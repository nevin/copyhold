import { describeSave, saveSelection } from "../lib/clipboard.js";
import { t } from "../lib/i18n.js";

const menuId = "copyhold-save-selection";

// The toolbar badge confirms saves made without opening the popup.
async function showResult(result) {
  const failed = Boolean(result?.error);
  try {
    await chrome.action.setBadgeBackgroundColor({ color: failed ? "#9a2340" : "#176044" });
    await chrome.action.setBadgeText({ text: failed ? "!" : "✓" });
    await chrome.action.setTitle({ title: t("badgeTitle", failed ? result.error : result.message) });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: t("extName") });
    }, 4000);
  } catch (error) {
    console.error("Copyhold badge:", error);
  }
  if (!failed) {
    const changes = new BroadcastChannel("copyhold-entries");
    changes.postMessage("updated");
    changes.close();
  }
}

/**
 * Adds the Save clipboard keyboard command and the Save selection context menu item.
 * @param {() => Promise<any>} saveClipboard Reads and saves the clipboard in this browser's background.
 */
export function setUpShortcuts(saveClipboard) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      { id: menuId, title: t("menuSaveSelection"), contexts: ["selection"] },
      () => void chrome.runtime.lastError,
    );
  });
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== menuId || !info.selectionText) return;
    saveSelection(info.selectionText)
      .then((result) => showResult({ ...result, message: describeSave(result) }))
      .catch((error) => showResult({ error: error.message || t("errorSaveSelection") }));
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "save-clipboard") return;
    saveClipboard()
      .then(showResult)
      .catch((error) => showResult({ error: error.message || t("errorSaveClipboard") }));
  });
}
