// Text for people goes through t(), which uses the browser's translations. Offscreen documents and
// tests have no chrome.i18n, so they fall back to the English messages.
import english from "../_locales/en/messages.json" with { type: "json" };

const getMessage = globalThis.chrome?.i18n?.getMessage;
const language = globalThis.chrome?.i18n?.getUILanguage?.() ?? navigator.language;
const plurals = new Intl.PluralRules(language);

/**
 * @param {string} key
 * @param {...(string | number)} substitutions Fill $1, $2, and so on.
 */
export function t(key, ...substitutions) {
  const values = substitutions.map(String);
  const message = getMessage?.(key, values);
  if (message) return message;
  const fallback = english[key]?.message;
  if (fallback === undefined) {
    console.warn(`Missing message: ${key}`);
    return key;
  }
  return fallback.replace(/\$(\d)/g, (_, position) => values[position - 1] ?? "");
}

/**
 * Picks key_one, key_other, and so on for the count, which fills $1 formatted for the language.
 * @param {string} key
 * @param {number} count
 * @param {...(string | number)} substitutions Fill $2 onward.
 */
export function tn(key, count, ...substitutions) {
  const form = `${key}_${plurals.select(count)}`;
  const chosen = getMessage?.(form) || english[form] ? form : `${key}_other`;
  return t(chosen, count.toLocaleString(language), ...substitutions);
}

/** Fills elements marked with data-i18n (text) and data-i18n-<attribute> (attributes). */
export function localize(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(/** @type {HTMLElement} */ (element).dataset.i18n);
  }
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
  if (root === document) document.documentElement.lang = language;
}
