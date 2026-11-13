import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/environment.js";
import { createEntry } from "../src/lib/entries.js";
import * as settings from "../src/lib/settings.js";
import * as store from "../src/lib/store.js";

// A version 3 database, as releases before the meta store left it.
await new Promise((resolve, reject) => {
  const request = indexedDB.open("clipfile", 3);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("entries", { keyPath: "id" }).createIndex("expiresAt", "expiresAt");
    const clipboard = request.result.createObjectStore("clipboard");
    clipboard.put(7, "retentionDays");
    clipboard.put("old-fingerprint", "fingerprint");
  };
  request.onsuccess = () => {
    request.result.close();
    resolve();
  };
  request.onerror = () => reject(request.error);
});

test("upgrading keeps settings and capture state from the old clipboard store", async () => {
  assert.deepEqual(await settings.getSettings(), {
    autoCapture: false,
    autoCaptureAsked: false,
    pausedUntil: 0,
    retentionDays: 7,
    closeAfterCopy: true,
    historyLimit: 0,
    density: "comfortable",
    hidePreviews: false,
  });
  assert.equal((await store.getMeta(["fingerprint"])).fingerprint, "old-fingerprint");
});

test("settings changes are saved and reach listeners", async () => {
  const seen = [];
  const stop = settings.onSettingsChange((changes) => seen.push(changes));
  await settings.updateSettings({ retentionDays: 0 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  stop();
  assert.deepEqual(seen, [{ retentionDays: 0 }]);
  assert.equal((await settings.getSettings()).retentionDays, 0);
});

test("setMeta with keepExisting never overwrites", async () => {
  await store.setMeta({ autoCaptureAsked: true });
  await store.setMeta({ autoCaptureAsked: false, other: 1 }, { keepExisting: true });
  assert.deepEqual(await store.getMeta(["autoCaptureAsked", "other"]), { autoCaptureAsked: true, other: 1 });
});

test("every update increases a clip's revision", async () => {
  const clip = createEntry({ text: "revision" });
  await store.add([clip]);
  await store.update(clip.id, { pinned: true });
  await store.update(clip.id, { title: "t" });
  assert.equal((await store.list()).find((entry) => entry.id === clip.id).revision, 2);
  await store.remove(clip.id);
});

test("pinning clears a default expiry but keeps a manual one", async () => {
  const automatic = createEntry({ text: "auto", expiresAt: "2099-01-01T00:00:00.000Z", defaultExpiry: true });
  const manual = createEntry({ text: "manual", expiresAt: "2099-01-01T00:00:00.000Z" });
  await store.add([automatic, manual]);
  await store.update(automatic.id, { pinned: true });
  await store.update(manual.id, { pinned: true });
  const byText = Object.fromEntries((await store.list()).map((entry) => [entry.text, entry]));
  assert.equal(byText.auto.expiresAt, null);
  assert.equal(byText.manual.expiresAt, "2099-01-01T00:00:00.000Z");
  await store.removeMany([automatic.id, manual.id]);
});

test("expired clips are hidden from the list and removed by cleanup", async () => {
  const expired = createEntry({ text: "expired", expiresAt: "2020-01-01T00:00:00.000Z" });
  await store.add([expired]);
  assert.equal((await store.list()).some((entry) => entry.id === expired.id), false);
  assert.equal(await store.removeExpired(), true);
  assert.equal(await store.removeExpired(), false);
});

test("trimHistory keeps pinned clips and the most recently used unpinned ones", async () => {
  const now = Date.now();
  const clips = Array.from({ length: 6 }, (_, index) =>
    createEntry({ text: `trim ${index}`, createdAt: new Date(now - index * 60_000).toISOString() }));
  clips[5].lastUsedAt = new Date(now).toISOString();
  clips[4].pinned = true;
  await store.add(clips);
  assert.equal(await store.trimHistory(0), 0);
  assert.equal(await store.trimHistory(100), 0);
  assert.equal(await store.trimHistory(3), 2);
  const left = (await store.list()).filter((entry) => entry.text.startsWith("trim")).map((entry) => entry.text).sort();
  assert.deepEqual(left, ["trim 0", "trim 1", "trim 4", "trim 5"]);
});
