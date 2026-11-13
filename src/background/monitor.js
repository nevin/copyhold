import { getSettings, updateSettings } from "../lib/settings.js";
import { skipCurrentClipboard } from "../lib/store.js";
import { everyMinute } from "./tick.js";
import { t } from "../lib/i18n.js";

const resumeAlarm = "copyhold-resume-capture";
// The resume alarm's name before the rename to Copyhold.
const legacyAlarms = ["clipfile-resume-capture"];
// Nothing can be copied without input, so the monitor stops after a minute of inactivity.
const idleSeconds = 60;

/**
 * How each browser runs the clipboard monitor.
 * @typedef {{
 *   isRunning(): Promise<boolean>,
 *   start(): Promise<void>,
 *   stop(): Promise<void>,
 *   saveClipboard(): Promise<{ message?: string, error?: string, added?: boolean, existing?: boolean }>,
 * }} Driver
 */

/**
 * Starts and stops the clipboard monitor to match the settings, pauses, and idle state.
 * @param {Driver} driver
 */
export function setUpMonitor(driver) {
  // Monitor changes and keyboard saves run one at a time, so they never race over the clipboard reader.
  /** @type {Promise<unknown>} */
  let pending = Promise.resolve();
  /**
   * @template T
   * @param {() => Promise<T>} work
   * @returns {Promise<T>}
   */
  function queue(work) {
    const result = pending.then(work);
    pending = result.catch((error) => console.error("Clipboard monitor:", error));
    return result;
  }

  /**
   * @param {{ enabled?: boolean, pause?: "pause" | "resume", retry?: boolean }} [options]
   * @returns {Promise<{ enabled: boolean, pausedUntil: number }>}
   */
  function updateMonitor({ enabled, pause, retry } = {}) {
    return queue(async () => {
      const saved = await getSettings();
      const autoCapture = enabled ?? saved.autoCapture;
      const pausedUntil = !autoCapture || pause === "resume" ? 0
        : pause === "pause" ? Date.now() + 15 * 60_000
        : saved.pausedUntil > Date.now() ? saved.pausedUntil : 0;
      const changed = autoCapture !== saved.autoCapture || pausedUntil !== saved.pausedUntil;
      const active = await chrome.idle.queryState(idleSeconds) === "active";
      const shouldRun = autoCapture && !pausedUntil && active;
      const running = await driver.isRunning();
      const stop = running && (!shouldRun || retry === true);
      if (changed || stop) {
        // Hold the clipboard lock so the monitor cannot capture between these steps.
        await navigator.locks.request("copyhold-clipboard", async () => {
          // Skip what is on the clipboard now: it was copied while capture was off or before it was turned on.
          if (changed && (pause === "pause" || autoCapture !== saved.autoCapture)) await skipCurrentClipboard();
          if (changed) await updateSettings({ autoCapture, pausedUntil });
          if (stop) await driver.stop();
        });
      }

      if (pause === "pause") await chrome.alarms.create(resumeAlarm, { when: pausedUntil });
      else if (!pausedUntil && saved.pausedUntil) await chrome.alarms.clear(resumeAlarm);
      if (shouldRun && (!running || retry === true)) await driver.start();
      return { enabled: autoCapture, pausedUntil };
    });
  }

  async function startMonitor() {
    try {
      await Promise.all(legacyAlarms.map((name) => chrome.alarms.clear(name)));
      const { pausedUntil } = await updateMonitor();
      if (pausedUntil && !await chrome.alarms.get(resumeAlarm)) {
        await chrome.alarms.create(resumeAlarm, { when: pausedUntil });
      }
    } catch (error) {
      console.error("Clipboard monitor startup:", error);
    }
  }

  // A once-a-minute check restarts the monitor if Chrome closed its document.
  everyMinute(startMonitor);
  chrome.idle.setDetectionInterval(idleSeconds);
  chrome.idle.onStateChanged.addListener(startMonitor);
  chrome.runtime.onStartup.addListener(startMonitor);
  chrome.runtime.onInstalled.addListener(startMonitor);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === resumeAlarm) return startMonitor();
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const url = sender.url?.split("?")[0];
    if (message?.type !== "copyhold-auto-capture" || url !== chrome.runtime.getURL("popup/popup.html")) return;
    updateMonitor(message).then(
      respond,
      () => respond({ error: t("errorUpdateCapture") }),
    );
    return true;
  });

  return {
    startMonitor,
    saveClipboard: () => queue(() => driver.saveClipboard()),
  };
}
