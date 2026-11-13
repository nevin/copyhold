import { captureAutomatically } from "./clipboard.js";

const clipboard = document.getElementById("clipboard");
const changes = new BroadcastChannel("clipfile-entries");
const pollInterval = 1000;
let delay = pollInterval;
let lastSuccess = 0;
let failed = false;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "clipfile-capture-health" &&
      sender.url?.split("?")[0] === chrome.runtime.getURL("manager.html")) {
    respond({ lastSuccess, failed });
  }
});

function readText() {
  const pasteRead = new AbortController();
  let text;
  clipboard.addEventListener("paste", (event) => {
    event.preventDefault();
    text = event.clipboardData.getData("text/plain");
  }, { once: true, signal: pasteRead.signal });
  try {
    clipboard.focus();
    document.execCommand("paste");
    return text;
  } finally {
    pasteRead.abort();
  }
}

async function capture() {
  try {
    const added = await captureAutomatically(readText);
    if (added === null) throw new Error("Clipboard read did not complete.");
    lastSuccess = Date.now();
    failed = false;
    if (added) changes.postMessage("updated");
    delay = pollInterval;
  } catch (error) {
    console.error("Could not capture clipboard text:", error);
    failed = true;
    delay = Math.min(delay * 2, 30_000);
  } finally {
    setTimeout(capture, delay);
  }
}

capture();
