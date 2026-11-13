import assert from "node:assert/strict";
import test from "node:test";
import { compareEntries, createEntry, exportEntries, importEntries, sortEntries, withDefaultRetention } from "../src/lib/entries.js";

const entry = {
  text: "hi", title: "", description: "", visibility: "visible", pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, expiresAt: null,
};

test("backups round-trip and accept the earlier Clipfile format", () => {
  assert.equal(JSON.parse(exportEntries([])).format, "copyhold");
  for (const format of ["copyhold", "clipfile"]) {
    const [imported] = importEntries(JSON.stringify({ format, version: 1, entries: [entry] }));
    assert.equal(imported.text, "hi");
    assert.notEqual(imported.id, undefined);
  }
});

test("invalid backups are rejected without importing anything", () => {
  assert.throws(() => importEntries("not json"), /valid JSON/);
  assert.throws(() => importEntries(JSON.stringify({ format: "other", version: 1, entries: [] })), /Copyhold JSON backup/);
  const bad = { format: "copyhold", version: 1, entries: [entry, { ...entry, pinned: "yes" }] };
  assert.throws(() => importEntries(JSON.stringify(bad)), /Entry 2 is invalid/);
});

test("expired entries are dropped on import", () => {
  const expired = { ...entry, expiresAt: "2020-01-01T00:00:00.000Z" };
  assert.equal(importEntries(JSON.stringify({ format: "copyhold", version: 1, entries: [expired] })).length, 0);
});

test("default retention applies to new unpinned clips without an expiry", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const kept = withDefaultRetention(createEntry({ text: "a" }), 7, now);
  assert.equal(kept.expiresAt, new Date(now + 7 * 86_400_000).toISOString());
  assert.equal(kept.defaultExpiry, true);
  assert.equal(withDefaultRetention(createEntry({ text: "a", pinned: true }), 7, now).expiresAt, null);
  assert.equal(withDefaultRetention(createEntry({ text: "a" }), 0, now).expiresAt, null);
});

test("pinned clips sort first, then by most recent use", () => {
  const old = createEntry({ text: "old", createdAt: "2026-01-01T00:00:00.000Z" });
  const used = createEntry({ text: "used", createdAt: "2025-01-01T00:00:00.000Z", lastUsedAt: "2026-06-01T00:00:00.000Z" });
  const pinned = createEntry({ text: "pinned", pinned: true, createdAt: "2024-01-01T00:00:00.000Z" });
  assert.deepEqual([old, used, pinned].sort(compareEntries).map((e) => e.text), ["pinned", "used", "old"]);
});

test("sortEntries matches compareEntries", () => {
  const clips = Array.from({ length: 50 }, (_, index) => createEntry({
    text: `clip ${index}`,
    pinned: index % 7 === 0,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (index * 13) % 40)).toISOString(),
    lastUsedAt: index % 3 ? null : new Date(Date.UTC(2026, 1, 1 + (index * 7) % 20)).toISOString(),
  }));
  assert.deepEqual(sortEntries(clips).map((entry) => entry.id), [...clips].sort(compareEntries).map((entry) => entry.id));
});
