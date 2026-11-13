import { copyClip } from "../../lib/clipboard.js";
import { isExpired } from "../../lib/entries.js";
import { clipPreview, displayLength, relativeTime } from "../../lib/format.js";
import { sensitiveLabel } from "../../lib/sensitive.js";
import * as store from "../../lib/store.js";
import { transformLabel } from "../../lib/transforms.js";
import { byId, dateFormat, fullTab, icon, run, textLine } from "./dom.js";
import { categoryDot, refresh, showCopyFeedback } from "./list.js";
import { offerUndo } from "./undo.js";
import { state } from "./state.js";
import { t, tn } from "../../lib/i18n.js";

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

// Everything Copyhold knows about the clip, as label and value pairs under its content.
function showDetails(entry) {
  const rows = [];
  const add = (label, ...values) => {
    const value = document.createElement("dd");
    value.append(...values);
    rows.push(textLine("dt", "", label), value);
  };
  const none = () => textLine("span", "detail-none", t("detailNone"));
  const dated = (timestamp) => `${dateFormat.format(new Date(timestamp))} (${relativeTime(timestamp)})`;

  const category = document.createElement("span");
  if (entry.category) {
    const dot = categoryDot(entry.category);
    if (dot) category.append(dot);
    category.append(entry.category);
  }
  add(t("category"), entry.category ? category : none());
  add(t("subcategory"), entry.subcategory || none());
  add(t("tags"), entry.tags?.length ? entry.tags.map((tag) => `#${tag}`).join("  ") : none());

  const expiry = document.createElement("span");
  if (entry.expiresAt) {
    expiry.className = Date.parse(entry.expiresAt) - Date.now() < 3_600_000 ? "detail-expiry expiry-soon" : "detail-expiry";
    expiry.append(icon("clock", "action-icon expiry-icon"), dated(entry.expiresAt));
    if (entry.defaultExpiry) expiry.append(textLine("span", "detail-note", t("detailDefaultExpiry")));
  }
  add(t("detailExpires"), entry.expiresAt ? expiry : t("noExpiry"));
  add(t("detailSaved"), dated(entry.createdAt));
  add(t("detailLastCopied"), entry.lastUsedAt
    ? `${dated(entry.lastUsedAt)} · ${tn("timesCopied", entry.useCount ?? 0)}`
    : t("detailNeverCopied"));
  add(entry.kind === "image" ? t("detailSize") : t("detailLength"), entry.kind === "image"
    ? t("imageDimensions", entry.width, entry.height)
    : tn("characters", displayLength(entry.text)));
  const visibility = { visible: t("visibilityShown"), masked: t("visibilityMasked"), hidden: t("visibilityHidden") }[entry.visibility];
  add(t("detailVisibility"), entry.sensitive ? `${visibility} · ${t("maskedAutomatically", sensitiveLabel(entry.sensitive))}` : visibility);
  if (entry.template) add(t("templateLabel"), t("detailTemplate"));
  if (entry.sourceUrl) {
    const link = document.createElement("a");
    link.href = entry.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = entry.sourceTitle || entry.sourceUrl;
    link.title = entry.sourceUrl;
    add(t("detailSource"), link);
  }
  byId("clip-preview-details").replaceChildren(...rows);
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
  showDetails(entry);
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
