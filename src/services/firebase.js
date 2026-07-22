import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAnalytics } from 'firebase/analytics';
import { APP_CHECK_SITE_KEY } from '../config/appConfig';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  serverTimestamp
} from 'firebase/firestore';

// Re-exported so the rest of the app never imports firebase/firestore directly.
export { serverTimestamp };

// Crown Excel Electronics - Live Production Firebase Configuration
const defaultFirebaseConfig = {
  apiKey: "AIzaSyAWUlgbCxZZq6jeFKQ1iyBVYre9qfaX578",
  authDomain: "crown-excel-general.firebaseapp.com",
  projectId: "crown-excel-general",
  storageBucket: "crown-excel-general.firebasestorage.app",
  messagingSenderId: "15611302528",
  appId: "1:15611302528:web:22e16676f81537445f4c65",
  measurementId: "G-2B6V8M3KH4"
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.db = null;
    this.analytics = null;
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.config = this.loadConfig();
    this.listeners = {};
    this.init();

    window.addEventListener('online', () => {
      this.isOnline = true;
      window.dispatchEvent(new CustomEvent('network-status-change', { detail: { online: true } }));
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      window.dispatchEvent(new CustomEvent('network-status-change', { detail: { online: false } }));
    });
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem('crown_firebase_config');
      return saved ? JSON.parse(saved) : defaultFirebaseConfig;
    } catch (e) {
      return defaultFirebaseConfig;
    }
  }

  saveConfig(newConfig) {
    try {
      localStorage.setItem('crown_firebase_config', JSON.stringify(newConfig));
      this.config = newConfig;
      this.init();
      return true;
    } catch (e) {
      console.error("Failed to save Firebase config:", e);
      return false;
    }
  }

  init() {
    try {
      if (!this.config || !this.config.projectId) {
        console.warn("No valid Firebase configuration found. Running in Local Offline Mode.");
        return;
      }

      this.app = initializeApp(this.config);

      // App Check (invisible reCAPTCHA v3) — attests every request comes from the genuine app,
      // blocking bots/scripts from abusing Firestore or the login. No user interaction (v3 is
      // invisible), so it adds zero friction. Inert until a site key is configured, so it never
      // breaks dev or an un-provisioned project. See docs/SECURITY.md for the rollout order.
      try {
        if (APP_CHECK_SITE_KEY) {
          if (import.meta.env?.DEV) {
            // Allows localhost to obtain App Check tokens during development (register the
            // printed debug token in the console → App Check → Debug tokens).
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          initializeAppCheck(this.app, {
            provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
            isTokenAutoRefreshEnabled: true
          });
          console.log('🛡️ Firebase App Check active (invisible reCAPTCHA v3).');
        }
      } catch (acErr) {
        console.warn('App Check initialization skipped:', acErr.message);
      }

      try {
        this.analytics = getAnalytics(this.app);
      } catch (err) {
        console.log("Analytics initialization skipped (offline/adblock):", err.message);
      }
      
      // Initialize Firestore with modern persistent offline IndexedDB cache
      try {
        this.db = initializeFirestore(this.app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
        console.log("🔥 Firebase Firestore connected with Multi-Tab Offline Persistence!");
      } catch (cacheErr) {
        this.db = getFirestore(this.app);
        console.log("🔥 Firebase Firestore connected in standard mode:", cacheErr.message);
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.warn("Firebase initialization warning:", error.message);
      this.isInitialized = false;
    }
  }

  // --- CLOUD CRUD & SYNCHRONIZATION ENGINE ---

  // Surfaces a cloud-write failure so it can never be silently lost. Transient errors are
  // auto-retried by Firestore's offline queue, so we DON'T alarm on those (that would be daily
  // friction) — only permanent failures (permission-denied, invalid data, quota) raise the flag.
  _reportSyncError(collectionName, id, err) {
    const code = String(err?.code || '');
    console.warn(`Failed to sync [${collectionName}/${id}]:`, err?.message || err);
    const transient = ['unavailable', 'deadline-exceeded', 'cancelled', 'aborted', 'network'].some((c) => code.includes(c));
    if (!transient) {
      window.dispatchEvent(new CustomEvent('crown-sync-error', {
        detail: { collection: collectionName, id, code, message: err?.message || String(err) }
      }));
    }
  }

  async saveToCloud(collectionName, id, data) {
    if (!this.isInitialized || !this.db) return false;
    try {
      const docRef = doc(this.db, collectionName, id);
      await setDoc(docRef, data, { merge: true });
      return true;
    } catch (err) {
      this._reportSyncError(collectionName, id, err);
      return false;
    }
  }

  async deleteFromCloud(collectionName, id) {
    if (!this.isInitialized || !this.db) return false;
    try {
      const docRef = doc(this.db, collectionName, id);
      await deleteDoc(docRef);
      return true;
    } catch (err) {
      this._reportSyncError(collectionName, id, err);
      return false;
    }
  }

  // Subscribe to real-time updates from a Firestore collection. When `teamId` is provided the
  // stream is scoped to that team (where('teamId','==',teamId)) — this is what enforces per-team
  // isolation at the sync layer for non-admins; admins pass no teamId and stream every team.
  subscribeToCollection(collectionName, onUpdateCallback, teamId = null) {
    if (!this.isInitialized || !this.db) return () => {};
    try {
      const colRef = collection(this.db, collectionName);
      const source = teamId ? query(colRef, where('teamId', '==', teamId)) : colRef;
      const unsubscribe = onSnapshot(source, (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ ...docSnap.data(), id: docSnap.id });
        });
        onUpdateCallback(items);
      }, (error) => {
        console.warn(`Real-time listener error on [${collectionName}]:`, error.message);
      });
      this.listeners[collectionName] = unsubscribe;
      return unsubscribe;
    } catch (err) {
      console.warn(`Failed to subscribe to [${collectionName}]:`, err.message);
      return () => {};
    }
  }

  async fetchCollectionOnce(collectionName) {
    if (!this.isInitialized || !this.db) return null;
    try {
      const colRef = collection(this.db, collectionName);
      const snapshot = await getDocs(colRef);
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data(), id: docSnap.id });
      });
      return items;
    } catch (err) {
      console.warn(`Failed to fetch collection [${collectionName}]:`, err.message);
      return null;
    }
  }

  async getDocOnce(collectionName, id) {
    if (!this.isInitialized || !this.db) {
      return { exists: false, data: null, error: 'not-initialized' };
    }
    try {
      const snap = await getDoc(doc(this.db, collectionName, id));
      return {
        exists: snap.exists(),
        data: snap.exists() ? { ...snap.data(), id: snap.id } : null
      };
    } catch (err) {
      return { exists: false, data: null, error: err.code || err.message };
    }
  }

  // Atomically creates a document only if it does not exist yet — the client half of the
  // duplicate-serial guarantee (security rules are the server half). Transactions always read
  // from the server, never the cache, so this also cleanly refuses to run offline instead of
  // queueing a write that could lose a conflict hours later.
  async createIfAbsent(collectionName, id, data) {
    if (!this.isInitialized || !this.db) return { ok: false, error: 'not-initialized' };
    try {
      return await runTransaction(this.db, async (tx) => {
        const ref = doc(this.db, collectionName, id);
        const snap = await tx.get(ref);
        if (snap.exists()) {
          return { ok: false, exists: true, existing: { ...snap.data(), id: snap.id } };
        }
        tx.set(ref, data);
        return { ok: true };
      });
    } catch (err) {
      return { ok: false, error: err.code || err.message };
    }
  }

  // Atomically hands out the next number in a shared sequence (counters/{counterId}.next).
  // Invoice numbers MUST come from here: a per-browser counter lets two terminals mint the same
  // number, and because saveToCloud is a merge-write the second bill would land on top of the
  // first (or be denied as a non-admin update) and disappear. The transaction serialises that.
  // `floor` is the highest number the caller already knows to be in use, so the very first
  // allocation (empty counter doc) can't hand back a number that an existing bill already owns,
  // and a stale counter can only ever heal upward. Returns null when offline — transactions read
  // from the server and never queue.
  async allocateSequentialNumber(counterId, floor) {
    if (!this.isInitialized || !this.db) return null;
    try {
      return await runTransaction(this.db, async (tx) => {
        const ref = doc(this.db, 'counters', counterId);
        const snap = await tx.get(ref);
        const stored = snap.exists() && Number.isFinite(snap.data().next) ? snap.data().next : 0;
        const next = Math.max(stored, floor + 1);
        tx.set(ref, { next: next + 1 }, { merge: true });
        return next;
      });
    } catch (err) {
      console.warn(`Failed to allocate number [${counterId}]:`, err?.message || err);
      return null;
    }
  }

  // Like saveToCloud but AWAITS and THROWS on failure. Use for writes where the cloud is the
  // source of truth (serial edits, staff, locations) and the caller must surface the error —
  // saveToCloud's silent-swallow behavior is only appropriate for background mirroring.
  async updateDocStrict(collectionName, id, data) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Cloud database is not connected.');
    }
    await setDoc(doc(this.db, collectionName, id), data, { merge: true });
  }

  async fetchCollectionOrdered(collectionName, { orderByField = 'createdAt', direction = 'desc', max = 200 } = {}) {
    if (!this.isInitialized || !this.db) return [];
    try {
      const q = query(collection(this.db, collectionName), orderBy(orderByField, direction), limit(max));
      const snapshot = await getDocs(q);
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data(), id: docSnap.id });
      });
      return items;
    } catch (err) {
      console.warn(`Failed to fetch ordered collection [${collectionName}]:`, err.message);
      return [];
    }
  }

  async getCollectionCount(collectionName) {
    if (!this.isInitialized || !this.db) return null;
    try {
      const snap = await getCountFromServer(collection(this.db, collectionName));
      return snap.data().count;
    } catch (err) {
      console.warn(`Failed to count collection [${collectionName}]:`, err.message);
      return null;
    }
  }

  unsubscribeAll() {
    Object.values(this.listeners).forEach((unsub) => {
      try { unsub(); } catch { /* already torn down */ }
    });
    this.listeners = {};
  }
}

export const firebaseService = new FirebaseService();
