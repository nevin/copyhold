// Passphrase-protected backups: the whole version 1 backup, encrypted with AES-GCM under a key
// derived from the passphrase with PBKDF2. Unprotected backups stay plain version 1 JSON.
import { t } from "./i18n.js";
import { fromBase64, passphraseKey, toBase64 } from "./lock.js";

const iterations = 600_000;

/**
 * @param {string} json A version 1 backup.
 * @param {string} passphrase
 */
export async function encryptBackup(json, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json));
  return JSON.stringify({
    format: "copyhold",
    version: 2,
    encryption: { cipher: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data) },
  });
}

/** Returns the parsed backup if it is protected with a passphrase, or null. */
export function encryptedBackup(text) {
  try {
    const backup = JSON.parse(text);
    return backup?.format === "copyhold" && backup.version === 2 && backup.encryption ? backup : null;
  } catch {
    return null;
  }
}

/**
 * Returns the version 1 backup inside, or throws if the passphrase is wrong.
 * @param {any} backup As returned by encryptedBackup.
 * @param {string} passphrase
 */
export async function decryptBackup(backup, passphrase) {
  const { iterations: rounds, salt, iv, data } = backup.encryption;
  if (!Number.isInteger(rounds) || rounds < 100_000 || rounds > 10_000_000) throw new Error(t("errorNotBackup"));
  const key = await passphraseKey(passphrase, fromBase64(salt), rounds);
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(data)));
  } catch {
    throw new Error(t("errorBackupPassphrase"));
  }
}
