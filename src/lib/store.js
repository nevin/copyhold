import { isExpired } from "./entries.js";
import { seal, sealedFields } from "./lock.js";
import { t } from "./i18n.js";

let database;

// Sorts like the clip list: pinned first, then most recently used. ISO dates sort as text.
export function orderKey(entry) {
  return `${entry.pinned ? 1 : 0}:${entry.lastUsedAt ?? entry.createdAt}`;
}

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    // The database keeps its pre-rename name; renaming it would orphan existing clips.
    const request = indexedDB.open("clipfile", 5);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) request.result.createObjectStore("entries", { keyPath: "id" });
      if (oldVersion < 2) request.result.createObjectStore("clipboard");
      const entries = request.transaction.objectStore("entries");
      if (oldVersion < 3) entries.createIndex("expiresAt", "expiresAt");
      // The store holds settings and capture state, not clipboard contents.
      if (oldVersion < 4) request.transaction.objectStore("clipboard").name = "meta";
      if (oldVersion < 5) {
        // "order" loads the first screenful quickly; "hash" finds an existing copy of the same content.
        entries.createIndex("order", "order");
        entries.createIndex("hash", "hash");
        const cursorRequest = entries.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          cursor.update({ ...cursor.value, order: orderKey(cursor.value) });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      db.onclose = () => { database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function transact(mode, work, stores = ["entries"]) {
  const db = await openDatabase();
  const transaction = db.transaction(stores, mode);
  const complete = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted."));
  });
  let request;
  try {
    request = work(transaction.objectStore(stores[0]), transaction);
  } catch (error) {
    transaction.abort();
    await complete.catch(() => {});
    throw error;
  }
  await complete;
  return request?.result;
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return btoa(String.fromCharCode(...digest));
}

/**
 * Identifies clipboard content without storing another copy of it.
 * @param {{ text?: string, image?: Blob }} content
 */
export async function contentDigest(content) {
  if (content.image) return `img:${await sha256(await content.image.arrayBuffer())}`;
  // Hash UTF-16 code units to distinguish all JavaScript strings.
  const text = content.text ?? "";
  return sha256(Uint16Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)));
}

export function list() {
  return transact("readonly", (store) => store.getAll())
    .then((entries) => entries.filter((entry) => !isExpired(entry)));
}

// The first clips in list order, read from the index without loading the whole history.
export async function listRecent(limit) {
  const entries = [];
  await transact("readonly", (store) => {
    const request = store.index("order").openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || entries.length >= limit) return;
      if (!isExpired(cursor.value)) entries.push(cursor.value);
      cursor.continue();
    };
  });
  return entries;
}

export function countUnpinned() {
  return transact("readonly", (store) => store.index("order").count(IDBKeyRange.upperBound("1", true)));
}

export async function getMeta(keys) {
  const requests = new Map();
  await transact("readonly", (meta) => {
    for (const key of keys) requests.set(key, meta.get(key));
  }, ["meta"]);
  return Object.fromEntries([...requests]
    .filter(([, request]) => request.result !== undefined)
    .map(([key, request]) => [key, request.result]));
}

export function setMeta(values, { keepExisting = false } = {}) {
  return transact("readwrite", (meta) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        meta.delete(key);
        continue;
      }
      if (!keepExisting) {
        meta.put(value, key);
        continue;
      }
      const existing = meta.get(key);
      existing.onsuccess = () => {
        if (existing.result === undefined) meta.put(value, key);
      };
    }
  }, ["meta"]);
}

export async function getLock() {
  return (await getMeta(["lock"])).lock;
}

// The next automatic capture records the clipboard without saving it.
export function skipCurrentClipboard() {
  return setMeta({ skipClipboard: true });
}

export async function removeExpired() {
  let removed = false;
  await transact("readwrite", (store) => {
    const request = store.index("expiresAt").openCursor(IDBKeyRange.upperBound(new Date().toISOString()));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      removed = true;
      cursor.continue();
    };
  });
  return removed;
}

// Deletes the least recently used unpinned clips beyond the limit, and returns how many it removed.
// Unpinned clips sort first in the order index, oldest first, so this reads only the clips it deletes.
export async function trimHistory(limit) {
  if (!limit) return 0;
  let removed = 0;
  await transact("readwrite", (store) => {
    const unpinned = IDBKeyRange.upperBound("1", true);
    const count = store.index("order").count(unpinned);
    count.onsuccess = () => {
      let excess = count.result - limit;
      if (excess <= 0) return;
      const request = store.index("order").openCursor(unpinned);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || excess <= 0) return;
        cursor.delete();
        removed++;
        excess--;
        cursor.continue();
      };
    };
  });
  return removed;
}

// Adds the derived fields every stored clip has, and encrypts its contents when the lock is on.
async function prepare(entry, lock) {
  const record = { ...entry, order: orderKey(entry) };
  if (lock) {
    delete record.hash;
    return seal(record, lock);
  }
  record.hash ??= await contentDigest(record);
  return record;
}

export async function add(entries) {
  const lock = await getLock();
  const records = [];
  for (const entry of entries) records.push(await prepare(entry, lock));
  return transact("readwrite", (store) => {
    for (const record of records) store.add(record);
  });
}

// Puts back records exactly as remove returned them, for undo.
export function restore(records) {
  return transact("readwrite", (store) => {
    for (const record of records) store.put(record);
  });
}

// Returns an unexpired clip with the same content, if there is one. Locked clips have no hash.
export async function findByHash(hash) {
  const matches = await transact("readonly", (store) => store.index("hash").getAll(hash));
  return matches.find((entry) => !isExpired(entry));
}

export async function update(id, changes) {
  const contentChanged = sealedFields.some((field) => field in changes);
  let sealedChanges;
  let hash;
  if (contentChanged) {
    const lock = await getLock();
    if (lock) sealedChanges = await seal({ ...changes }, lock);
    else if ("text" in changes) hash = await contentDigest({ text: changes.text });
  }
  const entry = await transact("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return;
      // The revision tells views that this clip changed without comparing its contents.
      const next = { ...request.result, ...(sealedChanges ?? changes), revision: (request.result.revision ?? 0) + 1 };
      if (sealedChanges) next.sealed = { ...request.result.sealed, ...sealedChanges.sealed };
      if (hash) next.hash = hash;
      if (next.pinned && next.defaultExpiry) {
        next.expiresAt = null;
        next.defaultExpiry = false;
      }
      next.order = orderKey(next);
      store.put(next);
    };
    return request;
  });
  if (!entry) throw new Error(t("errorClipRemoved"));
}

export function remove(id) {
  return removeMany([id]);
}

export async function removeMany(ids) {
  const removed = [];
  await transact("readwrite", (store) => {
    for (const id of new Set(ids)) {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) return;
        removed.push(request.result);
        store.delete(id);
      };
    }
  });
  return removed;
}

// Clips saved before version 1.2 have no hash; this adds one so duplicates can be found.
export async function backfillHashes() {
  const missing = (await transact("readonly", (store) => store.getAll()))
    .filter((entry) => !entry.hash && !entry.sealed);
  if (!missing.length) return 0;
  const hashes = new Map();
  for (const entry of missing) hashes.set(entry.id, await contentDigest(entry));
  await transact("readwrite", (store) => {
    for (const [id, hash] of hashes) {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result && !request.result.hash && !request.result.sealed) store.put({ ...request.result, hash });
      };
    }
  });
  return hashes.size;
}

/**
 * Rewrites every clip, for turning the lock on or off. The transform runs before the write
 * transaction, because encryption is asynchronous and a transaction can't wait for it.
 * @param {(entry: any) => Promise<any>} transform
 * @param {Record<string, unknown>} meta Meta values to write in the same transaction.
 */
export async function rewriteAll(transform, meta) {
  const records = [];
  for (const entry of await transact("readonly", (store) => store.getAll())) records.push(await transform(entry));
  await transact("readwrite", (store, transaction) => {
    for (const record of records) store.put({ ...record, order: orderKey(record) });
    const metaStore = transaction.objectStore("meta");
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined) metaStore.delete(key);
      else metaStore.put(value, key);
    }
  }, ["entries", "meta"]);
}
