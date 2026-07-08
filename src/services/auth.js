// Google sign-in for staff, backed by the Firestore `staff` allowlist. Only accounts an admin
// has added (or the bootstrap admins in appConfig) ever reach the app; everyone else lands on
// the access-denied screen. firestore.rules enforce the same allowlist server-side.

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { firebaseService, serverTimestamp } from './firebase';
import { BOOTSTRAP_ADMIN_EMAILS, DEFAULT_LOCATION } from '../config/appConfig';

class AuthService {
  constructor() {
    this.auth = null;
  }

  init() {
    if (this.auth) return this.auth;
    if (!firebaseService.app) return null;
    this.auth = getAuth(firebaseService.app);
    return this.auth;
  }

  // Subscribes to Firebase auth state; returns the unsubscribe function.
  onChange(callback) {
    const auth = this.init();
    if (!auth) {
      callback(null);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  }

  async signInWithGoogle() {
    const auth = this.init();
    if (!auth) {
      return { ok: false, error: 'Firebase is not configured — open Settings and add your project keys.' };
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return { ok: true };
    } catch (err) {
      if (err.code === 'auth/popup-blocked') {
        return { ok: false, error: 'Your browser blocked the sign-in popup. Allow popups for this site and try again.' };
      }
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return { ok: false, error: '' }; // user dismissed the popup — not an error worth showing
      }
      if (err.code === 'auth/operation-not-allowed') {
        return { ok: false, error: 'Google sign-in is not enabled for this Firebase project yet (Console → Authentication → Sign-in method).' };
      }
      return { ok: false, error: err.message || 'Sign-in failed. Please try again.' };
    }
  }

  async signOutUser() {
    const auth = this.init();
    if (auth) await signOut(auth);
  }

  // Decides what a freshly signed-in Google account is allowed to be:
  //  - active staff doc            → ready
  //  - bootstrap admin email       → self-provision (or self-heal) its own admin record,
  //                                  seeding the default location on the very first login
  //  - anything else               → unauthorized (incl. permission-denied reads, which is
  //                                  exactly what non-staff see once rules are published)
  async resolveStaffProfile(user) {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) return { status: 'unauthorized' };

    const res = await firebaseService.getDocOnce('staff', email);
    if (res.exists && res.data?.active !== false) {
      return { status: 'ready', staff: res.data };
    }

    if (BOOTSTRAP_ADMIN_EMAILS.includes(email)) {
      const staff = {
        id: email,
        email,
        displayName: user.displayName || email,
        role: 'admin',
        locationId: DEFAULT_LOCATION.id,
        active: true,
        addedBy: 'bootstrap'
      };
      try {
        await firebaseService.updateDocStrict('staff', email, { ...staff, addedAt: serverTimestamp() });
        const locations = await firebaseService.fetchCollectionOnce('locations');
        if (!locations || locations.length === 0) {
          await firebaseService.updateDocStrict('locations', DEFAULT_LOCATION.id, DEFAULT_LOCATION);
        }
        return { status: 'ready', staff };
      } catch (err) {
        console.warn('Bootstrap admin provisioning failed:', err.message);
        return { status: 'unauthorized' };
      }
    }

    return { status: 'unauthorized' };
  }
}

export const authService = new AuthService();
