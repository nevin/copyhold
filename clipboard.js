import { createEntry, withDefaultRetention } from "./entries.js";
import * as store from "./store.js";

export const supportsAutoCapture = Boolean(globalThis.chrome?.storage?.local &&
  chrome.runtime.getManifest().background?.service_worker);

function withClipboardLock(work) {
  return navigator.locks.request("copyhold-clipboard", work);
}

function newEntry(text) {
  return (retentionDays) => withDefaultRetention(createEntry({ text }), retentionDays);
}

// Only the offscreen monitor captures automatically, so this is the text it last recorded.
let lastCaptured;

export function captureAutomatically(readText) {
  return withClipboardLock(async () => {
    const text = readText();
    if (text === undefined) return null;
    // Polls usually see unchanged text, so skip hashing and storage until it changes.
    if (text === lastCaptured) return false;
    const added = await store.observeClipboard(text, text ? newEntry(text) : undefined, { automatic: true });
    lastCaptured = text;
    return added;
  });
}

export async function saveClipboard() {
  async function save() {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      throw new Error("Could not read the clipboard.");
    }
    if (!text) throw new Error("The clipboard has no text to save.");

    return store.observeClipboard(text, newEntry(text), { manual: true });
  }

  return supportsAutoCapture ? withClipboardLock(save) : save();
}

export async function copyToClipboard(text) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      throw new Error("Could not write to the clipboard.");
    }
    if (supportsAutoCapture) {
      try {
        await store.observeClipboard(text);
      } catch {
        throw new Error("Text copied, but automatic capture could not record the clipboard change.");
      }
    }
  }

  return supportsAutoCapture ? withClipboardLock(copy) : copy();
}
