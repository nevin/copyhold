import { exportEntries, importEntries, sortEntries } from "../../lib/entries.js";
import { decryptBackup, encryptBackup, encryptedBackup } from "../../lib/backup-crypto.js";
import { describeImage } from "../../lib/images.js";
import * as store from "../../lib/store.js";
import { byId, fullTab, run, status } from "./dom.js";
import { loaders, refresh } from "./list.js";
import { t, tn } from "../../lib/i18n.js";

const file = byId("file");

byId("import-hint").textContent = fullTab ? t("importHintTab") : t("importHintPopup");
if (!fullTab) byId("import").title = t("importHintPopup");

byId("import").addEventListener("click", () => {
  if (fullTab) file.click();
  else window.open("popup.html?view=tab&import=1", "_blank", "noopener");
});

const exportDialog = byId("export-dialog");
const passphraseDialog = byId("import-passphrase-dialog");

// Asks for a protected backup's passphrase until it decrypts, and returns the backup inside, or null if cancelled.
function askBackupPassphrase(backup) {
  const form = byId("import-passphrase-form");
  const input = byId("import-passphrase");
  const formStatus = byId("import-passphrase-status");
  form.reset();
  formStatus.textContent = "";
  passphraseDialog.showModal();
  return new Promise((resolve) => {
    const finish = (result) => {
      form.removeEventListener("submit", submit);
      passphraseDialog.removeEventListener("close", cancel);
      if (passphraseDialog.open) passphraseDialog.close();
      resolve(result);
    };
    const cancel = () => finish(null);
    const submit = async (event) => {
      event.preventDefault();
      formStatus.textContent = t("unlocking");
      try {
        finish(await decryptBackup(backup, input.value));
      } catch (error) {
        formStatus.textContent = error.message;
        input.select();
      }
    };
    form.addEventListener("submit", submit);
    passphraseDialog.addEventListener("close", cancel);
  });
}
byId("cancel-import").addEventListener("click", () => passphraseDialog.close());

async function importFile(selected) {
  let json = await selected.text();
  const protectedBackup = encryptedBackup(json);
  if (protectedBackup) {
    json = await askBackupPassphrase(protectedBackup);
    if (json === null) return;
  }
  const entries = await importEntries(json, describeImage);
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

// Protection is on by default; without it, the dialog says the backup is unencrypted.
function showProtection() {
  const protect = byId("export-protect").checked;
  byId("export-passphrase-fields").hidden = !protect;
  byId("export-warning").hidden = protect;
  byId("confirm-export").textContent = protect ? t("export") : t("exportUnprotected");
}

byId("export").addEventListener("click", () => {
  byId("export-form").reset();
  byId("export-status").textContent = "";
  showProtection();
  exportDialog.showModal();
  byId("export-passphrase").focus();
});
byId("export-protect").addEventListener("change", showProtection);
byId("cancel-export").addEventListener("click", () => exportDialog.close());

byId("export-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const protect = byId("export-protect").checked;
  const passphrase = byId("export-passphrase").value;
  const formStatus = byId("export-status");
  if (protect && passphrase.length < 8) {
    formStatus.textContent = t("passphraseTooShort");
    return;
  }
  if (protect && passphrase !== byId("export-confirm").value) {
    formStatus.textContent = t("passphraseMismatch");
    return;
  }
  const submit = /** @type {HTMLButtonElement} */ (/** @type {SubmitEvent} */ (event).submitter);
  submit.disabled = true;
  formStatus.textContent = protect ? t("encryptingBackup") : "";
  run(async () => {
    try {
      const entries = sortEntries(await loaders.prepare(await store.list()));
      const json = await exportEntries(entries);
      const contents = protect ? await encryptBackup(json, passphrase) : json;
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const download = document.createElement("a");
      download.href = url;
      download.download = `copyhold-${new Date().toISOString().slice(0, 10)}${protect ? "-protected" : ""}.json`;
      download.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      exportDialog.close();
      status(protect ? t("exportStartedProtected") : t("exportStarted"));
    } finally {
      submit.disabled = false;
    }
  });
});

if (new URLSearchParams(location.search).has("import")) {
  status(t("importPrompt"));
  byId("import").focus();
}
