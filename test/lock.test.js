import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/environment.js";
import * as clipboard from "../src/lib/clipboard.js";
import { createEntry } from "../src/lib/entries.js";
import { changePassphrase, createLock, createOpener, seal, unlock } from "../src/lib/lock.js";
import * as store from "../src/lib/store.js";

const { lock, privateKey } = await createLock("correct horse battery");

test("sealed fields can be opened only with the private key", async () => {
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const sealed = await seal({ id: "a", text: "secret", title: "t", description: "", image, pinned: true, category: "Bank", tags: ["money", "pin"] }, lock);
  assert.equal(sealed.category, undefined);
  assert.equal(sealed.tags, undefined);
  assert.equal(sealed.text, undefined);
  assert.equal(sealed.pinned, true);
  assert.ok(sealed.sealed.text.data instanceof ArrayBuffer);
  const opened = await createOpener(privateKey)(sealed);
  assert.equal(opened.text, "secret");
  assert.equal(opened.title, "t");
  assert.equal(opened.category, "Bank");
  assert.deepEqual(opened.tags, ["money", "pin"]);
  assert.deepEqual(new Uint8Array(await opened.image.arrayBuffer()), new Uint8Array([1, 2, 3]));
  const { privateKey: otherKey } = await createLock("another passphrase");
  await assert.rejects(createOpener(otherKey)(sealed));
});

test("the passphrase unlocks the key, and changing it keeps the same key", async () => {
  await assert.rejects(unlock(lock, "wrong passphrase"), /isn't right/);
  const sealed = await seal({ text: "kept" }, lock);
  const changed = await changePassphrase(lock, privateKey, "new passphrase here");
  await assert.rejects(unlock(changed, "correct horse battery"));
  const key = await unlock(changed, "new passphrase here");
  assert.equal((await createOpener(key)(sealed)).text, "kept");
});

test("with the lock on, saved and edited clips are stored encrypted", async () => {
  await store.setMeta({ lock });
  assert.equal((await clipboard.captureAutomatically(() => ({ text: "captured while locked" }))), true);
  const clip = createEntry({ text: "added by hand" });
  await store.add([clip]);
  await store.update(clip.id, { title: "renamed" });
  const records = await store.list();
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.text, undefined);
    assert.equal(record.hash, undefined);
    assert.ok(record.sealed);
  }
  const open = createOpener(privateKey);
  const opened = await Promise.all(records.map(open));
  assert.deepEqual(opened.map((entry) => entry.text).sort(), ["added by hand", "captured while locked"]);
  assert.equal(opened.find((entry) => entry.id === clip.id).title, "renamed");
  // The clipboard fingerprint is slowed with PBKDF2, so it doesn't match the plain hash.
  const { fingerprint } = await store.getMeta(["fingerprint"]);
  assert.notEqual(fingerprint, await store.contentDigest({ text: "captured while locked" }));
  assert.equal(await clipboard.captureAutomatically(() => ({ text: "captured while locked" })), false);
});
