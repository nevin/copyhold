import { createEntry } from "./entries.js";
import * as store from "./store.js";

export const supportsAutoCapture = Boolean(globalThis.chrome?.storage?.local &&
  chrome.runtime.getManifest().background?.service_worker);

function withClipboardLock(work) {
  return navigator.locks.request("clipfile-clipboard", work);
}

export function captureAutomatically(readText, { baseline = false } = {}) {
  return withClipboardLock(async () => {
    const text = readText();
    if (text === undefined) return null;
    if (baseline || !text) return store.observeClipboard(text);
    const entry = await store.applyDefaultRetention(createEntry({ text }));
    return store.observeClipboard(text, () => entry);
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

    const entry = await store.applyDefaultRetention(createEntry({ text }));
    return store.observeClipboard(text, () => entry, { manual: true });
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
