import { createEntry, withDefaultRetention } from "./entries.js";
import { autoCaptureMaxImageBytes, describeImage, maxImageBytes } from "./images.js";
import { fromBase64, toBase64 } from "./lock.js";
import { applyRules } from "./rules.js";
import { detectSensitive, sensitiveLabel } from "./sensitive.js";
import { getSettings } from "./settings.js";
import * as store from "./store.js";
import { fillTemplate, transforms } from "./transforms.js";
import { t } from "./i18n.js";

// Automatic capture skips longer text, which would slow every popup open; Save clipboard still keeps it.
export const autoCaptureMaxLength = 1_000_000;

// Chrome and Edge capture from an offscreen document; Firefox's background page reads the clipboard itself.
export const supportsAutoCapture = Boolean(globalThis.chrome?.runtime?.getManifest?.().background);

/**
 * Clipboard content: text, or an image.
 * Selections also carry the page they came from.
 * @typedef {{ text?: string, image?: Blob, sourceUrl?: string, sourceTitle?: string }} Content
 */

export function withClipboardLock(work) {
  return navigator.locks.request("copyhold-clipboard", work);
}

// Identifies the clipboard so a capture can tell whether it changed. With the lock on, a plain hash
// could confirm a guessed password, so it goes through PBKDF2 to make guessing slow.
async function fingerprint(content, lock) {
  const digest = await store.contentDigest(content);
  if (!lock) return digest;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(digest), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(lock.salt), iterations: 100_000 }, material, 256,
  );
  return toBase64(bits);
}

/**
 * Saves clipboard content, or brings an existing copy of it to the top.
 * @param {Content} content
 * @param {"automatic" | "manual" | "selection"} mode Selections don't come from the clipboard, so they
 *   leave its fingerprint alone.
 * @returns {Promise<{ added?: boolean, existing?: boolean, skipped?: "sensitive" | "large", sensitive?: string | null }>}
 */
export async function saveContent(content, mode) {
  const automatic = mode === "automatic";
  const [{ fingerprint: previous, skipClipboard, lock }, settings] = await Promise.all([
    store.getMeta(["fingerprint", "skipClipboard", "lock"]),
    getSettings(),
  ]);
  const print = mode === "selection" ? undefined : await fingerprint(content, lock);
  const record = (extra = {}) => (print ? store.setMeta({ fingerprint: print, ...extra }) : undefined);
  if (automatic && skipClipboard) {
    await record({ skipClipboard: undefined });
    return {};
  }
  if (automatic && print === previous) return {};
  const image = content.image;
  if (!image && !content.text) {
    await record();
    return {};
  }

  if (image && image.size > (automatic ? autoCaptureMaxImageBytes : maxImageBytes)) {
    if (!automatic) throw new Error(t("errorImageTooLarge"));
    await record({ skippedLongAt: Date.now() });
    return { skipped: "large" };
  }
  if (automatic && !image && content.text.length > autoCaptureMaxLength) {
    await record({ skippedLongAt: Date.now() });
    return { skipped: "large" };
  }

  const sensitive = image ? null : detectSensitive(content.text);
  if (sensitive && automatic && settings.sensitiveClips === "skip") {
    await record();
    return { skipped: "sensitive", sensitive };
  }
  const mask = Boolean(sensitive) && settings.sensitiveClips !== "keep";

  // Locked clips are stored without a hash, so duplicates can only be found while the lock is off.
  if (!lock) {
    const existing = await store.findByHash(await store.contentDigest(content));
    if (existing) {
      await store.update(existing.id, { lastUsedAt: new Date().toISOString() });
      await record();
      return { existing: true };
    }
  }

  const source = content.sourceUrl ? { sourceUrl: content.sourceUrl, sourceTitle: content.sourceTitle } : {};
  const entry = image
    ? createEntry({ kind: "image", ...await describeImage(image) })
    : createEntry({
      text: content.text,
      visibility: mask ? "masked" : "visible",
      sensitive: mask ? sensitive : undefined,
      ...source,
      ...applyRules({ text: content.text, ...source }, settings.rules),
    });
  await store.add([withDefaultRetention(entry, settings.retentionDays)]);
  await record();
  await store.trimHistory(settings.historyLimit);
  return { added: true, sensitive: mask ? sensitive : null };
}

/** A sentence describing what saveContent did, for manual saves. */
export function describeSave(result) {
  if (result.existing) return t("saveExisting");
  if (result.sensitive) return t("saveMasked", sensitiveLabel(result.sensitive));
  return t("saveDone");
}

// Polls usually see unchanged content, so a cheap key skips hashing and storage until it changes.
async function quickKey(content) {
  if (!content.image) return `text:${content.text}`;
  const { size, type } = content.image;
  const middle = Math.max(0, Math.floor(size / 2) - 128);
  const sample = new Uint8Array(await content.image.slice(middle, middle + 256).arrayBuffer());
  return `image:${type}:${size}:${sample.join(",")}`;
}

// Only the clipboard monitor captures automatically, so this is the content it last recorded.
let lastCaptured;

/**
 * @param {() => Content | undefined | Promise<Content | undefined>} read Returns undefined if the read failed.
 * @returns {Promise<boolean | null>} Whether the saved clips changed, or null if the clipboard couldn't be read.
 */
export function captureAutomatically(read) {
  return withClipboardLock(async () => {
    const content = await read();
    if (content === undefined) return null;
    const key = await quickKey(content);
    if (key === lastCaptured) return false;
    // Empty content still goes through, so it consumes a pending skip and updates the fingerprint.
    const result = await saveContent(content, "automatic");
    lastCaptured = key;
    return Boolean(result.added || result.existing);
  });
}

/**
 * Reads text, or an image when there is no text.
 * @param {{ images?: boolean }} [options]
 * @returns {Promise<Content>}
 */
export async function readClipboard({ images = true } = {}) {
  if (images && navigator.clipboard.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/plain")) {
        const text = await (await item.getType("text/plain")).text();
        if (text) return { text };
      }
    }
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"));
      if (type) return { image: await item.getType(type) };
    }
    return { text: "" };
  }
  return { text: await navigator.clipboard.readText() };
}

export function saveClipboard() {
  return withClipboardLock(async () => {
    let content;
    try {
      content = await readClipboard();
    } catch {
      throw new Error(t("errorReadClipboard"));
    }
    if (!content.text && !content.image) throw new Error(t("clipboardEmpty"));
    const result = await saveContent(content, "manual");
    return { ...result, message: describeSave(result) };
  });
}

/**
 * Saves selected text from a page; the context menu passes it without touching the clipboard.
 * @param {string} text
 * @param {{ url?: string, title?: string }} [source] The page it was selected on.
 */
export function saveSelection(text, source = {}) {
  return withClipboardLock(() => saveContent({ text, sourceUrl: source.url, sourceTitle: source.title }, "selection"));
}

async function writeContent(content) {
  try {
    if (content.image) await navigator.clipboard.write([new ClipboardItem({ [content.image.type]: content.image })]);
    else await navigator.clipboard.writeText(content.text);
  } catch {
    throw new Error(t("errorWriteClipboard"));
  }
  // Record what is on the clipboard now, so automatic capture doesn't save it again.
  try {
    await store.setMeta({ fingerprint: await fingerprint(content, await store.getLock()) });
  } catch {
    throw new Error(t("errorRecordClipboard"));
  }
}

/**
 * Copies a clip that has been decrypted, if it was locked. Templates fill in their placeholders,
 * and a transform such as "upper" changes the text as it is copied.
 * @param {any} entry
 * @param {{ transform?: string }} [options]
 */
export async function copyClip(entry, { transform } = {}) {
  if (entry.kind === "image") return withClipboardLock(() => writeContent({ image: entry.image }));
  let text = entry.text;
  // Reading the clipboard for {clipboard} happens before taking the lock that writing holds.
  if (entry.template) text = await fillTemplate(text, { clipboard: () => navigator.clipboard.readText() });
  const chosen = transforms.find(({ id }) => id === transform);
  if (chosen) text = chosen.apply(text);
  return withClipboardLock(() => writeContent({ text }));
}

/** Copies the text of several clips, one per line. Images can't be combined, so they are left out. */
export async function copyClips(entries) {
  const texts = entries.filter((entry) => entry.kind !== "image").map((entry) => entry.text);
  if (texts.length) await withClipboardLock(() => writeContent({ text: texts.join("\n") }));
  return { copied: texts.length, skippedImages: entries.length - texts.length };
}
