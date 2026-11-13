// Ways to change a clip's text as it is copied, and the placeholders templates fill in.
import { t } from "./i18n.js";

function prettyJson(text) {
  return JSON.stringify(JSON.parse(text), null, 2);
}

function isJson(text) {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function canDecodeUrl(text) {
  if (!/%[\da-f]{2}/i.test(text)) return false;
  try {
    return decodeURIComponent(text) !== text;
  } catch {
    return false;
  }
}

/**
 * Each transform has a key, the menu letter, and whether it applies to a text.
 * @type {{ id: string, key: string, applies: (text: string) => boolean, apply: (text: string) => string }[]}
 */
export const transforms = [
  { id: "trim", key: "T", applies: (text) => text !== text.trim(), apply: (text) => text.trim() },
  { id: "singleLine", key: "L", applies: (text) => /\n/.test(text.trim()), apply: (text) => text.trim().replace(/\s*\n\s*/g, " ") },
  { id: "upper", key: "U", applies: (text) => text !== text.toLocaleUpperCase(), apply: (text) => text.toLocaleUpperCase() },
  { id: "lower", key: "W", applies: (text) => text !== text.toLocaleLowerCase(), apply: (text) => text.toLocaleLowerCase() },
  {
    id: "title",
    key: "I",
    applies: (text) => /[a-z]/i.test(text),
    apply: (text) => text.toLocaleLowerCase().replace(/(^|[\s\-_/([{"'])(\p{L})/gu, (_, before, letter) => before + letter.toLocaleUpperCase()),
  },
  { id: "jsonPretty", key: "J", applies: isJson, apply: (text) => prettyJson(text.trim()) },
  { id: "jsonMinify", key: "N", applies: isJson, apply: (text) => JSON.stringify(JSON.parse(text.trim())) },
  { id: "urlEncode", key: "E", applies: (text) => encodeURIComponent(text) !== text, apply: (text) => encodeURIComponent(text) },
  { id: "urlDecode", key: "D", applies: canDecodeUrl, apply: (text) => decodeURIComponent(text) },
];

/** Transforms that would change this text. */
export function transformsFor(text) {
  return transforms.filter((transform) => transform.applies(text));
}

export function transformLabel(id) {
  return t(`transform_${id}`);
}

export const placeholders = ["date", "isodate", "time", "datetime", "weekday", "clipboard"];

/**
 * Fills {date}, {time}, and the other placeholders. Unknown ones are left as they are.
 * @param {string} text
 * @param {{ now?: Date, clipboard?: () => Promise<string> }} [options]
 */
export async function fillTemplate(text, { now = new Date(), clipboard = async () => "" } = {}) {
  const pad = (value) => String(value).padStart(2, "0");
  const values = {
    date: () => now.toLocaleDateString(),
    isodate: () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: () => now.toLocaleTimeString([], { timeStyle: "short" }),
    datetime: () => now.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    weekday: () => now.toLocaleDateString([], { weekday: "long" }),
  };
  const clipboardText = text.includes("{clipboard}") ? await clipboard().catch(() => "") : "";
  return text.replace(/\{(\w+)\}/g, (match, name) => {
    if (name === "clipboard") return clipboardText;
    return values[name]?.() ?? match;
  });
}

/** True when the text has at least one placeholder that a template would fill. */
export function hasPlaceholders(text) {
  return new RegExp(`\\{(?:${placeholders.join("|")})\\}`).test(text);
}
