// Minimal IndexedDB wrapper. Uploaded songs live here so they survive reloads
// (blob: URLs die with the page, which is why uploads used to vanish).

const DB_NAME = 'deckos';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const idb = {
  putTrack: (track) => run('tracks', 'readwrite', (s) => s.put(track)),
  deleteTrack: (id) => run('tracks', 'readwrite', (s) => s.delete(id)),
  allTracks: () => run('tracks', 'readonly', (s) => s.getAll()),
  clearTracks: () => run('tracks', 'readwrite', (s) => s.clear()),
  getKV: (key) => run('kv', 'readonly', (s) => s.get(key)),
  setKV: (key, value) => run('kv', 'readwrite', (s) => s.put(value, key))
};
