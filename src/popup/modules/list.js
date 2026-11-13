import { sortEntries } from "../../lib/entries.js";
import { clipPreview, clipType, displayLength, displayUrl, relativeTime, shortAge } from "../../lib/format.js";
import { emptyFilter, isFiltering, matchesFilter, matchesTagTerms, matchesText, parseQuery } from "../../lib/organize.js";
import { sensitiveLabel } from "../../lib/sensitive.js";
import { updateSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { copyEntry, deleteEntry, openClipPreview, togglePin } from "./actions.js";
import { byId, icon, iconPaths, run, status, textLine, timeElement } from "./dom.js";
import { openEditor } from "./editor.js";
import { filterByTag, showActiveFilters } from "./filters.js";
import { menuIsOpen, openMenu, openMenuForActive, recentlyClosedFor } from "./menu.js";
import { setClipSelected, startSelection } from "./selection.js";
import { changes, state } from "./state.js";
import { t, tn } from "../../lib/i18n.js";

export const search = byId("search");
export const clipList = byId("entries");
const clearSearch = byId("clear-search");
const allClips = byId("all-clips");
const pinnedClips = byId("pinned-clips");
const groups = { pinned: byId("pinned-group"), recent: byId("recent-group") };
const selectVisible = byId("select-visible");
const showMore = byId("show-more");
/** @type {Map<string, { revision: string, item: HTMLElement }>} */
const clipItems = new Map();
// Rendering every match makes large histories slow, so the list grows in steps.
const renderStep = 200;
let renderLimit = renderStep;
let hiddenMatches = 0;
let renderVersion = 0;
let pendingListUpdate = false;
let copiedClipId;
let copiedFeedbackTimer;

setInterval(() => {
  for (const time of clipList.querySelectorAll("time")) time.textContent = relativeTime(time.dateTime);
  for (const age of clipList.querySelectorAll(".clip-age")) age.textContent = shortAge(age.dataset.time);
}, 60_000);

export function clipName(entry) {
  return entry.title ||
    (entry.kind === "image" && t("image")) ||
    (entry.visibility === "visible" && entry.text.trim().replace(/\s+/g, " ").slice(0, 60)) ||
    t("untitledClip");
}

export function clipItem(id) {
  return clipItems.get(id)?.item;
}

function updateCopyFeedback(id, copied) {
  const item = clipItem(id);
  if (!item) return;
  const button = /** @type {HTMLElement} */ (item.querySelector('[data-action="copy"]'));
  button.querySelector("path").setAttribute("d", iconPaths[copied ? "copied" : "copy"]);
  button.title = copied ? t("copiedToClipboard") : t("copy");
  item.classList.toggle("is-copied", copied);
}

export function showCopyFeedback(id) {
  clearTimeout(copiedFeedbackTimer);
  const announcement = byId("copy-status");
  announcement.textContent = t("copiedAnnouncement");
  updateCopyFeedback(copiedClipId, false);
  copiedClipId = id;
  updateCopyFeedback(id, true);
  copiedFeedbackTimer = setTimeout(() => {
    announcement.textContent = "";
    updateCopyFeedback(id, false);
    copiedClipId = undefined;
  }, 1800);
}

// Row actions are for pointers; keyboard users reach the same actions from search and the actions menu.
// They aren't buttons because a list option may not contain focusable controls.
function rowButton(action, label, handler, iconName = action) {
  const button = document.createElement("span");
  button.className = `row-action ${action}`;
  button.dataset.action = action;
  button.title = label;
  button.append(icon(iconName));
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", handler);
  return button;
}

function previewFor(entry, visibility) {
  const visible = visibility === "visible";
  const type = visible ? clipType(entry.text) : "text";
  const placeholder = !visible || !entry.text.trim();
  const preview = textLine(
    "p",
    `preview${placeholder ? " protected" : ""}${type === "code" ? " code" : ""}${type === "link" ? " link" : ""}`,
    type === "link" ? displayUrl(entry.text) : clipPreview(entry.text, visibility),
  );
  if (type === "color" && CSS.supports("color", entry.text.trim())) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = entry.text.trim();
    preview.prepend(swatch);
  } else if (type !== "text" && type !== "color") {
    preview.prepend(icon(type, "action-icon type-icon"));
  }
  return preview;
}

function imagePreviewFor(entry, visibility) {
  const preview = document.createElement("div");
  preview.className = "image-preview";
  if (visibility === "visible" && entry.thumbnail) {
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.src = URL.createObjectURL(entry.thumbnail);
    image.addEventListener("load", () => URL.revokeObjectURL(image.src), { once: true });
    preview.append(image);
  } else {
    preview.append(icon("image", "action-icon type-icon"));
  }
  preview.append(textLine("span", "image-size", t("imageDimensions", entry.width, entry.height)));
  return preview;
}

/** A coloured dot for a category, or null when the category has no colour. */
export function categoryDot(category, className = "category-dot") {
  const color = category && state.categoryColors[category.toLocaleLowerCase()];
  if (!color) return null;
  const dot = document.createElement("span");
  dot.className = className;
  dot.dataset.color = color;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// The category, tags, template badge, and source page under a clip. Selecting a tag filters by it.
function labelsFor(entry) {
  const tags = entry.tags ?? [];
  if (!entry.category && !tags.length && !entry.template && !entry.sourceUrl && !entry.expiresAt && !entry.sensitive) return null;
  const labels = document.createElement("div");
  labels.className = "clip-labels";
  // The chips and link are for pointers; screen readers get the same facts as text, since options can't hold controls.
  labels.setAttribute("aria-hidden", "true");
  if (entry.sensitive) {
    const shield = icon("shield", "action-icon meta-icon");
    const marker = document.createElement("span");
    marker.className = "label-shield";
    marker.title = t("maskedAutomatically", sensitiveLabel(entry.sensitive));
    marker.append(shield);
    labels.append(marker);
  }
  if (entry.template) {
    const badge = textLine("span", "template-badge", t("templateLabel"));
    badge.title = t("templateHint");
    labels.append(badge);
  }
  if (entry.category) {
    const category = textLine("span", "category", entry.subcategory
      ? t("categoryPath", entry.category, entry.subcategory) : entry.category);
    const dot = categoryDot(entry.category);
    if (dot) category.prepend(dot);
    labels.append(category);
  }
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = `#${tag}`;
    chip.title = t("filterByTag", tag);
    chip.addEventListener("mousedown", (event) => event.preventDefault());
    chip.addEventListener("click", () => filterByTag(tag));
    labels.append(chip);
  }
  if (entry.expiresAt) {
    const expiry = document.createElement("span");
    expiry.className = "label-expiry";
    appendMessage(expiry, "metaExpires", timeElement(entry.expiresAt));
    labels.append(expiry);
  }
  if (entry.sourceUrl) {
    const source = textLine("span", "source-link", t("fromSite", hostOf(entry.sourceUrl)));
    source.title = entry.sourceTitle ? `${entry.sourceTitle}\n${entry.sourceUrl}` : entry.sourceUrl;
    source.addEventListener("click", () => window.open(entry.sourceUrl, "_blank", "noopener,noreferrer"));
    labels.append(source);
  }
  return labels;
}

function describeLabels(entry) {
  const parts = [];
  if (entry.template) parts.push(t("templateLabel"));
  if (entry.category) parts.push(t("categoryDescription", entry.subcategory ? t("categoryPath", entry.category, entry.subcategory) : entry.category));
  if (entry.tags?.length) parts.push(t("tagsDescription", entry.tags.join(", ")));
  if (entry.sourceUrl) parts.push(t("fromSite", hostOf(entry.sourceUrl)));
  return parts.join(". ");
}

function sizeLabel(entry) {
  if (entry.kind === "image") return t("imageLabel", entry.width, entry.height);
  return tn("characters", displayLength(entry.text));
}

function itemFor(entry) {
  const item = document.createElement("div");
  item.className = "clip";
  item.id = `clip-${entry.id}`;
  item.dataset.id = entry.id;
  item.setAttribute("role", "option");
  const check = document.createElement("span");
  check.className = "clip-check";
  check.setAttribute("aria-hidden", "true");
  const key = document.createElement("kbd");
  key.className = "clip-key";
  key.setAttribute("aria-hidden", "true");
  const usedAt = entry.lastUsedAt ?? entry.createdAt;
  const age = textLine("span", Date.now() - Date.parse(usedAt) < 3_600_000 ? "clip-age is-fresh" : "clip-age", shortAge(usedAt));
  age.dataset.time = usedAt;
  age.setAttribute("aria-hidden", "true");
  // The details line is gone from view; the age's tooltip keeps when it was used and how long it is.
  age.title = `${t(entry.lastUsedAt ? "metaCopied" : "metaSaved", relativeTime(usedAt))} · ${sizeLabel(entry)}`;
  const label = sizeLabel(entry);
  const size = textLine("span", "clip-size", entry.kind === "image" ? t("imageShort") : displayLength(entry.text).toLocaleString());
  size.title = label;
  size.setAttribute("aria-hidden", "true");

  const visibility = state.hidePreviews && entry.visibility === "visible" ? "masked" : entry.visibility;
  const details = document.createElement("div");
  details.className = "clip-details";
  if (entry.title) details.append(textLine("p", "clip-title", entry.title));
  details.append(entry.kind === "image" ? imagePreviewFor(entry, visibility) : previewFor(entry, visibility));
  if (entry.description) details.append(textLine("p", "description", entry.description));
  const labels = labelsFor(entry);
  if (labels) details.append(labels, textLine("span", "sr-only", describeLabels(entry)));
  const meta = document.createElement("p");
  meta.className = "meta";
  appendMessage(meta, entry.lastUsedAt ? "metaCopied" : "metaSaved", timeElement(entry.lastUsedAt ?? entry.createdAt));
  if (entry.expiresAt) {
    meta.append(t("metaSeparator"));
    appendMessage(meta, "metaExpires", timeElement(entry.expiresAt));
  }
  if (entry.visibility !== "hidden") meta.append(t("metaSeparator"), label);
  // Read by screen readers only; the row shows the same facts more briefly.
  if (entry.sensitive) meta.append(t("metaSeparator"), t("maskedAutomatically", sensitiveLabel(entry.sensitive)));
  details.append(meta);

  const actions = document.createElement("div");
  actions.className = "clip-actions";
  actions.setAttribute("aria-hidden", "true");
  // Preview shows the whole clip without copying it; masked and hidden clips stay concealed until revealed.
  // "preview" already names the clip text, so the button gets its own class.
  const preview = rowButton("show-preview", t("preview"), () => {
    setActive(entry.id);
    openClipPreview(entry);
  }, "preview");
  preview.classList.add("quick");
  const pin = rowButton("pin", entry.pinned ? t("unpin") : t("pin"), () => togglePin(entry));
  pin.classList.add("quick");
  pin.classList.toggle("is-on", entry.pinned);
  const edit = rowButton("edit", t("edit"), () => openEditor(entry));
  edit.classList.add("quick");
  const remove = rowButton("delete", t("delete"), () => deleteEntry(entry));
  remove.classList.add("quick");
  actions.append(
    preview,
    pin,
    edit,
    remove,
    rowButton("copy", t("copy"), () => copyEntry(entry)),
    rowButton("more", t("moreActions"), (event) => {
      // The click that light-dismissed this entry's menu should not reopen it.
      if (recentlyClosedFor(entry.id)) return;
      setActive(entry.id);
      openMenu(entry, event.currentTarget);
    }),
  );
  item.append(check, age, details, size, key, actions);
  const dot = categoryDot(entry.category, "category-dot clip-dot");
  if (dot) details.prepend(dot);
  // Compact rows have no room for tags, so they show how many there are.
  if (entry.tags?.length) {
    const count = textLine("span", "clip-tag-count", `#${entry.tags.length}`);
    count.title = entry.tags.map((tag) => `#${tag}`).join(" ");
    count.setAttribute("aria-hidden", "true");
    details.after(count);
  }

  item.addEventListener("mousedown", (event) => {
    if (event.shiftKey) event.preventDefault();
  });
  item.addEventListener("click", (event) => {
    if (/** @type {Element} */ (event.target).closest(".row-action, .tag, .source-link")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(item, true)) return;
    setActive(entry.id);
    if (state.selecting) setClipSelected(entry.id, !state.selectedIds.has(entry.id));
    else if (event.shiftKey) startSelection(entry.id);
    else copyEntry(entry);
  });
  item.addEventListener("contextmenu", (event) => {
    if (state.selecting) return;
    event.preventDefault();
    setActive(entry.id);
    openMenu(entry, item, event.clientX, event.clientY);
  });
  return item;
}

// Appends a message whose $1 is an element, such as a time, keeping the word order of the language.
function appendMessage(parent, key, element) {
  const [before, after = ""] = t(key, "\u0000").split("\u0000");
  parent.append(before, element, after);
}

function setEmptyState(title, hints, showReset) {
  byId("empty-title").textContent = title;
  const container = byId("empty-hints");
  if (container.textContent !== hints.join("")) {
    container.replaceChildren(...hints.map((hint) => textLine("p", "", hint)));
  }
  byId("reset-filters").hidden = !showReset;
}

export function updateEmptyState() {
  const hasQuery = Boolean(search.value.trim()) || isFiltering(state.filter);
  const pinnedOnly = pinnedClips.checked;
  if (hasQuery) {
    const candidates = pinnedOnly ? state.clips.filter((clip) => clip.pinned) : state.clips;
    const hints = [pinnedOnly ? t("tryDifferentSearchOrAll") : t("tryDifferentSearch")];
    if (candidates.some((clip) => clip.visibility !== "visible" || clip.kind === "image")) {
      hints.push(t("searchLimitations"));
    }
    if (isFiltering(state.filter)) hints.unshift(t("filterEmptyHint"));
    setEmptyState(t("noMatchingClips"), hints, true);
  } else if (pinnedOnly) {
    setEmptyState(t("noPinnedClips"), [t("noPinnedHint")], true);
  } else {
    const hints = [state.autoCaptureEnabled ? t("emptyAutoHint") : t("emptyManualHint")];
    if (state.openShortcut) hints.push(t("emptyOpenShortcut", state.openShortcut));
    if (state.saveShortcut) hints.push(t("emptySaveShortcut", state.saveShortcut));
    hints.push(t("emptyPrivacy"));
    setEmptyState(t("welcome"), hints, false);
  }
}

globalThis.chrome?.commands?.getAll?.().then((commands) => {
  state.openShortcut = commands.find(({ name }) => name === "_execute_action")?.shortcut ?? "";
  state.saveShortcut = commands.find(({ name }) => name === "save-clipboard")?.shortcut ?? "";
  updateEmptyState();
}).catch(() => {});

export function updateItemStates() {
  const { selecting, selectedIds, shownClips, activeId } = state;
  byId("list-tools").hidden = selecting;
  byId("bulk-actions").hidden = !selecting;
  clipList.classList.toggle("is-selecting", selecting);
  clipList.setAttribute("aria-multiselectable", String(selecting));
  for (const [id, { item }] of clipItems) {
    const selected = selectedIds.has(id);
    item.classList.toggle("is-selected", selecting && selected);
    item.classList.toggle("is-active", id === activeId);
    item.setAttribute("aria-selected", String(selecting ? selected : id === activeId));
  }
  if (clipItems.has(activeId)) search.setAttribute("aria-activedescendant", `clip-${activeId}`);
  else search.removeAttribute("aria-activedescendant");

  const count = selectedIds.size;
  const summary = t("selectedCount", count);
  const selectedCount = byId("selected-count");
  if (selectedCount.textContent !== summary) selectedCount.textContent = summary;
  selectVisible.checked = count > 0 && count === shownClips.length;
  selectVisible.indeterminate = count > 0 && count < shownClips.length;
  selectVisible.disabled = shownClips.length === 0;
  for (const id of ["delete-selected", "copy-selected", "pin-selected", "organize-selected"]) byId(id).disabled = count === 0;
  byId("pin-selected").textContent = count && state.clips.filter((clip) => selectedIds.has(clip.id)).every((clip) => clip.pinned)
    ? t("unpin") : t("pin");
  updateSearchHint();
}

function updateSearchHint() {
  const { shownClips, selecting } = state;
  byId("search-shortcut").textContent = !shownClips.length ? ""
    : selecting ? t("searchHintSelect") : t("searchHintCopy");
}

export function setActive(id) {
  state.activeId = id;
  updateItemStates();
  clipItem(id)?.scrollIntoView({ block: "nearest" });
}


export function renderList(resetActive = false) {
  if (document.querySelector("dialog[open]")) {
    pendingListUpdate = true;
    return;
  }
  pendingListUpdate = false;
  const { clips, selectedIds } = state;
  const query = search.value.trim();
  const { text, tags } = parseQuery(query);
  const pinnedOnly = pinnedClips.checked;
  const filtering = isFiltering(state.filter);
  const matches = clips.filter((clip) => (!pinnedOnly || clip.pinned) &&
    matchesText(clip, text) && matchesTagTerms(clip, tags) && (!filtering || matchesFilter(clip, state.filter)));
  const hadFocus = clipList.contains(document.activeElement);
  const pinnedMatches = matches.filter((clip) => clip.pinned).length;
  // The Pinned filter shows only pinned clips, so folding them away there would empty the list.
  const collapsed = state.pinnedCollapsed && !pinnedOnly;
  const listed = collapsed ? matches.filter((clip) => !clip.pinned) : matches;

  if (resetActive) renderLimit = renderStep;
  const shown = listed.slice(0, renderLimit);
  hiddenMatches = listed.length - shown.length;
  const visibleIds = new Set(shown.map(({ id }) => id));
  state.shownClips = shown;
  for (const id of selectedIds) if (!visibleIds.has(id)) selectedIds.delete(id);
  for (const [id, { item }] of clipItems) {
    if (!visibleIds.has(id)) {
      item.remove();
      clipItems.delete(id);
    }
  }
  const rows = { pinned: [], recent: [] };
  shown.forEach((entry, index) => {
    const revision = `${entry.revision ?? 0}:${state.hidePreviews}:${state.colorsVersion}`;
    let cached = clipItems.get(entry.id);
    if (cached?.revision !== revision) {
      cached?.item.remove();
      cached = { revision, item: itemFor(entry) };
      clipItems.set(entry.id, cached);
      if (entry.id === copiedClipId) updateCopyFeedback(entry.id, true);
    }
    const shortcut = index < 9 ? String(index + 1) : "";
    cached.item.querySelector(".clip-key").textContent = shortcut;
    if (shortcut) cached.item.setAttribute("aria-keyshortcuts", `Alt+${shortcut}`);
    else cached.item.removeAttribute("aria-keyshortcuts");
    rows[entry.pinned ? "pinned" : "recent"].push(cached.item);
  });
  for (const [name, group] of Object.entries(groups)) {
    group.replaceChildren(group.querySelector(".group-heading"), ...rows[name]);
    group.hidden = name === "pinned" ? pinnedMatches === 0 : rows[name].length === 0;
  }
  byId("pinned-heading").hidden = pinnedOnly;
  byId("recent-heading").hidden = pinnedMatches === 0 || pinnedOnly;
  const toggle = byId("pinned-toggle");
  toggle.dataset.expanded = String(!collapsed);
  toggle.title = collapsed ? t("expandPinned") : t("collapsePinned");
  const accessibleToggle = byId("pinned-toggle-sr");
  accessibleToggle.hidden = pinnedMatches === 0 || pinnedOnly;
  accessibleToggle.setAttribute("aria-expanded", String(!collapsed));
  accessibleToggle.textContent = `${collapsed ? t("expandPinned") : t("collapsePinned")} (${pinnedMatches.toLocaleString()})`;
  byId("pinned-count").textContent = pinnedMatches.toLocaleString();
  showMore.hidden = hiddenMatches === 0;
  showMore.textContent = t("showMore", Math.min(renderStep, hiddenMatches).toLocaleString(), hiddenMatches.toLocaleString());
  if (hadFocus && !clipList.contains(document.activeElement)) search.focus({ preventScroll: true });

  if (resetActive || !visibleIds.has(state.activeId)) state.activeId = listed[0]?.id;
  updateItemStates();
  if (resetActive) clipList.scrollTop = 0;

  const count = tn("clipCount", matches.length);
  // While the rest of a large history loads, only the first screenful is known.
  const summary = state.partial ? ""
    : query || pinnedOnly || filtering ? t("clipCountFiltered", matches.length.toLocaleString(), clips.length.toLocaleString()) : count;
  byId("count").textContent = summary;
  if (resetActive) byId("search-status").textContent = query ? t("clipsFound", count) : t("clipsShown", count);
  search.setAttribute("aria-expanded", String(matches.length > 0));
  clearSearch.hidden = search.value.length === 0;
  clipList.hidden = matches.length === 0;
  byId("empty").hidden = matches.length > 0 || state.partial;
  updateEmptyState();
  byId("export").disabled = clips.length === 0;
  showActiveFilters();
}

/** Hooks that turn stored entries into displayable clips, such as decrypting them. */
export const loaders = {
  /** @param {any[]} entries @returns {Promise<any[]>} */
  prepare: async (entries) => entries,
};

// The first screenful comes from an index, so the popup paints before a large history finishes loading.
export async function render({ quick = false } = {}) {
  const version = ++renderVersion;
  // The index holds clips in recent order, so other orders wait for the whole history.
  if (quick && state.sortOrder === "recent") {
    const first = await loaders.prepare(await store.listRecent(renderStep));
    if (version !== renderVersion) return;
    state.clips = first;
    state.partial = first.length === renderStep;
    renderList();
    if (!state.partial) return;
  }
  const entries = sortEntries(await loaders.prepare(await store.list()), state.sortOrder);
  if (version !== renderVersion) return;
  state.clips = entries;
  state.partial = false;
  renderList();
}

export async function refresh(message) {
  changes.postMessage("updated");
  await render();
  if (message !== undefined) status(message);
}

// Fast typing renders once per frame; keys that act on the list flush a pending render first.
let pendingSearchFrame = 0;
function flushSearch() {
  if (!pendingSearchFrame) return;
  cancelAnimationFrame(pendingSearchFrame);
  pendingSearchFrame = 0;
  renderList(true);
}
search.addEventListener("input", () => {
  if (pendingSearchFrame) return;
  pendingSearchFrame = requestAnimationFrame(() => {
    pendingSearchFrame = 0;
    renderList(true);
  });
});
showMore.addEventListener("click", () => {
  renderLimit += renderStep;
  renderList();
});
search.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  flushSearch();
  const { shownClips, selecting, selectedIds } = state;
  const index = shownClips.findIndex(({ id }) => id === state.activeId);
  const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[event.key];
  if (move > 0 && hiddenMatches && index + move >= shownClips.length) {
    renderLimit += renderStep;
    renderList();
  }
  if (move && state.shownClips.length) {
    event.preventDefault();
    const next = index < 0 ? 0 : Math.max(0, Math.min(state.shownClips.length - 1, index + move));
    setActive(state.shownClips[next].id);
    return;
  }
  const active = shownClips[index];
  if (!active) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (selecting) setClipSelected(active.id, !selectedIds.has(active.id));
    else if (event.shiftKey) openMenuForActive();
    else copyEntry(active);
  } else if (!selecting && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
    event.preventDefault();
    openMenuForActive();
  }
});

// Alt+1 to Alt+9 copy the clip at that position. Event codes keep this working on macOS,
// where Option+digit types a symbol.
document.addEventListener("keydown", (event) => {
  if (event.key === "Alt") clipList.classList.add("show-keys");
  const digit = /^Digit([1-9])$/.exec(event.code);
  if (!digit || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || state.selecting ||
      document.querySelector("dialog[open]") || menuIsOpen()) return;
  const entry = state.shownClips[Number(digit[1]) - 1];
  if (!entry) return;
  event.preventDefault();
  setActive(entry.id);
  copyEntry(entry);
});
document.addEventListener("keyup", (event) => {
  if (event.key === "Alt") clipList.classList.remove("show-keys");
});
addEventListener("blur", () => clipList.classList.remove("show-keys"));

export function setSortOrder(order) {
  state.sortOrder = order;
  byId("sort-order").value = order;
  state.clips = sortEntries(state.clips, order);
  renderList(true);
}

export function setCategoryColors(colors) {
  state.categoryColors = colors ?? {};
  // Rows are cached by revision, so a new colors version rebuilds them.
  state.colorsVersion++;
  renderList();
}

byId("sort-order").addEventListener("change", (event) => {
  setSortOrder(event.target.value);
  run(() => updateSettings({ sortOrder: state.sortOrder }));
});

export function setPinnedCollapsed(collapsed) {
  state.pinnedCollapsed = collapsed;
  renderList();
}

byId("pinned-toggle").addEventListener("mousedown", (event) => event.preventDefault());
for (const id of ["pinned-toggle", "pinned-toggle-sr"]) {
  byId(id).addEventListener("click", () => {
    setPinnedCollapsed(!state.pinnedCollapsed);
    run(() => updateSettings({ pinnedCollapsed: state.pinnedCollapsed }));
  });
}

for (const filter of [allClips, pinnedClips]) {
  filter.addEventListener("change", () => renderList(true));
}
clearSearch.addEventListener("click", () => {
  search.value = "";
  search.focus();
  renderList(true);
});
byId("reset-filters").addEventListener("click", () => {
  search.value = "";
  allClips.checked = true;
  state.filter = emptyFilter();
  search.focus();
  renderList(true);
});
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("close", () => {
    if (pendingListUpdate) renderList();
  });
}
changes.addEventListener("message", () => run(render));
