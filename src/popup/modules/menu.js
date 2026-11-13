import { clipType } from "../../lib/format.js";
import { t } from "../../lib/i18n.js";
import { transformLabel, transformsFor } from "../../lib/transforms.js";
import { copyEntry, deleteEntry, openClipPreview, openLink, openSource, toggleMask, togglePin } from "./actions.js";
import { byId, icon, textLine } from "./dom.js";
import { openEditor } from "./editor.js";
import { clipItem, clipName, search } from "./list.js";
import { startSelection } from "./selection.js";
import { state } from "./state.js";

const clipMenu = byId("clip-menu");
let menuEntryId;
let menuClosedAt = 0;
// Set while the Copy as list is showing, so Backspace goes back instead of deleting.
let inSubmenu = false;
let reposition = () => {};

/**
 * One menu item: icon, label, letter, what it does, and whether the menu stays open afterward.
 * @typedef {{ icon: any, label: string, key: string, action: () => void, stay?: boolean, danger?: boolean }} MenuItem
 */

export function menuIsOpen() {
  return clipMenu.matches(":popover-open");
}

// True right after the menu for this entry was light-dismissed, so the same click doesn't reopen it.
export function recentlyClosedFor(id) {
  return menuEntryId === id && Date.now() - menuClosedAt < 300;
}

/** @returns {MenuItem[]} */
function menuActions(entry) {
  const visible = entry.visibility === "visible";
  const text = entry.kind !== "image";
  /** @type {MenuItem[]} */
  const actions = [{ icon: "preview", label: t("preview"), key: t("menuKeyPreview"), action: () => openClipPreview(entry) }];
  if (text && transformsFor(entry.text).length) {
    actions.push({ icon: "copy", label: t("copyAs"), key: t("menuKeyCopyAs"), action: () => showTransforms(entry), stay: true });
  }
  if (visible && text && clipType(entry.text) === "link") {
    actions.push({ icon: "open", label: t("openLink"), key: t("menuKeyOpen"), action: () => openLink(entry) });
  }
  if (entry.sourceUrl) {
    actions.push({ icon: "link", label: t("openSource"), key: t("menuKeySource"), action: () => openSource(entry) });
  }
  actions.push(
    { icon: visible ? "eyeOff" : "eye", label: visible ? t("mask") : t("show"), key: t("menuKeyMask"), action: () => toggleMask(entry) },
    { icon: "pin", label: entry.pinned ? t("unpin") : t("pin"), key: t("menuKeyPin"), action: () => togglePin(entry) },
    { icon: "edit", label: t("edit"), key: t("menuKeyEdit"), action: () => openEditor(entry) },
    { icon: "select", label: t("select"), key: t("menuKeySelect"), action: () => startSelection(entry.id) },
    { icon: "delete", label: t("delete"), key: t("menuKeyDelete"), action: () => deleteEntry(entry), danger: true },
  );
  return actions;
}

function menuItem({ icon: iconName, label, key, action, stay, danger }) {
  const item = document.createElement("button");
  item.type = "button";
  item.tabIndex = -1;
  item.className = danger ? "menu-item danger" : "menu-item";
  item.setAttribute("role", "menuitem");
  item.setAttribute("aria-keyshortcuts", key);
  item.dataset.key = key;
  const shortcut = textLine("kbd", "", key);
  shortcut.setAttribute("aria-hidden", "true");
  item.append(icon(iconName), textLine("span", "", label), shortcut);
  item.addEventListener("click", () => {
    if (!stay) clipMenu.hidePopover();
    action();
  });
  return item;
}

function fillMenu(items, heading) {
  const children = items.map(menuItem);
  if (heading) {
    const title = textLine("div", "menu-heading", heading);
    title.setAttribute("role", "presentation");
    children.unshift(title);
  }
  clipMenu.replaceChildren(...children);
  reposition();
  /** @type {HTMLElement} */ (clipMenu.querySelector('[role="menuitem"]')).focus();
}

// Copy as replaces the menu with ways to change the text as it is copied.
function showTransforms(entry) {
  inSubmenu = true;
  /** @type {MenuItem[]} */
  const items = transformsFor(entry.text).map((transform) => ({
    icon: "copy",
    label: transformLabel(transform.id),
    key: transform.key,
    action: () => copyEntry(entry, transform.id),
  }));
  items.push({ icon: "more", label: t("back"), key: t("menuKeyBack"), action: () => showMain(entry), stay: true });
  fillMenu(items, t("copyAs"));
}

function showMain(entry) {
  inSubmenu = false;
  fillMenu(menuActions(entry));
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
  reposition = () => positionMenu(anchor, x, y);
  clipMenu.showPopover();
  showMain(entry);
  addEventListener("resize", reposition, { once: true });
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
    /** @type {HTMLElement} */ (items[(index + move + items.length) % items.length]).focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    /** @type {HTMLElement} */ (items.at(event.key === "Home" ? 0 : -1)).focus();
  } else if (event.key === "Tab") {
    event.preventDefault();
    clipMenu.hidePopover();
  } else if (inSubmenu && (event.key === "Backspace" || event.key === "ArrowLeft")) {
    event.preventDefault();
    /** @type {HTMLElement} */ (items.at(-1)).click();
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const key = event.key === "Delete" || event.key === "Backspace" ? t("menuKeyDelete") : event.key.toUpperCase();
    const match = /** @type {HTMLElement} */ (items.find((item) => /** @type {HTMLElement} */ (item).dataset.key === key));
    if (!match) return;
    event.preventDefault();
    match.click();
  }
});

clipMenu.addEventListener("toggle", (event) => {
  if (event.newState !== "closed") return;
  inSubmenu = false;
  menuClosedAt = Date.now();
  if (document.activeElement === document.body) search.focus({ preventScroll: true });
});
