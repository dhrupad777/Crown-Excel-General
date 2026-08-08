import React, { useState, useEffect, useCallback } from 'react';
import { Archive, FileDown, Trash2, Plus, Loader2, CalendarClock } from 'lucide-react';
import { storageService } from '../services/storage';
import { downloadBundle } from '../utils/backup';

// In-app backup history. Snapshots are generated automatically (weekly) and on demand, kept on this
// device, and downloaded as JSON/XML whenever the admin likes — no forced downloads.
const fmtBytes = (n) => {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export const BackupsPanel = () => {
  const [index, setIndex] = useState(() => storageService.getBackupIndex());
  const [auto, setAuto] = useState(() => storageService.isAutoBackupEnabled());
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');

  const refresh = useCallback(() => setIndex(storageService.getBackupIndex()), []);

  useEffect(() => {
    window.addEventListener('crown-backup-change', refresh);
    return () => window.removeEventListener('crown-backup-change', refresh);
  }, [refresh]);

  const createNow = async () => {
    setBusy(true);
    try {
      await storageService.createBackupSnapshot();
      refresh();
    } catch (e) {
      alert(`Could not create a backup: ${e.message}`);
    }
    setBusy(false);
  };

  const download = async (snap, fmt) => {
    setDownloading(snap.id + fmt);
    try {
      const bundle = await storageService.getBackupSnapshotBundle(snap.id);
      if (!bundle) { alert('This backup could not be read from the device.'); }
      else downloadBundle(bundle, [fmt], new Date(snap.createdAt).toISOString().slice(0, 10));
    } catch (e) {
      alert(`Download failed: ${e.message}`);
    }
    setDownloading('');
  };

  const remove = async (snap) => {
    if (!window.confirm(`Delete the backup from ${fmtWhen(snap.createdAt)}? This can't be undone.`)) return;
    await storageService.deleteBackupSnapshot(snap.id);
    refresh();
  };

  const toggleAuto = () => {
    const next = !auto;
    storageService.setAutoBackupEnabled(next);
    setAuto(next);
  };

  const countLine = (c) => c
    ? `${c.products ?? 0} products · ${c.customers ?? 0} partners · ${c.invoices ?? 0} invoices · ${c.serials ?? 0} serials`
    : '';

  return (
    <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b-2 border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Archive className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">Backups</h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
              Full snapshots (products, partners, invoices, serials, staff, stores) kept on this device. Download any as JSON or XML.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer whitespace-nowrap" title="Automatically capture a snapshot once a week when an admin opens the app">
            <input type="checkbox" checked={auto} onChange={toggleAuto} className="accent-indigo-600" />
            <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> Auto weekly
          </label>
          <button onClick={createNow} disabled={busy} className="btn btn-primary text-xs py-2.5 px-4 font-bold disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Back up now
          </button>
        </div>
      </div>

      <div className="p-5">
        {index.length === 0 ? (
          <p className="text-xs font-semibold text-slate-400 text-center py-8">
            No backups yet. One is created automatically each week — or press <b>Back up now</b>.
          </p>
        ) : (
          <div className="space-y-2">
            {index.map((snap) => (
              <div key={snap.id} className="border-2 border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-heading font-black text-sm text-slate-900">{fmtWhen(snap.createdAt)}</div>
                  <div className="text-[11px] font-semibold text-slate-500 truncate">{countLine(snap.counts)} · {fmtBytes(snap.size)}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => download(snap, 'json')}
                    disabled={downloading === snap.id + 'json'}
                    className="btn btn-outline text-[11px] py-1.5 px-3 font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {downloading === snap.id + 'json' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-indigo-600" />} JSON
                  </button>
                  <button
                    onClick={() => download(snap, 'xml')}
                    disabled={downloading === snap.id + 'xml'}
                    className="btn btn-outline text-[11px] py-1.5 px-3 font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {downloading === snap.id + 'xml' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-indigo-600" />} XML
                  </button>
                  <button
                    onClick={() => remove(snap)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 transition-colors"
                    title="Delete this backup"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
