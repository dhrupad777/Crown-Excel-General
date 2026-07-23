import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw, Wrench, Trash2 } from 'lucide-react';
import { storageService } from '../services/storage';

// Reconciles what SHOULD exist against what DOES, and shows it. Every past data-loss incident in
// this app was invisible because nothing compared the two — this panel is that comparison, run on
// demand, with a repair action wherever one is safe.
const SEV = {
  error: { icon: XCircle, cls: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' },
  warn: { icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-300', dot: 'bg-amber-500' },
  ok: { icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' }
};

export const DataHealthPanel = () => {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState('');
  const [repairMsg, setRepairMsg] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [issues, setIssues] = useState(() => storageService.getIssues());

  const run = useCallback(async () => {
    setRunning(true);
    setRepairMsg('');
    try {
      setReport(await storageService.runDataHealthCheck());
    } catch (err) {
      setRepairMsg(`Check failed: ${err.message}`);
    }
    setIssues(storageService.getIssues());
    setRunning(false);
  }, []);

  useEffect(() => { run(); }, [run]);

  const handleRepair = async (kind) => {
    setRepairing(kind);
    setRepairMsg('');
    try {
      if (kind === 'registerMissingSerials') {
        const r = await storageService.repairMissingRegistrations();
        setRepairMsg(`Repaired ${r.invoices} bill(s): ${r.registered} registered, ${r.duplicates} already on record${r.failed ? `, ${r.failed} failed` : ''}.`);
      }
      if (kind === 'retryPending') {
        const r = await storageService.retryPendingWrites();
        setRepairMsg(`Retried ${r.retried}: ${r.ok} synced${r.failed ? `, ${r.failed} still failing` : ''}.`);
      }
      await run();
    } catch (err) {
      setRepairMsg(`Repair failed: ${err.message}`);
    }
    setRepairing('');
  };

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const problems = (report?.findings || []).filter((f) => f.severity !== 'ok').length;

  return (
    <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b-2 border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-rose-600" />
          <div>
            <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">Data Health</h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
              Recomputes every total from the raw records — nothing here is a stored count that could drift.
            </p>
          </div>
        </div>
        <button onClick={run} disabled={running} className="btn btn-outline text-xs py-2.5 px-4 font-bold disabled:opacity-60 self-start sm:self-auto">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-700" />} Re-check
        </button>
      </div>

      <div className="p-5 space-y-3">
        {!report && running && (
          <p className="text-xs font-semibold text-slate-400 text-center py-6">Reconciling records…</p>
        )}

        {report && (
          <div className={`rounded-xl border-2 p-3 text-xs font-black ${problems === 0 ? SEV.ok.cls : SEV.error.cls}`}>
            {problems === 0
              ? 'All checks passed — records, regions and the cloud all agree.'
              : `${problems} issue${problems === 1 ? '' : 's'} need attention.`}
          </div>
        )}

        {repairMsg && (
          <p className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">{repairMsg}</p>
        )}

        {(report?.findings || []).map((f) => {
          const sev = SEV[f.severity] || SEV.ok;
          const Icon = sev.icon;
          const open = expanded.has(f.key);
          return (
            <div key={f.key} className="border-2 border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${f.severity === 'error' ? 'text-red-600' : f.severity === 'warn' ? 'text-amber-600' : 'text-emerald-600'}`} />
                  <div className="min-w-0">
                    <div className="font-heading font-black text-xs text-slate-900 uppercase tracking-wider">{f.title}</div>
                    <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{f.summary}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {f.items?.length > 0 && (
                    <button onClick={() => toggle(f.key)} className="btn btn-outline text-[11px] py-1.5 px-3 font-bold">
                      {open ? 'Hide' : `Show ${f.items.length}`}
                    </button>
                  )}
                  {f.repair && (
                    <button
                      onClick={() => handleRepair(f.repair)}
                      disabled={!!repairing}
                      className="btn btn-primary text-[11px] py-1.5 px-3 font-bold disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {repairing === f.repair ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />} Repair
                    </button>
                  )}
                </div>
              </div>
              {open && f.items?.length > 0 && (
                <div className="border-t border-slate-200 bg-slate-50 max-h-56 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <tbody className="divide-y divide-slate-200">
                      {f.items.map((it, idx) => (
                        <tr key={`${it.id}-${idx}`}>
                          <td className="p-2 font-mono font-bold text-slate-700 truncate max-w-[220px]">{it.label || it.id}</td>
                          <td className="p-2 font-semibold text-slate-500 whitespace-nowrap">
                            {it.missing != null ? `${it.missing} of ${it.billed} missing` : ''}
                            {it.collection ? it.collection : ''}
                            {it.kind ? it.kind : ''}
                            {it.local != null ? `${it.local} local / ${it.cloud} cloud` : ''}
                            {it.error ? it.error : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Persistent problem log — these do NOT expire on a timer. */}
        {issues.length > 0 && (
          <div className="border-2 border-red-200 rounded-xl overflow-hidden">
            <div className="p-3 flex items-center justify-between gap-2 bg-red-50">
              <span className="font-heading font-black text-xs text-red-700 uppercase tracking-wider">
                Recorded errors ({issues.length})
              </span>
              <button
                onClick={() => { storageService.clearIssues(); setIssues([]); }}
                className="btn btn-outline text-[11px] py-1.5 px-3 font-bold text-red-600 border-red-300 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {issues.slice(0, 50).map((i) => (
                <div key={i.id} className="p-2.5 text-[11px]">
                  <div className="font-bold text-slate-800">{i.message}</div>
                  <div className="text-slate-400 font-semibold">{new Date(i.at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
