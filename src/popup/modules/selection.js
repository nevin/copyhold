import { copyClips } from "../../lib/clipboard.js";
import { createEntry, isExpired, withDefaultRetention } from "../../lib/entries.js";
import { cleanTags } from "../../lib/organize.js";
import { getSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { openOrganize } from "./bulk.js";
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

byId("organize-selected").addEventListener("click", () => openOrganize(selectedEntries()));

// Combine joins the selected text clips, in list order, into one new clip.
const combineDialog = byId("combine-dialog");
const separators = { line: "\n", blank: "\n\n", comma: ", ", space: " " };
byId("combine-selected").addEventListener("click", () => {
  byId("combine-form").reset();
  const images = selectedEntries().filter((clip) => clip.kind === "image").length;
  byId("combine-status").textContent = images ? tn("combineSkipsImages", images) : "";
  combineDialog.showModal();
});
byId("cancel-combine").addEventListener("click", () => combineDialog.close());
byId("combine-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const clips = selectedEntries().filter((clip) => clip.kind !== "image" && !isExpired(clip));
  if (!clips.length) return;
  const separator = separators[byId("combine-form").elements.separator.value];
  const categories = new Set(clips.map((clip) => clip.category));
  run(async () => {
    const combined = createEntry({
      text: clips.map((clip) => clip.text).join(separator),
      title: t("combinedTitle", clips.length),
      // The combined clip keeps a category all the originals share, and all their tags.
      category: categories.size === 1 ? clips[0].category : "",
      subcategory: categories.size === 1 && new Set(clips.map((clip) => clip.subcategory)).size === 1 ? clips[0].subcategory : "",
      tags: cleanTags(clips.flatMap((clip) => clip.tags ?? [])),
      visibility: clips.some((clip) => clip.visibility !== "visible") ? "masked" : "visible",
    });
    await store.add([withDefaultRetention(combined, (await getSettings()).retentionDays)]);
    if (byId("combine-remove").checked) offerUndo(await store.removeMany(clips.map(({ id }) => id)));
    combineDialog.close();
    endSelection();
    await refresh(tn("combined", clips.length));
  });
});

byId("delete-selected").addEventListener("click", () => run(async () => {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  // Deleted clips go to the trash, and Undo is right there, so there's no confirmation.
  offerUndo(await store.removeMany(ids));
  endSelection();
  await refresh();
}));
