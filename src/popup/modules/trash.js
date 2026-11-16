// The trash: deleted clips wait 30 days before they're removed for good, and can be restored until then.
import { clipPreview, relativeTime } from "../../lib/format.js";
import { t, tn } from "../../lib/i18n.js";
import * as store from "../../lib/store.js";
import { byId, run, textLine } from "./dom.js";
import { confirmAction } from "./editor.js";
import { loaders, refresh } from "./list.js";

const dialog = byId("trash-dialog");

function describe(clip) {
  if (clip.title) return clip.title;
  if (clip.kind === "image") return t("imageLabel", clip.width, clip.height);
  return clipPreview(clip.text.trim().replace(/\s+/g, " ").slice(0, 120), clip.visibility);
}

async function render() {
  // Trashed clips are encrypted like the others when the lock is on.
  const clips = await loaders.prepare(await store.listTrash());
  byId("empty-trash").disabled = !clips.length;
  byId("trash-list").replaceChildren(...(clips.length ? clips.map((clip) => {
    const item = document.createElement("li");
    item.className = "manage-item";
    const text = document.createElement("div");
    text.className = "trash-text";
    text.append(textLine("span", "name", describe(clip)), textLine("span", "when", t("deletedAgo", relativeTime(clip.deletedAt))));
    const restore = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: t("restore") });
    restore.addEventListener("click", () => run(async () => {
      await store.restoreFromTrash([clip.id]);
      byId("trash-status").textContent = t("restored");
      await refresh();
      await render();
    }));
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: t("deleteForever") });
    remove.addEventListener("click", () => run(async () => {
      await store.deleteFromTrash([clip.id]);
      await render();
    }));
    item.append(text, restore, remove);
    return item;
  }) : [textLine("li", "filter-empty", t("trashEmpty"))]));
  updateTrashCount(clips.length);
}

export function updateTrashCount(count) {
  byId("trash-count").textContent = count ? count.toLocaleString() : "";
}

byId("open-trash").addEventListener("click", () => run(async () => {
  byId("trash-status").textContent = "";
  await render();
  dialog.showModal();
}));
byId("close-trash").addEventListener("click", () => dialog.close());
byId("empty-trash").addEventListener("click", () => run(async () => {
  const count = await store.countTrash();
  if (!await confirmAction(tn("emptyTrashTitle", count), t("emptyTrashMessage"), t("emptyTrash"), true)) return;
  await store.deleteFromTrash();
  await render();
}));

run(async () => updateTrashCount(await store.countTrash()));
