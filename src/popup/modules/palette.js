// The command palette: Cmd+K (Ctrl+K elsewhere) finds any action, view, category, or tag by typing.
import { t } from "../../lib/i18n.js";
import { collectOrganization, emptyFilter } from "../../lib/organize.js";
import { byId, fullTab, isMac, textLine } from "./dom.js";
import { applyFilter, filterByTag } from "./filters.js";
import { search } from "./list.js";
import { menuIsOpen } from "./menu.js";
import { state } from "./state.js";

const palette = byId("palette");
const input = byId("palette-input");
const list = byId("palette-list");
export const paletteShortcut = isMac ? "⌘K" : "Ctrl+K";
let commands = [];
let shown = [];
let active = 0;

/**
 * @typedef {{ label: string, group: string, run: () => void, hint?: string }} Command
 */

const click = (id) => () => byId(id).click();
const available = (id) => {
  const element = byId(id);
  return element && !element.hidden && !element.disabled && !element.closest("[hidden]");
};

// Changes a setting the way choosing it in Settings would, so the same handlers run.
function choose(name, value) {
  return () => {
    const option = /** @type {HTMLInputElement} */ (document.querySelector(`[name="${name}"][value="${value}"]`));
    option.checked = true;
    option.dispatchEvent(new Event("change", { bubbles: true }));
  };
}

function setSelect(id, value) {
  return () => {
    const select = byId(id);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
}

function openSettingsThen(id) {
  return () => {
    byId("settings").open = true;
    byId(id).click();
  };
}

/** @returns {Command[]} */
function buildCommands() {
  const actions = t("paletteActions");
  const view = t("paletteView");
  const filter = t("paletteFilter");
  /** @type {Command[]} */
  const items = [
    { label: t("newClip"), group: actions, run: click("new") },
    { label: t("saveClipboard"), group: actions, run: click("capture") },
    { label: t("selectClipsCommand"), group: actions, run: click("select-all") },
    { label: t("importBackup"), group: actions, run: click("import") },
    { label: t("exportBackup"), group: actions, run: click("export") },
    { label: t("settingsAndBackups"), group: actions, run: () => { byId("settings").open = true; } },
    { label: t("manageCategoriesAndTags"), group: actions, run: openSettingsThen("manage-organization") },
    { label: t("autoTagRules"), group: actions, run: openSettingsThen("manage-rules") },
  ];
  if (!fullTab) items.push({ label: t("openInNewTab"), group: actions, run: click("open-tab") });
  if (available("capture-switch")) {
    items.push({ label: state.autoCaptureEnabled ? t("turnOffAutoSave") : t("turnOnAutoSave"), group: actions, run: click("capture-switch") });
  }
  if (available("capture-pause")) items.push({ label: byId("capture-pause").textContent, group: actions, run: click("capture-pause") });
  if (available("lock-now")) items.push({ label: t("lockCopyhold"), group: actions, run: click("lock-now") });

  items.push(
    { label: state.hidePreviews ? t("showClipPreviews") : t("hideClipPreviews"), group: view, run: click("hide-previews") },
    { label: state.pinnedCollapsed ? t("expandPinned") : t("collapsePinned"), group: view, run: click("pinned-toggle") },
    { label: t("showAllClips"), group: view, run: click("all-clips") },
    { label: t("showPinnedOnly"), group: view, run: click("pinned-clips") },
    { label: t("densityCommand", t("comfortable")), group: view, run: choose("density", "comfortable") },
    { label: t("densityCommand", t("compact")), group: view, run: choose("density", "compact") },
    { label: t("themeCommand", t("light")), group: view, run: choose("theme", "light") },
    { label: t("themeCommand", t("dark")), group: view, run: choose("theme", "dark") },
    { label: t("themeCommand", t("system")), group: view, run: choose("theme", "system") },
  );
  for (const order of ["recent", "used", "oldest", "name"]) {
    const label = t(`sort${order[0].toUpperCase()}${order.slice(1)}`);
    items.push({ label: t("sortCommand", label), group: view, run: setSelect("sort-order", order) });
  }

  const { categories, tags } = collectOrganization(state.clips);
  for (const category of categories) {
    items.push({ label: t("filterCategoryCommand", category.name), group: filter, run: () => applyFilter({ ...state.filter, category: category.name, subcategory: "" }) });
    for (const subcategory of category.subcategories) {
      items.push({
        label: t("filterCategoryCommand", t("categoryPath", category.name, subcategory.name)),
        group: filter,
        run: () => applyFilter({ ...state.filter, category: category.name, subcategory: subcategory.name }),
      });
    }
  }
  for (const tag of tags) items.push({ label: t("filterTagCommand", tag.name), group: filter, run: () => filterByTag(tag.name) });
  if (state.filter.category || state.filter.tags.length) {
    items.push({ label: t("clearFilters"), group: filter, run: () => applyFilter(emptyFilter()) });
  }
  return items;
}

// Every typed word must appear in the command's label or group, in any order.
function matching(query) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.group}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

function renderList() {
  shown = matching(input.value).slice(0, 50);
  active = Math.min(active, Math.max(0, shown.length - 1));
  if (!shown.length) {
    list.replaceChildren(textLine("div", "palette-empty", t("noCommands")));
    input.removeAttribute("aria-activedescendant");
    return;
  }
  list.replaceChildren(...shown.map((command, index) => {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.id = `command-${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === active));
    item.append(textLine("span", "label", command.label), textLine("span", "group", command.group));
    item.addEventListener("mousedown", (event) => event.preventDefault());
    item.addEventListener("click", () => runCommand(command));
    item.addEventListener("mousemove", () => {
      if (active !== index) setActive(index);
    });
    return item;
  }));
  input.setAttribute("aria-activedescendant", `command-${active}`);
}

function setActive(index) {
  active = index;
  for (const [position, item] of [...list.children].entries()) item.setAttribute("aria-selected", String(position === index));
  input.setAttribute("aria-activedescendant", `command-${index}`);
  list.children[index]?.scrollIntoView({ block: "nearest" });
}

function runCommand(command) {
  palette.close();
  command.run();
}

export function openPalette() {
  if (palette.open) return;
  commands = buildCommands();
  input.value = "";
  active = 0;
  renderList();
  palette.showModal();
  input.focus();
}

input.addEventListener("input", () => {
  active = 0;
  renderList();
});
input.addEventListener("keydown", (event) => {
  const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (move && shown.length) {
    event.preventDefault();
    setActive((active + move + shown.length) % shown.length);
  } else if (event.key === "Enter" && shown[active]) {
    event.preventDefault();
    runCommand(shown[active]);
  }
});
palette.addEventListener("close", () => {
  if (!document.querySelector("dialog[open]") && !byId("settings").open) search.focus({ preventScroll: true });
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "k" || !(isMac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey) return;
  if (palette.open) {
    event.preventDefault();
    palette.close();
    return;
  }
  if (document.querySelector("dialog[open]") || menuIsOpen() || !byId("lock-screen").hidden) return;
  event.preventDefault();
  openPalette();
});

byId("open-palette").addEventListener("click", openPalette);
byId("open-palette-key").textContent = paletteShortcut;
byId("search-palette-hint").textContent = paletteShortcut;
