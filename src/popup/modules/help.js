// The keyboard cheat sheet (press ?) and a one-time tip about what's new.
import { t } from "../../lib/i18n.js";
import { getSettings, updateSettings } from "../../lib/settings.js";
import { byId, isMac, run, textLine } from "./dom.js";
import { search } from "./list.js";
import { menuIsOpen } from "./menu.js";
import { state } from "./state.js";

const dialog = byId("shortcuts-dialog");
// Shown once after updating to the version that brought these features.
const tipVersion = "1.4";

function keys(...names) {
  const term = document.createElement("dt");
  names.forEach((name, index) => {
    if (index) term.append(" ");
    term.append(textLine("kbd", "", name));
  });
  return term;
}

function render() {
  const mod = isMac ? "⌘" : "Ctrl";
  const alt = isMac ? "⌥" : "Alt";
  const rows = [
    ["section", t("shortcutsList")],
    [[state.openShortcut || `${alt}+Shift+Y`], t("shortcutOpen")],
    [[state.saveShortcut || `${alt}+Shift+S`], t("shortcutSave")],
    [["↑", "↓"], t("shortcutChoose")],
    [["Enter"], t("shortcutEnter")],
    [["Shift+Enter"], t("shortcutMenu")],
    [[`${alt}+1`, "…", `${alt}+9`], t("shortcutSlots")],
    [[`${mod}+K`], t("shortcutPalette")],
    [["Shift+click"], t("shortcutSelect")],
    [["Esc"], t("shortcutEscape")],
    [["?"], t("shortcutHelp")],
    ["section", t("shortcutsMenu")],
    [["V", "C", "F", "O", "G"], t("shortcutMenuCopy")],
    [["M", "P", "E", "S", "D"], t("shortcutMenuEdit")],
    ["section", t("shortcutsEditor")],
    [[`${mod}+Enter`], t("shortcutEditorDone")],
    ["section", t("shortcutsSearch")],
    [["#tag", "cat:Work", "sub:Code"], t("shortcutSearchLabels")],
    [["type:link", "type:image"], t("shortcutSearchType")],
    [["is:pinned", "is:template", "is:expiring"], t("shortcutSearchIs")],
    [["before:2026-01-01", "after:2026-01-01"], t("shortcutSearchDates")],
  ];
  byId("shortcuts-list").replaceChildren(...rows.flatMap(([names, description]) => names === "section"
    ? [textLine("dt", "section", description)]
    : [keys(...names), textLine("dd", "", description)]));
}

export function openShortcuts() {
  render();
  dialog.showModal();
}

byId("open-shortcuts").addEventListener("click", openShortcuts);

// ? opens the cheat sheet, unless it's being typed into a field.
document.addEventListener("keydown", (event) => {
  if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = /** @type {HTMLElement} */ (event.target);
  const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  if ((typing && !(target === search && !search.value)) || document.querySelector("dialog[open]") || menuIsOpen()) return;
  event.preventDefault();
  openShortcuts();
});

run(async () => {
  const { tipsSeen } = await getSettings();
  if (tipsSeen === tipVersion) return;
  byId("tip-text").textContent = t("tipNew", isMac ? "⌘K" : "Ctrl+K");
  byId("tip-bar").hidden = false;
});
byId("dismiss-tip").addEventListener("click", () => run(async () => {
  byId("tip-bar").hidden = true;
  search.focus({ preventScroll: true });
  await updateSettings({ tipsSeen: tipVersion });
}));
