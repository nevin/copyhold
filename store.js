import { isExpired } from "./entries.js";

let database;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("clipfile", 4);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) request.result.createObjectStore("entries", { keyPath: "id" });
      if (oldVersion < 2) request.result.createObjectStore("clipboard");
      if (oldVersion < 3) {
        request.transaction.objectStore("entries").createIndex("expiresAt", "expiresAt");
      }
      // The store holds settings and capture state, not clipboard contents.
      if (oldVersion < 4) request.transaction.objectStore("clipboard").name = "meta";
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

export function list() {
  return transact("readonly", (store) => store.getAll())
    .then((entries) => entries.filter((entry) => !isExpired(entry)));
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

export function add(entries) {
  return transact("readwrite", (store) => {
    for (const entry of entries) store.add(entry);
  });
}

// makeEntry receives the default retention in days and returns the entry to save.
export async function observeClipboard(text, makeEntry, { manual = false, automatic = false } = {}) {
  // Hash UTF-16 code units to distinguish all JavaScript strings without storing another copy.
  const units = Uint16Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", units));
  const fingerprint = btoa(String.fromCharCode(...digest));
  let added = false;
  await transact("readwrite", (entries, transaction) => {
    const meta = transaction.objectStore("meta");
    const previous = meta.get("fingerprint");
    const skip = meta.get("skipClipboard");
    const retentionDays = meta.get("retentionDays");
    // Requests in one transaction succeed in order, so all three results are ready here.
    retentionDays.onsuccess = () => {
      const changed = previous.result !== fingerprint;
      if (changed) meta.put(fingerprint, "fingerprint");
      if (automatic && skip.result) {
        meta.delete("skipClipboard");
        return;
      }
      if (!makeEntry) return;
      const save = () => {
        entries.add(makeEntry(retentionDays.result ?? 0));
        added = true;
      };
      if (manual) {
        // Check and insert in the same transaction so concurrent saves see each other.
        const cursorRequest = entries.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) save();
          else if (cursor.value.text !== text || isExpired(cursor.value)) cursor.continue();
        };
      } else if (changed) {
        save();
      }
    };
  }, ["entries", "meta"]);
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
