// The ⋯ menu in the header: less frequent actions, so the header can stay to search and Save.
import { byId } from "./dom.js";
import { search } from "./list.js";

const button = byId("app-menu-button");
const menu = byId("app-menu");
const items = () => [...menu.querySelectorAll('[role^="menuitem"]')].filter((item) => !item.hidden);

function position() {
  const rect = button.getBoundingClientRect();
  const { width } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  menu.style.top = `${rect.bottom + 4}px`;
}

menu.addEventListener("toggle", (event) => {
  const open = event.newState === "open";
  button.setAttribute("aria-expanded", String(open));
  if (open) {
    position();
    items()[0]?.focus();
  } else if (!document.activeElement || document.activeElement === document.body || menu.contains(document.activeElement)) {
    search.focus({ preventScroll: true });
  }
});

// Choosing an item closes the menu after the item's own handler has run.
menu.addEventListener("click", (event) => {
  if (/** @type {Element} */ (event.target).closest('[role^="menuitem"]')) menu.hidePopover();
});

menu.addEventListener("keydown", (event) => {
  const list = items();
  const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (move) {
    event.preventDefault();
    list[(index + move + list.length) % list.length].focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    list.at(event.key === "Home" ? 0 : -1).focus();
  } else if (event.key === "Tab") {
    event.preventDefault();
    menu.hidePopover();
  }
});

byId("open-settings").addEventListener("click", () => {
  byId("settings").open = true;
  byId("close-settings").focus();
});
