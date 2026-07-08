import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth';
import { storageService } from '../services/storage';

const AuthContext = createContext({
  status: 'loading',
  user: null,
  staff: null,
  isAdmin: false,
  signIn: async () => ({ ok: false }),
  signOut: async () => {}
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, staff: null });

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = authService.onChange(async (user) => {
      if (!user) {
        storageService.stopCloudSync();
        if (!cancelled) setState({ status: 'signedOut', user: null, staff: null });
        return;
      }

      // Firebase re-fires onAuthStateChanged for the same signed-in user (token refresh, tab
      // refocus, SDK proactive refresh). Once we're already resolved for this exact account,
      // ignore the re-fire — flipping back to 'loading' would unmount the whole app to the
      // splash and reset the active tab. The staff onSnapshot effect below keeps role/active
      // status live, so nothing is missed.
      let alreadyResolved = false;
      setState((prev) => {
        if (prev.status === 'ready' && prev.user?.uid === user.uid) {
          alreadyResolved = true;
          return prev;
        }
        return { status: 'loading', user, staff: null };
      });
      if (alreadyResolved) return;

      const result = await authService.resolveStaffProfile(user);
      if (cancelled) return;

      if (result.status === 'ready') {
        storageService.setCurrentUser({
          email: user.email,
          displayName: user.displayName || result.staff.displayName || user.email,
          role: result.staff.role,
          locationId: result.staff.locationId
        });
        storageService.initCloudSync();
        setState({ status: 'ready', user, staff: result.staff });
      } else {
        setState({ status: 'unauthorized', user, staff: null });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Live role refresh: if an admin edits this operator's staff record (role change,
  // deactivation) the staff mirror updates via onSnapshot and this keeps the session honest.
  useEffect(() => {
    const handleStaffChange = (e) => {
      if (e.detail?.type !== 'staff') return;
      setState(prev => {
        if (prev.status !== 'ready' || !prev.user?.email) return prev;
        const me = storageService.getStaffByEmail(prev.user.email);
        if (!me) return prev;
        if (me.active === false) {
          return { status: 'unauthorized', user: prev.user, staff: null };
        }
        storageService.setCurrentUser({
          email: prev.user.email,
          displayName: prev.user.displayName || me.displayName,
          role: me.role,
          locationId: me.locationId
        });
        return { ...prev, staff: me };
      });
    };
    window.addEventListener('crown-data-change', handleStaffChange);
    return () => window.removeEventListener('crown-data-change', handleStaffChange);
  }, []);

  const signIn = useCallback(() => authService.signInWithGoogle(), []);
  const signOut = useCallback(() => authService.signOutUser(), []);

  const value = {
    status: state.status,
    user: state.user,
    staff: state.staff,
    isAdmin: state.staff?.role === 'admin',
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
