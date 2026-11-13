import { t, tn } from "./i18n.js";

const segmenter = new Intl.Segmenter();
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
/** @type {[Intl.RelativeTimeFormatUnit, number][]} */
const relativeUnits = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const shellCommand = /^(?:\$ )?(?:sudo|ssh|scp|git|npm|npx|pnpm|yarn|docker|kubectl|curl|wget|cd|ls|cat|grep|python3?|node|brew|make|cargo|go)\s/;

export function characterCount(text) {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

// Counting graphemes is exact but slow for very long text, where code units are close enough.
export function displayLength(text) {
  return text.length > 20_000 ? text.length : characterCount(text);
}

function maskedPreview(text) {
  const trimmed = text.trim();
  let previousIndex = 0;
  let count = 0;
  for (const { index } of segmenter.segment(trimmed)) {
    if (count === 3) return trimmed.slice(0, index) + "**";
    previousIndex = index;
    count++;
  }
  // Leave at least one character concealed in short clips.
  return trimmed.slice(0, previousIndex) + "**";
}

export function clipPreview(text, visibility) {
  if (visibility === "hidden") {
    return tn("hiddenPreview", displayLength(text));
  }
  if (visibility === "masked") return maskedPreview(text);
  return text.trim() ? text : t("spacesOnly");
}

export function clipType(text) {
  const value = text.trim();
  if (!value) return "text";
  if (/^(#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|hsl)a?\([^()]*\))$/i.test(value)) return "color";
  if (!/\s/.test(value)) {
    if (/^https?:\/\//i.test(value) && URL.canParse(value)) return "link";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  }
  if (/^(?:select|insert|update|delete|with|create|alter|drop)\s/i.test(value) || shellCommand.test(value) ||
    /[{};]\s*$/m.test(value) || /^\s*(?:const|let|var)\s+[\w$]+\s*=/m.test(value) ||
    /^\s*(?:function|def|class)\s+[\w$]+\s*[({:]/m.test(value) || /^\s*(?:import|export)\s.*\bfrom\b/m.test(value)) {
    return "code";
  }
  return "text";
}

export function displayUrl(text) {
  const url = new URL(text.trim());
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.host}${path}${url.search}${url.hash}`;
}

// A short age such as "8m", "2h", "3d", or "2w" for compact lists.
export function shortAge(timestamp, now = Date.now()) {
  const minutes = Math.max(0, (now - Date.parse(timestamp)) / 60_000);
  if (minutes < 1) return t("ageNow");
  if (minutes < 60) return t("ageMinutes", Math.floor(minutes));
  const hours = minutes / 60;
  if (hours < 24) return t("ageHours", Math.floor(hours));
  const days = hours / 24;
  if (days < 7) return t("ageDays", Math.floor(days));
  if (days < 35) return t("ageWeeks", Math.floor(days / 7));
  return shortDate.format(new Date(timestamp));
}

export function relativeTime(timestamp, now = Date.now()) {
  const seconds = (Date.parse(timestamp) - now) / 1000;
  if (Math.abs(seconds) < 60) return seconds < 0 ? t("justNow") : t("inUnderAMinute");
  // A little slack lets values just under a unit, such as a day set a moment ago, read as that unit.
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(seconds) >= size * 0.97) return relativeFormat.format(Math.round(seconds / size), unit);
  }
}
