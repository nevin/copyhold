import { t } from "../../lib/i18n.js";
import { collectOrganization, emptyFilter, isFiltering } from "../../lib/organize.js";
import { byId, textLine } from "./dom.js";
import { renderList, search } from "./list.js";
import { state } from "./state.js";

const button = byId("filter-button");
const panel = byId("filter-panel");
const activeFilters = byId("active-filters");
const same = (first, second) => first.toLocaleLowerCase() === second.toLocaleLowerCase();

function applyFilter(filter) {
  state.filter = filter;
  renderList(true);
  if (panel.matches(":popover-open")) buildPanel();
}

/** Adds a tag to the filter, as when a tag on a clip is selected. */
export function filterByTag(tag) {
  if (state.filter.tags.some((existing) => same(existing, tag))) return;
  applyFilter({ ...state.filter, tags: [...state.filter.tags, tag] });
}

function chooseCategory(category, subcategory = "") {
  const { filter } = state;
  const chosen = same(filter.category, category) && same(filter.subcategory, subcategory);
  applyFilter({ ...filter, category: chosen ? "" : category, subcategory: chosen ? "" : subcategory });
}

function toggleTag(tag) {
  const { filter } = state;
  const tags = filter.tags.some((existing) => same(existing, tag))
    ? filter.tags.filter((existing) => !same(existing, tag))
    : [...filter.tags, tag];
  applyFilter({ ...filter, tags });
}

function option(label, count, pressed, onSelect, className = "filter-option") {
  const item = document.createElement("button");
  item.type = "button";
  item.className = className;
  item.setAttribute("aria-pressed", String(pressed));
  item.append(textLine("span", "name", label));
  if (count !== undefined) item.append(textLine("span", "count", count.toLocaleString()));
  item.addEventListener("click", onSelect);
  return item;
}

function buildPanel() {
  const { categories, tags } = collectOrganization(state.clips);
  const { filter } = state;
  const focusedLabel = panel.contains(document.activeElement) ? document.activeElement.textContent : null;

  const categorySection = document.createElement("section");
  categorySection.append(textLine("h2", "", t("category")));
  if (categories.length) {
    const list = document.createElement("div");
    list.className = "filter-options";
    list.append(option(t("allCategories"), undefined, !filter.category, () => applyFilter({ ...filter, category: "", subcategory: "" })));
    for (const category of categories) {
      list.append(option(category.name, category.count,
        same(filter.category, category.name) && !filter.subcategory, () => chooseCategory(category.name)));
      for (const subcategory of category.subcategories) {
        list.append(option(subcategory.name, subcategory.count,
          same(filter.category, category.name) && same(filter.subcategory, subcategory.name),
          () => chooseCategory(category.name, subcategory.name), "filter-option sub"));
      }
    }
    categorySection.append(list);
  } else {
    categorySection.append(textLine("p", "filter-empty", t("noCategoriesYet")));
  }

  const tagSection = document.createElement("section");
  tagSection.append(textLine("h2", "", t("tagsAllMatch")));
  if (tags.length) {
    const list = document.createElement("div");
    list.className = "filter-tags";
    for (const tag of tags) {
      const chip = option(`#${tag.name}`, tag.count, filter.tags.some((existing) => same(existing, tag.name)),
        () => toggleTag(tag.name), "tag");
      list.append(chip);
    }
    tagSection.append(list);
  } else {
    tagSection.append(textLine("p", "filter-empty", t("noTagsYet")));
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const clear = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: t("clearFilters") });
  clear.disabled = !isFiltering(filter);
  clear.addEventListener("click", () => applyFilter(emptyFilter()));
  const done = Object.assign(document.createElement("button"), { type: "button", className: "secondary", textContent: t("done") });
  done.addEventListener("click", () => panel.hidePopover());
  actions.append(clear, done);

  panel.replaceChildren(categorySection, tagSection, actions);
  // Keep focus on the option that was just chosen.
  const refocus = focusedLabel && [...panel.querySelectorAll("button")].find((item) => item.textContent === focusedLabel);
  refocus?.focus();
}

function positionPanel() {
  const rect = button.getBoundingClientRect();
  const { width, height } = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
  const below = rect.bottom + 4;
  panel.style.top = `${below + height <= innerHeight - 8 ? below : Math.max(8, rect.top - 4 - height)}px`;
}

// The content is built before the panel shows, so it never appears empty; it's placed once it has a size.
panel.addEventListener("beforetoggle", (event) => {
  if (event.newState === "open") buildPanel();
});
panel.addEventListener("toggle", (event) => {
  const open = event.newState === "open";
  button.setAttribute("aria-expanded", String(open));
  if (open) {
    positionPanel();
    panel.querySelector('[aria-pressed="true"], button')?.focus();
  } else if (!document.activeElement || document.activeElement === document.body) {
    search.focus({ preventScroll: true });
  }
});
addEventListener("resize", () => {
  if (panel.matches(":popover-open")) positionPanel();
});

function removableChip(label, onRemove) {
  const chip = textLine("span", "tag", label);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", t("removeFilter", label));
  remove.addEventListener("click", () => {
    onRemove();
    search.focus({ preventScroll: true });
  });
  chip.append(remove);
  return chip;
}

// The chosen filters, shown under the list tools so it's clear why clips are missing.
// The list calls this after each render.
export function showActiveFilters() {
  const { filter } = state;
  const count = (filter.category ? 1 : 0) + filter.tags.length;
  button.classList.toggle("is-active", count > 0);
  byId("filter-count").textContent = count ? String(count) : "";
  activeFilters.hidden = count === 0;
  if (!count) {
    activeFilters.replaceChildren();
    return;
  }
  const chips = [];
  if (filter.category) {
    const label = filter.subcategory ? t("categoryPath", filter.category, filter.subcategory) : filter.category;
    chips.push(removableChip(label, () => applyFilter({ ...state.filter, category: "", subcategory: "" })));
  }
  for (const tag of filter.tags) chips.push(removableChip(`#${tag}`, () => toggleTag(tag)));
  const clear = Object.assign(document.createElement("button"), { type: "button", className: "quiet clear-filters", textContent: t("clearFilters") });
  clear.addEventListener("click", () => applyFilter(emptyFilter()));
  activeFilters.replaceChildren(...chips, clear);
}

