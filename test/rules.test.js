import assert from "node:assert/strict";
import test from "node:test";
import { applyRules, cleanRule, ruleMatches } from "../src/lib/rules.js";

const rule = (fields) => cleanRule({ category: "", tags: [], ...fields }).rule;

test("rules are cleaned, and incomplete ones explain why", () => {
  assert.equal(cleanRule({ kind: "contains", value: " ", tags: ["a"] }).error, "ruleNeedsValue");
  assert.equal(cleanRule({ kind: "pattern", value: "(", tags: ["a"] }).error, "ruleBadPattern");
  assert.equal(cleanRule({ kind: "contains", value: "x" }).error, "ruleNeedsAction");
  assert.equal(rule({ kind: "domain", value: "https://www.GitHub.com/path", tags: ["code"] }).value, "github.com");
});

test("rules match words, sites, and patterns", () => {
  assert.equal(ruleMatches(rule({ kind: "contains", value: "Invoice", tags: ["x"] }), "your INVOICE is ready"), true);
  const github = rule({ kind: "domain", value: "github.com", tags: ["x"] });
  assert.equal(ruleMatches(github, "see https://gist.github.com/abc"), true);
  assert.equal(ruleMatches(github, "see https://notgithub.com/abc"), false);
  assert.equal(ruleMatches(github, "selected words", "https://github.com/org/repo"), true);
  assert.equal(ruleMatches(rule({ kind: "pattern", value: "^INV-\\d+$", tags: ["x"] }), "inv-2041"), true);
});

test("the first category wins, an existing one is kept, and tags add up", () => {
  const rules = [
    rule({ kind: "contains", value: "invoice", category: "Work", subcategory: "Billing", tags: ["finance"] }),
    rule({ kind: "contains", value: "invoice", category: "Home", tags: ["Finance", "urgent"] }),
    rule({ kind: "contains", value: "recipe", category: "Home", tags: ["food"] }),
  ];
  assert.deepEqual(applyRules({ text: "Invoice 42" }, rules),
    { category: "Work", subcategory: "Billing", tags: ["finance", "urgent"], matched: 2 });
  assert.deepEqual(applyRules({ text: "invoice", category: "Mine", tags: ["kept"] }, rules),
    { category: "Mine", subcategory: "", tags: ["kept", "finance", "urgent"], matched: 2 });
  assert.equal(applyRules({ text: "nothing" }, rules).matched, 0);
});

test("patterns are length-limited and run on the start of long text only", () => {
  assert.equal(cleanRule({ kind: "pattern", value: "a".repeat(201), tags: ["x"] }).error, "rulePatternTooLong");
  const late = rule({ kind: "contains", value: "needle", tags: ["x"] });
  assert.equal(ruleMatches(late, `${"x".repeat(20_000)} needle`), false);
  assert.equal(ruleMatches(late, `needle ${"x".repeat(20_000)}`), true);
});
