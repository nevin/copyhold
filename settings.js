import * as store from "./store.js";

export const defaultSettings = { autoCapture: true, pausedUntil: 0, retentionDays: 0, closeAfterCopy: true };
const settingsChannel = "clipfile-settings";
const themeKey = "clipfile-theme";
let migration;

// Earlier builds kept capture settings in chrome.storage.local, which offscreen documents and
// Firefox cannot read. Values already in IndexedDB win, so a late migration cannot undo a change.
function migrate() {
  migration ??= (async () => {
    if (!globalThis.chrome?.storage?.local) return;
    const legacyKeys = ["autoCapture", "pausedUntil", "skipCurrentClipboard"];
    const { skipCurrentClipboard, ...legacy } = await chrome.storage.local.get(legacyKeys);
    if (skipCurrentClipboard) legacy.skipClipboard = true;
    if (Object.keys(legacy).length) await store.setMeta(legacy, { keepExisting: true });
    await chrome.storage.local.remove(legacyKeys);
  })().catch((error) => {
    migration = undefined;
    throw error;
  });
  return migration;
}

export async function getSettings() {
  await migrate();
  return { ...defaultSettings, ...await store.getMeta(Object.keys(defaultSettings)) };
}

export async function updateSettings(changes) {
  await migrate();
  await store.setMeta(changes);
  const channel = new BroadcastChannel(settingsChannel);
  channel.postMessage(changes);
  channel.close();
}

// The listener receives the changed settings, including changes made in this view.
export function onSettingsChange(listener) {
  new BroadcastChannel(settingsChannel).addEventListener("message", ({ data }) => listener(data));
}

// The theme is read synchronously so each view opens in the right colors without a flash.
export function getTheme() {
  const theme = localStorage.getItem(themeKey);
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function setTheme(theme) {
  localStorage.setItem(themeKey, theme);
}

export function onThemeChange(listener) {
  addEventListener("storage", (event) => {
    if (event.key === themeKey || event.key === null) listener(getTheme());
  });
}
