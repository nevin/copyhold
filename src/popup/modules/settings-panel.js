import {
  getSettings, getTheme, onSettingsChange, onThemeChange, setTheme, updateSettings,
} from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { byId, iconPaths, run, status } from "./dom.js";
import { confirmAction } from "./editor.js";
import { clipList, refresh, renderList, setCategoryColors, setPinnedCollapsed, setSortOrder } from "./list.js";
import { state } from "./state.js";
import { t, tn } from "../../lib/i18n.js";

const settings = byId("settings");
const themeOptions = settings.querySelectorAll('[name="theme"]');
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const closeAfterCopyInput = byId("close-after-copy");
const hidePreviewsButton = byId("hide-previews");
const retentionDays = byId("retention-days");
const historyLimit = byId("history-limit");
const sensitiveClips = byId("sensitive-clips");
const captureImages = byId("capture-images");
let savedHistoryLimit = 0;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
  for (const option of themeOptions) option.checked = option.value === theme;
}

applyTheme(getTheme());
systemTheme.addEventListener("change", () => applyTheme(getTheme()));
onThemeChange(applyTheme);

export function closeSettings() {
  settings.open = false;
  byId("app-menu-button").focus();
}

document.addEventListener("click", (event) => {
  // The path is fixed when the click starts, so it still counts a button that the click removed.
  const path = event.composedPath();
  const inside = path.includes(settings) || path.includes(byId("app-menu")) || path.some((node) => node instanceof HTMLDialogElement);
  if (settings.open && !inside) settings.open = false;
});
settings.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !settings.open) return;
  event.preventDefault();
  closeSettings();
});
byId("close-settings").addEventListener("click", closeSettings);

function applyDensity(density) {
  clipList.classList.toggle("compact", density === "compact");
  for (const option of settings.querySelectorAll('[name="density"]')) option.checked = option.value === density;
}

function applyHidePreviews(hidden) {
  state.hidePreviews = hidden;
  hidePreviewsButton.setAttribute("aria-checked", String(hidden));
  hidePreviewsButton.querySelector("span").textContent = hidden ? t("showClipPreviews") : t("hideClipPreviews");
  hidePreviewsButton.querySelector("path").setAttribute("d", iconPaths[hidden ? "eye" : "eyeOff"]);
  renderList();
}

settings.addEventListener("change", (event) => {
  const { name, value } = event.target;
  if (name === "theme") {
    setTheme(value);
    applyTheme(getTheme());
  } else if (name === "density") {
    applyDensity(value);
    run(() => updateSettings({ density: value }));
  }
});
hidePreviewsButton.addEventListener("mousedown", (event) => event.preventDefault());
hidePreviewsButton.addEventListener("click", () => {
  applyHidePreviews(!state.hidePreviews);
  status(state.hidePreviews ? t("clipPreviewsHidden") : t("clipPreviewsShown"));
  run(() => updateSettings({ hidePreviews: state.hidePreviews }));
});

run(async () => {
  const saved = await getSettings();
  applyDensity(saved.density);
  if (saved.hidePreviews) applyHidePreviews(true);
  if (saved.pinnedCollapsed) setPinnedCollapsed(true);
  if (saved.sortOrder !== "recent") setSortOrder(saved.sortOrder);
  setCategoryColors(saved.categoryColors);
  for (const [input, key] of [[retentionDays, "retentionDays"], [historyLimit, "historyLimit"], [sensitiveClips, "sensitiveClips"]]) {
    input.value = String(saved[key]);
    input.disabled = false;
  }
  savedHistoryLimit = saved.historyLimit;
  for (const [input, key] of [[closeAfterCopyInput, "closeAfterCopy"], [captureImages, "captureImages"]]) {
    input.checked = saved[key];
    input.disabled = false;
  }
  state.closeAfterCopy = saved.closeAfterCopy;
});
onSettingsChange((changes) => {
  if ("retentionDays" in changes) retentionDays.value = String(changes.retentionDays);
  if ("sensitiveClips" in changes) sensitiveClips.value = changes.sensitiveClips;
  if ("captureImages" in changes) captureImages.checked = changes.captureImages;
  if ("closeAfterCopy" in changes) closeAfterCopyInput.checked = state.closeAfterCopy = changes.closeAfterCopy;
  if ("density" in changes) applyDensity(changes.density);
  if ("sortOrder" in changes && changes.sortOrder !== state.sortOrder) setSortOrder(changes.sortOrder);
  if ("categoryColors" in changes) setCategoryColors(changes.categoryColors);
  if ("pinnedCollapsed" in changes && changes.pinnedCollapsed !== state.pinnedCollapsed) setPinnedCollapsed(changes.pinnedCollapsed);
  if ("hidePreviews" in changes && changes.hidePreviews !== state.hidePreviews) applyHidePreviews(changes.hidePreviews);
  if ("historyLimit" in changes) historyLimit.value = String(savedHistoryLimit = changes.historyLimit);
});
retentionDays.addEventListener("change", () => run(() => updateSettings({ retentionDays: Number(retentionDays.value) })));
sensitiveClips.addEventListener("change", () => run(() => updateSettings({ sensitiveClips: sensitiveClips.value })));
captureImages.addEventListener("change", () => run(() => updateSettings({ captureImages: captureImages.checked })));
closeAfterCopyInput.addEventListener("change", () => run(async () => {
  state.closeAfterCopy = closeAfterCopyInput.checked;
  await updateSettings({ closeAfterCopy: state.closeAfterCopy });
}));
historyLimit.addEventListener("change", () => run(async () => {
  const limit = Number(historyLimit.value);
  const unpinned = await store.countUnpinned();
  const excess = limit ? Math.max(0, unpinned - limit) : 0;
  if (excess && !await confirmAction(
    tn("trimTitle", excess),
    t("trimMessage", limit.toLocaleString()),
    t("deleteClips"),
    true,
  )) {
    historyLimit.value = String(savedHistoryLimit);
    return;
  }
  await updateSettings({ historyLimit: limit });
  savedHistoryLimit = limit;
  const removed = await store.trimHistory(limit);
  if (removed) await refresh(tn("trimmed", removed));
  else status(t("historySaved"));
}));

export { settings };
