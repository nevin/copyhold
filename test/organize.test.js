import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanTags, collectOrganization, emptyFilter, matchesFilter, matchesTagTerms, matchesText, parseQuery, parseTags,
} from "../src/lib/organize.js";

const clip = (fields) => ({ title: "", description: "", text: "", visibility: "visible", category: "", subcategory: "", tags: [], ...fields });

test("tags are trimmed, lose a leading #, and don't repeat ignoring case", () => {
  assert.deepEqual(cleanTags([" Work ", "#urgent", "work", "", "  ", "two  words"]), ["Work", "urgent", "two words"]);
  assert.deepEqual(parseTags("alpha, #beta,,ALPHA"), ["alpha", "beta"]);
  assert.equal(cleanTags(Array.from({ length: 30 }, (_, index) => `tag ${index}`)).length, 20);
  assert.deepEqual(cleanTags("not a list"), []);
});

test("searches split into text and #tag terms", () => {
  assert.deepEqual(parseQuery("  #work Invoice  #2026 "), { text: "invoice", tags: ["work", "2026"] });
  assert.deepEqual(parseQuery("#"), { text: "#", tags: [] });
});

test("filters match category, subcategory, and all chosen tags", () => {
  const invoice = clip({ category: "Work", subcategory: "Invoices", tags: ["urgent", "Finance"] });
  const recipe = clip({ category: "Home", tags: ["food"] });
  const filter = (fields) => ({ ...emptyFilter(), ...fields });
  assert.equal(matchesFilter(invoice, filter({ category: "work" })), true);
  assert.equal(matchesFilter(invoice, filter({ category: "Work", subcategory: "Receipts" })), false);
  assert.equal(matchesFilter(invoice, filter({ tags: ["finance", "URGENT"] })), true);
  assert.equal(matchesFilter(invoice, filter({ tags: ["finance", "food"] })), false);
  assert.equal(matchesFilter(recipe, filter({ category: "Work" })), false);
  assert.equal(matchesFilter(clip({}), emptyFilter()), true);
});

test("text search covers category and tags, even for masked clips", () => {
  const masked = clip({ text: "secret value", visibility: "masked", category: "Accounts", tags: ["bank"] });
  assert.equal(matchesText(masked, "secret"), false);
  assert.equal(matchesText(masked, "account"), true);
  assert.equal(matchesText(masked, "bank"), true);
  assert.equal(matchesTagTerms(masked, ["ba"]), true);
  assert.equal(matchesTagTerms(masked, ["bank", "work"]), false);
  assert.equal(matchesText(clip({}), "anything"), false);
});

test("categories, subcategories, and tags are collected with counts", () => {
  const { categories, tags } = collectOrganization([
    clip({ category: "Work", subcategory: "Invoices", tags: ["urgent"] }),
    clip({ category: "work", subcategory: "Notes", tags: ["Urgent", "later"] }),
    clip({ category: "Home" }),
    clip({}),
  ]);
  assert.deepEqual(categories.map(({ name, count, subcategories }) => [name, count, subcategories.map((sub) => sub.name)]),
    [["Home", 1, []], ["Work", 2, ["Invoices", "Notes"]]]);
  assert.deepEqual(tags.map(({ name, count }) => [name, count]), [["later", 1], ["urgent", 2]]);
});
