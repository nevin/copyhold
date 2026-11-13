// The popup and the full-tab view share this page. Each module wires up its own part of it.
import "./modules/localized.js";
import { byId, fullTab, run } from "./modules/dom.js";
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
import { initLock } from "./modules/lock.js";

document.documentElement.classList.toggle("full-tab", fullTab);
byId("open-tab").hidden = fullTab;
// Escape steps back one layer at a time: a dialog, menu, settings, selection, or search text closes first,
// each with its own handler, and the next Escape closes the popup. The full-tab view stays open.
document.addEventListener("keydown", (event) => {
  if (fullTab || event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
  if (document.querySelector("dialog[open], :popover-open") || byId("settings").open || state.selecting) return;
  if (search.value && document.activeElement === search) return;
  window.close();
});

run(async () => {
  if (!await initLock()) return;
  if (!fullTab) search.focus();
  await render({ quick: true });
});
