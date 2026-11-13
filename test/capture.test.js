import assert from "node:assert/strict";
import test from "node:test";
import { setClipboard } from "./helpers/environment.js";
import * as clipboard from "../src/lib/clipboard.js";
import * as settings from "../src/lib/settings.js";
import * as store from "../src/lib/store.js";

const texts = async () => (await store.list()).map((entry) => entry.text).sort();

test("turning capture on with an empty clipboard doesn't skip the next copy", async () => {
  await store.skipCurrentClipboard();
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "" })), false);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "next copy" })), true);
  await store.removeMany((await store.list()).map(({ id }) => id));
});

test("a pending skip records the current clipboard without saving it", async () => {
  await store.skipCurrentClipboard();
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "before consent" })), false);
  assert.deepEqual(await store.getMeta(["skipClipboard"]), {});
  assert.deepEqual(await texts(), []);
});

test("unchanged text is skipped and new text is saved with the default retention", async () => {
  await settings.updateSettings({ retentionDays: 7 });
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "before consent" })), false);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "first" })), true);
  const [first] = await store.list();
  assert.equal(first.defaultExpiry, true);
  assert.ok(Math.abs(Date.parse(first.expiresAt) - Date.now() - 7 * 86_400_000) < 5_000);
  await settings.updateSettings({ retentionDays: 0 });
});

test("failed reads and empty text save nothing", async () => {
  assert.equal(await clipboard.captureAutomatically(() => undefined), null);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "" })), false);
  assert.deepEqual(await texts(), ["first"]);
});

test("Save clipboard deduplicates and leaves a pending skip in place", async () => {
  await store.skipCurrentClipboard();
  setClipboard("first");
  assert.equal((await clipboard.saveClipboard()).existing, true);
  setClipboard("saved by hand");
  assert.equal((await clipboard.saveClipboard()).added, true);
  assert.equal((await store.getMeta(["skipClipboard"])).skipClipboard, true);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "after pause" })), false);
  assert.deepEqual(await texts(), ["first", "saved by hand"]);
});

test("copying a clip records it so automatic capture doesn't save it again", async () => {
  await clipboard.copyClip({ kind: "text", text: "copied from a clip" });
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "copied from a clip" })), false);
  assert.deepEqual(await texts(), ["first", "saved by hand"]);
});

test("very long text isn't saved automatically, and the skip is recorded", async () => {
  const long = "x".repeat(clipboard.autoCaptureMaxLength + 1);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: long })), false);
  assert.ok((await store.getMeta(["skippedLongAt"])).skippedLongAt > 0);
  assert.equal((await store.list()).some((entry) => entry.text === long), false);
});

test("captures respect the history size", async () => {
  await settings.updateSettings({ historyLimit: 2 });
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "newest" })), true);
  assert.equal((await store.list()).length, 2);
  assert.ok((await texts()).includes("newest"));
});

test("copying the same text again moves its clip to the top instead of saving a duplicate", async () => {
  await settings.updateSettings({ historyLimit: 0 });
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "again" })), true);
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "something else" })), true);
  const before = (await store.list()).find((entry) => entry.text === "again");
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "again" })), true);
  const matches = (await store.list()).filter((entry) => entry.text === "again");
  assert.equal(matches.length, 1);
  assert.ok(matches[0].lastUsedAt > before.createdAt);
  assert.equal((await store.listRecent(1))[0].text, "again");
});

test("text that looks like a secret is masked, or skipped when chosen", async () => {
  // A made-up key, assembled at runtime so secret scanners don't mistake it for a real one.
  const key = ["sk", "live", "51HxQabcdefghijklmnopqrstu"].join("_");
  assert.equal(await clipboard.captureAutomatically(() => ({ text: key })), true);
  const saved = (await store.list()).find((entry) => entry.text === key);
  assert.equal(saved.visibility, "masked");
  assert.equal(saved.sensitive, "apiKey");

  await settings.updateSettings({ sensitiveClips: "skip" });
  const card = "4242 4242 4242 4242";
  assert.equal(await clipboard.captureAutomatically(() => ({ text: card })), false);
  assert.equal((await store.list()).some((entry) => entry.text === card), false);
  // Saving by hand is a deliberate choice, so the clip is kept, masked.
  setClipboard(card);
  const result = await clipboard.saveClipboard();
  assert.equal(result.sensitive, "cardNumber");
  assert.match(result.message, /masked/);

  await settings.updateSettings({ sensitiveClips: "keep" });
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "Tr0ub4dor&3xyz" })), true);
  assert.equal((await store.list()).find((entry) => entry.text === "Tr0ub4dor&3xyz").visibility, "visible");
  await settings.updateSettings({ sensitiveClips: "mask" });
});

test("a selection from the context menu is saved without touching the clipboard fingerprint", async () => {
  const { fingerprint } = await store.getMeta(["fingerprint"]);
  assert.equal((await clipboard.saveSelection("selected on a page")).added, true);
  assert.equal((await store.getMeta(["fingerprint"])).fingerprint, fingerprint);
});

test("auto-tag rules categorize and tag new clips, and selections keep their page", async () => {
  await settings.updateSettings({
    rules: [{ id: "r1", kind: "domain", value: "example.com", category: "Work", subcategory: "Links", tags: ["web"] }],
  });
  assert.equal((await clipboard.saveSelection("read this later", { url: "https://docs.example.com/page", title: "Docs" })).added, true);
  const saved = (await store.list()).find((entry) => entry.text === "read this later");
  assert.deepEqual([saved.category, saved.subcategory, saved.tags, saved.sourceTitle], ["Work", "Links", ["web"], "Docs"]);
  await settings.updateSettings({ rules: [] });
});
