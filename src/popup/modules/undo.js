import { isExpired } from "../../lib/entries.js";
import * as store from "../../lib/store.js";
import { byId, run } from "./dom.js";
import { refresh, search } from "./list.js";
import { t, tn } from "../../lib/i18n.js";

const undoBar = byId("undo-bar");
const undoButton = byId("undo-delete");
const undoDuration = 12_000;
const undoHolds = new Set();
let deletedClips = [];
let undoTimer;
let undoRemaining = 0;
let undoStarted = 0;

function closeUndo() {
  clearTimeout(undoTimer);
  undoHolds.clear();
  deletedClips = [];
  if (undoBar.contains(document.activeElement)) search.focus();
  undoBar.hidden = true;
}

// Hovering or focusing the bar pauses the countdown so there is time to decide.
function holdUndo(reason, held) {
  const wasPaused = undoHolds.size > 0;
  if (held) undoHolds.add(reason);
  else undoHolds.delete(reason);
  const paused = undoHolds.size > 0;
  if (undoBar.hidden || paused === wasPaused) return;
  if (paused) {
    clearTimeout(undoTimer);
    undoRemaining -= Date.now() - undoStarted;
  } else {
    undoStarted = Date.now();
    undoTimer = setTimeout(closeUndo, undoRemaining);
  }
  undoBar.classList.toggle("is-paused", paused);
}

/** @param {any[]} clips The stored entries that were deleted, as they were in the database. */
export function offerUndo(clips) {
  if (!clips.length) return;
  clearTimeout(undoTimer);
  deletedClips = clips;
  undoBar.hidden = false;
  byId("undo-message").textContent = tn("clipsDeleted", clips.length);
  const progress = byId("undo-progress");
  progress.replaceWith(progress.cloneNode());
  undoRemaining = undoDuration;
  undoStarted = Date.now();
  const paused = undoHolds.size > 0;
  undoBar.classList.toggle("is-paused", paused);
  if (!paused) undoTimer = setTimeout(closeUndo, undoRemaining);
}

undoBar.addEventListener("pointerenter", () => holdUndo("pointer", true));
undoBar.addEventListener("pointerleave", () => holdUndo("pointer", false));
undoBar.addEventListener("focusin", () => holdUndo("focus", true));
undoBar.addEventListener("focusout", (event) => {
  if (!undoBar.contains(event.relatedTarget)) holdUndo("focus", false);
});

undoButton.addEventListener("click", () => run(async () => {
  const batch = deletedClips;
  const restorable = batch.filter((clip) => !isExpired(clip));
  undoButton.disabled = true;
  try {
    await store.restore(restorable);
    if (deletedClips === batch) closeUndo();
    await refresh(restorable.length === batch.length ? t("deletionUndone") : t("expiredNotRestored"));
  } finally {
    undoButton.disabled = false;
  }
}));
