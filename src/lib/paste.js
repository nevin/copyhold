// Pasting a clip into the text field the person was typing in before opening Copyhold.

/**
 * Runs inside the page (in each frame) through chrome.scripting, so it must not use anything outside itself.
 * Inserts the text at the caret of the focused text field and returns whether it did.
 * @param {string} text
 */
export function insertIntoFocusedField(text) {
  const element = document.activeElement;
  if (!element || element === document.body || element.tagName === "IFRAME" || element.tagName === "FRAME") return false;
  const textTypes = ["text", "search", "email", "url", "tel", "password", ""];
  const isInput = element instanceof HTMLInputElement && textTypes.includes(element.type) && !element.readOnly && !element.disabled;
  const isTextArea = element instanceof HTMLTextAreaElement && !element.readOnly && !element.disabled;
  const isEditable = element instanceof HTMLElement && element.isContentEditable;
  if (!isInput && !isTextArea && !isEditable) return false;
  element.focus();
  // insertText goes through the browser's editing, so the page sees a normal input and Undo works.
  if (document.execCommand("insertText", false, text)) return true;
  if (isInput || isTextArea) {
    const field = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (element);
    field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, "end");
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }
  return false;
}

/**
 * Pastes into the tab the popup was opened over. Needs the activeTab grant that opening the popup gives,
 * so it returns false on pages extensions can't reach, such as browser settings and stores.
 * @param {number} tabId
 * @param {string} text
 */
export async function pasteIntoTab(tabId, text) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: insertIntoFocusedField,
      args: [text],
    });
    return results.some((result) => result.result === true);
  } catch {
    return false;
  }
}
