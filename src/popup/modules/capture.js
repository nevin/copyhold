import { saveClipboard, supportsAutoCapture } from "../../lib/clipboard.js";
import { getSettings, onSettingsChange, updateSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { byId, run, status } from "./dom.js";
import { refresh, search, updateEmptyState } from "./list.js";
import { state } from "./state.js";
import { t } from "../../lib/i18n.js";

const autoCapture = byId("auto-capture");
const capturePause = byId("capture-pause");
const captureRetry = byId("capture-retry");
const captureSwitch = byId("capture-switch");
const capturePrompt = byId("capture-prompt");
let capturePausedUntil = 0;
let captureHealthy = true;
let updatingCapture = false;

function showAutoCapture(enabled, pausedUntil = 0) {
  capturePausedUntil = pausedUntil;
  state.autoCaptureEnabled = enabled && !pausedUntil && captureHealthy;
  autoCapture.checked = enabled;
  captureSwitch.setAttribute("aria-checked", String(enabled));
  const captureState = byId("capture-state");
  captureState.textContent = !enabled ? t("autoSaveOff") : pausedUntil ? t("autoSavePaused")
    : captureHealthy ? t("autoSaveOn") : t("autoSaveIssue");
  captureState.hidden = false;
  byId("capture-toolbar").hidden = false;
  const indicator = byId("capture-indicator");
  const indicatorState = !enabled ? "off" : pausedUntil ? "paused" : captureHealthy ? "active" : "issue";
  const label = {
    off: t("autoSaveOff"),
    paused: t("autoSavePausedUntil", new Date(pausedUntil).toLocaleTimeString([], { timeStyle: "short" })),
    active: t("autoSaveActive"),
    issue: t("captureIssue"),
  }[indicatorState];
  indicator.dataset.state = indicatorState;
  if (indicator.textContent !== label) indicator.textContent = label;
  capturePause.hidden = !enabled;
  capturePause.textContent = pausedUntil ? t("resume") : t("pause");
  capturePause.title = pausedUntil ? t("resumeTitle") : t("pauseTitle");
  captureRetry.hidden = !enabled || Boolean(pausedUntil) || captureHealthy;
  captureRetry.title = t("retryTitle");
  updateEmptyState();
}

async function configureAutoCapture(options = {}) {
  const response = await chrome.runtime.sendMessage({ type: "copyhold-auto-capture", ...options });
  if (!response || response.error) throw new Error(response?.error || t("errorReachMonitor"));
  showAutoCapture(response.enabled, response.pausedUntil);
}

async function checkCaptureHealth() {
  if (!autoCapture.checked || capturePausedUntil || updatingCapture) return;
  const health = await chrome.runtime.sendMessage({ type: "copyhold-capture-health" }).catch(() => null);
  if (!autoCapture.checked || capturePausedUntil || updatingCapture) return;
  captureHealthy = Boolean(health && !health.failed && Date.now() - health.lastSuccess < 10_000);
  if (captureHealthy && document.activeElement === captureRetry) capturePause.focus();
  showAutoCapture(true);
}

async function withCaptureUpdate(work) {
  if (updatingCapture) return;
  updatingCapture = true;
  try {
    await work();
  } finally {
    updatingCapture = false;
  }
}

if (supportsAutoCapture) {
  byId("auto-capture-setting").hidden = false;
  // Ask once before reading the clipboard in the background, so capture is never a surprise.
  run(async () => {
    const saved = await getSettings();
    capturePrompt.hidden = saved.autoCaptureAsked || saved.autoCapture;
  });
  for (const [id, enabled] of /** @type {[string, boolean][]} */ ([["capture-prompt-on", true], ["capture-prompt-off", false]])) {
    byId(id).addEventListener("click", () => run(async () => {
      capturePrompt.hidden = true;
      search.focus({ preventScroll: true });
      await updateSettings({ autoCaptureAsked: true });
      if (!enabled) return;
      await withCaptureUpdate(async () => {
        await configureAutoCapture({ enabled: true });
        status(t("captureOn"));
      });
    }));
  }
  run(async () => {
    const { skippedLongAt = 0, skippedLongSeenAt = 0 } = await store.getMeta(["skippedLongAt", "skippedLongSeenAt"]);
    if (skippedLongAt <= skippedLongSeenAt) return;
    status(t("skippedLarge"));
    await store.setMeta({ skippedLongSeenAt: skippedLongAt });
  });
  onSettingsChange((changes) => {
    if (changes.autoCaptureAsked) capturePrompt.hidden = true;
    if (!("autoCapture" in changes) && !("pausedUntil" in changes)) return;
    run(async () => {
      const saved = await getSettings();
      showAutoCapture(saved.autoCapture, saved.pausedUntil);
    });
  });
  setInterval(checkCaptureHealth, 3000);
  captureRetry.addEventListener("click", () => run(() => withCaptureUpdate(async () => {
    captureRetry.setAttribute("aria-disabled", "true");
    try {
      await configureAutoCapture({ retry: true });
    } finally {
      captureRetry.removeAttribute("aria-disabled");
    }
  })));
  capturePause.addEventListener("click", () => run(() => withCaptureUpdate(async () => {
    captureHealthy = true;
    await configureAutoCapture({ pause: capturePausedUntil ? "resume" : "pause" });
  })));
  run(async () => {
    try {
      await configureAutoCapture();
    } finally {
      autoCapture.disabled = false;
    }
  });
  autoCapture.addEventListener("click", (event) => {
    if (updatingCapture) event.preventDefault();
  });
  // The header switch goes through the Settings checkbox so both stay in step.
  captureSwitch.addEventListener("click", () => {
    if (!autoCapture.disabled && !updatingCapture) autoCapture.click();
  });
  autoCapture.addEventListener("change", () => run(async () => {
    const enabled = autoCapture.checked;
    updatingCapture = true;
    autoCapture.setAttribute("aria-disabled", "true");
    try {
      await configureAutoCapture({ enabled });
      await updateSettings({ autoCaptureAsked: true });
      status(enabled ? t("captureOn") : t("captureOff"));
    } catch (error) {
      const saved = await getSettings();
      showAutoCapture(saved.autoCapture, saved.pausedUntil);
      throw error;
    } finally {
      updatingCapture = false;
      autoCapture.removeAttribute("aria-disabled");
    }
  }));
}

byId("capture").addEventListener("click", () => run(async () => {
  const result = await saveClipboard();
  await refresh(result.message);
}));
