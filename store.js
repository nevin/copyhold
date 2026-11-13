import { isExpired } from "./entries.js";

let database;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("clipfile", 3);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) request.result.createObjectStore("entries", { keyPath: "id" });
      if (oldVersion < 2) request.result.createObjectStore("clipboard");
      if (oldVersion < 3) {
        request.transaction.objectStore("entries").createIndex("expiresAt", "expiresAt");
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
    request = work(transaction.objectStore("entries"), transaction);
  } catch (error) {
    transaction.abort();
    await complete.catch(() => {});
    throw error;
  }
  await complete;
  return request?.result;
}

export function list() {
  return transact("readonly", (store) => store.getAll())
    .then((entries) => entries.filter((entry) => !isExpired(entry)));
}

export async function getRetentionDays() {
  const days = await transact("readonly", (_, transaction) =>
    transaction.objectStore("clipboard").get("retentionDays"), ["entries", "clipboard"]);
  return days ?? 0;
}

export function setRetentionDays(days) {
  return transact("readwrite", (_, transaction) =>
    transaction.objectStore("clipboard").put(days, "retentionDays"), ["entries", "clipboard"]);
}

export async function applyDefaultRetention(entry) {
  const days = await getRetentionDays();
  if (days && !entry.pinned && !entry.expiresAt) {
    entry.expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    entry.defaultExpiry = true;
  }
  return entry;
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

export function add(entries) {
  return transact("readwrite", (store) => {
    for (const entry of entries) store.add(entry);
  });
}

export async function observeClipboard(text, makeEntry, { manual = false } = {}) {
  // Hash UTF-16 code units to distinguish all JavaScript strings without storing another copy.
  const units = Uint16Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", units));
  const fingerprint = btoa(String.fromCharCode(...digest));
  let added = false;
  await transact("readwrite", (entries, transaction) => {
    const clipboard = transaction.objectStore("clipboard");
    const previous = clipboard.get("fingerprint");
    previous.onsuccess = () => {
      const changed = previous.result !== fingerprint;
      if (changed) clipboard.put(fingerprint, "fingerprint");
      if (!makeEntry) return;
      if (manual) {
        // Check and insert in the same transaction so concurrent saves see each other.
        const cursorRequest = entries.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            entries.add(makeEntry());
            added = true;
          } else if (cursor.value.text !== text || isExpired(cursor.value)) {
            cursor.continue();
          }
        };
      } else if (changed) {
        entries.add(makeEntry());
        added = true;
      }
    };
  }, ["entries", "clipboard"]);
  return added;
}

export function update(id, changes) {
  return transact("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return;
      const entry = { ...request.result, ...changes };
      if (entry.pinned && entry.defaultExpiry) {
        entry.expiresAt = null;
        entry.defaultExpiry = false;
      }
      store.put(entry);
    };
    return request;
  }).then((entry) => {
    if (!entry) throw new Error("This entry was removed in another view.");
  });
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
