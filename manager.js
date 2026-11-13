import {
  compareEntries, createEntry, exportEntries, importEntries, isExpired, withDefaultRetention,
} from "./entries.js";
import { copyToClipboard, saveClipboard, supportsAutoCapture } from "./clipboard.js";
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
const confirmation = byId("confirmation");
const file = byId("file");
const fullTab = new URLSearchParams(location.search).get("view") === "tab";
const changes = new BroadcastChannel("clipfile-entries");
const autoCapture = byId("auto-capture");
const capturePause = byId("capture-pause");
const captureRetry = byId("capture-retry");
const undoBar = byId("undo-bar");
const undoButton = byId("undo-delete");
let deletedClips = [];
let undoTimer;
const retentionDays = byId("retention-days");
let capturePausedUntil = 0;
let captureHealthy = true;
const search = byId("search");
const clearSearch = byId("clear-search");
const allClips = byId("all-clips");
const pinnedClips = byId("pinned-clips");
const clipList = byId("entries");
const selectClips = byId("select-clips");
const finishSelection = byId("finish-selection");
const selectVisible = byId("select-visible");
const deleteSelected = byId("delete-selected");
const selectedIds = new Set();
let selecting = false;
let shownClips = [];
const settings = document.querySelector(".settings");
const themeOptions = settings.querySelectorAll('[name="theme"]');
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: fullTab ? "medium" : "short",
  timeStyle: "short",
});
let editedEntry;
let renderVersion = 0;
let clips = [];
let autoCaptureEnabled = false;
let pendingListUpdate = false;
let updatingCapture = false;
let copiedClipId;
let copiedFeedbackTimer;
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

document.addEventListener("click", (event) => {
  if (settings.open && !settings.contains(event.target)) settings.open = false;
});

settings.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !settings.open) return;
  event.preventDefault();
  settings.open = false;
  settings.querySelector("summary").focus();
});

function status(message, error = false) {
  const output = byId("status");
  output.textContent = message;
  output.classList.toggle("error", error);
}

const actionPaths = {
  copied: "m5 12 4 4L19 6",
  copy: "M8 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM15 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1",
  pin: "m16 3 5 5-3 1-3 4v3h-2l-5-5V9h3l4-3 1-3ZM11 14l-7 7",
  edit: "m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z",
  preview: "M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h6",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5",
  mask: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  unmask: "M3 3l18 18M10 6.2c.6-.1 1.3-.2 2-.2 6.4 0 10 6 10 6a16 16 0 0 1-3 3.4M6.2 7.8A17 17 0 0 0 2 12s3.6 6 10 6c1.5 0 2.9-.3 4.1-.9M10 10a3 3 0 0 0 4 4",
};

function clipButton(action, label, name, handler, iconName = action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "copy" ? "secondary copy" : `quiet ${action}`;
  button.dataset.action = action;
  button.title = label;
  button.setAttribute("aria-label", `${label} ${name}`);
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("class", "action-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", actionPaths[iconName]);
  icon.append(path);
  button.append(icon);
  button.addEventListener("click", handler);
  return button;
}

function textLine(tag, className, text) {
  const line = document.createElement(tag);
  line.className = className;
  line.textContent = text;
  return line;
}

function updateCopyFeedback(id, copied) {
  const item = clipItems.get(id)?.item;
  if (!item) return;
  const button = item.querySelector('[data-action="copy"]');
  button.querySelector("path").setAttribute("d", actionPaths[copied ? "copied" : "copy"]);
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

const clipSegmenter = new Intl.Segmenter();

function maskedPreview(text) {
  const trimmed = text.trim();
  let previousIndex = 0;
  let count = 0;
  for (const { index } of clipSegmenter.segment(trimmed)) {
    if (count === 3) return trimmed.slice(0, index) + "**";
    previousIndex = index;
    count++;
  }
  // Leave at least one character concealed in short clips.
  return trimmed.slice(0, previousIndex) + "**";
}

function clipPreview(text, visibility) {
  if (visibility === "hidden") return "Hidden text";
  if (visibility === "masked") return maskedPreview(text);
  return text.trim() ? text : "Whitespace";
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

function updateEditorPreview() {
  const { text, title, visibility } = editForm.elements;
  const sampleTitle = byId("sample-title");
  sampleTitle.textContent = title.value;
  sampleTitle.hidden = !title.value;
  const sample = byId("sample-text");
  sample.textContent = text.value ? clipPreview(text.value, visibility.value) : "Enter text to see a preview.";
  sample.classList.toggle("protected", !text.value || visibility.value !== "visible");
}

function itemFor(entry) {
  const item = document.createElement("li");
  item.className = "clip";
  item.dataset.id = entry.id;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "clip-select";
  checkbox.dataset.action = "select";
  checkbox.hidden = true;
  const visibleText = entry.visibility === "visible";
  const name = entry.title || (visibleText && entry.text.trim().replace(/\s+/g, " ").slice(0, 60)) || "Untitled clip";
  checkbox.setAttribute("aria-label", `Select ${name}`);
  checkbox.addEventListener("change", () => setClipSelected(entry.id, checkbox.checked));
  const details = document.createElement("div");
  details.className = "clip-details";
  if (entry.title) details.append(textLine("h3", "clip-title", entry.title));
  details.append(textLine("p", visibleText ? "preview" : "preview protected", clipPreview(entry.text, entry.visibility)));
  if (entry.description) details.append(textLine("p", "description", entry.description));
  if (entry.lastUsedAt) {
    const used = textLine("p", "used", "Last copied ");
    const time = document.createElement("time");
    time.dateTime = entry.lastUsedAt;
    time.textContent = dateFormat.format(new Date(entry.lastUsedAt));
    used.append(time);
    details.append(used);
  }
  if (entry.expiresAt) {
    const expiry = textLine("p", "used expiry", "Expires ");
    const time = document.createElement("time");
    time.dateTime = entry.expiresAt;
    time.textContent = dateFormat.format(new Date(entry.expiresAt));
    expiry.append(time);
    details.append(expiry);
  }

  const copyClip = () => run(async () => {
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
  });
  const copy = clipButton("copy", "Copy", name, copyClip);
  item.addEventListener("click", (event) => {
    if (event.target.closest("button, input")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(item, true)) return;
    if (selecting) setClipSelected(entry.id, !selectedIds.has(entry.id));
    else copyClip();
  });
  const pin = clipButton("pin", "Pin", name, () => run(async () => {
    await store.update(entry.id, { pinned: !entry.pinned });
    await refresh(entry.pinned ? "Clip unpinned." : "Clip pinned.");
  }));
  pin.setAttribute("aria-pressed", String(entry.pinned));
  pin.title = entry.pinned ? "Unpin" : "Pin";
  const visibility = clipButton("visibility", visibleText ? "Mask" : "Unmask", name, () => run(async () => {
    await store.update(entry.id, { visibility: visibleText ? "masked" : "visible" });
    await refresh();
  }), visibleText ? "mask" : "unmask");
  const actions = document.createElement("div");
  actions.className = "actions clip-actions";
  actions.append(
    copy,
    clipButton("preview", "Preview", name, () => openClipPreview(entry)),
    visibility,
    pin,
    clipButton("edit", "Edit", name, () => openEditor(entry)),
    clipButton("delete", "Delete", name, () => run(async () => {
      if (!await confirmAction("Delete clip?", `“${name}” will be removed from your saved clips.`, "Delete", true)) return;
      offerUndo(await store.remove(entry.id));
      await refresh();
    })),
  );
  item.append(checkbox, details, actions);
  return item;
}

function updateEmptyState(hasQuery) {
  const pinnedOnly = pinnedClips.checked;
  let title = "No saved clips";
  let hint = autoCaptureEnabled
    ? "Copy some text to save it automatically."
    : "Copy some text, then select Save clipboard.";
  if (hasQuery) {
    title = "No matching clips";
    hint = pinnedOnly ? "Try a different search or show all clips." : "Try a different search.";
  } else if (pinnedOnly) {
    title = "No pinned clips";
    hint = "Use Pin on a clip to keep it here.";
  }
  byId("empty-title").textContent = title;
  byId("empty-hint").textContent = hint;
  byId("reset-filters").hidden = !(pinnedOnly || hasQuery);
}

function updateSelection() {
  selectClips.setAttribute("aria-expanded", String(selecting));
  byId("list-tools").hidden = selecting;
  byId("bulk-actions").hidden = !selecting;
  clipList.classList.toggle("is-selecting", selecting);
  for (const [id, { item }] of clipItems) {
    const checkbox = item.querySelector(".clip-select");
    checkbox.hidden = !selecting;
    checkbox.checked = selectedIds.has(id);
    item.classList.toggle("is-selected", checkbox.checked);
    item.querySelector(".clip-actions").hidden = selecting;
  }
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
  byId("search-key-hint").hidden = selecting || !shownClips.length;
  if (selecting || !shownClips.length) search.removeAttribute("aria-describedby");
  else search.setAttribute("aria-describedby", "search-shortcut");
}

function setClipSelected(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateSelection();
}

selectClips.addEventListener("click", () => {
  selecting = true;
  updateSelection();
  (selectVisible.disabled ? finishSelection : selectVisible).focus();
});

function endSelection() {
  selecting = false;
  selectedIds.clear();
  updateSelection();
  selectClips.focus();
}

finishSelection.addEventListener("click", endSelection);
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.key !== "Escape" || !selecting ||
      confirmation.open || editor.open || previewDialog.open || settings.open ||
      (event.target === search && search.value)) return;
  event.preventDefault();
  endSelection();
});

selectVisible.addEventListener("change", () => {
  selectedIds.clear();
  if (selectVisible.checked) for (const { id } of shownClips) selectedIds.add(id);
  updateSelection();
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
  deletedClips = [];
  if (document.activeElement === undoButton) search.focus();
  undoBar.hidden = true;
}

function offerUndo(clips) {
  if (!clips.length) return;
  clearTimeout(undoTimer);
  deletedClips = clips;
  undoBar.hidden = false;
  byId("undo-message").textContent = clips.length === 1 ? "Clip deleted" : `${clips.length} clips deleted`;
  undoTimer = setTimeout(closeUndo, 12_000);
}

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

function renderList(announceSearch = false) {
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
  const active = document.activeElement;
  const focusedItem = clipList.contains(active) ? active.closest(".clip") : null;
  const oldIndex = focusedItem ? Array.from(clipList.children).indexOf(focusedItem) : -1;

  const visibleIds = new Set(matches.map(({ id }) => id));
  shownClips = matches;
  for (const id of selectedIds) if (!visibleIds.has(id)) selectedIds.delete(id);
  for (const [id, { item }] of clipItems) {
    if (!visibleIds.has(id)) {
      item.remove();
      clipItems.delete(id);
    }
  }
  let next = clipList.firstElementChild;
  for (const entry of matches) {
    const data = JSON.stringify(entry);
    let cached = clipItems.get(entry.id);
    if (cached?.data !== data) {
      const item = itemFor(entry);
      if (cached?.item === next) next = next.nextElementSibling;
      cached?.item.remove();
      cached = { data, item };
      clipItems.set(entry.id, cached);
      if (entry.id === copiedClipId) updateCopyFeedback(entry.id, true);
    }
    if (cached.item === next) next = next.nextElementSibling;
    else clipList.insertBefore(cached.item, next);
  }

  updateSelection();
  if (focusedItem && document.activeElement !== active) {
    const item = clipItems.get(focusedItem.dataset.id)?.item ??
      clipList.children[Math.min(oldIndex, matches.length - 1)];
    const target = item?.querySelector(`[data-action="${active.dataset.action}"]`) ?? search;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }

  const count = `${matches.length} ${matches.length === 1 ? "clip" : "clips"}`;
  const summary = query || pinnedOnly ? `${matches.length} of ${clips.length} clips` : count;
  byId("count").textContent = summary;
  if (announceSearch) byId("search-status").textContent = query ? `${count} found.` : `${count} shown.`;
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
  if (event.key !== "Enter" || event.isComposing || selecting) return;
  const firstCopy = clipList.querySelector('[data-action="copy"]');
  if (!firstCopy) return;
  event.preventDefault();
  firstCopy.click();
});
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
  const label = { off: "Auto-save off", paused: "Auto-save paused", active: "Auto-save on", issue: "Capture needs attention" }[state];
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
  retentionDays.value = String((await getSettings()).retentionDays);
  retentionDays.disabled = false;
});
onSettingsChange((changes) => {
  if ("retentionDays" in changes) retentionDays.value = String(changes.retentionDays);
});
retentionDays.addEventListener("change", () => run(async () => {
  await updateSettings({ retentionDays: Number(retentionDays.value) });
}));

function localExpiryValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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
  byId("expires-at").value = localExpiryValue(entry?.expiresAt);
  editForm.elements.visibility.value = entry?.visibility ?? "visible";
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
editForm.addEventListener("input", updateEditorPreview);
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
      byId("expires-at").focus();
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

byId("import").addEventListener("click", () => {
  if (fullTab) {
    file.click();
  } else {
    window.open("manager.html?view=tab&import=1", "_blank", "noopener");
  }
});

file.addEventListener("change", () => run(async () => {
  const selected = file.files[0];
  file.value = "";
  if (!selected) return;
  const entries = importEntries(await selected.text());
  await store.add(entries);
  await refresh(`Imported ${entries.length} ${entries.length === 1 ? "entry" : "entries"}.`);
}));

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
