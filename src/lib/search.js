// Search: keywords such as cat:Work or type:link narrow the list, and the remaining words rank clips,
// best match first, tolerating a typo in longer words.
import { clipType } from "./format.js";

export const clipKinds = ["text", "link", "email", "code", "color", "image"];
const flags = ["pinned", "template", "masked", "hidden", "expiring", "formatted", "snippet"];
// How much a match in each field counts; a title match outranks one deep in the text.
/** @type {[string, number][]} */
const fieldWeights = [["title", 4], ["tags", 3], ["category", 3], ["abbreviation", 3], ["subcategory", 2], ["description", 2], ["text", 1], ["sourceTitle", 1]];

/** What kind of content a clip holds, for type filters. */
export function clipKind(clip) {
  return clip.kind === "image" ? "image" : clipType(clip.text ?? "");
}

function dateBound(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

/**
 * Splits a search into words, #tags, and keywords:
 * cat:, sub:, tag:, type:, is:, before:, and after:. Unknown keywords are searched as words.
 * @param {string} query
 */
export function parseQuery(query) {
  const parsed = {
    words: /** @type {string[]} */ ([]),
    tags: /** @type {string[]} */ ([]),
    category: "",
    subcategory: "",
    types: /** @type {string[]} */ ([]),
    flags: /** @type {string[]} */ ([]),
    before: /** @type {number | undefined} */ (undefined),
    after: /** @type {number | undefined} */ (undefined),
  };
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const keyword = /^(\w+):(.+)$/.exec(token);
    const key = keyword?.[1].toLowerCase();
    const value = keyword?.[2] ?? "";
    if (/^#.+/.test(token)) parsed.tags.push(token.slice(1));
    else if (key === "tag") parsed.tags.push(value.replace(/^#/, ""));
    else if (key === "cat" || key === "category") parsed.category = value.replace(/_/g, " ");
    else if (key === "sub" || key === "subcategory") parsed.subcategory = value.replace(/_/g, " ");
    else if (key === "type" && clipKinds.includes(value.toLowerCase())) parsed.types.push(value.toLowerCase());
    else if (key === "is" && flags.includes(value.toLowerCase())) parsed.flags.push(value.toLowerCase());
    else if (key === "before" && dateBound(value) !== undefined) parsed.before = dateBound(value);
    else if (key === "after" && dateBound(value) !== undefined) parsed.after = dateBound(value);
    else parsed.words.push(token.toLocaleLowerCase());
  }
  return parsed;
}

function hasFlag(clip, flag) {
  if (flag === "pinned") return Boolean(clip.pinned);
  if (flag === "template") return Boolean(clip.template);
  if (flag === "masked") return clip.visibility === "masked";
  if (flag === "hidden") return clip.visibility === "hidden";
  if (flag === "expiring") return Boolean(clip.expiresAt);
  if (flag === "formatted") return Boolean(clip.html);
  return Boolean(clip.abbreviation);
}

/** True when the clip meets every keyword in the search. */
export function matchesKeywords(clip, parsed) {
  const lower = (value) => (value ?? "").toLocaleLowerCase();
  if (parsed.category && !lower(clip.category).startsWith(lower(parsed.category))) return false;
  if (parsed.subcategory && !lower(clip.subcategory).startsWith(lower(parsed.subcategory))) return false;
  if (!parsed.tags.every((term) => (clip.tags ?? []).some((tag) => lower(tag).startsWith(lower(term))))) return false;
  if (parsed.types.length && !parsed.types.includes(clipKind(clip))) return false;
  if (!parsed.flags.every((flag) => hasFlag(clip, flag))) return false;
  const saved = Date.parse(clip.createdAt);
  if (parsed.before !== undefined && !(saved < parsed.before)) return false;
  if (parsed.after !== undefined && !(saved >= parsed.after)) return false;
  return true;
}

// What can be searched in each field. Masked, hidden, and image clips are searched by their labels only.
/** @returns {[string, number][]} */
function fieldValues(clip) {
  return fieldWeights.map(([field, weight]) => {
    let value = clip[field];
    if (field === "text" && (clip.visibility !== "visible" || clip.kind === "image")) value = "";
    if (field === "tags") value = (value ?? []).join(" ");
    return /** @type {[string, number]} */ ([String(value ?? "").toLocaleLowerCase(), weight]);
  });
}

// True when the two words differ by at most one letter added, removed, or changed.
function withinOneEdit(first, second) {
  if (Math.abs(first.length - second.length) > 1) return false;
  let index = 0;
  while (index < first.length && first[index] === second[index]) index++;
  return first.slice(index + 1) === second.slice(index + 1) ||
    first.slice(index + 1) === second.slice(index) ||
    first.slice(index) === second.slice(index + 1);
}

/**
 * How well the clip matches every word, or 0 if any word doesn't match. A word at the start of a word
 * in a field counts most, then anywhere in a field, then, with fuzzy on, a word one typo away.
 * @param {any} clip
 * @param {string[]} words Lower-case words.
 * @param {{ fuzzy?: boolean }} [options]
 */
export function scoreClip(clip, words, { fuzzy = false } = {}) {
  if (!words.length) return 1;
  const fields = fieldValues(clip);
  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const [value, weight] of fields) {
      if (!value) continue;
      const at = value.indexOf(word);
      if (at >= 0) {
        const startsWord = at === 0 || /[\s\-_/.,:;([{"'#@]/.test(value[at - 1]);
        best = Math.max(best, weight * (startsWord ? 3 : 2));
      } else if (fuzzy && word.length >= 4) {
        if (value.split(/[^\p{L}\p{N}]+/u).some((part) => part.length >= 3 && withinOneEdit(part, word))) best = Math.max(best, weight);
      }
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

/**
 * Where the words appear in the text, as merged [start, end] ranges, for highlighting.
 * @param {string} text
 * @param {string[]} words Lower-case words.
 */
export function highlightRanges(text, words) {
  const lower = text.toLocaleLowerCase();
  // Lower-casing can change length for a few characters; highlighting is skipped then rather than misplaced.
  if (lower.length !== text.length || !words.length) return [];
  const ranges = [];
  for (const word of words) {
    let at = lower.indexOf(word);
    while (at >= 0 && ranges.length < 50) {
      ranges.push([at, at + word.length]);
      at = lower.indexOf(word, at + word.length);
    }
  }
  ranges.sort((first, second) => first[0] - second[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
