import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';

// Default Demo Configuration - Can be updated in App Settings
const defaultFirebaseConfig = {
  apiKey: "AIzaSyDemoKeyForCrownExcelGeneralBillingApp99",
  authDomain: "crown-excel-general.firebaseapp.com",
  projectId: "crown-excel-general-demo",
  storageBucket: "crown-excel-general.appspot.com",
  messagingSenderId: "1029384756",
  appId: "1:1029384756:web:abcdef1234567890"
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.config = this.loadConfig();
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
      // Check if config has valid project ID
      if (!this.config || !this.config.projectId) {
        console.warn("No valid Firebase configuration found. Running in High-Speed Local Offline Mode.");
        return;
      }

      this.app = initializeApp(this.config);
      
      // Initialize Firestore with modern persistent offline IndexedDB cache
      try {
        this.db = initializeFirestore(this.app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
        console.log("Firebase Firestore initialized with Multi-Tab Offline Persistence!");
      } catch (cacheErr) {
        // Fallback to standard getFirestore if persistent cache already initialized or fails in private browsing
        this.db = getFirestore(this.app);
        console.log("Firebase Firestore initialized in standard mode:", cacheErr.message);
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.warn("Firebase initialization warning (switching to Local Engine):", error.message);
      this.isInitialized = false;
    }
  }
}

export const firebaseService = new FirebaseService();
