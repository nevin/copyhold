// Chrome and Edge background. A service worker can't read the clipboard, so an offscreen document does.
import "./expiry.js";
import "./lock-timer.js";
import { setUpMonitor } from "./monitor.js";
import { setUpShortcuts } from "./shortcuts.js";
import { t } from "../lib/i18n.js";

const offscreenPage = "offscreen/offscreen.html";

function offscreenContexts() {
  return chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(offscreenPage), chrome.runtime.getURL(`${offscreenPage}?monitor`)],
  });
}

function createDocument(url) {
  return chrome.offscreen.createDocument({
    url,
    reasons: ["CLIPBOARD"],
    justification: "Read the clipboard to save it locally, when the user turns on automatic capture or uses the Save clipboard shortcut.",
  });
}

/** @type {import("./monitor.js").Driver} */
const offscreenDriver = {
  async isRunning() {
    return (await offscreenContexts()).some((context) => context.documentUrl.endsWith("?monitor"));
  },
  async start() {
    // A document opened for a single save doesn't monitor, so it is replaced.
    if ((await offscreenContexts()).length) await chrome.offscreen.closeDocument();
    await createDocument(`${offscreenPage}?monitor`);
  },
  async stop() {
    if ((await offscreenContexts()).length) await chrome.offscreen.closeDocument();
  },
  async saveClipboard() {
    const opened = !(await offscreenContexts()).length;
    if (opened) await createDocument(offscreenPage);
    try {
      const response = await chrome.runtime.sendMessage({ type: "copyhold-save-clipboard" });
      if (!response) throw new Error(t("errorReadClipboard"));
      return response;
    } finally {
      if (opened) await chrome.offscreen.closeDocument();
    }
  },
};

const monitor = setUpMonitor(offscreenDriver);
setUpShortcuts(monitor.saveClipboard);
