import { t } from "./i18n.js";

// Recognizes copied text that is probably a secret, so it can be masked or skipped instead of saved in view.
// Every check runs locally on the text; nothing is looked up or sent anywhere.

/** @type {[string, RegExp][]} */
const tokenPatterns = [
  ["privateKey", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["apiKey", /\b(?:sk|rk|pk)_(?:live|test)_[0-9a-zA-Z]{16,}\b/],
  ["apiKey", /\bsk-(?:proj-|ant-)?[0-9a-zA-Z_-]{20,}\b/],
  ["accessToken", /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{30,}\b|\bgithub_pat_[0-9a-zA-Z_]{40,}\b/],
  ["accessToken", /\bglpat-[0-9a-zA-Z_-]{20,}\b/],
  ["accessToken", /\bxox[abprs]-[0-9a-zA-Z-]{10,}\b/],
  ["accessToken", /\bnpm_[0-9a-zA-Z]{36}\b/],
  ["apiKey", /\bAKIA[0-9A-Z]{16}\b/],
  ["apiKey", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["accessToken", /\beyJ[0-9a-zA-Z_-]{10,}\.eyJ[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,}\b/],
];

function passesLuhn(digits) {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function isCardNumber(text) {
  if (!/^[\d -]{13,23}$/.test(text)) return false;
  const digits = text.replace(/[ -]/g, "");
  return digits.length >= 13 && digits.length <= 19 && !/^(\d)\1+$/.test(digits) && passesLuhn(digits);
}

// A single word mixing lower case, upper case, digits, and symbols reads like a generated password.
function looksLikePassword(text) {
  if (text.length < 10 || text.length > 64 || /\s/.test(text)) return false;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(text)) return false;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(text)) return false;
  return /[a-z]/.test(text) && /[A-Z]/.test(text) && /\d/.test(text) && /[^a-zA-Z\d]/.test(text);
}

/**
 * Returns the kind of secret the text looks like, such as "apiKey", or null.
 * @param {string} text
 * @returns {string | null}
 */
export function detectSensitive(text) {
  // Long text is a document, not a secret on its own; checking it would also be slow.
  if (!text || text.length > 5000) return null;
  const trimmed = text.trim();
  for (const [label, pattern] of tokenPatterns) if (pattern.test(trimmed)) return label;
  if (isCardNumber(trimmed)) return "cardNumber";
  if (looksLikePassword(trimmed)) return "password";
  return null;
}

/** Describes a kind returned by detectSensitive, such as "an API key". */
export function sensitiveLabel(kind) {
  return t(`sensitive_${kind}`);
}
