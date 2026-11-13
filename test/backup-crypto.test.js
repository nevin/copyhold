import assert from "node:assert/strict";
import test from "node:test";
import { decryptBackup, encryptBackup, encryptedBackup } from "../src/lib/backup-crypto.js";
import { createEntry, exportEntries, importEntries } from "../src/lib/entries.js";

test("a protected backup round-trips with the right passphrase only", async () => {
  const json = await exportEntries([createEntry({ text: "secret clip", tags: ["private"] })]);
  const protectedJson = await encryptBackup(json, "backup passphrase");
  assert.equal(protectedJson.includes("secret clip"), false);
  const backup = encryptedBackup(protectedJson);
  assert.equal(backup.version, 2);
  assert.equal(encryptedBackup(json), null);
  await assert.rejects(decryptBackup(backup, "wrong passphrase"), /doesn't open this backup/);
  const [clip] = await importEntries(await decryptBackup(backup, "backup passphrase"));
  assert.deepEqual([clip.text, clip.tags], ["secret clip", ["private"]]);
});

test("a protected backup with tampered settings is refused", async () => {
  const backup = encryptedBackup(await encryptBackup("{}", "backup passphrase"));
  backup.encryption.iterations = 1;
  await assert.rejects(decryptBackup(backup, "backup passphrase"), /Copyhold JSON backup/);
});
