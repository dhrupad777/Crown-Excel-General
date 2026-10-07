// The live data mirror's home on the device. IndexedDB, not localStorage.
//
// localStorage caps a whole site at roughly 5 MB. The mirror holds every invoice with every line
// item on it, so a shop billing 60-unit orders reaches that ceiling in a few hundred bills — and
// when it did, the write threw, saveInvoice returned null, and the Billing Desk refused the sale
// outright (the bill never even reached Firestore, because the local write came first). IndexedDB
// has no such ceiling: a browser will give it a large share of free disk.
//
// Firestore remains the source of truth. This is only what the device keeps so the app can read
// instantly and keep billing offline.
//
// Pure storage — no imports from the app, so there is no import cycle.

const DB_NAME = 'crown_excel_mirror';
const STORE = 'collections';
const VERSION = 1;

export const mirrorAvailable = () => typeof indexedDB !== 'undefined';

const open = () =>
  new Promise((resolve, reject) => {
    if (!mirrorAvailable()) { reject(new Error('This browser has no IndexedDB.')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // A second tab blocking an upgrade would otherwise hang this promise forever, leaving the app
    // waiting on hydration before it renders.
    req.onblocked = () => reject(new Error('Another tab is upgrading the local database.'));
  });

// Every stored collection, as a Map of key → rows. One transaction, not one per key.
export const mirrorReadAll = async (keys) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = new Map();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    keys.forEach((key) => {
      const req = store.get(key);
      req.onsuccess = () => { if (req.result !== undefined) out.set(key, req.result); };
    });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
};

// Structured-clone storage: the rows go in as objects, so there is no JSON.stringify of several
// megabytes on every save, and no parse on every read.
export const mirrorWrite = async (key, rows) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rows, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const mirrorDelete = async (key) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};
