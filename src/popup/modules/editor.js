import { createEntry, isExpired, withDefaultRetention } from "../../lib/entries.js";
import { clipPreview, relativeTime } from "../../lib/format.js";
import { t } from "../../lib/i18n.js";
import { cleanName, cleanTags, collectOrganization, maxTags, parseTags } from "../../lib/organize.js";
import { getSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { byId, isMac, run, textLine } from "./dom.js";
import { refresh } from "./list.js";
import { changes, state } from "./state.js";

const editor = byId("editor");
const editForm = byId("edit-form");
const editorOptions = byId("editor-options");
const expiryInput = byId("expires-at");
const confirmation = byId("confirmation");
const textField = byId("text");
const categoryInput = byId("category");
const subcategoryInput = byId("subcategory");
const tagInput = byId("tag-input");
const tagList = byId("tag-list");
const saveState = byId("save-state");
// Edits save on their own shortly after typing stops; Done or closing saves anything still pending.
const saveDelay = 600;
let editedEntry;
let editorTags = [];
let saveTimer;
let pendingSave = false;
/** @type {Promise<unknown>} */
let saving = Promise.resolve();
let savedThisSession = false;
let createdThisSession = false;

function localExpiryValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function updateEditorPreview() {
  const { title, visibility } = editForm.elements;
  const sampleTitle = byId("sample-title");
  sampleTitle.textContent = title.value;
  sampleTitle.hidden = !title.value;
  const sample = byId("sample-text");
  const text = editedEntry?.kind === "image" ? t("image") : textField.value;
  sample.textContent = text ? clipPreview(text, visibility.value) : t("editorEmptyPreview");
  sample.classList.toggle("protected", !text.trim() || visibility.value !== "visible");

  const expiry = expiryInput.value ? new Date(expiryInput.value) : null;
  const expiryLabel = !expiry || Number.isNaN(expiry.getTime()) ? t("noExpiry")
    : expiry.getTime() > Date.now() ? t("expiresIn", relativeTime(expiry.toISOString()))
    : t("expiryInPast");
  const visibilityLabel = { visible: t("visibilityShown"), masked: t("visibilityMasked"), hidden: t("visibilityHidden") }[visibility.value];
  byId("options-summary").textContent = t("optionsSummary", expiryLabel, visibilityLabel);
}

function setSaveState(saveStatus, message = "") {
  saveState.dataset.state = saveStatus;
  saveState.textContent = message || {
    idle: t("autoSaveHint", isMac ? t("saveShortcutMac") : t("saveShortcutOther")),
    pending: t("unsavedChanges"),
    saving: t("saving"),
    saved: t("savedState"),
  }[saveStatus] || "";
}

// Suggestions come from the categories, subcategories, and tags already in use.
function fillOptions(list, names) {
  byId(list).replaceChildren(...names.map((name) => Object.assign(document.createElement("option"), { value: name })));
}

function updateSuggestions() {
  const { categories, tags } = collectOrganization(state.clips);
  fillOptions("category-options", categories.map(({ name }) => name));
  const category = categories.find(({ name }) => name.toLocaleLowerCase() === cleanName(categoryInput.value).toLocaleLowerCase());
  fillOptions("subcategory-options", category?.subcategories.map(({ name }) => name) ?? []);
  fillOptions("tag-options", tags.map(({ name }) => name)
    .filter((name) => !editorTags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())));
  subcategoryInput.disabled = !cleanName(categoryInput.value);
}

function renderTags() {
  tagList.replaceChildren(...editorTags.map((tag) => {
    const item = textLine("li", "tag", tag);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", t("removeTag", tag));
    remove.addEventListener("click", () => {
      editorTags = editorTags.filter((existing) => existing !== tag);
      renderTags();
      scheduleSave();
      tagInput.focus();
    });
    item.append(remove);
    return item;
  }));
  tagInput.disabled = editorTags.length >= maxTags;
  updateSuggestions();
}

// Adds what is typed in the tag box.
function commitTagInput() {
  const typed = parseTags(tagInput.value);
  tagInput.value = "";
  if (!typed.length) return;
  const next = cleanTags([...editorTags, ...typed]);
  if (next.length === editorTags.length) return;
  editorTags = next;
  renderTags();
  scheduleSave();
}

// Reads the form now, so a save that runs after the editor closes still has the values.
function readForm() {
  /** @type {any} */
  const data = Object.fromEntries(new FormData(editForm));
  data.category = cleanName(categoryInput.value);
  data.subcategory = data.category ? cleanName(subcategoryInput.value) : "";
  data.tags = [...editorTags];
  data.template = byId("template").checked;
  return data;
}

async function saveNow(data) {
  const entry = editedEntry;
  if (data.expiresAt) {
    const expiry = data.expiresAt === localExpiryValue(entry?.expiresAt) ? new Date(entry.expiresAt) : new Date(data.expiresAt);
    if (!(expiry.getTime() > Date.now())) {
      setSaveState("error", t("errorExpiryPast"));
      return;
    }
    data.expiresAt = expiry.toISOString();
  } else {
    data.expiresAt = null;
  }
  data.defaultExpiry = Boolean(entry?.defaultExpiry && data.expiresAt === entry.expiresAt);
  if (entry?.kind === "image" || (entry && data.text === entry.text.replace(/\r\n?/g, "\n"))) delete data.text;
  // A new clip is created once it has text; until then there is nothing to save.
  if (!entry && !data.text?.trim()) {
    setSaveState("idle");
    return;
  }

  setSaveState("saving");
  try {
    if (entry) {
      await store.update(entry.id, data);
      editedEntry = { ...entry, ...data };
    } else {
      const created = withDefaultRetention(createEntry(data), (await getSettings()).retentionDays);
      await store.add([created]);
      editedEntry = created;
      createdThisSession = true;
    }
  } catch (error) {
    setSaveState("error", error.message || t("errorSaveClip"));
    return;
  }
  savedThisSession = true;
  changes.postMessage("updated");
  if (!pendingSave) setSaveState("saved");
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!pendingSave) return saving;
  pendingSave = false;
  const data = readForm();
  saving = saving.then(() => saveNow(data));
  return saving;
}

function scheduleSave() {
  pendingSave = true;
  setSaveState("pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, saveDelay);
}

export function openEditor(entry) {
  if (entry && isExpired(entry)) {
    run(() => refresh(t("clipExpired")));
    return;
  }
  editedEntry = entry;
  savedThisSession = false;
  createdThisSession = false;
  pendingSave = false;
  const image = entry?.kind === "image";
  byId("editor-title").textContent = image ? t("editImageClip") : entry ? t("editClip") : t("newClip");
  // Image clips keep their picture; only the other fields can change.
  byId("text-field").hidden = image;
  byId("title").value = entry?.title ?? "";
  byId("description").value = entry?.description ?? "";
  textField.value = image ? "" : entry?.text ?? "";
  categoryInput.value = entry?.category ?? "";
  subcategoryInput.value = entry?.subcategory ?? "";
  editorTags = [...entry?.tags ?? []];
  byId("template").checked = entry?.template === true;
  byId("template").closest(".template-field").hidden = image;
  tagInput.value = "";
  renderTags();
  expiryInput.value = localExpiryValue(entry?.expiresAt);
  editForm.elements.visibility.value = entry?.visibility ?? "visible";
  editorOptions.open = false;
  updateEditorPreview();
  byId("form-status").textContent = "";
  setSaveState("idle");
  editor.showModal();
  if (image) byId("title").focus();
}

export function confirmAction(title, message, action, destructive = false) {
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
editForm.addEventListener("input", (event) => {
  updateEditorPreview();
  if (event.target === categoryInput) updateSuggestions();
  if (event.target === tagInput) {
    // A suggestion picked from the list arrives as one replacement, and is added right away.
    if (!(event instanceof InputEvent) || event.inputType === "insertReplacementText") commitTagInput();
    return;
  }
  scheduleSave();
});
editForm.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || !(isMac ? event.metaKey : event.ctrlKey)) return;
  event.preventDefault();
  editForm.requestSubmit(byId("save-edit"));
});
tagInput.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if ((event.key === "Enter" && !(isMac ? event.metaKey : event.ctrlKey)) || event.key === ",") {
    event.preventDefault();
    commitTagInput();
  } else if (event.key === "Backspace" && !tagInput.value && editorTags.length) {
    editorTags = editorTags.slice(0, -1);
    renderTags();
    scheduleSave();
  }
});
tagInput.addEventListener("blur", commitTagInput);
byId("tag-field").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) tagInput.focus();
});
byId("expiry-presets").addEventListener("click", (event) => {
  const preset = /** @type {Element} */ (event.target).closest("[data-expiry]");
  if (!(preset instanceof HTMLElement)) return;
  const duration = Number(preset.dataset.expiry);
  expiryInput.value = duration ? localExpiryValue(new Date(Date.now() + duration).toISOString()) : "";
  updateEditorPreview();
  scheduleSave();
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  commitTagInput();
  editor.close();
});

// Closing in any way, with Done, Escape, or the keyboard shortcut, saves what is pending first.
editor.addEventListener("close", () => {
  if (editor.open) return;
  commitTagInput();
  const finished = flushSave();
  byId("sample-title").textContent = "";
  byId("sample-text").textContent = "";
  run(async () => {
    await finished;
    if (saveState.dataset.state === "error") await refresh(saveState.textContent);
    else if (savedThisSession) await refresh(createdThisSession ? t("clipAdded") : t("clipUpdated"));
  });
});
