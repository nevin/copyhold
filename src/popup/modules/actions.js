import { copyClip } from "../../lib/clipboard.js";
import { isExpired } from "../../lib/entries.js";
import { clipPreview } from "../../lib/format.js";
import * as store from "../../lib/store.js";
import { transformLabel } from "../../lib/transforms.js";
import { byId, fullTab, run } from "./dom.js";
import { refresh, showCopyFeedback } from "./list.js";
import { offerUndo } from "./undo.js";
import { state } from "./state.js";
import { t } from "../../lib/i18n.js";

const previewDialog = byId("clip-preview");
const previewText = byId("clip-preview-text");
const previewImage = byId("clip-preview-image");
const revealPreview = byId("clip-preview-reveal");
let previewEntry;

/**
 * @param {any} entry
 * @param {string} [transform] A transform id, such as "upper", to change the text as it is copied.
 */
export function copyEntry(entry, transform) {
  return run(async () => {
    if (isExpired(entry)) {
      await refresh(t("clipExpired"));
      return;
    }
    await copyClip(entry, { transform });
    showCopyFeedback(entry.id);
    try {
      await store.update(entry.id, { lastUsedAt: new Date().toISOString(), useCount: (entry.useCount ?? 0) + 1 });
    } catch {
      throw new Error(t("errorLastUsed"));
    }
    await refresh(transform ? t("copiedAs", transformLabel(transform)) : undefined);
    // Leave the confirmation on screen briefly so closing does not feel abrupt.
    if (!fullTab && state.closeAfterCopy) setTimeout(() => window.close(), 400);
  });
}

export function togglePin(entry) {
  run(async () => {
    await store.update(entry.id, { pinned: !entry.pinned });
    await refresh(entry.pinned ? t("clipUnpinned") : t("clipPinned"));
  });
}

export function toggleMask(entry) {
  run(async () => {
    const masking = entry.visibility === "visible";
    await store.update(entry.id, { visibility: masking ? "masked" : "visible" });
    await refresh(masking ? t("clipMasked") : t("clipShown"));
  });
}

export function deleteEntry(entry) {
  run(async () => {
    // Undo replaces a confirmation, so deleting one clip takes one step.
    offerUndo(await store.remove(entry.id));
    await refresh();
  });
}

export function openSource(entry) {
  window.open(entry.sourceUrl, "_blank", "noopener,noreferrer");
}

export function openLink(entry) {
  if (isExpired(entry)) {
    run(() => refresh(t("clipExpired")));
    return;
  }
  window.open(entry.text.trim(), "_blank", "noopener");
}

function showPreviewContent(reveal) {
  const entry = previewEntry;
  if (entry.kind === "image") {
    previewText.hidden = true;
    previewImage.hidden = !reveal;
    if (reveal && !previewImage.src) previewImage.src = URL.createObjectURL(entry.image);
    if (!reveal) previewText.hidden = false;
    if (!reveal) previewText.textContent = t("hiddenImage", entry.width, entry.height);
    return;
  }
  previewImage.hidden = true;
  previewText.hidden = false;
  previewText.textContent = reveal ? entry.text : clipPreview(entry.text, entry.visibility);
}

function setRevealed(revealed) {
  revealPreview.dataset.revealed = String(revealed);
  revealPreview.textContent = revealed ? t("conceal") : t("reveal");
  showPreviewContent(revealed);
}

export function openClipPreview(entry) {
  if (isExpired(entry)) {
    run(() => refresh(t("clipExpired")));
    return;
  }
  previewEntry = entry;
  for (const [field, value] of [["title", entry.title], ["description", entry.description]]) {
    const element = byId(`clip-preview-${field}`);
    element.textContent = value;
    element.hidden = !value;
  }
  revealPreview.hidden = entry.visibility === "visible";
  setRevealed(revealPreview.hidden);
  previewDialog.showModal();
}

revealPreview.addEventListener("click", () => {
  if (isExpired(previewEntry)) {
    previewDialog.close();
    run(() => refresh(t("clipExpired")));
    return;
  }
  setRevealed(revealPreview.dataset.revealed !== "true");
});

previewDialog.addEventListener("close", () => {
  if (previewDialog.open) return;
  previewEntry = undefined;
  previewText.textContent = "";
  if (previewImage.src) URL.revokeObjectURL(previewImage.src);
  previewImage.removeAttribute("src");
  byId("clip-preview-title").textContent = "";
  byId("clip-preview-description").textContent = "";
});
