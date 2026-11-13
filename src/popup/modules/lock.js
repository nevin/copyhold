import { withClipboardLock } from "../../lib/clipboard.js";
import { changePassphrase, createLock, createOpener, seal, unlock } from "../../lib/lock.js";
import {
  getUnlockedKey, lockNow, onLockChange, rememberUnlockedKey, touchUnlocked,
} from "../../lib/session.js";
import { getSettings, onSettingsChange, updateSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { byId, run, status } from "./dom.js";
import { confirmAction } from "./editor.js";
import { loaders, refresh, render, search } from "./list.js";
import { t } from "../../lib/i18n.js";

const lockScreen = byId("lock-screen");
const lockDialog = byId("lock-dialog");
const lockForm = byId("lock-form");
const lockAfter = byId("lock-after");
let lockRecord;
let privateKey;
let opener;
let dialogMode;

// Locked clips are decrypted in memory for this view only; nothing decrypted is written back.
loaders.prepare = async (entries) => {
  if (!opener) return entries.filter((entry) => !entry.sealed);
  return Promise.all(entries.map(opener));
};

function showLockState() {
  const enabled = Boolean(lockRecord);
  const locked = enabled && !privateKey;
  lockScreen.hidden = !locked;
  byId("clips-panel").hidden = locked;
  for (const id of ["new", "open-tab", "lock-now", "search-area", "hide-previews", "open-palette"]) byId(id).toggleAttribute("data-locked", locked);
  byId("lock-now").hidden = !enabled || locked;
  byId("lock-summary").textContent = enabled
    ? t("lockSummaryOn")
    : t("lockSummaryOff");
  byId("lock-options").hidden = !enabled;
  byId("lock-setup").hidden = enabled;
  byId("lock-change").hidden = !enabled || locked;
  byId("lock-remove").hidden = !enabled || locked;
  if (locked) byId("unlock-passphrase").focus();
}

function setUnlocked(key) {
  privateKey = key;
  opener = key ? createOpener(key) : undefined;
}

/** Finds out whether Copyhold is locked. Returns true when the clip list can be shown. */
export async function initLock() {
  lockRecord = await store.getLock();
  if (lockRecord) setUnlocked(await getUnlockedKey());
  showLockState();
  if (privateKey) await touchUnlocked();
  return !lockRecord || Boolean(privateKey);
}

setInterval(() => {
  if (privateKey && document.visibilityState === "visible") run(touchUnlocked);
}, 60_000);

// Another view locked, unlocked, or changed the lock; reloading is the simplest way to follow it.
onLockChange((unlocked) => {
  if (unlocked !== Boolean(privateKey)) location.reload();
});

byId("unlock-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("unlock-passphrase");
  const unlockStatus = byId("unlock-status");
  const submit = event.submitter;
  submit.disabled = true;
  unlockStatus.textContent = t("unlocking");
  run(async () => {
    try {
      const key = await unlock(lockRecord, input.value);
      // Update this view first, so the session change it causes doesn't reload it.
      setUnlocked(key);
      await rememberUnlockedKey(key);
      input.value = "";
      unlockStatus.textContent = "";
      showLockState();
      search.focus();
      await render({ quick: true });
    } catch (error) {
      unlockStatus.textContent = error.message;
      input.select();
    } finally {
      submit.disabled = false;
    }
  });
});

byId("lock-now").addEventListener("click", () => run(async () => {
  setUnlocked(undefined);
  await lockNow();
  showLockState();
}));

byId("forgot-passphrase").addEventListener("click", () => run(async () => {
  if (!await confirmAction(
    t("forgotTitle"),
    t("forgotMessage"),
    t("deleteAllClips"),
    true,
  )) return;
  await withClipboardLock(async () => {
    await store.removeMany((await store.list()).map(({ id }) => id));
    await store.removeExpired();
    await store.setMeta({ lock: undefined, skipClipboard: true });
  });
  lockRecord = undefined;
  setUnlocked(undefined);
  await lockNow();
  showLockState();
  await refresh(t("forgotDone"));
}));

function openLockDialog(mode) {
  dialogMode = mode;
  byId("lock-dialog-title").textContent = mode === "setup" ? t("lockSetupTitle") : t("changePassphrase");
  byId("lock-dialog-message").textContent = mode === "setup"
    ? t("lockSetupMessage")
    : t("lockChangeMessage");
  byId("save-lock").textContent = mode === "setup" ? t("turnOnLock") : t("changePassphrase");
  lockForm.reset();
  byId("lock-form-status").textContent = "";
  lockDialog.showModal();
}

byId("lock-setup").addEventListener("click", () => openLockDialog("setup"));
byId("lock-change").addEventListener("click", () => openLockDialog("change"));
byId("cancel-lock").addEventListener("click", () => lockDialog.close());

lockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const passphrase = byId("new-passphrase").value;
  const formStatus = byId("lock-form-status");
  if (passphrase.length < 8) {
    formStatus.textContent = t("passphraseTooShort");
    return;
  }
  if (passphrase !== byId("confirm-passphrase").value) {
    formStatus.textContent = t("passphraseMismatch");
    return;
  }
  const submit = event.submitter;
  submit.disabled = true;
  formStatus.textContent = dialogMode === "setup" ? t("encrypting") : t("saving");
  run(async () => {
    try {
      if (dialogMode === "setup") {
        const { lock, privateKey: key } = await createLock(passphrase);
        // Hold the clipboard lock so no clip is captured unencrypted while the history is rewritten.
        await withClipboardLock(() => store.rewriteAll(async (record) => {
          if (record.sealed) return record;
          const { hash, ...entry } = record;
          return seal(entry, lock);
        }, { lock, fingerprint: undefined, skipClipboard: true }));
        lockRecord = lock;
        setUnlocked(key);
        await rememberUnlockedKey(key);
        status(t("lockOn"));
      } else {
        lockRecord = await changePassphrase(lockRecord, privateKey, passphrase);
        await store.setMeta({ lock: lockRecord });
        status(t("passphraseChanged"));
      }
      lockDialog.close();
      showLockState();
      await refresh();
    } catch (error) {
      formStatus.textContent = error.message || t("errorSaveLock");
    } finally {
      submit.disabled = false;
    }
  });
});

byId("lock-remove").addEventListener("click", () => run(async () => {
  if (!await confirmAction(
    t("lockRemoveTitle"),
    t("lockRemoveMessage"),
    t("turnOffLock"),
  )) return;
  status(t("decrypting"));
  await withClipboardLock(() => store.rewriteAll(async (record) => {
    const entry = await opener(record);
    entry.hash ??= await store.contentDigest(entry);
    return entry;
  }, { lock: undefined, fingerprint: undefined, skipClipboard: true }));
  lockRecord = undefined;
  setUnlocked(undefined);
  await lockNow();
  showLockState();
  await refresh(t("lockOff"));
}));

run(async () => {
  lockAfter.value = String((await getSettings()).lockAfterMinutes);
});
onSettingsChange((changes) => {
  if ("lockAfterMinutes" in changes) lockAfter.value = String(changes.lockAfterMinutes);
});
lockAfter.addEventListener("change", () => run(() => updateSettings({ lockAfterMinutes: Number(lockAfter.value) })));
