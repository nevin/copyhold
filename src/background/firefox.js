// Firefox background. Its background page can read the clipboard directly, so it runs the monitor itself.
import "./expiry.js";
import "./lock-timer.js";
import { describeSave, readClipboard, saveContent, withClipboardLock } from "../lib/clipboard.js";
import { createPoller } from "../lib/poller.js";
import { getSettings, onSettingsChange } from "../lib/settings.js";
import { setUpMonitor } from "./monitor.js";
import { setUpShortcuts } from "./shortcuts.js";
import { t } from "../lib/i18n.js";

// Firefox suspends an idle background page; this alarm wakes it so polling continues.
const keepAlive = "copyhold-keep-alive";
let captureImages = false;
getSettings().then((settings) => { captureImages = settings.captureImages; });
onSettingsChange((changes) => {
  if ("captureImages" in changes) captureImages = changes.captureImages;
});

const poller = createPoller(() => readClipboard({ images: captureImages }).catch(() => undefined));

/** @type {import("./monitor.js").Driver} */
const pageDriver = {
  async isRunning() {
    return poller.running;
  },
  async start() {
    poller.start();
    await chrome.alarms.create(keepAlive, { periodInMinutes: 0.5 });
  },
  async stop() {
    poller.stop();
    await chrome.alarms.clear(keepAlive);
  },
  saveClipboard() {
    return withClipboardLock(async () => {
      const content = await readClipboard();
      if (!content.text && !content.image) return { message: t("clipboardEmpty") };
      const result = await saveContent(content, "manual");
      return { ...result, message: describeSave(result) };
    });
  },
};

const monitor = setUpMonitor(pageDriver);
setUpShortcuts(monitor.saveClipboard);
// The page may have been suspended and reloaded, so starting here resumes capture.
monitor.startMonitor();
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === keepAlive) return monitor.startMonitor();
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "copyhold-capture-health" &&
      sender.url?.split("?")[0] === chrome.runtime.getURL("popup/popup.html")) {
    respond(poller.health);
  }
});
