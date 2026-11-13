import { clipType } from "../../lib/format.js";
import { deleteEntry, openClipPreview, openLink, toggleMask, togglePin } from "./actions.js";
import { byId, icon, textLine } from "./dom.js";
import { openEditor } from "./editor.js";
import { clipItem, clipName, search } from "./list.js";
import { startSelection } from "./selection.js";
import { state } from "./state.js";
import { t } from "../../lib/i18n.js";

const clipMenu = byId("clip-menu");
let menuEntryId;
let menuClosedAt = 0;

export function menuIsOpen() {
  return clipMenu.matches(":popover-open");
}

// True right after the menu for this entry was light-dismissed, so the same click doesn't reopen it.
export function recentlyClosedFor(id) {
  return menuEntryId === id && Date.now() - menuClosedAt < 300;
}

/** @returns {[any, string, string, () => void][]} */
function menuActions(entry) {
  const visible = entry.visibility === "visible";
  /** @type {[any, string, string, () => void][]} */
  const actions = [["preview", t("preview"), t("menuKeyPreview"), () => openClipPreview(entry)]];
  if (visible && entry.kind !== "image" && clipType(entry.text) === "link") {
    actions.push(["open", t("openLink"), t("menuKeyOpen"), () => openLink(entry)]);
  }
  actions.push(
    [visible ? "eyeOff" : "eye", visible ? t("mask") : t("show"), t("menuKeyMask"), () => toggleMask(entry)],
    ["pin", entry.pinned ? t("unpin") : t("pin"), t("menuKeyPin"), () => togglePin(entry)],
    ["edit", t("edit"), t("menuKeyEdit"), () => openEditor(entry)],
    ["select", t("select"), t("menuKeySelect"), () => startSelection(entry.id)],
    ["delete", t("delete"), t("menuKeyDelete"), () => deleteEntry(entry)],
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

export function openMenu(entry, anchor, x, y) {
  if (menuIsOpen()) clipMenu.hidePopover();
  menuEntryId = entry.id;
  clipMenu.setAttribute("aria-label", t("actionsFor", clipName(entry)));
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

export function openMenuForActive() {
  const entry = state.shownClips.find(({ id }) => id === state.activeId);
  if (entry) openMenu(entry, clipItem(entry.id).querySelector('[data-action="more"]'));
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
    const key = event.key === "Delete" || event.key === "Backspace" ? t("menuKeyDelete") : event.key.toUpperCase();
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
