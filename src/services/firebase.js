import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot
} from 'firebase/firestore';

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

  async saveToCloud(collectionName, id, data) {
    if (!this.isInitialized || !this.db) return false;
    try {
      const docRef = doc(this.db, collectionName, id);
      await setDoc(docRef, data, { merge: true });
      return true;
    } catch (err) {
      console.warn(`Failed to sync [${collectionName}/${id}] to Firebase cloud:`, err.message);
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
      console.warn(`Failed to delete [${collectionName}/${id}] from Firebase cloud:`, err.message);
      return false;
    }
  }

  // Subscribe to real-time updates from a Firestore collection
  subscribeToCollection(collectionName, onUpdateCallback) {
    if (!this.isInitialized || !this.db) return () => {};
    try {
      const colRef = collection(this.db, collectionName);
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
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
}

export const firebaseService = new FirebaseService();
