// Durable, on-device store for full-data backup snapshots. Uses IndexedDB, not localStorage: a
// single backup can be a few MB (all invoices + serials) and localStorage's ~5MB ceiling is
// already spent on the live mirror. IndexedDB gives us room to keep a rolling history the user can
// download whenever they like. Pure storage — no imports from the app, so there's no import cycle.

const DB_NAME = 'crown_excel_backups';
const STORE = 'snapshots';
const VERSION = 1;

const open = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no IndexedDB, so in-app backups are unavailable.')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Stores the full backup bundle (object) under `id`.
export const idbPutBundle = async (id, bundle) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bundle, id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const idbGetBundle = async (id) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
};

export const idbDeleteBundle = async (id) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};
