// Snippet expansion. Runs in web pages only when the person turns it on and grants site access.
// Typing a clip's abbreviation, such as ";addr", replaces it with the clip. The abbreviations come from
// Copyhold; a clip's text is fetched only when its abbreviation is typed.
(() => {
  /** @type {string[]} */
  let abbreviations = [];
  let longest = 0;

  function load() {
    chrome.runtime.sendMessage({ type: "copyhold-abbreviations" }).then((list) => {
      // Longest first, so ";addr2" wins over ";addr".
      abbreviations = Array.isArray(list) ? [...list].sort((first, second) => second.length - first.length) : [];
      longest = abbreviations[0]?.length ?? 0;
    }, () => {});
  }
  load();
  // Abbreviations added while the page is open are picked up the next time it gets focus.
  addEventListener("focus", load);

  function editableTarget(event) {
    const element = /** @type {HTMLElement} */ (event.composedPath()[0]);
    if (element instanceof HTMLInputElement) {
      return ["text", "search", "email", "url", "tel", ""].includes(element.type) ? element : null;
    }
    if (element instanceof HTMLTextAreaElement) return element;
    return element instanceof HTMLElement && element.isContentEditable ? element : null;
  }

  // The text just before the caret, or null when there's a selection.
  function textBeforeCaret(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.selectionStart !== element.selectionEnd || element.selectionStart === null) return null;
      return element.value.slice(Math.max(0, element.selectionStart - longest - 1), element.selectionStart);
    }
    const selection = element.ownerDocument.getSelection();
    if (!selection?.isCollapsed || selection.anchorNode?.nodeType !== Node.TEXT_NODE) return null;
    const node = /** @type {Text} */ (selection.anchorNode);
    return node.data.slice(Math.max(0, selection.anchorOffset - longest - 1), selection.anchorOffset);
  }

  // Selects the abbreviation just typed and types the clip over it, so the page sees normal input and Undo works.
  function replaceBeforeCaret(element, length, text) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const end = element.selectionStart ?? 0;
      element.setSelectionRange(end - length, end);
      if (!element.ownerDocument.execCommand("insertText", false, text)) {
        element.setRangeText(text, end - length, end, "end");
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
      return;
    }
    const selection = element.ownerDocument.getSelection();
    const node = selection.anchorNode;
    const end = selection.anchorOffset;
    const range = element.ownerDocument.createRange();
    range.setStart(node, end - length);
    range.setEnd(node, end);
    selection.removeAllRanges();
    selection.addRange(range);
    element.ownerDocument.execCommand("insertText", false, text);
  }

  document.addEventListener("input", (event) => {
    // Only real typing expands; a page can't trigger expansion by faking input.
    if (!event.isTrusted || !abbreviations.length || !(event instanceof InputEvent) || !event.inputType?.startsWith("insert")) return;
    const element = editableTarget(event);
    if (!element) return;
    const before = textBeforeCaret(element);
    if (!before) return;
    // An abbreviation counts only at the start of a word, so ";addr" inside "x;addr" doesn't expand.
    const abbreviation = abbreviations.find((candidate) => before.endsWith(candidate) &&
      (before.length === candidate.length || /[\s([{"'<>]/.test(before[before.length - candidate.length - 1])));
    if (!abbreviation) return;
    chrome.runtime.sendMessage({ type: "copyhold-expand", abbreviation }).then((response) => {
      if (typeof response?.text !== "string") return;
      // Typing may have continued while Copyhold looked the clip up; expand only if the abbreviation is still last.
      if (!textBeforeCaret(element)?.endsWith(abbreviation)) return;
      replaceBeforeCaret(element, abbreviation.length, response.text);
    }, () => {});
  }, true);
})();
