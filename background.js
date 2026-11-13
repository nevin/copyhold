import "./expiry.js";
import { getSettings, updateSettings } from "./settings.js";
import { skipCurrentClipboard } from "./store.js";

const offscreenPage = "offscreen.html";
const resumeAlarm = "copyhold-resume-capture";
const watchdog = "copyhold-capture-watchdog";
// Alarm names registered before the rename to Copyhold.
const legacyAlarms = ["clipfile-resume-capture", "clipfile-capture-watchdog"];
// Nothing can be copied without input, so the monitor stops after a minute of inactivity.
const idleSeconds = 60;
let pending = Promise.resolve();

function updateMonitor({ enabled, pause, retry } = {}) {
  const update = pending.then(async () => {
    const saved = await getSettings();
    const autoCapture = enabled ?? saved.autoCapture;
    const pausedUntil = !autoCapture || pause === "resume" ? 0
      : pause === "pause" ? Date.now() + 15 * 60_000
      : saved.pausedUntil > Date.now() ? saved.pausedUntil : 0;
    const changed = autoCapture !== saved.autoCapture || pausedUntil !== saved.pausedUntil;
    const active = await chrome.idle.queryState(idleSeconds) === "active";
    const shouldRun = autoCapture && !pausedUntil && active;
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(offscreenPage)],
    });
    const stop = contexts.length && (!shouldRun || retry === true);
    if (changed || stop) {
      // Hold the clipboard lock so the monitor cannot capture between these steps.
      await navigator.locks.request("copyhold-clipboard", async () => {
        // Skip what is on the clipboard now: it was copied while capture was off or before it was turned on.
        if (changed && (pause === "pause" || autoCapture !== saved.autoCapture)) await skipCurrentClipboard();
        if (changed) await updateSettings({ autoCapture, pausedUntil });
        if (stop) await chrome.offscreen.closeDocument();
      });
    }

    if (pause === "pause") await chrome.alarms.create(resumeAlarm, { when: pausedUntil });
    else if (!pausedUntil && saved.pausedUntil) await chrome.alarms.clear(resumeAlarm);
    if (shouldRun && (!contexts.length || retry === true)) {
      await chrome.offscreen.createDocument({
        url: offscreenPage,
        reasons: ["CLIPBOARD"],
        justification: "Save clipboard text locally while automatic capture is enabled.",
      });
    }
    return { enabled: autoCapture, pausedUntil };
  });
  pending = update.catch((error) => console.error("Clipboard monitor:", error));
  return update;
}

async function startMonitor() {
  try {
    await Promise.all(legacyAlarms.map((name) => chrome.alarms.clear(name)));
    if (!await chrome.alarms.get(watchdog)) {
      await chrome.alarms.create(watchdog, { periodInMinutes: 1 });
    }
    const { pausedUntil } = await updateMonitor();
    if (pausedUntil && !await chrome.alarms.get(resumeAlarm)) {
      await chrome.alarms.create(resumeAlarm, { when: pausedUntil });
    }
  } catch (error) {
    console.error("Clipboard monitor startup:", error);
  }
}

chrome.idle.setDetectionInterval(idleSeconds);
chrome.idle.onStateChanged.addListener(startMonitor);
chrome.runtime.onStartup.addListener(startMonitor);
chrome.runtime.onInstalled.addListener(startMonitor);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === watchdog || alarm.name === resumeAlarm) return startMonitor();
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const url = sender.url?.split("?")[0];
  if (message?.type !== "copyhold-auto-capture" || url !== chrome.runtime.getURL("manager.html")) return;
  updateMonitor(message).then(
    respond,
    () => respond({ error: "Could not update automatic capture." }),
  );
  return true;
});
