// Rules that give newly saved clips a category and tags, such as "links from github.com go to Work › Code".
import { cleanName, cleanTags } from "./organize.js";

export const ruleKinds = ["contains", "domain", "pattern"];
// Rules check the start of long clips only, so a slow pattern can't stall saving a huge copy.
const ruleTextLimit = 10_000;
const maxPatternLength = 200;

/**
 * @typedef {{ id: string, kind: "contains" | "domain" | "pattern", value: string,
 *   category: string, subcategory: string, tags: string[] }} Rule
 */

/** Cleans a rule as typed in the rules dialog, or returns an error message key. */
export function cleanRule(rule) {
  const kind = ruleKinds.includes(rule.kind) ? rule.kind : "contains";
  const value = String(rule.value ?? "").trim();
  if (!value) return { error: "ruleNeedsValue" };
  if (kind === "pattern") {
    if (value.length > maxPatternLength) return { error: "rulePatternTooLong" };
    try {
      new RegExp(value, "i");
    } catch {
      return { error: "ruleBadPattern" };
    }
  }
  const category = cleanName(rule.category);
  const tags = cleanTags(rule.tags);
  if (!category && !tags.length) return { error: "ruleNeedsAction" };
  return {
    rule: {
      id: rule.id || crypto.randomUUID(),
      kind,
      value: kind === "domain" ? value.toLocaleLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : value,
      category,
      subcategory: category ? cleanName(rule.subcategory) : "",
      tags,
    },
  };
}

function hostsIn(text) {
  const hosts = [];
  for (const [url] of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    try {
      hosts.push(new URL(url).hostname.toLocaleLowerCase());
    } catch {
      // Not a full address; ignore it.
    }
  }
  return hosts;
}

/**
 * @param {Rule} rule
 * @param {string} fullText Only the start of long text is checked.
 * @param {string} [sourceUrl] The page a selection came from, which domain rules also check.
 */
export function ruleMatches(rule, fullText, sourceUrl = "") {
  const text = fullText.slice(0, ruleTextLimit);
  if (rule.kind === "contains") return text.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());
  if (rule.kind === "domain") {
    const hosts = hostsIn(`${text} ${sourceUrl}`);
    return hosts.some((host) => host === rule.value || host.endsWith(`.${rule.value}`));
  }
  try {
    return new RegExp(rule.value, "i").test(text);
  } catch {
    return false;
  }
}

/**
 * Applies matching rules to a clip. The first matching rule with a category sets it, unless the clip
 * already has one; tags from every matching rule are added.
 * @param {{ text: string, category?: string, subcategory?: string, tags?: string[], sourceUrl?: string }} clip
 * @param {Rule[]} rules
 * @returns {{ category: string, subcategory: string, tags: string[], matched: number }}
 */
export function applyRules(clip, rules) {
  let category = clip.category ?? "";
  let subcategory = clip.subcategory ?? "";
  let tags = [...clip.tags ?? []];
  let matched = 0;
  for (const rule of rules ?? []) {
    if (!ruleMatches(rule, clip.text ?? "", clip.sourceUrl)) continue;
    matched++;
    if (!category && rule.category) {
      category = rule.category;
      subcategory = rule.subcategory;
    }
    tags = cleanTags([...tags, ...rule.tags]);
  }
  return { category, subcategory, tags, matched };
}
