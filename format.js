const segmenter = new Intl.Segmenter();
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const relativeUnits = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const shellCommand = /^(?:\$ )?(?:sudo|ssh|scp|git|npm|npx|pnpm|yarn|docker|kubectl|curl|wget|cd|ls|cat|grep|python3?|node|brew|make|cargo|go)\s/;

export function characterCount(text) {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
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
    const count = characterCount(text);
    return `Hidden · ${count} ${count === 1 ? "character" : "characters"}`;
  }
  if (visibility === "masked") return maskedPreview(text);
  return text.trim() ? text : "(spaces only)";
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

export function relativeTime(timestamp, now = Date.now()) {
  const seconds = (Date.parse(timestamp) - now) / 1000;
  if (Math.abs(seconds) < 60) return seconds < 0 ? "just now" : "in under a minute";
  // A little slack lets values just under a unit, such as a day set a moment ago, read as that unit.
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(seconds) >= size * 0.97) return relativeFormat.format(Math.round(seconds / size), unit);
  }
}
