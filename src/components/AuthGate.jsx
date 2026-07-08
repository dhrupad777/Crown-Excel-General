import React, { useState } from 'react';
import { Crown, ShieldAlert, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const GoogleGlyph = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

const Shell = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-[#f7f9fb] px-4 font-body">
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#2563eb] flex items-center justify-center shadow-lg shadow-blue-500/30 text-white">
          <Crown className="w-7 h-7" />
        </div>
        <div>
          <h1 className="font-heading font-black text-xl text-slate-900 leading-none">Crown Excel</h1>
          <span className="text-[10px] font-extrabold text-[#2563eb] tracking-widest uppercase">General Electronics</span>
        </div>
      </div>
      {children}
      <p className="text-center text-[11px] font-semibold text-slate-400 mt-6">
        Serial Number Capture &amp; Warranty Registration Platform
      </p>
    </div>
  </div>
);

// Gates the entire app behind Google staff authentication:
//   loading      → splash
//   signedOut    → sign-in card
//   unauthorized → signed in with a non-staff account; ask an admin, offer sign-out
//   ready        → render the app
export const AuthGate = ({ children }) => {
  const { status, user, signIn, signOut } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'ready') return children;

  if (status === 'loading') {
    return (
      <Shell>
        <div className="glass-card rounded-2xl bg-white border border-slate-200 shadow-md p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-[#2563eb] animate-spin" />
          <p className="text-sm font-bold text-slate-600">Verifying staff session…</p>
        </div>
      </Shell>
    );
  }

  if (status === 'unauthorized') {
    return (
      <Shell>
        <div className="glass-card rounded-2xl bg-white border border-slate-200 shadow-md p-8 space-y-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <h2 className="font-heading font-black text-lg text-slate-900">Access Restricted</h2>
            <p className="text-sm font-semibold text-slate-600 mt-2">
              <span className="font-black text-slate-900 break-all">{user?.email}</span> is not on the
              authorized staff list.
            </p>
            <p className="text-xs font-semibold text-slate-500 mt-2">
              Ask your administrator to add this email in the Admin → Staff panel, then sign in again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="btn btn-outline w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Sign out &amp; switch account
          </button>
        </div>
      </Shell>
    );
  }

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    const res = await signIn();
    if (!res.ok && res.error) setError(res.error);
    setBusy(false);
  };

  return (
    <Shell>
      <div className="glass-card rounded-2xl bg-white border border-slate-200 shadow-md p-8 space-y-5">
        <div className="text-center">
          <h2 className="font-heading font-black text-lg text-slate-900">Staff Sign In</h2>
          <p className="text-xs font-semibold text-slate-500 mt-1.5">
            Access is limited to authorized Crown Excel staff Google accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          className="w-full bg-white border-2 border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 font-heading font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-sm disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGlyph />}
          <span>{busy ? 'Opening Google…' : 'Sign in with Google'}</span>
        </button>
        {error && (
          <p className="text-xs font-bold text-red-500 text-center" role="alert">{error}</p>
        )}
      </div>
    </Shell>
  );
};
