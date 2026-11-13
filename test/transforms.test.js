import assert from "node:assert/strict";
import test from "node:test";
import { fillTemplate, hasPlaceholders, transforms, transformsFor } from "../src/lib/transforms.js";

const apply = (id, text) => transforms.find((transform) => transform.id === id).apply(text);

test("transforms change text as expected", () => {
  assert.equal(apply("trim", "  hi \n"), "hi");
  assert.equal(apply("singleLine", "one\n  two\nthree "), "one two three");
  assert.equal(apply("upper", "Straße"), "STRASSE");
  assert.equal(apply("title", "hello wORLD-wide (beta)"), "Hello World-Wide (Beta)");
  assert.equal(apply("jsonPretty", '{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(apply("jsonMinify", '{ "a": 1 }'), '{"a":1}');
  assert.equal(apply("urlEncode", "a b&c"), "a%20b%26c");
  assert.equal(apply("urlDecode", "a%20b%26c"), "a b&c");
});

test("only transforms that would change the text are offered", () => {
  const ids = (text) => transformsFor(text).map(({ id }) => id);
  assert.ok(!ids("hello").includes("jsonPretty"));
  assert.ok(ids('{"a":1}').includes("jsonPretty"));
  assert.ok(!ids("HELLO").includes("upper"));
  assert.ok(!ids("plain").includes("urlDecode"));
  assert.ok(!ids("100%zz").includes("urlDecode"));
  assert.ok(!ids("one line").includes("singleLine"));
  assert.equal(new Set(transforms.map(({ key }) => key)).size, transforms.length);
});

test("templates fill placeholders and leave unknown ones", async () => {
  const now = new Date(2026, 10, 13, 9, 5);
  const filled = await fillTemplate("On {isodate} ({weekday}): {clipboard} {unknown}", { now, clipboard: async () => "pasted" });
  assert.equal(filled, `On 2026-11-13 (${now.toLocaleDateString([], { weekday: "long" })}): pasted {unknown}`);
  assert.equal(await fillTemplate("{clipboard}", { clipboard: async () => { throw new Error("denied"); } }), "");
  assert.equal(hasPlaceholders("Hi {date}"), true);
  assert.equal(hasPlaceholders("const x = {a}"), false);
});
