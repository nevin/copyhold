import {
  compareEntries, createEntry, exportEntries, importEntries, isExpired, withDefaultRetention,
} from "./entries.js";
import { copyToClipboard, saveClipboard, supportsAutoCapture } from "./clipboard.js";
import { clipPreview, clipType, displayUrl, relativeTime } from "./format.js";
import {
  getSettings, getTheme, onSettingsChange, onThemeChange, setTheme, updateSettings,
} from "./settings.js";
import * as store from "./store.js";

const byId = (id) => document.getElementById(id);
const editor = byId("editor");
const previewDialog = byId("clip-preview");
const previewText = byId("clip-preview-text");
const revealPreview = byId("clip-preview-reveal");
let previewEntry;
const editForm = byId("edit-form");
const editorOptions = byId("editor-options");
const expiryInput = byId("expires-at");
const confirmation = byId("confirmation");
const file = byId("file");
const fullTab = new URLSearchParams(location.search).get("view") === "tab";
const changes = new BroadcastChannel("clipfile-entries");
const autoCapture = byId("auto-capture");
const closeAfterCopyInput = byId("close-after-copy");
const capturePause = byId("capture-pause");
const captureRetry = byId("capture-retry");
const undoBar = byId("undo-bar");
const undoButton = byId("undo-delete");
const undoDuration = 12_000;
const undoHolds = new Set();
let deletedClips = [];
let undoTimer;
let undoRemaining = 0;
let undoStarted = 0;
const retentionDays = byId("retention-days");
let capturePausedUntil = 0;
let captureHealthy = true;
const search = byId("search");
const clearSearch = byId("clear-search");
const allClips = byId("all-clips");
const pinnedClips = byId("pinned-clips");
const clipList = byId("entries");
const groups = { pinned: byId("pinned-group"), recent: byId("recent-group") };
const clipMenu = byId("clip-menu");
let menuEntryId;
let menuClosedAt = 0;
const finishSelection = byId("finish-selection");
const selectVisible = byId("select-visible");
const deleteSelected = byId("delete-selected");
const selectedIds = new Set();
let selecting = false;
let shownClips = [];
let activeId;
const settings = document.querySelector(".settings");
const themeOptions = settings.querySelectorAll('[name="theme"]');
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const isMac = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform);
let editedEntry;
let renderVersion = 0;
let clips = [];
let autoCaptureEnabled = false;
let pendingListUpdate = false;
let updatingCapture = false;
let copiedClipId;
let copiedFeedbackTimer;
let closeAfterCopy = true;
let openShortcut = "";
const clipItems = new Map();

document.documentElement.classList.toggle("full-tab", fullTab);
byId("open-tab").hidden = fullTab;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
  for (const option of themeOptions) option.checked = option.value === theme;
}

applyTheme(getTheme());
systemTheme.addEventListener("change", () => applyTheme(getTheme()));
settings.addEventListener("change", (event) => {
  if (event.target.name !== "theme") return;
  setTheme(event.target.value);
  applyTheme(getTheme());
});
onThemeChange(applyTheme);

function closeSettings() {
  settings.open = false;
  settings.querySelector("summary").focus();
}

document.addEventListener("click", (event) => {
  if (settings.open && !settings.contains(event.target)) settings.open = false;
});

settings.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !settings.open) return;
  event.preventDefault();
  closeSettings();
});
byId("close-settings").addEventListener("click", closeSettings);

function status(message, error = false) {
  const output = byId("status");
  output.textContent = message;
  output.classList.toggle("error", error);
}

const iconPaths = {
  copied: "m5 12 4 4L19 6",
  copy: "M8 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM15 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pin: "m16 3 5 5-3 1-3 4v3h-2l-5-5V9h3l4-3 1-3ZM11 14l-7 7",
  edit: "m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z",
  preview: "M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h6",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5",
  select: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
  open: "M14 4h6v6m0-6-9 9m7 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "M3 3l18 18M10 6.2c.6-.1 1.3-.2 2-.2 6.4 0 10 6 10 6a16 16 0 0 1-3 3.4M6.2 7.8A17 17 0 0 0 2 12s3.6 6 10 6c1.5 0 2.9-.3 4.1-.9M10 10a3 3 0 0 0 4 4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  code: "m8 8-4 4 4 4m8-8 4 4-4 4",
  email: "M4 6h16v12H4ZM4 7l8 6 8-6",
};

function icon(name, className = "action-icon") {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", `${className} icon-${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", iconPaths[name]);
  svg.append(path);
  return svg;
}

// Row buttons are for pointers; keyboard users reach the same actions from search.
function rowButton(action, label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.className = action === "copy" ? "secondary copy" : `quiet ${action}`;
  button.dataset.action = action;
  button.title = label;
  button.append(icon(action));
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", handler);
  return button;
}

function textLine(tag, className, text) {
  const line = document.createElement(tag);
  line.className = className;
  line.textContent = text;
  return line;
}

function timeElement(timestamp) {
  const time = document.createElement("time");
  time.dateTime = timestamp;
  time.title = dateFormat.format(new Date(timestamp));
  time.textContent = relativeTime(timestamp);
  return time;
}

setInterval(() => {
  for (const time of clipList.querySelectorAll("time")) time.textContent = relativeTime(time.dateTime);
}, 60_000);

function clipName(entry) {
  return entry.title ||
    (entry.visibility === "visible" && entry.text.trim().replace(/\s+/g, " ").slice(0, 60)) ||
    "Untitled clip";
}

function updateCopyFeedback(id, copied) {
  const item = clipItems.get(id)?.item;
  if (!item) return;
  const button = item.querySelector('[data-action="copy"]');
  button.querySelector("path").setAttribute("d", iconPaths[copied ? "copied" : "copy"]);
  button.title = copied ? "Copied to clipboard" : "Copy";
  item.classList.toggle("is-copied", copied);
}

function showCopyFeedback(id) {
  clearTimeout(copiedFeedbackTimer);
  const announcement = byId("copy-status");
  announcement.textContent = "Copied to clipboard.";
  updateCopyFeedback(copiedClipId, false);
  copiedClipId = id;
  updateCopyFeedback(id, true);
  copiedFeedbackTimer = setTimeout(() => {
    announcement.textContent = "";
    updateCopyFeedback(id, false);
    copiedClipId = undefined;
  }, 1800);
}

function copyEntry(entry) {
  return run(async () => {
    if (isExpired(entry)) {
      await refresh("This clip has expired.");
      return;
    }
    await copyToClipboard(entry.text);
    showCopyFeedback(entry.id);
    try {
      await store.update(entry.id, { lastUsedAt: new Date().toISOString() });
    } catch {
      throw new Error("Text copied, but its last-used time could not be saved.");
    }
    await refresh();
    // Leave the confirmation on screen briefly so closing does not feel abrupt.
    if (!fullTab && closeAfterCopy) setTimeout(() => window.close(), 400);
  });
}

function togglePin(entry) {
  run(async () => {
    await store.update(entry.id, { pinned: !entry.pinned });
    await refresh(entry.pinned ? "Clip unpinned." : "Clip pinned.");
  });
}

function toggleMask(entry) {
  run(async () => {
    const masking = entry.visibility === "visible";
    await store.update(entry.id, { visibility: masking ? "masked" : "visible" });
    await refresh(masking ? "Clip text masked." : "Clip text shown.");
  });
}

function deleteEntry(entry) {
  run(async () => {
    if (!await confirmAction("Delete clip?", `“${clipName(entry)}” will be removed from your saved clips.`, "Delete", true)) return;
    offerUndo(await store.remove(entry.id));
    await refresh();
  });
}

function openLink(entry) {
  if (isExpired(entry)) {
    run(() => refresh("This clip has expired."));
    return;
  }
  window.open(entry.text.trim(), "_blank", "noopener");
}

function openClipPreview(entry) {
  if (isExpired(entry)) {
    run(() => refresh("This clip has expired."));
    return;
  }
  previewEntry = entry;
  for (const [field, value] of [["title", entry.title], ["description", entry.description]]) {
    const element = byId(`clip-preview-${field}`);
    element.textContent = value;
    element.hidden = !value;
  }
  revealPreview.hidden = entry.visibility === "visible";
  revealPreview.textContent = "Reveal text";
  previewText.textContent = revealPreview.hidden ? entry.text : clipPreview(entry.text, entry.visibility);
  previewDialog.showModal();
}

revealPreview.addEventListener("click", () => {
  if (isExpired(previewEntry)) {
    previewDialog.close();
    run(() => refresh("This clip has expired."));
    return;
  }
  const reveal = revealPreview.textContent === "Reveal text";
  previewText.textContent = reveal ? previewEntry.text : clipPreview(previewEntry.text, previewEntry.visibility);
  revealPreview.textContent = reveal ? "Conceal text" : "Reveal text";
});

previewDialog.addEventListener("close", () => {
  if (previewDialog.open) return;
  previewEntry = undefined;
  previewText.textContent = "";
  byId("clip-preview-title").textContent = "";
  byId("clip-preview-description").textContent = "";
});

function menuActions(entry) {
  const visible = entry.visibility === "visible";
  const actions = [["preview", "Preview", "V", () => openClipPreview(entry)]];
  if (visible && clipType(entry.text) === "link") actions.push(["open", "Open link", "O", () => openLink(entry)]);
  actions.push(
    [visible ? "eyeOff" : "eye", visible ? "Mask text" : "Show text", "M", () => toggleMask(entry)],
    ["pin", entry.pinned ? "Unpin" : "Pin", "P", () => togglePin(entry)],
    ["edit", "Edit", "E", () => openEditor(entry)],
    ["select", "Select", "S", () => startSelection(entry.id)],
    ["delete", "Delete", "D", () => deleteEntry(entry)],
  );
  return actions;
}

function positionMenu(anchor, x, y) {
  const rect = anchor.getBoundingClientRect();
  const { width, height } = clipMenu.getBoundingClientRect();
  const left = x ?? rect.right - width;
  const below = y ?? rect.bottom + 4;
  const above = (y ?? rect.top - 4) - height;
  clipMenu.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
  clipMenu.style.top = `${below + height <= innerHeight - 8 ? below : Math.max(8, above)}px`;
}

function openMenu(entry, anchor, x, y) {
  if (clipMenu.matches(":popover-open")) clipMenu.hidePopover();
  menuEntryId = entry.id;
  clipMenu.setAttribute("aria-label", `Actions for ${clipName(entry)}`);
  clipMenu.replaceChildren(...menuActions(entry).map(([iconName, label, key, action]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.tabIndex = -1;
    item.className = iconName === "delete" ? "menu-item danger" : "menu-item";
    item.setAttribute("role", "menuitem");
    item.setAttribute("aria-keyshortcuts", key);
    item.dataset.key = key;
    const shortcut = textLine("kbd", "", key);
    shortcut.setAttribute("aria-hidden", "true");
    item.append(icon(iconName), textLine("span", "", label), shortcut);
    item.addEventListener("click", () => {
      clipMenu.hidePopover();
      action();
    });
    return item;
  }));
  clipMenu.showPopover();
  positionMenu(anchor, x, y);
  addEventListener("resize", () => positionMenu(anchor, x, y), { once: true });
  clipMenu.firstElementChild.focus();
}

function openMenuForActive() {
  const entry = shownClips.find(({ id }) => id === activeId);
  if (entry) openMenu(entry, clipItems.get(entry.id).item.querySelector('[data-action="more"]'));
}

clipMenu.addEventListener("keydown", (event) => {
  const items = [...clipMenu.querySelectorAll('[role="menuitem"]')];
  const index = items.indexOf(document.activeElement);
  const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (move) {
    event.preventDefault();
    items[(index + move + items.length) % items.length].focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    items.at(event.key === "Home" ? 0 : -1).focus();
  } else if (event.key === "Tab") {
    event.preventDefault();
    clipMenu.hidePopover();
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const key = event.key === "Delete" || event.key === "Backspace" ? "D" : event.key.toUpperCase();
    const match = items.find((item) => item.dataset.key === key);
    if (!match) return;
    event.preventDefault();
    match.click();
  }
});

clipMenu.addEventListener("toggle", (event) => {
  if (event.newState !== "closed") return;
  menuClosedAt = Date.now();
  if (document.activeElement === document.body) search.focus({ preventScroll: true });
});

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

  const visible = entry.visibility === "visible";
  const type = visible ? clipType(entry.text) : "text";
  const details = document.createElement("div");
  details.className = "clip-details";
  if (entry.title) details.append(textLine("p", "clip-title", entry.title));
  const placeholder = !visible || !entry.text.trim();
  const preview = textLine(
    "p",
    `preview${placeholder ? " protected" : ""}${type === "code" ? " code" : ""}`,
    type === "link" ? displayUrl(entry.text) : clipPreview(entry.text, entry.visibility),
  );
  if (type === "color" && CSS.supports("color", entry.text.trim())) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = entry.text.trim();
    preview.prepend(swatch);
  } else if (type !== "text" && type !== "color") {
    preview.prepend(icon(type, "action-icon type-icon"));
  }
  details.append(preview);
  if (entry.description) details.append(textLine("p", "description", entry.description));
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.append(entry.lastUsedAt ? "Copied " : "Saved ", timeElement(entry.lastUsedAt ?? entry.createdAt));
  if (entry.expiresAt) meta.append(" · Expires ", timeElement(entry.expiresAt));
  details.append(meta);

  const actions = document.createElement("div");
  actions.className = "clip-actions";
  actions.setAttribute("aria-hidden", "true");
  actions.append(
    rowButton("copy", "Copy", () => copyEntry(entry)),
    rowButton("more", "More actions", (event) => {
      // The click that light-dismissed this entry's menu should not reopen it.
      if (menuEntryId === entry.id && Date.now() - menuClosedAt < 300) return;
      setActive(entry.id);
      openMenu(entry, event.currentTarget);
    }),
  );
  item.append(check, key, details, actions);

  item.addEventListener("mousedown", (event) => {
    if (event.shiftKey) event.preventDefault();
  });
  item.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(item, true)) return;
    setActive(entry.id);
    if (selecting) setClipSelected(entry.id, !selectedIds.has(entry.id));
    else if (event.shiftKey) startSelection(entry.id);
    else copyEntry(entry);
  });
  item.addEventListener("contextmenu", (event) => {
    if (selecting) return;
    event.preventDefault();
    setActive(entry.id);
    openMenu(entry, item, event.clientX, event.clientY);
  });
  return item;
}

function setEmptyState(title, hints, showReset) {
  byId("empty-title").textContent = title;
  const container = byId("empty-hints");
  if (container.textContent !== hints.join("")) {
    container.replaceChildren(...hints.map((hint) => textLine("p", "", hint)));
  }
  byId("reset-filters").hidden = !showReset;
}

function updateEmptyState(hasQuery) {
  const pinnedOnly = pinnedClips.checked;
  if (hasQuery) {
    const candidates = pinnedOnly ? clips.filter((clip) => clip.pinned) : clips;
    const hints = [pinnedOnly ? "Try a different search or show all clips." : "Try a different search."];
    if (candidates.some((clip) => clip.visibility !== "visible")) {
      hints.push("Masked and hidden clips are searched by title and description only.");
    }
    setEmptyState("No matching clips", hints, true);
  } else if (pinnedOnly) {
    setEmptyState("No pinned clips", ["Choose Pin from a clip’s More actions menu to keep it here."], true);
  } else {
    const hints = [autoCaptureEnabled ? "Text you copy is saved here automatically."
      : supportsAutoCapture ? "Copy some text, then select Save clipboard. You can turn on automatic saving in Settings."
      : "Copy some text, then select Save clipboard."];
    if (openShortcut) hints.push(`Open Clipfile anytime with ${openShortcut}.`);
    hints.push("Clips stay in this browser profile and are never sent anywhere.");
    setEmptyState("Welcome to Clipfile", hints, false);
  }
}

globalThis.chrome?.commands?.getAll?.().then((commands) => {
  openShortcut = commands.find(({ name }) => name === "_execute_action")?.shortcut ?? "";
  updateEmptyState(Boolean(search.value.trim()));
}).catch(() => {});

function updateItemStates() {
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
  const summary = `${count} selected`;
  const selectedCount = byId("selected-count");
  if (selectedCount.textContent !== summary) selectedCount.textContent = summary;
  selectVisible.checked = count > 0 && count === shownClips.length;
  selectVisible.indeterminate = count > 0 && count < shownClips.length;
  selectVisible.disabled = shownClips.length === 0;
  deleteSelected.disabled = count === 0;
  updateSearchHint();
}

function updateSearchHint() {
  byId("search-key-hint").hidden = !shownClips.length;
  byId("search-key-action").textContent = selecting ? "Select" : "Copy";
  byId("search-shortcut").textContent = !shownClips.length ? ""
    : selecting ? "Use Up and Down to choose a clip. Enter selects or clears it."
    : "Use Up and Down to choose a clip. Enter copies it. Shift+Enter opens more actions.";
}

function setActive(id) {
  activeId = id;
  updateItemStates();
  clipItems.get(id)?.item.scrollIntoView({ block: "nearest" });
}

function setClipSelected(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateItemStates();
}

function startSelection(id) {
  selecting = true;
  if (id) selectedIds.add(id);
  updateItemStates();
  search.focus({ preventScroll: true });
}

function endSelection() {
  selecting = false;
  selectedIds.clear();
  updateItemStates();
  search.focus({ preventScroll: true });
}

finishSelection.addEventListener("click", endSelection);
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.key !== "Escape" || !selecting ||
      confirmation.open || editor.open || previewDialog.open || settings.open ||
      clipMenu.matches(":popover-open") || (event.target === search && search.value)) return;
  event.preventDefault();
  endSelection();
});

selectVisible.addEventListener("change", () => {
  selectedIds.clear();
  if (selectVisible.checked) for (const { id } of shownClips) selectedIds.add(id);
  updateItemStates();
});

deleteSelected.addEventListener("click", () => run(async () => {
  const ids = [...selectedIds];
  if (!ids.length) return;
  const label = ids.length === 1 ? "1 clip" : `${ids.length} clips`;
  if (!await confirmAction(`Delete ${label}?`, "The selected clips will be permanently removed.", "Delete", true)) return;
  offerUndo(await store.removeMany(ids));
  endSelection();
  await refresh();
}));

function closeUndo() {
  clearTimeout(undoTimer);
  undoHolds.clear();
  deletedClips = [];
  if (undoBar.contains(document.activeElement)) search.focus();
  undoBar.hidden = true;
}

// Hovering or focusing the bar pauses the countdown so there is time to decide.
function holdUndo(reason, held) {
  const wasPaused = undoHolds.size > 0;
  if (held) undoHolds.add(reason);
  else undoHolds.delete(reason);
  const paused = undoHolds.size > 0;
  if (undoBar.hidden || paused === wasPaused) return;
  if (paused) {
    clearTimeout(undoTimer);
    undoRemaining -= Date.now() - undoStarted;
  } else {
    undoStarted = Date.now();
    undoTimer = setTimeout(closeUndo, undoRemaining);
  }
  undoBar.classList.toggle("is-paused", paused);
}

function offerUndo(clips) {
  if (!clips.length) return;
  clearTimeout(undoTimer);
  deletedClips = clips;
  undoBar.hidden = false;
  byId("undo-message").textContent = clips.length === 1 ? "Clip deleted" : `${clips.length} clips deleted`;
  const progress = byId("undo-progress");
  progress.replaceWith(progress.cloneNode());
  undoRemaining = undoDuration;
  undoStarted = Date.now();
  const paused = undoHolds.size > 0;
  undoBar.classList.toggle("is-paused", paused);
  if (!paused) undoTimer = setTimeout(closeUndo, undoRemaining);
}

undoBar.addEventListener("pointerenter", () => holdUndo("pointer", true));
undoBar.addEventListener("pointerleave", () => holdUndo("pointer", false));
undoBar.addEventListener("focusin", () => holdUndo("focus", true));
undoBar.addEventListener("focusout", (event) => {
  if (!undoBar.contains(event.relatedTarget)) holdUndo("focus", false);
});

undoButton.addEventListener("click", () => run(async () => {
  const batch = deletedClips;
  const restorable = batch.filter((clip) => !isExpired(clip));
  undoButton.disabled = true;
  try {
    await store.add(restorable);
    if (deletedClips === batch) closeUndo();
    await refresh(restorable.length === batch.length ? "Deletion undone." : "Expired clips could not be restored.");
  } finally {
    undoButton.disabled = false;
  }
}));

function renderList(resetActive = false) {
  if (editor.open || confirmation.open || previewDialog.open) {
    pendingListUpdate = true;
    return;
  }
  pendingListUpdate = false;
  const query = search.value.trim().toLocaleLowerCase();
  const pinnedOnly = pinnedClips.checked;
  const matches = clips.filter((clip) => {
    if (pinnedOnly && !clip.pinned) return false;
    if (!query) return true;
    const fields = [clip.title, clip.description];
    if (clip.visibility === "visible") fields.push(clip.text);
    return fields.some((value) => value.toLocaleLowerCase().includes(query));
  });
  const hadFocus = clipList.contains(document.activeElement);

  const visibleIds = new Set(matches.map(({ id }) => id));
  shownClips = matches;
  for (const id of selectedIds) if (!visibleIds.has(id)) selectedIds.delete(id);
  for (const [id, { item }] of clipItems) {
    if (!visibleIds.has(id)) {
      item.remove();
      clipItems.delete(id);
    }
  }
  const rows = { pinned: [], recent: [] };
  matches.forEach((entry, index) => {
    const data = JSON.stringify(entry);
    let cached = clipItems.get(entry.id);
    if (cached?.data !== data) {
      cached?.item.remove();
      cached = { data, item: itemFor(entry) };
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
    group.hidden = rows[name].length === 0;
  }
  byId("pinned-heading").hidden = pinnedOnly;
  byId("recent-heading").hidden = rows.pinned.length === 0;
  if (hadFocus && !clipList.contains(document.activeElement)) search.focus({ preventScroll: true });

  if (resetActive || !visibleIds.has(activeId)) activeId = matches[0]?.id;
  updateItemStates();
  if (resetActive) clipList.scrollTop = 0;

  const count = `${matches.length} ${matches.length === 1 ? "clip" : "clips"}`;
  const summary = query || pinnedOnly ? `${matches.length} of ${clips.length} clips` : count;
  byId("count").textContent = summary;
  if (resetActive) byId("search-status").textContent = query ? `${count} found.` : `${count} shown.`;
  search.setAttribute("aria-expanded", String(matches.length > 0));
  clearSearch.hidden = search.value.length === 0;
  clipList.hidden = matches.length === 0;
  byId("empty").hidden = matches.length > 0;
  updateEmptyState(Boolean(query));
  byId("export").disabled = clips.length === 0;
}

async function render() {
  const version = ++renderVersion;
  const entries = (await store.list()).sort(compareEntries);
  if (version !== renderVersion) return;
  clips = entries;
  renderList();
}

search.addEventListener("input", () => renderList(true));
search.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  const index = shownClips.findIndex(({ id }) => id === activeId);
  const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[event.key];
  if (move && shownClips.length) {
    event.preventDefault();
    const next = index < 0 ? 0 : Math.max(0, Math.min(shownClips.length - 1, index + move));
    setActive(shownClips[next].id);
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
  if (!digit || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || selecting ||
      editor.open || confirmation.open || previewDialog.open || clipMenu.matches(":popover-open")) return;
  const entry = shownClips[Number(digit[1]) - 1];
  if (!entry) return;
  event.preventDefault();
  setActive(entry.id);
  copyEntry(entry);
});
document.addEventListener("keyup", (event) => {
  if (event.key === "Alt") clipList.classList.remove("show-keys");
});
addEventListener("blur", () => clipList.classList.remove("show-keys"));

if (!fullTab) search.focus();
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
  search.focus();
  renderList(true);
});
for (const dialog of [editor, confirmation, previewDialog]) {
  dialog.addEventListener("close", () => {
    if (pendingListUpdate) renderList();
  });
}

async function refresh(message) {
  changes.postMessage("updated");
  await render();
  if (message !== undefined) status(message);
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    status(error.message || "Something went wrong.", true);
  }
}

function showAutoCapture(enabled, pausedUntil = 0) {
  capturePausedUntil = pausedUntil;
  autoCaptureEnabled = enabled && !pausedUntil && captureHealthy;
  autoCapture.checked = enabled;
  const captureState = byId("capture-state");
  captureState.textContent = !enabled ? "Auto-save off" : pausedUntil ? "Auto-save paused"
    : captureHealthy ? "Auto-save on" : "Auto-save needs attention";
  captureState.hidden = false;
  byId("capture-toolbar").hidden = false;
  const indicator = byId("capture-indicator");
  const state = !enabled ? "off" : pausedUntil ? "paused" : captureHealthy ? "active" : "issue";
  const label = {
    off: "Auto-save off",
    paused: `Auto-save paused until ${new Date(pausedUntil).toLocaleTimeString([], { timeStyle: "short" })}`,
    active: "Saving copied text automatically",
    issue: "Capture needs attention",
  }[state];
  indicator.dataset.state = state;
  if (indicator.textContent !== label) indicator.textContent = label;
  capturePause.hidden = !enabled;
  capturePause.textContent = pausedUntil ? "Resume" : "Pause";
  capturePause.title = pausedUntil ? "Resume automatic capture" : "Pause automatic capture for 15 minutes";
  captureRetry.hidden = !enabled || Boolean(pausedUntil) || captureHealthy;
  captureRetry.title = "Capture may be unavailable. Restart automatic capture.";
  updateEmptyState(Boolean(search.value.trim()));
}

async function configureAutoCapture(options = {}) {
  const response = await chrome.runtime.sendMessage({ type: "clipfile-auto-capture", ...options });
  if (!response || response.error) throw new Error(response?.error || "Could not reach the clipboard monitor.");
  showAutoCapture(response.enabled, response.pausedUntil);
}

async function checkCaptureHealth() {
  if (!autoCapture.checked || capturePausedUntil || updatingCapture) return;
  const health = await chrome.runtime.sendMessage({ type: "clipfile-capture-health" }).catch(() => null);
  if (!autoCapture.checked || capturePausedUntil || updatingCapture) return;
  captureHealthy = Boolean(health && !health.failed && Date.now() - health.lastSuccess < 10_000);
  if (captureHealthy && document.activeElement === captureRetry) capturePause.focus();
  showAutoCapture(true);
}

if (supportsAutoCapture) {
  byId("auto-capture-setting").hidden = false;
  onSettingsChange((changes) => {
    if (!("autoCapture" in changes) && !("pausedUntil" in changes)) return;
    run(async () => {
      const saved = await getSettings();
      showAutoCapture(saved.autoCapture, saved.pausedUntil);
    });
  });
  setInterval(checkCaptureHealth, 3000);
  captureRetry.addEventListener("click", () => run(async () => {
    if (updatingCapture) return;
    updatingCapture = true;
    captureRetry.setAttribute("aria-disabled", "true");
    try {
      await configureAutoCapture({ retry: true });
    } finally {
      updatingCapture = false;
      captureRetry.removeAttribute("aria-disabled");
    }
  }));
  capturePause.addEventListener("click", () => run(async () => {
    if (updatingCapture) return;
    updatingCapture = true;
    try {
      captureHealthy = true;
      await configureAutoCapture({ pause: capturePausedUntil ? "resume" : "pause" });
    } finally {
      updatingCapture = false;
    }
  }));
  run(async () => {
    try {
      await configureAutoCapture();
    } finally {
      autoCapture.disabled = false;
    }
  });
  autoCapture.addEventListener("click", (event) => {
    if (updatingCapture) event.preventDefault();
  });
  autoCapture.addEventListener("change", () => run(async () => {
    const enabled = autoCapture.checked;
    updatingCapture = true;
    autoCapture.setAttribute("aria-disabled", "true");
    try {
      await configureAutoCapture({ enabled });
      status(enabled ? "Automatic capture is on." : "Automatic capture is off.");
    } catch (error) {
      const saved = await getSettings();
      showAutoCapture(saved.autoCapture, saved.pausedUntil);
      throw error;
    } finally {
      updatingCapture = false;
      autoCapture.removeAttribute("aria-disabled");
    }
  }));
}

run(async () => {
  const saved = await getSettings();
  retentionDays.value = String(saved.retentionDays);
  retentionDays.disabled = false;
  closeAfterCopy = saved.closeAfterCopy;
  closeAfterCopyInput.checked = closeAfterCopy;
  closeAfterCopyInput.disabled = false;
});
onSettingsChange((changes) => {
  if ("retentionDays" in changes) retentionDays.value = String(changes.retentionDays);
  if ("closeAfterCopy" in changes) closeAfterCopyInput.checked = closeAfterCopy = changes.closeAfterCopy;
});
retentionDays.addEventListener("change", () => run(async () => {
  await updateSettings({ retentionDays: Number(retentionDays.value) });
}));
closeAfterCopyInput.addEventListener("change", () => run(async () => {
  closeAfterCopy = closeAfterCopyInput.checked;
  await updateSettings({ closeAfterCopy });
}));

function localExpiryValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function updateEditorPreview() {
  const { text, title, visibility } = editForm.elements;
  const sampleTitle = byId("sample-title");
  sampleTitle.textContent = title.value;
  sampleTitle.hidden = !title.value;
  const sample = byId("sample-text");
  sample.textContent = text.value ? clipPreview(text.value, visibility.value) : "Enter text to see a preview.";
  sample.classList.toggle("protected", !text.value.trim() || visibility.value !== "visible");

  const expiry = expiryInput.value ? new Date(expiryInput.value) : null;
  const expiryLabel = !expiry || Number.isNaN(expiry.getTime()) ? "No expiry"
    : expiry.getTime() > Date.now() ? `Expires ${relativeTime(expiry.toISOString())}`
    : "Expiry is in the past";
  const visibilityLabel = { visible: "Shown", masked: "Masked", hidden: "Hidden" }[visibility.value];
  byId("options-summary").textContent = `${expiryLabel} · ${visibilityLabel}`;
}

function openEditor(entry) {
  if (entry && isExpired(entry)) {
    run(() => refresh("This clip has expired."));
    return;
  }
  editedEntry = entry;
  byId("editor-title").textContent = entry ? "Edit clip" : "New clip";
  byId("title").value = entry?.title ?? "";
  byId("description").value = entry?.description ?? "";
  byId("text").value = entry?.text ?? "";
  expiryInput.value = localExpiryValue(entry?.expiresAt);
  editForm.elements.visibility.value = entry?.visibility ?? "visible";
  editorOptions.open = false;
  updateEditorPreview();
  byId("form-status").textContent = "";
  editor.showModal();
}

function confirmAction(title, message, action, destructive = false) {
  byId("confirm-title").textContent = title;
  byId("confirm-message").textContent = message;
  const confirm = byId("confirm-action");
  confirm.textContent = action;
  confirm.classList.toggle("destructive", destructive);
  confirmation.returnValue = "cancel";
  confirmation.showModal();
  return new Promise((resolve) => {
    confirmation.addEventListener("close", () => resolve(confirmation.returnValue === "confirm"), { once: true });
  });
}

byId("new").addEventListener("click", () => openEditor());
byId("cancel-edit").addEventListener("click", () => editor.close());
byId("save-shortcut").textContent = isMac ? "⌘↵ to save" : "Ctrl+Enter to save";
editForm.addEventListener("input", updateEditorPreview);
editForm.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || !(isMac ? event.metaKey : event.ctrlKey)) return;
  event.preventDefault();
  editForm.requestSubmit(byId("save-edit"));
});
byId("expiry-presets").addEventListener("click", (event) => {
  const preset = event.target.closest("[data-expiry]");
  if (!preset) return;
  const duration = Number(preset.dataset.expiry);
  expiryInput.value = duration ? localExpiryValue(new Date(Date.now() + duration).toISOString()) : "";
  updateEditorPreview();
});
editor.addEventListener("close", () => {
  if (editor.open) return;
  byId("sample-title").textContent = "";
  byId("sample-text").textContent = "";
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(editForm));
  if (data.expiresAt) {
    const expiry = data.expiresAt === localExpiryValue(editedEntry?.expiresAt)
      ? new Date(editedEntry.expiresAt) : new Date(data.expiresAt);
    if (!(expiry.getTime() > Date.now())) {
      byId("form-status").textContent = "Choose an expiry date and time in the future.";
      editorOptions.open = true;
      expiryInput.focus();
      return;
    }
    data.expiresAt = expiry.toISOString();
  } else {
    data.expiresAt = null;
  }
  data.defaultExpiry = Boolean(editedEntry?.defaultExpiry && data.expiresAt === editedEntry.expiresAt);
  if (editedEntry && data.text === editedEntry.text.replace(/\r\n?/g, "\n")) {
    data.text = editedEntry.text;
  }

  const submit = event.submitter;
  if (submit.disabled) return;
  submit.disabled = true;
  const id = editedEntry?.id;
  try {
    if (id) await store.update(id, data);
    else await store.add([withDefaultRetention(createEntry(data), (await getSettings()).retentionDays)]);
  } catch (error) {
    byId("form-status").textContent = error.message || "Could not save the entry.";
    return;
  } finally {
    submit.disabled = false;
  }
  editor.close();
  await run(() => refresh(id ? "Clip updated." : "Clip added."));
});

byId("capture").addEventListener("click", () => run(async () => {
  const added = await saveClipboard();
  await refresh(added ? "Clipboard saved." : "This clipboard text is already saved.");
}));

byId("import-hint").textContent = fullTab
  ? "You can also drop a backup file onto this page."
  : "Import opens Clipfile in a tab so the file picker stays open.";

byId("import").addEventListener("click", () => {
  if (fullTab) {
    file.click();
  } else {
    window.open("manager.html?view=tab&import=1", "_blank", "noopener");
  }
});

async function importFile(selected) {
  const entries = importEntries(await selected.text());
  await store.add(entries);
  await refresh(`Imported ${entries.length} ${entries.length === 1 ? "entry" : "entries"}.`);
}

file.addEventListener("change", () => run(async () => {
  const selected = file.files[0];
  file.value = "";
  if (selected) await importFile(selected);
}));

if (fullTab) {
  document.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    document.body.classList.add("is-dropping");
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) document.body.classList.remove("is-dropping");
  });
  document.addEventListener("drop", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    document.body.classList.remove("is-dropping");
    const selected = event.dataTransfer.files[0];
    if (selected) run(() => importFile(selected));
  });
}

byId("export").addEventListener("click", () => run(async () => {
  if (!await confirmAction("Export clips?", "The JSON backup contains all saved text in plain text, including masked and hidden entries.", "Export")) return;
  const url = URL.createObjectURL(new Blob([exportEntries((await store.list()).sort(compareEntries))], { type: "application/json" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = `clipfile-${new Date().toISOString().slice(0, 10)}.json`;
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  status("Export started.");
}));

changes.addEventListener("message", () => run(render));
if (new URLSearchParams(location.search).has("import")) {
  settings.open = true;
  status("Select Import backup to choose a Clipfile backup.");
  byId("import").focus();
}
run(render);
