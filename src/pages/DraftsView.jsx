import React, { useState, useEffect } from 'react';
import { FileEdit, Clock, AlertTriangle, PlusCircle, CheckCircle2, XCircle, Loader2, MapPin } from 'lucide-react';
import { storageService } from '../services/storage';
import { customerPrimaryName } from '../utils/customer';
import { useAuth } from '../context/AuthContext';

// Open drafts for the region (admins: all regions). A draft stays live for 2 days while stores add
// serials; then it freezes and only an admin can cancel or finalize it. `onContinueDraft` hands the
// draft id back to App, which opens the Billing Desk in continue mode.
const timeLeft = (expiresAt) => {
  if (typeof expiresAt !== 'number') return { expired: false, label: 'open' };
  const ms = expiresAt - Date.now();
  if (ms <= 0) return { expired: true, label: 'EXPIRED' };
  const h = Math.floor(ms / (60 * 60 * 1000));
  if (h >= 24) return { expired: false, label: `${Math.floor(h / 24)}d ${h % 24}h left` };
  if (h >= 1) return { expired: false, label: `${h}h left` };
  return { expired: false, label: `${Math.max(1, Math.floor(ms / (60 * 1000)))}m left` };
};

const storeChips = (inv) => {
  const names = new Set((inv.items || []).map((i) => i.locationName).filter(Boolean));
  return [...names];
};

export const DraftsView = ({ onContinueDraft }) => {
  const { isAdmin } = useAuth();
  const [drafts, setDrafts] = useState(() => storageService.getDrafts());
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0); // re-render the countdown each minute

  useEffect(() => {
    const load = () => setDrafts(storageService.getDrafts());
    load();
    window.addEventListener('crown-data-change', load);
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => { window.removeEventListener('crown-data-change', load); clearInterval(t); };
  }, []);
  void tick;

  const sorted = [...drafts].sort((a, b) => {
    const ax = storageService.isDraftExpired(a) ? 0 : 1;
    const bx = storageService.isDraftExpired(b) ? 0 : 1;
    if (ax !== bx) return ax - bx; // expired first
    return (a.draftExpiresAt || 0) - (b.draftExpiresAt || 0);
  });

  const expiredCount = drafts.filter((d) => storageService.isDraftExpired(d)).length;

  const finalize = async (inv) => {
    setBusy(inv.id + 'final');
    try {
      await storageService.finalizeDraft(inv.id);
      setDrafts(storageService.getDrafts());
    } catch (e) {
      alert(e.message);
    }
    setBusy('');
  };

  const cancel = async (inv) => {
    const reason = window.prompt(`Cancel draft ${inv.invoiceNo || inv.id}? Optionally add a reason (kept on record):`, '');
    if (reason === null) return; // dismissed
    setBusy(inv.id + 'cancel');
    try {
      await storageService.cancelDraft(inv.id, reason);
      setDrafts(storageService.getDrafts());
    } catch (e) {
      alert(e.message);
    }
    setBusy('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-amber-500">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shadow-sm">
            <FileEdit className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">Draft Invoices</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Open bills that stores add serials to for up to 2 days, then finalize. {drafts.length} open{expiredCount ? ` · ${expiredCount} expired` : ''}.
            </p>
          </div>
        </div>
      </div>

      {expiredCount > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-bold text-red-700">
            {expiredCount} draft{expiredCount === 1 ? '' : 's'} passed the 2-day window and {expiredCount === 1 ? 'is' : 'are'} awaiting an admin decision.
            {isAdmin ? ' Cancel or finalize each below.' : ' Only an administrator can cancel or finalize them now.'}
          </div>
        </div>
      )}

      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {sorted.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <FileEdit className="w-12 h-12 mx-auto text-slate-300" />
            <div className="font-heading font-black text-slate-800 text-lg">No open drafts</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              On the Billing Desk, scan some items and press <b>Save as Draft</b> to keep a bill open for other stores to add to.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sorted.map((inv) => {
              const tl = timeLeft(inv.draftExpiresAt);
              const expired = tl.expired;
              const units = (inv.items || []).reduce((s, i) => s + (i.qty || 0), 0);
              const canStaffAct = !expired || isAdmin;
              return (
                <div key={inv.id} className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${expired ? 'bg-red-50/50' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-black text-sm text-slate-900">{inv.invoiceNo || inv.id}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${expired ? 'text-red-700 bg-red-100 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        <Clock className="w-3 h-3" /> {tl.label}
                      </span>
                      {isAdmin && inv.teamId && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                          <MapPin className="w-3 h-3" /> {inv.teamId}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 mt-1">{customerPrimaryName(inv.customer)} · {units} unit{units === 1 ? '' : 's'}</div>
                    {storeChips(inv).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {storeChips(inv).map((s) => (
                          <span key={s} className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {!expired && (
                      <button
                        onClick={() => onContinueDraft?.(inv.id)}
                        className="btn btn-outline text-xs py-2 px-3 font-bold flex items-center gap-1.5"
                        title="Add your store's serials to this draft"
                      >
                        <PlusCircle className="w-4 h-4 text-[#2563eb]" /> Add items
                      </button>
                    )}
                    {canStaffAct && (
                      <button
                        onClick={() => finalize(inv)}
                        disabled={busy === inv.id + 'final'}
                        className="btn btn-primary text-xs py-2 px-3 font-bold flex items-center gap-1.5 disabled:opacity-60"
                        title="Save as a final invoice and register its serials"
                      >
                        {busy === inv.id + 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save as Final
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => cancel(inv)}
                        disabled={busy === inv.id + 'cancel'}
                        className="btn btn-outline text-xs py-2 px-3 font-bold text-red-600 border-red-300 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-60"
                        title="Void this draft (kept on record)"
                      >
                        {busy === inv.id + 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancel
                      </button>
                    )}
                    {expired && !isAdmin && (
                      <span className="text-[11px] font-bold text-red-600">Awaiting admin</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
