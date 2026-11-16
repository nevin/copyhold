// The popup and the full-tab view share this page. Each module wires up its own part of it.
import "./modules/localized.js";
import { byId, fullTab, inPanel, inPopup, run } from "./modules/dom.js";
import { render, search } from "./modules/list.js";
import { state } from "./modules/state.js";
import "./modules/actions.js";
import "./modules/menu.js";
import "./modules/app-menu.js";
import "./modules/filters.js";
import "./modules/manage.js";
import "./modules/selection.js";
import "./modules/undo.js";
import "./modules/editor.js";
import "./modules/capture.js";
import "./modules/settings-panel.js";
import "./modules/backup.js";
import "./modules/bulk.js";
import "./modules/rules-dialog.js";
import "./modules/storage.js";
import "./modules/palette.js";
import "./modules/trash.js";
import "./modules/help.js";
import { afterUnlock, initLock } from "./modules/lock.js";

document.documentElement.classList.toggle("full-tab", fullTab);
document.documentElement.classList.toggle("side-panel", inPanel);
byId("open-tab").hidden = fullTab;
// Chrome has a side panel and Firefox a sidebar; the menu item opens whichever this browser has.
const sidePanel = globalThis.chrome?.sidePanel;
const sidebar = /** @type {any} */ (globalThis).browser?.sidebarAction;
byId("open-side-panel").hidden = inPanel || (!sidePanel && !sidebar);
byId("open-side-panel").addEventListener("click", () => run(async () => {
  if (sidePanel) await sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
  else await sidebar.open();
  if (inPopup) window.close();
}));
// Escape steps back one layer at a time: a dialog, menu, settings, selection, or search text closes first,
// each with its own handler, and the next Escape closes the popup. The full-tab view stays open.
document.addEventListener("keydown", (event) => {
  if (!inPopup || event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
  if (document.querySelector("dialog[open], :popover-open") || byId("settings").open || state.selecting) return;
  if (search.value && document.activeElement === search) return;
  window.close();
});

// The popup remembers which tab it opened over, so a chosen clip can be pasted there.
if (inPopup) {
  chrome.tabs?.query({ active: true, currentWindow: true })
    .then(([tab]) => { state.pageTabId = tab?.id; })
    .catch(() => {});
}

run(async () => {
  if (!await initLock()) return;
  if (!fullTab) search.focus();
  await render({ quick: true });
  await afterUnlock();
});
