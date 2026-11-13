import { copyClips } from "../../lib/clipboard.js";
import { isExpired } from "../../lib/entries.js";
import * as store from "../../lib/store.js";
import { confirmAction } from "./editor.js";
import { byId, run, status } from "./dom.js";
import { refresh, search, updateItemStates } from "./list.js";
import { menuIsOpen } from "./menu.js";
import { state } from "./state.js";
import { offerUndo } from "./undo.js";
import { t, tn } from "../../lib/i18n.js";

const selectVisible = byId("select-visible");

export function setClipSelected(id, checked) {
  if (checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  updateItemStates();
}

export function startSelection(id) {
  state.selecting = true;
  if (id) state.selectedIds.add(id);
  updateItemStates();
  search.focus({ preventScroll: true });
}

export function endSelection() {
  state.selecting = false;
  state.selectedIds.clear();
  updateItemStates();
  search.focus({ preventScroll: true });
}

// Selected clips in list order.
function selectedEntries() {
  return state.clips.filter((clip) => state.selectedIds.has(clip.id));
}

byId("finish-selection").addEventListener("click", endSelection);
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.key !== "Escape" || !state.selecting ||
      document.querySelector("dialog[open]") || byId("settings").open || menuIsOpen() ||
      (event.target === search && search.value)) return;
  event.preventDefault();
  endSelection();
});

selectVisible.addEventListener("change", () => {
  state.selectedIds.clear();
  if (selectVisible.checked) for (const { id } of state.shownClips) state.selectedIds.add(id);
  updateItemStates();
});

byId("select-all").addEventListener("change", (event) => {
  event.target.checked = false;
  for (const { id } of state.shownClips) state.selectedIds.add(id);
  startSelection();
});

byId("copy-selected").addEventListener("click", () => run(async () => {
  const entries = selectedEntries().filter((clip) => !isExpired(clip));
  if (!entries.length) return;
  const { copied, skippedImages } = await copyClips(entries);
  byId("copy-status").textContent = tn("copiedClips", copied);
  status(skippedImages ? `${tn("copiedLines", copied)} ${t("imagesOneAtATime")}` : tn("copiedLines", copied));
}));

byId("pin-selected").addEventListener("click", () => run(async () => {
  const entries = selectedEntries();
  const pinning = entries.some((clip) => !clip.pinned);
  for (const clip of entries) if (clip.pinned !== pinning) await store.update(clip.id, { pinned: pinning });
  await refresh(tn(pinning ? "pinnedClips" : "unpinnedClips", entries.length));
}));

byId("delete-selected").addEventListener("click", () => run(async () => {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  if (!await confirmAction(tn("deleteClipsTitle", ids.length), t("deleteSelectedMessage"), t("delete"), true)) return;
  offerUndo(await store.removeMany(ids));
  endSelection();
  await refresh();
}));
