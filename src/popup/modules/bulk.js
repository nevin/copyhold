// Organize several selected clips at once: set or remove a category, and add or remove tags.
import { t, tn } from "../../lib/i18n.js";
import { cleanName, cleanTags, collectOrganization, parseTags } from "../../lib/organize.js";
import * as store from "../../lib/store.js";
import { byId, run } from "./dom.js";
import { refresh } from "./list.js";
import { state } from "./state.js";

const dialog = byId("organize-dialog");
const form = byId("organize-form");
const categoryInput = byId("organize-category");
const subcategoryInput = byId("organize-subcategory");
const clearCategory = byId("organize-clear-category");
const same = (first, second) => first.toLocaleLowerCase() === second.toLocaleLowerCase();
let targets = [];

/** Fills a datalist with names. Shared by the organize and rules dialogs. */
export function fillOptions(list, names) {
  byId(list).replaceChildren(...names.map((name) => Object.assign(document.createElement("option"), { value: name })));
}

/** Refreshes the category and tag suggestions used by the organize and rules dialogs. */
export function updateOrganizeOptions(category = categoryInput.value) {
  const { categories, tags } = collectOrganization(state.clips);
  fillOptions("organize-category-options", categories.map(({ name }) => name));
  fillOptions("organize-tag-options", tags.map(({ name }) => name));
  const chosen = categories.find(({ name }) => same(name, cleanName(category)));
  fillOptions("organize-subcategory-options", chosen?.subcategories.map(({ name }) => name) ?? []);
}

/** @param {any[]} clips */
export function openOrganize(clips) {
  if (!clips.length) return;
  targets = clips;
  form.reset();
  byId("organize-title").textContent = tn("organizeCount", clips.length);
  byId("organize-status").textContent = "";
  subcategoryInput.disabled = true;
  updateOrganizeOptions("");
  dialog.showModal();
}

categoryInput.addEventListener("input", () => {
  subcategoryInput.disabled = !cleanName(categoryInput.value);
  updateOrganizeOptions();
});
clearCategory.addEventListener("change", () => {
  categoryInput.disabled = subcategoryInput.disabled = clearCategory.checked;
});
byId("cancel-organize").addEventListener("click", () => dialog.close());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const category = clearCategory.checked ? "" : cleanName(categoryInput.value);
  const subcategory = category ? cleanName(subcategoryInput.value) : "";
  const add = parseTags(byId("organize-add-tags").value);
  const remove = parseTags(byId("organize-remove-tags").value);
  if (!clearCategory.checked && !category && !add.length && !remove.length) {
    byId("organize-status").textContent = t("organizeNothing");
    return;
  }
  run(async () => {
    let changed = 0;
    for (const clip of targets) {
      const changes = {};
      if (clearCategory.checked) Object.assign(changes, { category: "", subcategory: "" });
      else if (category) Object.assign(changes, { category, subcategory });
      if (add.length || remove.length) {
        const tags = cleanTags([...clip.tags ?? [], ...add]).filter((tag) => !remove.some((removed) => same(removed, tag)));
        if (tags.join("\n") !== (clip.tags ?? []).join("\n")) changes.tags = tags;
      }
      if (!Object.keys(changes).length) continue;
      await store.update(clip.id, changes);
      changed++;
    }
    dialog.close();
    await refresh(tn("organized", changed));
  });
});
