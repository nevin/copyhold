import { exportEntries, importEntries, sortEntries } from "../../lib/entries.js";
import { describeImage } from "../../lib/images.js";
import * as store from "../../lib/store.js";
import { byId, fullTab, run, status } from "./dom.js";
import { confirmAction } from "./editor.js";
import { loaders, refresh } from "./list.js";
import { settings } from "./settings-panel.js";
import { t, tn } from "../../lib/i18n.js";

const file = byId("file");

byId("import-hint").textContent = fullTab
  ? t("importHintTab")
  : t("importHintPopup");

byId("import").addEventListener("click", () => {
  if (fullTab) file.click();
  else window.open("popup.html?view=tab&import=1", "_blank", "noopener");
});

async function importFile(selected) {
  const entries = await importEntries(await selected.text(), describeImage);
  await store.add(entries);
  await refresh(tn("imported", entries.length));
}

file.addEventListener("change", () => run(async () => {
  const selected = file.files[0];
  file.value = "";
  if (selected) await importFile(selected);
}));

if (fullTab) {
  document.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    document.body.classList.add("is-dropping");
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) document.body.classList.remove("is-dropping");
  });
  document.addEventListener("drop", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    document.body.classList.remove("is-dropping");
    const selected = event.dataTransfer.files[0];
    if (selected) run(() => importFile(selected));
  });
}

byId("export").addEventListener("click", () => run(async () => {
  if (!await confirmAction(
    t("exportTitle"),
    t("exportMessage"),
    t("export"),
  )) return;
  const entries = sortEntries(await loaders.prepare(await store.list()));
  const url = URL.createObjectURL(new Blob([await exportEntries(entries)], { type: "application/json" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = `copyhold-${new Date().toISOString().slice(0, 10)}.json`;
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  status(t("exportStarted"));
}));

if (new URLSearchParams(location.search).has("import")) {
  settings.open = true;
  status(t("importPrompt"));
  byId("import").focus();
}
