import assert from "node:assert/strict";
import test from "node:test";
import { setClipboard } from "./helpers/environment.js";
import * as clipboard from "../src/lib/clipboard.js";
import * as settings from "../src/lib/settings.js";
import * as store from "../src/lib/store.js";

const texts = async () => (await store.list()).map((entry) => entry.text).sort();

test("a pending skip records the current clipboard without saving it", async () => {
  await store.skipCurrentClipboard();
  assert.equal(await clipboard.captureAutomatically(() => "before consent"), false);
  assert.deepEqual(await store.getMeta(["skipClipboard"]), {});
  assert.deepEqual(await texts(), []);
});

test("unchanged text is skipped and new text is saved with the default retention", async () => {
  await settings.updateSettings({ retentionDays: 7 });
  assert.equal(await clipboard.captureAutomatically(() => "before consent"), false);
  assert.equal(await clipboard.captureAutomatically(() => "first"), true);
  const [first] = await store.list();
  assert.equal(first.defaultExpiry, true);
  assert.ok(Math.abs(Date.parse(first.expiresAt) - Date.now() - 7 * 86_400_000) < 5_000);
  await settings.updateSettings({ retentionDays: 0 });
});

test("failed reads and empty text save nothing", async () => {
  assert.equal(await clipboard.captureAutomatically(() => undefined), null);
  assert.equal(await clipboard.captureAutomatically(() => ""), false);
  assert.deepEqual(await texts(), ["first"]);
});

test("Save clipboard deduplicates and leaves a pending skip in place", async () => {
  await store.skipCurrentClipboard();
  setClipboard("first");
  assert.equal(await clipboard.saveClipboard(), false);
  setClipboard("saved by hand");
  assert.equal(await clipboard.saveClipboard(), true);
  assert.equal((await store.getMeta(["skipClipboard"])).skipClipboard, true);
  assert.equal(await clipboard.captureAutomatically(() => "after pause"), false);
  assert.deepEqual(await texts(), ["first", "saved by hand"]);
});

test("copying a clip records it so automatic capture doesn't save it again", async () => {
  await clipboard.copyToClipboard("copied from a clip");
  assert.equal(await clipboard.captureAutomatically(() => "copied from a clip"), false);
  assert.deepEqual(await texts(), ["first", "saved by hand"]);
});

test("very long text isn't saved automatically, and the skip is recorded", async () => {
  const long = "x".repeat(clipboard.autoCaptureMaxLength + 1);
  assert.equal(await clipboard.captureAutomatically(() => long), false);
  assert.ok((await store.getMeta(["skippedLongAt"])).skippedLongAt > 0);
  assert.equal((await store.list()).some((entry) => entry.text === long), false);
});

test("captures respect the history size", async () => {
  await settings.updateSettings({ historyLimit: 2 });
  assert.equal(await clipboard.captureAutomatically(() => "newest"), true);
  assert.equal((await store.list()).length, 2);
  assert.ok((await texts()).includes("newest"));
});
