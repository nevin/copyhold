import { t, tn } from "../../lib/i18n.js";
import { cleanName, cleanTags, collectOrganization } from "../../lib/organize.js";
import { getProtectedSettings, updateProtectedSettings } from "./lock.js";
import * as store from "../../lib/store.js";
import { byId, run, textLine } from "./dom.js";
import { confirmAction } from "./editor.js";
import { refresh } from "./list.js";
import { state } from "./state.js";

const dialog = byId("manage-dialog");
const same = (first, second) => first.toLocaleLowerCase() === second.toLocaleLowerCase();

// Applies a change to every clip it affects, then shows how many changed.
async function updateClips(select, change, message) {
  const affected = state.clips.filter(select);
  for (const clip of affected) await store.update(clip.id, change(clip));
  await refresh();
  byId("manage-status").textContent = tn(message, affected.length);
  render();
}

export const colorNames = ["purple", "blue", "teal", "green", "amber", "orange", "red", "pink", "gray"];

// Colours are keyed by category name, so renaming moves the colour and deleting forgets it.
async function moveColor(from, to) {
  const colors = { ...(await getProtectedSettings()).categoryColors };
  const color = colors[from.toLocaleLowerCase()];
  delete colors[from.toLocaleLowerCase()];
  if (color && to) colors[to.toLocaleLowerCase()] = color;
  await updateProtectedSettings({ categoryColors: colors });
}

async function setColor(category, color) {
  const colors = { ...(await getProtectedSettings()).categoryColors };
  if (color) colors[category.toLocaleLowerCase()] = color;
  else delete colors[category.toLocaleLowerCase()];
  await updateProtectedSettings({ categoryColors: colors });
  state.categoryColors = colors;
  render();
}

async function renameCategory(from, to) {
  await moveColor(from, to);
  return updateClips((clip) => same(clip.category, from), () => ({ category: to }), "renamedInClips");
}

function renameSubcategory(category, from, to) {
  return updateClips((clip) => same(clip.category, category) && same(clip.subcategory, from),
    () => ({ subcategory: to }), "renamedInClips");
}

function renameTag(from, to) {
  return updateClips((clip) => clip.tags?.some((tag) => same(tag, from)),
    (clip) => ({ tags: cleanTags(clip.tags.map((tag) => (same(tag, from) ? to : tag))) }), "renamedInClips");
}

async function deleteCategory(name) {
  await moveColor(name, "");
  return updateClips((clip) => same(clip.category, name), () => ({ category: "", subcategory: "" }), "removedFromClips");
}

function deleteSubcategory(category, name) {
  return updateClips((clip) => same(clip.category, category) && same(clip.subcategory, name),
    () => ({ subcategory: "" }), "removedFromClips");
}

function deleteTag(name) {
  return updateClips((clip) => clip.tags?.some((tag) => same(tag, name)),
    (clip) => ({ tags: clip.tags.filter((tag) => !same(tag, name)) }), "removedFromClips");
}

function actionButton(label, onClick) {
  const button = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: label });
  button.addEventListener("click", onClick);
  return button;
}

// Swaps the row for a text box; Enter saves the new name and Escape keeps the old one.
function startRename(item, current, onRename) {
  const input = Object.assign(document.createElement("input"), { type: "text", className: "rename-input", value: current, maxLength: 40 });
  input.setAttribute("aria-label", t("renameItem", current));
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const name = cleanName(input.value);
    if (save && name && name !== current) run(() => onRename(name));
    else render();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  item.replaceChildren(input, actionButton(t("save"), () => finish(true)));
  input.focus();
  input.select();
}

// A colour button opens a row of swatches under the category.
function colorButton(item, category) {
  const current = state.categoryColors[category.toLocaleLowerCase()];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quiet color-button";
  button.title = t("chooseColor", category);
  button.setAttribute("aria-label", t("chooseColor", category));
  button.setAttribute("aria-expanded", "false");
  const dot = document.createElement("span");
  dot.className = "category-dot";
  if (current) dot.dataset.color = current;
  button.append(dot);
  button.addEventListener("click", () => {
    const open = item.nextElementSibling?.classList.contains("color-row");
    if (open) {
      item.nextElementSibling.remove();
      button.setAttribute("aria-expanded", "false");
      return;
    }
    const swatches = document.createElement("li");
    swatches.className = "color-row";
    const options = [["", t("noColor")], ...colorNames.map((name) => [name, t(`color_${name}`)])];
    for (const [name, label] of options) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-swatch";
      swatch.title = label;
      swatch.setAttribute("aria-label", label);
      swatch.setAttribute("aria-pressed", String((current ?? "") === name));
      const sample = document.createElement("span");
      sample.className = "category-dot";
      if (name) sample.dataset.color = name;
      swatch.append(sample);
      swatch.addEventListener("click", () => run(() => setColor(category, name)));
      swatches.append(swatch);
    }
    item.after(swatches);
    button.setAttribute("aria-expanded", "true");
    /** @type {HTMLElement} */ (swatches.querySelector('[aria-pressed="true"]'))?.focus();
  });
  return button;
}

/**
 * @param {{ label: string, count: number, className?: string, onRename: (name: string) => Promise<void>,
 *   onDelete: () => Promise<void>, deleteTitle: string, deleteMessage: string, color?: string }} options
 */
function row({ label, count, className = "manage-item", onRename, onDelete, deleteTitle, deleteMessage, color }) {
  const item = document.createElement("li");
  item.className = className;
  if (color) item.append(colorButton(item, color));
  item.append(textLine("span", "name", label), textLine("span", "count", count.toLocaleString()));
  item.append(
    actionButton(t("rename"), () => startRename(item, label.replace(/^#/, ""), onRename)),
    actionButton(t("delete"), () => run(async () => {
      if (await confirmAction(deleteTitle, deleteMessage, t("delete"), true)) await onDelete();
    })),
  );
  return item;
}

function render() {
  const { categories, tags } = collectOrganization(state.clips);
  const categoryRows = [];
  for (const category of categories) {
    categoryRows.push(row({
      label: category.name,
      color: category.name,
      count: category.count,
      onRename: (name) => renameCategory(category.name, name),
      onDelete: () => deleteCategory(category.name),
      deleteTitle: t("deleteCategoryTitle", category.name),
      deleteMessage: tn("deleteCategoryMessage", category.count),
    }));
    for (const subcategory of category.subcategories) {
      categoryRows.push(row({
        label: subcategory.name,
        count: subcategory.count,
        className: "manage-item sub",
        onRename: (name) => renameSubcategory(category.name, subcategory.name, name),
        onDelete: () => deleteSubcategory(category.name, subcategory.name),
        deleteTitle: t("deleteSubcategoryTitle", subcategory.name),
        deleteMessage: tn("deleteSubcategoryMessage", subcategory.count),
      }));
    }
  }
  byId("manage-categories").replaceChildren(...(categoryRows.length ? categoryRows
    : [textLine("li", "filter-empty", t("noCategoriesYet"))]));
  byId("manage-tags").replaceChildren(...(tags.length ? tags.map((tag) => row({
    label: `#${tag.name}`,
    count: tag.count,
    onRename: (name) => renameTag(tag.name, name.replace(/^#+/, "")),
    onDelete: () => deleteTag(tag.name),
    deleteTitle: t("deleteTagTitle", tag.name),
    deleteMessage: tn("deleteTagMessage", tag.count),
  })) : [textLine("li", "filter-empty", t("noTagsYet"))]));
}

byId("manage-organization").addEventListener("click", () => {
  byId("manage-status").textContent = "";
  render();
  dialog.showModal();
});
