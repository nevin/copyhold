import assert from "node:assert/strict";
import test from "node:test";
import { clipPreview, clipType, displayLength, displayUrl, relativeTime, shortAge } from "../src/lib/format.js";

test("clipType recognizes links, emails, colors, and code", () => {
  const cases = {
    "https://github.com/a/b": "link",
    "sneha@example.com": "email",
    "#4334a3": "color",
    "rgb(1, 2, 3)": "color",
    "SELECT * FROM t": "code",
    "git status": "code",
    "const a = 1;": "code",
    "def main():": "code",
    "let me know (soon)": "text",
    "Export the report from Monday": "text",
    "Meeting at 3pm; bring notes": "text",
    "http:// not a url": "text",
    "   ": "text",
  };
  for (const [text, type] of Object.entries(cases)) assert.equal(clipType(text), type, text);
});

test("clipPreview masks, hides, and labels whitespace", () => {
  assert.equal(clipPreview("sk_test", "masked"), "sk_**");
  assert.equal(clipPreview("hunter2-very-secret", "hidden"), "Hidden · 19 characters");
  assert.equal(clipPreview("a", "hidden"), "Hidden · 1 character");
  assert.equal(clipPreview("   ", "visible"), "(spaces only)");
});

test("displayLength counts graphemes, and code units for very long text", () => {
  assert.equal(displayLength("héllo👋🏽"), 6);
  assert.equal(displayLength("x".repeat(30_000)), 30_000);
});

test("displayUrl drops the scheme and a bare trailing slash", () => {
  assert.equal(displayUrl("https://github.com/"), "github.com");
  assert.equal(displayUrl("https://x.dev/a?b=1#c"), "x.dev/a?b=1#c");
});

test("relativeTime and shortAge describe times in words and short form", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const at = (offset) => new Date(now + offset).toISOString();
  assert.equal(relativeTime(at(-30e3), now), "just now");
  assert.equal(relativeTime(at(-3_600e3), now), "1 hour ago");
  assert.equal(relativeTime(at(86_400e3 - 60e3), now), "tomorrow");
  assert.equal(relativeTime(at(20e3), now), "in under a minute");
  assert.equal(shortAge(at(-20e3), now), "now");
  assert.equal(shortAge(at(-8 * 60e3), now), "8m");
  assert.equal(shortAge(at(-2.5 * 3_600e3), now), "2h");
  assert.equal(shortAge(at(-3 * 86_400e3), now), "3d");
  assert.equal(shortAge(at(-15 * 86_400e3), now), "2w");
});
