import React, { useState, useMemo } from 'react';
import { ShieldCheck, MapPin, Store, Loader2, Crown, Lock, Check, X } from 'lucide-react';
import { storageService } from '../services/storage';
import { DATA_CATEGORIES, normalizePermissions } from '../config/appConfig';

// Admin dashboard for per-staff data access: pick a region, then a store, then set what each
// person there can SEE and DOWNLOAD, one row per category. Nothing here affects day-to-day work —
// billing, drafts, scanning, products and invoice printing are never gated (see DATA_CATEGORIES).
//
// `regions` comes from AdminPage's existing regionRows memo so the region → store → staff shape is
// computed once; `staffList` is the full roster.
export const AccessManagementPanel = ({ regions, staffList, onSaved }) => {
  const [region, setRegion] = useState('');
  const [storeId, setStoreId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const activeStaff = useMemo(
    () => staffList.filter((s) => s.active !== false),
    [staffList]
  );

  // Region → its stores → the staff posted to them. A staff member belongs to exactly one store.
  const staffByStore = useMemo(() => {
    const map = new Map();
    for (const s of activeStaff) {
      const key = s.locationId || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [activeStaff]);

  const selectedRegion = regions.find((r) => r.team === region) || null;
  const storesInRegion = selectedRegion?.stores || [];
  const staffInStore = (storeId && staffByStore.get(storeId)) || [];

  // Exposure at a glance, per region: how many of its non-admin staff hold each permission.
  const regionExposure = (r) => {
    const ids = new Set(r.stores.map((s) => s.id));
    const people = activeStaff.filter((s) => ids.has(s.locationId) && s.role !== 'admin');
    // Counted on VIEW: it's the coarser signal, and download can't exist without it.
    const counts = Object.fromEntries(DATA_CATEGORIES.map((c) => [c.key, 0]));
    for (const p of people) {
      const perms = normalizePermissions(p.permissions);
      for (const c of DATA_CATEGORIES) if (perms[c.view]) counts[c.key] += 1;
    }
    return { total: people.length, counts };
  };

  // `next` is normalized on save, which enforces "download implies view" - so switching View off
  // takes its Download with it. The reverse (turning Download on) is applied here, because
  // normalize can only ever remove a grant, never add one.
  const toggle = async (member, category, which) => {
    const email = member.email || member.id;
    const key = which === 'view' ? category.view : category.download;
    const before = normalizePermissions(member.permissions);
    const draft = { ...before, [key]: !before[key] };
    if (which === 'download' && draft[key]) draft[category.view] = true;
    const next = normalizePermissions(draft);
    setBusy(email + key);
    setError('');
    try {
      // A clean explicit record, mirroring the Staff modal's save: saveStaff REPLACES the stored
      // document, so spreading `member` would write the mirror's JSON-serialized `addedAt` back
      // over the real server timestamp.
      await storageService.saveStaff({
        email,
        displayName: member.displayName || email,
        role: member.role || 'standard',
        locationId: member.locationId || '',
        active: member.active !== false,
        addedBy: member.addedBy || '',
        permissions: next
      });
      // Recorded so a grant is never invisible: who changed whose access, and to what.
      storageService.appendAudit(
        'staff.permissions',
        { email, permissions: before },
        { email, permissions: next },
        { entity: 'staff', entityId: email }
      );
      onSaved?.();
    } catch (e) {
      setError(`Could not save ${member.displayName || email}: ${e.message}`);
    }
    setBusy('');
  };

  return (
    <div className="p-5 space-y-5 font-body">

      {/* Step 1 — region, with the exposure summary the admin scans first */}
      <div className="space-y-2">
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">1 · Region</span>
        {regions.length === 0 ? (
          <p className="text-xs font-semibold text-slate-400 py-4">No regions yet — add a store and give it a region.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regions.map((r) => {
              const { total, counts } = regionExposure(r);
              const active = region === r.team;
              return (
                <button
                  key={r.team}
                  type="button"
                  onClick={() => { setRegion(r.team); setStoreId(''); }}
                  className={`text-left border-2 rounded-xl p-3.5 transition-colors ${
                    active ? 'border-[#2563eb] bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-700">
                      <MapPin className="w-3.5 h-3.5" /> {r.team}
                    </span>
                    <span className="text-[10px] font-black text-slate-400">
                      {r.stores.length} store{r.stores.length === 1 ? '' : 's'} · {total} staff
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-1">
                    {DATA_CATEGORIES.map((c) => (
                      <div key={c.key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 w-16 flex-shrink-0">{c.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={counts[c.key] > 0 ? 'h-full bg-[#2563eb]' : 'h-full bg-slate-200'}
                            style={{ width: total ? `${(counts[c.key] / total) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-black text-slate-600 w-8 text-right">
                          {counts[c.key]}/{total}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2 — store */}
      {region && (
        <div className="space-y-2">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">2 · Store in {region}</span>
          <div className="flex flex-wrap gap-2">
            {storesInRegion.length === 0 && (
              <p className="text-xs font-semibold text-slate-400">No stores in this region yet.</p>
            )}
            {storesInRegion.map((s) => {
              const count = (staffByStore.get(s.id) || []).length;
              const active = storeId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStoreId(s.id)}
                  className={`border-2 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-2 transition-colors ${
                    active ? 'border-[#2563eb] bg-blue-50/60 text-[#2563eb]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" /> {s.name}
                  <span className="text-[10px] font-black text-slate-400">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 — staff and their toggles */}
      {storeId && (
        <div className="space-y-2">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">3 · Staff &amp; what they can take out</span>

          {error && (
            <p className="text-xs font-bold text-red-600 bg-red-50 border-2 border-red-200 rounded-xl p-3">{error}</p>
          )}

          {staffInStore.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400 py-4">No active staff posted to this store.</p>
          ) : (
            <div className="border-2 border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
              {staffInStore.map((member) => {
                const email = member.email || member.id;
                const isAdminMember = member.role === 'admin';
                const perms = normalizePermissions(member.permissions);
                return (
                  <div key={email} className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900">{member.displayName || email}</div>
                        <div className="text-[10px] font-mono font-semibold text-slate-400 truncate">{email}</div>
                      </div>
                      {isAdminMember && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                          <Crown className="w-3 h-3" /> Administrator · full access
                        </span>
                      )}
                    </div>

                    {isAdminMember ? (
                      <p className="text-[11px] font-semibold text-slate-500">
                        Admins hold every permission. Change the role in the Staff table above to restrict this person.
                      </p>
                    ) : (
                      // One row per category: See it, and Download it. Turning See off takes
                      // Download with it (normalizePermissions), so the pair can never disagree.
                      <div className="space-y-1.5">
                        <div className="hidden sm:flex items-center gap-2 px-1">
                          <span className="flex-1" />
                          <span className="w-[104px] text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">See</span>
                          <span className="w-[104px] text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Download</span>
                        </div>
                        {DATA_CATEGORIES.map((c) => {
                          // A plain render function, not a nested component: declaring a component
                          // inside the loop would remount it on every render.
                          const renderSwitch = ({ which, on, hint, disabled }) => {
                            const key = which === 'view' ? c.view : c.download;
                            const saving = busy === email + key;
                            return (
                              <button
                                key={which}
                                type="button"
                                onClick={() => toggle(member, c, which)}
                                disabled={saving || disabled}
                                title={disabled ? 'Nothing to download for this one' : hint}
                                className={`w-full sm:w-[104px] flex items-center justify-between gap-2 border-2 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-default ${
                                  on ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                <span className={`sm:hidden text-[10px] font-black ${on ? 'text-emerald-800' : 'text-slate-500'}`}>
                                  {which === 'view' ? 'See' : 'Download'}
                                </span>
                                <span className="hidden sm:block flex-1" />
                                <span className={`flex-shrink-0 w-9 h-5 rounded-full flex items-center px-0.5 ${on ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                                  <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center shadow">
                                    {saving
                                      ? <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-500" />
                                      : on ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <X className="w-2.5 h-2.5 text-slate-400" />}
                                  </span>
                                </span>
                              </button>
                            );
                          };
                          return (
                            <div key={c.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 border-2 border-slate-100 rounded-xl p-2">
                              <span className="flex-1 min-w-0">
                                <span className="block text-[11px] font-black text-slate-700">{c.label}</span>
                                <span className="block text-[10px] font-semibold text-slate-500 truncate">{c.viewHint}</span>
                              </span>
                              {renderSwitch({ which: 'view', on: perms[c.view], hint: c.viewHint })}
                              {renderSwitch({
                                which: 'download',
                                on: c.download ? perms[c.download] : false,
                                hint: c.downloadHint,
                                disabled: !c.download
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
            <Lock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-slate-600">
              <b className="text-slate-800">Backups are administrators only</b> and can't be granted here — one
              backup file contains every region's data. Billing, drafts, serial scanning, record lookup and invoice
              printing are never restricted, whatever is set above.
            </p>
          </div>
        </div>
      )}

      {!region && regions.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-blue-200 bg-blue-50/50 p-3">
          <ShieldCheck className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold text-slate-600">
            Pick a region to begin. New staff start with <b>no</b> download or analytics access — they can bill,
            continue drafts and look records up from day one, and you grant the rest here.
          </p>
        </div>
      )}
    </div>
  );
};
