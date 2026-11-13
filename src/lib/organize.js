// Categories, subcategories, and tags, and the filters built from them.
// Each clip has at most one category, one subcategory within it, and any number of tags.

export const maxTags = 20;
const maxNameLength = 40;

/** Trims a category, subcategory, or tag name and collapses its spaces. */
export function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, maxNameLength);
}

const sameName = (first, second) => first.localeCompare(second, undefined, { sensitivity: "accent" }) === 0;

/**
 * Cleans a list of tags: no blanks, no leading #, and no duplicates ignoring case, keeping the first spelling.
 * @param {unknown} tags
 * @returns {string[]}
 */
export function cleanTags(tags) {
  const cleaned = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const name = cleanName(cleanName(tag).replace(/^#+/, ""));
    if (name && !cleaned.some((existing) => sameName(existing, name))) cleaned.push(name);
  }
  return cleaned.slice(0, maxTags);
}

/** Splits typed text such as "work, #urgent" into tags. */
export function parseTags(text) {
  return cleanTags(String(text).split(","));
}

/**
 * Every category with its subcategories, and every tag, with how many clips use each, sorted by name.
 * @param {any[]} clips
 */
export function collectOrganization(clips) {
  const categories = new Map();
  const tags = new Map();
  const sorted = (map) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  const counted = (map, name) => {
    const key = name.toLocaleLowerCase();
    const item = map.get(key) ?? { name, count: 0 };
    item.count++;
    map.set(key, item);
    return item;
  };
  for (const clip of clips) {
    if (clip.category) {
      const category = counted(categories, clip.category);
      category.subcategories ??= new Map();
      if (clip.subcategory) counted(category.subcategories, clip.subcategory);
    }
    for (const tag of clip.tags ?? []) counted(tags, tag);
  }
  return {
    categories: sorted(categories).map((category) => ({ ...category, subcategories: sorted(category.subcategories) })),
    tags: sorted(tags),
  };
}

/**
 * Splits a search into text and #tag terms, so "#work invoice" finds clips tagged work that mention invoice.
 * @param {string} query
 */
export function parseQuery(query) {
  const tags = [];
  const words = [];
  for (const word of query.trim().split(/\s+/)) {
    if (/^#.+/.test(word)) tags.push(word.slice(1));
    else if (word) words.push(word);
  }
  return { text: words.join(" ").toLocaleLowerCase(), tags };
}

/**
 * @typedef {{ category: string, subcategory: string, tags: string[] }} Filter
 * Empty strings and an empty list match every clip. A clip must have all the chosen tags.
 */

/** @returns {Filter} */
export function emptyFilter() {
  return { category: "", subcategory: "", tags: [] };
}

export function isFiltering(filter) {
  return Boolean(filter.category || filter.tags.length);
}

/**
 * @param {any} clip
 * @param {Filter} filter
 */
export function matchesFilter(clip, filter) {
  if (filter.category && !sameName(clip.category ?? "", filter.category)) return false;
  if (filter.subcategory && !sameName(clip.subcategory ?? "", filter.subcategory)) return false;
  const clipTags = clip.tags ?? [];
  return filter.tags.every((tag) => clipTags.some((clipTag) => sameName(clipTag, tag)));
}

/**
 * Matches the text part of a search against what the clip shows. Masked, hidden, and image clips
 * match by title, description, category, and tags only.
 */
export function matchesText(clip, text) {
  if (!text) return true;
  const fields = [clip.title, clip.description, clip.category, clip.subcategory, ...(clip.tags ?? [])];
  if (clip.visibility === "visible" && clip.kind !== "image") fields.push(clip.text);
  return fields.some((value) => value?.toLocaleLowerCase().includes(text));
}

/** True when a tag search term matches one of the clip's tags; a term may be the start of a tag. */
export function matchesTagTerms(clip, terms) {
  const clipTags = (clip.tags ?? []).map((tag) => tag.toLocaleLowerCase());
  return terms.every((term) => clipTags.some((tag) => tag.startsWith(term.toLocaleLowerCase())));
}
