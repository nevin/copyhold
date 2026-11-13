import * as store from "./store.js";

// Automatic capture stays off until the person turns it on, from the first-run prompt or Settings.
export const defaultSettings = {
  autoCapture: false,
  autoCaptureAsked: false,
  pausedUntil: 0,
  retentionDays: 0,
  closeAfterCopy: true,
  // 0 keeps every clip.
  historyLimit: 0,
  density: "comfortable",
  hidePreviews: false,
  pinnedCollapsed: false,
  // What automatic capture does with text that looks like a password, key, or card number: mask, skip, or keep.
  sensitiveClips: "mask",
  captureImages: false,
  // Minutes without opening Copyhold before the lock closes again; 0 waits until the browser closes.
  lockAfterMinutes: 15,
};
const settingsChannel = "copyhold-settings";
const themeKey = "copyhold-theme";
const legacyThemeKey = "clipfile-theme";

export async function getSettings() {
  return { ...defaultSettings, ...await store.getMeta(Object.keys(defaultSettings)) };
}

export async function updateSettings(changes) {
  await store.setMeta(changes);
  const channel = new BroadcastChannel(settingsChannel);
  channel.postMessage(changes);
  channel.close();
}

// The listener receives the changed settings, including changes made in this view.
// Returns a function that stops listening.
export function onSettingsChange(listener) {
  const channel = new BroadcastChannel(settingsChannel);
  channel.addEventListener("message", ({ data }) => listener(data));
  return () => channel.close();
}

// The theme is read synchronously so each view opens in the right colors without a flash.
export function getTheme() {
  const legacy = localStorage.getItem(legacyThemeKey);
  if (legacy !== null) {
    if (localStorage.getItem(themeKey) === null) localStorage.setItem(themeKey, legacy);
    localStorage.removeItem(legacyThemeKey);
  }
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
