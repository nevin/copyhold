// While Copyhold is unlocked, the private key lives in session storage: in memory only, cleared when the
// browser closes, and readable only by Copyhold's own pages.
import { exportPrivateKey, fromBase64, importPrivateKey } from "./lock.js";
import { getSettings } from "./settings.js";

const sessionKey = "copyholdUnlocked";

function expired(session, lockAfterMinutes, now = Date.now()) {
  return Boolean(lockAfterMinutes) && now - session.lastActiveAt > lockAfterMinutes * 60_000;
}

/** Returns the unlocked private key, or null when Copyhold is locked. */
export async function getUnlockedKey() {
  /** @type {any} */
  const { [sessionKey]: session } = await chrome.storage.session.get(sessionKey);
  if (!session) return null;
  if (expired(session, (await getSettings()).lockAfterMinutes)) {
    await lockNow();
    return null;
  }
  return importPrivateKey(fromBase64(session.key));
}

export async function rememberUnlockedKey(privateKey) {
  await chrome.storage.session.set({ [sessionKey]: { key: await exportPrivateKey(privateKey), lastActiveAt: Date.now() } });
}

// Opening Copyhold counts as activity, so the lock timer restarts.
export async function touchUnlocked() {
  /** @type {any} */
  const { [sessionKey]: session } = await chrome.storage.session.get(sessionKey);
  if (session) await chrome.storage.session.set({ [sessionKey]: { ...session, lastActiveAt: Date.now() } });
}

export function lockNow() {
  return chrome.storage.session.remove(sessionKey);
}

/** Locks if the timer ran out. Background pages call this on a schedule. */
export async function lockIfExpired() {
  /** @type {any} */
  const { [sessionKey]: session } = await chrome.storage.session.get(sessionKey);
  if (session && expired(session, (await getSettings()).lockAfterMinutes)) await lockNow();
}

export function onLockChange(listener) {
  chrome.storage.session.onChanged?.addListener?.((changes) => {
    if (sessionKey in changes) listener(Boolean(changes[sessionKey].newValue));
  });
  // Firefox reports session changes through storage.onChanged.
  if (!chrome.storage.session.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && sessionKey in changes) listener(Boolean(changes[sessionKey].newValue));
    });
  }
}
