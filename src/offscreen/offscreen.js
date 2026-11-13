import { describeSave, saveContent, withClipboardLock } from "../lib/clipboard.js";
import { getSettings, onSettingsChange } from "../lib/settings.js";
import { createPoller } from "../lib/poller.js";
import { t } from "../lib/i18n.js";

const clipboard = document.getElementById("clipboard");
// The service worker opens this document with ?monitor to capture continuously, or without it
// for a single Save clipboard from the keyboard shortcut.
const monitoring = new URLSearchParams(location.search).has("monitor");
let captureImages = false;

// A service worker can't read the clipboard, so this document pastes into a text area instead.
function readClipboard({ images = captureImages } = {}) {
  const pasteRead = new AbortController();
  let content;
  clipboard.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const image = !text && images
      ? [...event.clipboardData.files].find((file) => file.type.startsWith("image/"))
      : undefined;
    content = image ? { image } : { text };
  }, { once: true, signal: pasteRead.signal });
  try {
    clipboard.focus();
    document.execCommand("paste");
    return content;
  } finally {
    pasteRead.abort();
  }
}

const poller = createPoller(() => readClipboard());

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const from = sender.url?.split("?")[0];
  if (message?.type === "copyhold-capture-health" && from === chrome.runtime.getURL("popup/popup.html")) {
    respond(poller.health);
  } else if (message?.type === "copyhold-save-clipboard" && from === chrome.runtime.getURL("background/service-worker.js")) {
    withClipboardLock(async () => {
      const content = readClipboard({ images: true });
      if (!content) throw new Error(t("errorReadClipboard"));
      if (!content.text && !content.image) return { message: t("clipboardEmpty") };
      const result = await saveContent(content, "manual");
      return { ...result, message: describeSave(result) };
    }).then(respond, (error) => respond({ error: error.message }));
    return true;
  }
});

if (monitoring) {
  getSettings().then((settings) => {
    captureImages = settings.captureImages;
    poller.start();
  });
  onSettingsChange((changes) => {
    if ("captureImages" in changes) captureImages = changes.captureImages;
  });
}
