export const visibilityOptions = ["visible", "masked", "hidden"];

export function createEntry(fields) {
  return {
    id: crypto.randomUUID(),
    text: fields.text,
    title: fields.title ?? "",
    description: fields.description ?? "",
    visibility: fields.visibility ?? "visible",
    pinned: fields.pinned ?? false,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    lastUsedAt: fields.lastUsedAt ?? null,
    expiresAt: fields.expiresAt ?? null,
    defaultExpiry: fields.defaultExpiry === true,
  };
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

export function exportEntries(entries) {
  return JSON.stringify({ format: "copyhold", version: 1, entries }, null, 2);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isExpired(entry, now = Date.now()) {
  return entry.expiresAt != null && Date.parse(entry.expiresAt) <= now;
}

export function importEntries(json) {
  let backup;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error("This file does not contain valid JSON.");
  }
  // Backups made before the rename to Copyhold use the "clipfile" format name.
  if (!["copyhold", "clipfile"].includes(backup?.format) || backup.version !== 1 || !Array.isArray(backup.entries)) {
    throw new Error("Choose a Copyhold JSON backup.");
  }
  return backup.entries.map((entry, index) => {
    if (!entry || typeof entry.text !== "string" || !entry.text ||
      typeof entry.title !== "string" || typeof entry.description !== "string" ||
      !visibilityOptions.includes(entry.visibility) || typeof entry.pinned !== "boolean" ||
      !isTimestamp(entry.createdAt) || (entry.lastUsedAt !== null && !isTimestamp(entry.lastUsedAt)) ||
      (entry.expiresAt != null && !isTimestamp(entry.expiresAt))) {
      throw new Error(`Entry ${index + 1} is invalid. No entries were imported.`);
    }
    return createEntry({
      ...entry,
      expiresAt: entry.expiresAt == null ? null : new Date(entry.expiresAt).toISOString(),
    });
  }).filter((entry) => !isExpired(entry));
}
