import { cleanName, cleanTags } from "./organize.js";
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
  };
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

// Same order as compareEntries, but parses each date once instead of in every comparison.
export function sortEntries(entries) {
  return entries
    .map((entry) => ({
      entry,
      pinned: Number(entry.pinned),
      used: Date.parse(entry.lastUsedAt ?? entry.createdAt),
      created: Date.parse(entry.createdAt),
    }))
    .sort((first, second) => second.pinned - first.pinned || second.used - first.used || second.created - first.created)
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
  "kind", "text", "title", "description", "category", "subcategory", "tags",
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
      ? typeof entry.image === "string" && entry.image.startsWith("data:image/")
      : typeof entry?.text === "string" && entry.text;
    if (!content ||
      typeof entry.title !== "string" || typeof entry.description !== "string" ||
      !visibilityOptions.includes(entry.visibility) || typeof entry.pinned !== "boolean" ||
      !isTimestamp(entry.createdAt) || (entry.lastUsedAt !== null && !isTimestamp(entry.lastUsedAt)) ||
      (entry.expiresAt != null && !isTimestamp(entry.expiresAt)) ||
      (entry.category != null && typeof entry.category !== "string") ||
      (entry.subcategory != null && typeof entry.subcategory !== "string") ||
      (entry.tags != null && (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string")))) {
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
