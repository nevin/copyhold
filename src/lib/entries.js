import { maxImageBytes } from "./images.js";
import { cleanName, cleanTags } from "./organize.js";

// Base64 makes data 4/3 the size; a backup's images get the same limit as saving one.
const maxImageDataUrlLength = Math.ceil(maxImageBytes * 4 / 3) + 64;
import { t } from "./i18n.js";

export const visibilityOptions = ["visible", "masked", "hidden"];

export function createEntry(fields) {
  const entry = {
    id: crypto.randomUUID(),
    kind: fields.kind === "image" ? "image" : "text",
    text: fields.text ?? "",
    title: fields.title ?? "",
    description: fields.description ?? "",
    visibility: fields.visibility ?? "visible",
    pinned: fields.pinned ?? false,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    lastUsedAt: fields.lastUsedAt ?? null,
    expiresAt: fields.expiresAt ?? null,
    defaultExpiry: fields.defaultExpiry === true,
    category: cleanName(fields.category),
    // A subcategory belongs to the category, so it is dropped when there is none.
    subcategory: fields.category ? cleanName(fields.subcategory) : "",
    tags: cleanTags(fields.tags),
    // How many times the clip was copied from Copyhold, for sorting by use.
    useCount: Number.isInteger(fields.useCount) && fields.useCount > 0 ? fields.useCount : 0,
    // A template fills in placeholders such as {date} when it is copied.
    template: fields.template === true,
  };
  // The page a selection was saved from.
  if (fields.sourceUrl && /^https?:\/\//i.test(fields.sourceUrl)) {
    entry.sourceUrl = String(fields.sourceUrl).slice(0, 2048);
    entry.sourceTitle = String(fields.sourceTitle ?? "").slice(0, 200);
  }
  // Set when the clip was masked because it looked like a secret; describes what it looked like.
  if (fields.sensitive) entry.sensitive = fields.sensitive;
  if (entry.kind === "image") {
    Object.assign(entry, { image: fields.image, thumbnail: fields.thumbnail, width: fields.width, height: fields.height });
  }
  return entry;
}

export function withDefaultRetention(entry, days, now = Date.now()) {
  if (days && !entry.pinned && !entry.expiresAt) {
    entry.expiresAt = new Date(now + days * 86_400_000).toISOString();
    entry.defaultExpiry = true;
  }
  return entry;
}

export function compareEntries(first, second) {
  return Number(second.pinned) - Number(first.pinned) ||
    Date.parse(second.lastUsedAt ?? second.createdAt) - Date.parse(first.lastUsedAt ?? first.createdAt) ||
    Date.parse(second.createdAt) - Date.parse(first.createdAt);
}

export const sortOrders = ["recent", "used", "oldest", "name"];
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * Pinned clips first, then by the chosen order. Keys are computed once per clip, not in every comparison.
 * "recent" matches compareEntries.
 * @param {any[]} entries
 * @param {string} [order]
 */
export function sortEntries(entries, order = "recent") {
  const keyed = entries.map((entry) => ({
    entry,
    pinned: Number(entry.pinned),
    used: Date.parse(entry.lastUsedAt ?? entry.createdAt),
    created: Date.parse(entry.createdAt),
    count: entry.useCount ?? 0,
    name: order === "name" ? (entry.title || entry.text || "").trim() : "",
  }));
  const recent = (first, second) => second.used - first.used || second.created - first.created;
  const byOrder = {
    recent,
    used: (first, second) => second.count - first.count || recent(first, second),
    oldest: (first, second) => first.created - second.created,
    // Clips without a title or text, such as untitled images, go after named ones.
    name: (first, second) => Number(!first.name) - Number(!second.name) || collator.compare(first.name, second.name) || recent(first, second),
  }[order] ?? recent;
  return keyed
    .sort((first, second) => second.pinned - first.pinned || byOrder(first, second))
    .map(({ entry }) => entry);
}

async function dataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

const exportedFields = [
  "kind", "text", "title", "description", "category", "subcategory", "tags", "useCount", "template", "sourceUrl", "sourceTitle",
  "visibility", "pinned", "createdAt", "lastUsedAt", "expiresAt", "defaultExpiry",
];

// Images are written as data URLs so a backup is one self-contained file. Thumbnails are rebuilt on import.
export async function exportEntries(entries) {
  const exported = [];
  for (const entry of entries) {
    const fields = Object.fromEntries(exportedFields.map((field) => [field, entry[field]]));
    if (entry.kind === "image") Object.assign(fields, { image: await dataUrl(entry.image), width: entry.width, height: entry.height });
    exported.push(fields);
  }
  return JSON.stringify({ format: "copyhold", version: 1, entries: exported }, null, 2);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isExpired(entry, now = Date.now()) {
  return entry.expiresAt != null && Date.parse(entry.expiresAt) <= now;
}

/**
 * @param {string} json
 * @param {(image: Blob) => Promise<{ thumbnail: Blob, width: number, height: number }>} [describeImage]
 */
export async function importEntries(json, describeImage) {
  let backup;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error(t("errorInvalidJson"));
  }
  // Backups made before the rename to Copyhold use the "clipfile" format name.
  if (!["copyhold", "clipfile"].includes(backup?.format) || backup.version !== 1 || !Array.isArray(backup.entries)) {
    throw new Error(t("errorNotBackup"));
  }
  const imported = [];
  for (const [index, entry] of backup.entries.entries()) {
    const image = entry?.kind === "image";
    const content = image
      ? typeof entry.image === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(entry.image) &&
        entry.image.length <= maxImageDataUrlLength
      : typeof entry?.text === "string" && entry.text;
    if (!content ||
      typeof entry.title !== "string" || typeof entry.description !== "string" ||
      !visibilityOptions.includes(entry.visibility) || typeof entry.pinned !== "boolean" ||
      !isTimestamp(entry.createdAt) || (entry.lastUsedAt !== null && !isTimestamp(entry.lastUsedAt)) ||
      (entry.expiresAt != null && !isTimestamp(entry.expiresAt)) ||
      (entry.category != null && typeof entry.category !== "string") ||
      (entry.subcategory != null && typeof entry.subcategory !== "string") ||
      (entry.tags != null && (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string"))) ||
      (entry.sourceUrl != null && typeof entry.sourceUrl !== "string")) {
      throw new Error(t("errorInvalidEntry", index + 1));
    }
    const fields = { ...entry, expiresAt: entry.expiresAt == null ? null : new Date(entry.expiresAt).toISOString() };
    if (image) {
      const blob = await (await fetch(entry.image)).blob();
      imported.push(createEntry({ ...fields, text: "", image: blob, ...await describeImage?.(blob) }));
    } else {
      imported.push(createEntry({ ...fields, kind: "text" }));
    }
  }
  return imported.filter((entry) => !isExpired(entry));
}
