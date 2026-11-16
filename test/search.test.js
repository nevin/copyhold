import assert from "node:assert/strict";
import test from "node:test";
import { clipKind, highlightRanges, matchesKeywords, parseQuery, scoreClip } from "../src/lib/search.js";

const clip = (fields) => ({
  text: "", title: "", description: "", visibility: "visible", category: "", subcategory: "", tags: [],
  createdAt: "2026-06-01T00:00:00.000Z", ...fields,
});

test("searches split into words, tags, and keywords", () => {
  const parsed = parseQuery("invoice #work cat:Finance sub:Bills type:link is:pinned before:2026-07-01 after:2026-01-01 type:nope");
  assert.deepEqual(parsed.words, ["invoice", "type:nope"]);
  assert.deepEqual(parsed.tags, ["work"]);
  assert.deepEqual([parsed.category, parsed.subcategory, parsed.types, parsed.flags], ["Finance", "Bills", ["link"], ["pinned"]]);
  assert.equal(parsed.before, Date.parse("2026-07-01"));
  assert.equal(parsed.after, Date.parse("2026-01-01"));
});

test("keywords narrow by category, tags, type, flags, and date", () => {
  const link = clip({ text: "https://example.com", category: "Finance", subcategory: "Bills", tags: ["work"], pinned: true });
  assert.equal(matchesKeywords(link, parseQuery("cat:fin sub:bill #wo type:link is:pinned")), true);
  assert.equal(matchesKeywords(link, parseQuery("type:code")), false);
  assert.equal(matchesKeywords(link, parseQuery("is:template")), false);
  assert.equal(matchesKeywords(link, parseQuery("before:2026-01-01")), false);
  assert.equal(matchesKeywords(link, parseQuery("after:2026-01-01")), true);
  assert.equal(clipKind({ kind: "image" }), "image");
});

test("better matches score higher, and fuzzy search forgives one typo", () => {
  const titled = clip({ title: "Invoice template", text: "body" });
  const inText = clip({ text: "see the attached invoice" });
  const inside = clip({ text: "reinvoiced later" });
  const [a, b, c] = [titled, inText, inside].map((item) => scoreClip(item, ["invoice"]));
  assert.ok(a > b && b > c && c > 0);
  assert.equal(scoreClip(clip({ text: "an invoce arrived" }), ["invoice"]), 0);
  assert.ok(scoreClip(clip({ text: "an invoce arrived" }), ["invoice"], { fuzzy: true }) > 0);
  assert.equal(scoreClip(clip({ text: "secret invoice", visibility: "masked" }), ["invoice"]), 0);
  assert.equal(scoreClip(inText, ["invoice", "missing"]), 0);
});

test("matches are highlighted as merged ranges", () => {
  assert.deepEqual(highlightRanges("Invoice for the invoices", ["invoice"]), [[0, 7], [16, 23]]);
  assert.deepEqual(highlightRanges("abcdef", ["abc", "cde"]), [[0, 5]]);
  assert.deepEqual(highlightRanges("nothing here", ["zzz"]), []);
});
