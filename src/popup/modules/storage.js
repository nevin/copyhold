// How much space Copyhold uses, shown in Settings, with a warning when the browser's limit is near.
import { t, tn } from "../../lib/i18n.js";
import * as store from "../../lib/store.js";
import { byId, run, status } from "./dom.js";
import { confirmAction } from "./editor.js";
import { refresh } from "./list.js";
import { offerUndo } from "./undo.js";

const warnAt = 0.8;
const sizeFormat = new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 });

export function formatSize(bytes) {
  return bytes < 100_000 ? t("sizeKilobytes", Math.max(1, Math.round(bytes / 1000)).toLocaleString())
    : bytes >= 1e9 ? t("sizeGigabytes", (bytes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 }))
    : sizeFormat.format(bytes / 1e6);
}

// Locked clips keep their image bytes in sealed boxes, which are counted the same way.
function imageBytes(record) {
  const sealedSize = (field) => record.sealed?.[field]?.data?.byteLength ?? 0;
  return (record.image?.size ?? sealedSize("image")) + (record.thumbnail?.size ?? sealedSize("thumbnail"));
}

async function measure() {
  const records = await store.list();
  const images = records.filter((record) => record.kind === "image");
  const estimate = await navigator.storage?.estimate?.().catch(() => null) ?? null;
  return {
    clips: records.length,
    images,
    imageBytes: images.reduce((total, record) => total + imageBytes(record), 0),
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
  };
}

async function showStorage() {
  const { clips, images, imageBytes: bytes, usage, quota } = await measure();
  const parts = [tn("clipCount", clips)];
  if (images.length) parts.push(t("imagesUsing", tn("imageCount", images.length), formatSize(bytes)));
  if (quota) parts.push(t("storageUsage", formatSize(usage), formatSize(quota)));
  byId("storage-summary").textContent = parts.join(" · ");
  const share = quota ? usage / quota : 0;
  byId("storage-fill").style.inlineSize = `${Math.min(100, Math.max(share * 100, usage ? 1 : 0))}%`;
  byId("storage-fill").parentElement.classList.toggle("is-full", share >= warnAt);
  const deleteImages = byId("delete-images");
  deleteImages.hidden = !images.length;
  deleteImages.textContent = tn("deleteImageCount", images.length);
  return share;
}

byId("settings").addEventListener("toggle", () => {
  if (byId("settings").open) run(showStorage);
});

byId("delete-images").addEventListener("click", () => run(async () => {
  const images = (await store.list()).filter((record) => record.kind === "image");
  if (!images.length) return;
  if (!await confirmAction(
    tn("deleteImagesTitle", images.length),
    t("deleteImagesMessage", formatSize(images.reduce((total, record) => total + imageBytes(record), 0))),
    t("delete"),
    true,
  )) return;
  offerUndo(await store.removeMany(images.map(({ id }) => id)));
  await refresh();
  await showStorage();
}));

// A warning on open, so the history can be trimmed before the browser refuses to save more.
run(async () => {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  if (estimate?.quota && estimate.usage / estimate.quota >= warnAt) status(t("storageAlmostFull"), true);
});
