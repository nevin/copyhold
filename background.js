import "./expiry.js";

const offscreenPage = "offscreen.html";
const resumeAlarm = "clipfile-resume-capture";
const watchdog = "clipfile-capture-watchdog";
let pending = Promise.resolve();

function updateMonitor({ enabled, pause, retry } = {}) {
  const update = pending.then(async () => {
    const saved = await chrome.storage.local.get({ autoCapture: true, pausedUntil: 0 });
    const autoCapture = enabled ?? saved.autoCapture;
    const pausedUntil = !autoCapture || pause === "resume" ? 0
      : pause === "pause" ? Date.now() + 15 * 60_000
      : saved.pausedUntil > Date.now() ? saved.pausedUntil : 0;
    if (autoCapture !== saved.autoCapture || pausedUntil !== saved.pausedUntil) {
      const settings = { autoCapture, pausedUntil };
      if (pause === "pause" || !autoCapture) settings.skipCurrentClipboard = crypto.randomUUID();
      await navigator.locks.request("clipfile-baseline-state", () => chrome.storage.local.set(settings));
    }

    if (pause === "pause") await chrome.alarms.create(resumeAlarm, { when: pausedUntil });
    else if (!pausedUntil && saved.pausedUntil) await chrome.alarms.clear(resumeAlarm);
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(offscreenPage)],
    });
    const shouldRun = autoCapture && !pausedUntil;
    if (contexts.length && (!shouldRun || retry === true)) {
      await navigator.locks.request("clipfile-clipboard", () => chrome.offscreen.closeDocument());
    }
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

chrome.runtime.onStartup.addListener(startMonitor);
chrome.runtime.onInstalled.addListener(startMonitor);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === watchdog || alarm.name === resumeAlarm) return startMonitor();
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const url = sender.url?.split("?")[0];
  if (url === chrome.runtime.getURL(offscreenPage) && message?.type === "clipfile-baseline") {
    const operation = navigator.locks.request("clipfile-baseline-state", async () => {
      const settings = await chrome.storage.local.get({ skipCurrentClipboard: false });
      if (message.done && message.done === settings.skipCurrentClipboard) {
        await chrome.storage.local.set({ skipCurrentClipboard: false });
      }
      return settings;
    });
    operation.then(respond, () => respond({ error: true }));
    return true;
  }
  if (message?.type !== "clipfile-auto-capture" || url !== chrome.runtime.getURL("manager.html")) return;
  updateMonitor(message).then(
    respond,
    () => respond({ error: "Could not update automatic capture." }),
  );
  return true;
});
