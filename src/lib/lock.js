import { t } from "./i18n.js";

// Passphrase lock. Clip contents are encrypted with a key pair: anything can encrypt new clips with the
// public key, even while Copyhold is locked, but only the passphrase can unlock the private key that reads them.
//
// - The private key is encrypted with AES-GCM under a key derived from the passphrase with PBKDF2.
// - Each context encrypting clips makes one ephemeral ECDH key pair and derives an AES-GCM key from it
//   and the lock's public key. Each sealed field stores that ephemeral public key so it can be decrypted.
// - Dates, pin state, and other metadata stay unencrypted so expiry and history limits keep working.

export const sealedFields = [
  "text", "title", "description", "category", "subcategory", "tags", "sourceUrl", "sourceTitle", "image", "thumbnail",
];
const iterations = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ecdh = { name: "ECDH", namedCurve: "P-256" };

/** @param {ArrayBuffer | Uint8Array} bytes */
export function toBase64(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** @param {string} text */
export function fromBase64(text) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

export async function passphraseKey(passphrase, salt, rounds) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapPrivateKey(privateKey, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await passphraseKey(passphrase, salt, iterations), pkcs8);
  return { salt: toBase64(salt), iv: toBase64(iv), iterations, wrapped: toBase64(wrapped) };
}

/**
 * Creates the lock record to store, and the unlocked private key.
 * @param {string} passphrase
 */
export async function createLock(passphrase) {
  const pair = await crypto.subtle.generateKey(ecdh, true, ["deriveKey"]);
  const publicKey = toBase64(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { lock: { version: 1, publicKey, ...await wrapPrivateKey(pair.privateKey, passphrase) }, privateKey: pair.privateKey };
}

/** Returns the lock record with the same key pair under a new passphrase. */
export async function changePassphrase(lock, privateKey, passphrase) {
  return { ...lock, ...await wrapPrivateKey(privateKey, passphrase) };
}

/**
 * Returns the private key, or throws if the passphrase is wrong.
 * @param {any} lock
 * @param {string} passphrase
 */
export async function unlock(lock, passphrase) {
  const key = await passphraseKey(passphrase, fromBase64(lock.salt), lock.iterations);
  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(lock.iv) }, key, fromBase64(lock.wrapped));
  } catch {
    throw new Error(t("errorPassphrase"));
  }
  return importPrivateKey(pkcs8);
}

export function importPrivateKey(pkcs8) {
  return crypto.subtle.importKey("pkcs8", pkcs8, ecdh, true, ["deriveKey"]);
}

export async function exportPrivateKey(privateKey) {
  return toBase64(await crypto.subtle.exportKey("pkcs8", privateKey));
}

// One ephemeral key per lock public key for the life of this context.
const sealers = new Map();

function sealerFor(lock) {
  let sealer = sealers.get(lock.publicKey);
  if (!sealer) {
    sealer = (async () => {
      const recipient = await crypto.subtle.importKey("raw", fromBase64(lock.publicKey), ecdh, false, []);
      const pair = await crypto.subtle.generateKey(ecdh, true, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "ECDH", public: recipient }, pair.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
      );
      return { key, epk: toBase64(await crypto.subtle.exportKey("raw", pair.publicKey)) };
    })();
    sealers.set(lock.publicKey, sealer);
  }
  return sealer;
}

/**
 * Moves the record's content fields into record.sealed, encrypted. Returns the record.
 * @param {any} record
 * @param {any} lock
 */
export async function seal(record, lock) {
  const { key, epk } = await sealerFor(lock);
  record.sealed = { ...record.sealed };
  for (const field of sealedFields) {
    if (!(field in record)) continue;
    const value = record[field];
    delete record[field];
    if (value == null) continue;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const blob = value instanceof Blob;
    const list = Array.isArray(value);
    const plain = blob ? await value.arrayBuffer() : encoder.encode(list ? JSON.stringify(value) : value);
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    record.sealed[field] = { epk, iv: toBase64(iv), data, ...(blob ? { type: value.type } : {}), ...(list ? { json: true } : {}) };
  }
  return record;
}

/**
 * Encrypts any JSON value with the lock's public key, as one sealed box. Used for settings that name
 * categories and tags, such as rules and category colours.
 */
export async function sealValue(value, lock) {
  const { key, epk } = await sealerFor(lock);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return { epk, iv: toBase64(iv), data, json: true };
}

/** Decrypts sealed records with an unlocked private key, caching derived keys by ephemeral key. */
export function createOpener(privateKey) {
  const keys = new Map();
  function keyFor(epk) {
    let key = keys.get(epk);
    if (!key) {
      key = crypto.subtle.importKey("raw", fromBase64(epk), ecdh, false, [])
        .then((sender) => crypto.subtle.deriveKey(
          { name: "ECDH", public: sender }, privateKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
        ));
      keys.set(epk, key);
    }
    return key;
  }
  /** @param {any} record */
  async function open(record) {
    if (!record.sealed) return record;
    const { sealed, ...entry } = record;
    await Promise.all(Object.entries(sealed).map(async ([field, box]) => {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, await keyFor(box.epk), box.data);
      entry[field] = "type" in box ? new Blob([plain], { type: box.type })
        : box.json ? JSON.parse(decoder.decode(plain)) : decoder.decode(plain);
    }));
    entry.text ??= "";
    entry.title ??= "";
    entry.description ??= "";
    entry.category ??= "";
    entry.subcategory ??= "";
    entry.tags ??= [];
    return entry;
  }
  /** Decrypts a box made by sealValue. */
  open.value = async (box) => {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, await keyFor(box.epk), box.data);
    return JSON.parse(decoder.decode(plain));
  };
  return open;
}
