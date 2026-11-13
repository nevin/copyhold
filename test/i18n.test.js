import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { t, tn } from "../src/lib/i18n.js";

const messages = JSON.parse(await readFile(new URL("../src/_locales/en/messages.json", import.meta.url), "utf8"));

test("messages fill substitutions and pick plural forms", () => {
  assert.equal(t("expiresIn", "in 2 hours"), "Expires in 2 hours");
  assert.equal(tn("clipCount", 1), "1 clip");
  assert.equal(tn("clipCount", 1200), "1,200 clips");
});

test("every key used in the source and markup exists", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(new URL("../src", import.meta.url), { recursive: true }))
    .filter((file) => /\.(js|html)$/.test(file));
  const missing = new Set();
  for (const file of files) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
    for (const [, key] of source.matchAll(/\bt\("(\w+)"/g)) if (!messages[key]) missing.add(key);
    for (const [, key] of source.matchAll(/\btn\("(\w+)"/g)) if (!messages[`${key}_other`]) missing.add(key);
    for (const [, key] of source.matchAll(/data-i18n(?:-[\w-]+)?="(\w+)"/g)) if (!messages[key]) missing.add(key);
  }
  assert.deepEqual([...missing], []);
});

test("message names are unique ignoring case, as Chrome requires", () => {
  const names = Object.keys(messages).map((name) => name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
