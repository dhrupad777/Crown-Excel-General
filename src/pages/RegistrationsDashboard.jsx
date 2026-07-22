import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  ShieldCheck,
  CalendarDays,
  CalendarClock,
  ShieldAlert,
  MapPin,
  Users,
  TrendingUp,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { storageService } from '../services/storage';
import { customerPrimaryName } from '../utils/customer';

// Simple CSS-bar breakdown list (no chart library — consistent with the app's card design).
const BreakdownCard = ({ title, icon: Icon, accent, entries, emptyLabel }) => {
  const max = entries.length > 0 ? Math.max(...entries.map(([, count]) => count)) : 0;
  return (
    <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 shadow-sm space-y-4">
      <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b-2 border-slate-200 pb-3">
        <Icon className={`w-4 h-4 ${accent}`} /> {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs font-semibold text-slate-400 py-4 text-center">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([label, count]) => (
            <div key={label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-800 truncate pr-2" title={label}>{label}</span>
                <span className="font-mono font-black text-slate-900">{count}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#2563eb]"
                  style={{ width: `${max > 0 ? Math.max((count / max) * 100, 4) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const RegistrationsDashboard = ({ onViewInvoice }) => {
  const [stats, setStats] = useState(() => storageService.getSerialStats());
  const [dupCount, setDupCount] = useState(null);
  const [recentDuplicates, setRecentDuplicates] = useState([]);
  const [loadingDups, setLoadingDups] = useState(false);
  const [openQueries, setOpenQueries] = useState(() =>
    storageService.getInvoices().filter((i) => i.query && !i.query.resolved)
  );

  useEffect(() => {
    const handleDataChange = (e) => {
      const type = e.detail?.type;
      if (!type || type === 'serials' || type === 'all') {
        setStats(storageService.getSerialStats());
      }
      if (!type || type === 'invoices' || type === 'all') {
        setOpenQueries(storageService.getInvoices().filter((i) => i.query && !i.query.resolved));
      }
    };
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  // Duplicate-attempt data is write-through (not mirrored), so it's fetched on demand.
  const refreshDuplicateData = useCallback(async () => {
    setLoadingDups(true);
    const [count, attempts] = await Promise.all([
      storageService.getDuplicateAttemptCount(),
      storageService.fetchDuplicateAttempts(25)
    ]);
    setDupCount(count);
    setRecentDuplicates(attempts);
    setLoadingDups(false);
  }, []);

  useEffect(() => {
    refreshDuplicateData();
  }, [refreshDuplicateData]);

  const tiles = [
    { label: 'Total Registered', value: stats.total, icon: ShieldCheck, cls: 'border-l-[#2563eb]', iconCls: 'text-[#2563eb]', note: 'Serial numbers on record' },
    { label: "Today's Registrations", value: stats.today, icon: CalendarDays, cls: 'border-l-emerald-600', iconCls: 'text-emerald-600', note: new Date().toLocaleDateString() },
    { label: 'This Month', value: stats.month, icon: CalendarClock, cls: 'border-l-purple-600', iconCls: 'text-purple-600', note: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) },
    { label: 'Duplicate Attempts', value: dupCount ?? '—', icon: ShieldAlert, cls: 'border-l-red-500', iconCls: 'text-red-500', note: 'Blocked & logged' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">

      {/* Open bill queries — staff-raised concerns needing admin attention. Click to jump to the invoice. */}
      {openQueries.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 rounded-xl bg-red-100 border border-red-200 text-red-600 animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-black text-sm text-red-700 uppercase tracking-wider">
                {openQueries.length} Open {openQueries.length === 1 ? 'Query' : 'Queries'} / Concern{openQueries.length === 1 ? '' : 's'}
              </h3>
              <p className="text-[11px] font-semibold text-red-500">Staff raised these bill concerns — click one to open the invoice and resolve it.</p>
            </div>
          </div>
          <div className="space-y-2">
            {openQueries.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => onViewInvoice?.(inv.id)}
                className="w-full text-left bg-white border border-red-200 rounded-xl px-4 py-2.5 hover:border-red-400 hover:bg-red-50/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <span className="font-mono">{inv.invoiceNo || inv.id}</span>
                    <span className="text-slate-400 font-semibold">•</span>
                    <span className="truncate font-bold text-slate-700">{customerPrimaryName(inv.customer)}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600 truncate mt-0.5">
                    &ldquo;{inv.query?.note}&rdquo; — {inv.query?.raisedByName || inv.query?.raisedBy}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-red-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-[#2563eb]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 shadow-sm">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">Registrations Dashboard</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Live serial-registration analytics across every store, user, and model.
            </p>
          </div>
        </div>
        <button
          onClick={refreshDuplicateData}
          disabled={loadingDups}
          className="btn btn-outline text-xs py-2.5 px-4 font-bold flex items-center gap-1.5 disabled:opacity-60"
        >
          {loadingDups ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-700" />}
          Refresh Duplicate Stats
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className={`bg-white border-2 border-slate-300 rounded-2xl p-5 shadow-sm border-l-4 ${tile.cls} flex flex-col justify-between`}>
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-black uppercase tracking-wider">
                <span>{tile.label}</span>
                <Icon className={`w-4 h-4 ${tile.iconCls}`} />
              </div>
              <div className="font-heading font-black text-3xl text-slate-900 font-mono mt-2">{tile.value}</div>
              <div className="text-[11px] font-bold text-slate-500 mt-1">{tile.note}</div>
            </div>
          );
        })}
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BreakdownCard
          title="Store-wise Registrations"
          icon={MapPin}
          accent="text-[#2563eb]"
          entries={Object.entries(stats.byLocation).sort((a, b) => b[1] - a[1])}
          emptyLabel="No registrations yet."
        />
        <BreakdownCard
          title="User-wise Registrations"
          icon={Users}
          accent="text-emerald-600"
          entries={Object.entries(stats.byUser).sort((a, b) => b[1] - a[1])}
          emptyLabel="No registrations yet."
        />
        <BreakdownCard
          title="Top-Selling Models"
          icon={TrendingUp}
          accent="text-purple-600"
          entries={stats.topModels.map((m) => [m.model, m.count])}
          emptyLabel="No registrations yet."
        />
      </div>

      {/* Recent duplicate attempts */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b-2 border-slate-200 bg-slate-50 flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">Recent Duplicate Entry Attempts</h3>
          <span className="bg-red-50 text-red-600 border border-red-200 font-bold px-2.5 py-0.5 rounded-full text-[11px]">{recentDuplicates.length}</span>
        </div>
        {recentDuplicates.length === 0 ? (
          <p className="p-10 text-center text-xs font-semibold text-slate-400">
            {loadingDups ? 'Loading…' : 'No duplicate attempts recorded — clean scanning so far.'}
          </p>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[800px]">
              <thead>
                <tr>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Serial Attempted</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Attempted By</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Source</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">When</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Original Registration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDuplicates.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className="font-mono text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">{d.serial}</span>
                    </td>
                    <td className="py-3.5 px-5 text-xs font-bold text-slate-800">{d.attemptedByName || d.createdBy}</td>
                    <td className="py-3.5 px-5">
                      <span className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                        {d.source === 'billing' ? 'Billing Desk' : 'Serial Capture'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      {d.date ? new Date(d.date).toLocaleString() : ''}
                    </td>
                    <td className="py-3.5 px-5 text-[11px] font-semibold text-slate-600">
                      {d.existing
                        ? `${d.existing.productName || ''}${d.existing.invoiceNo ? ` • ${d.existing.invoiceNo}` : ''}${d.existing.registeredBy ? ` • by ${d.existing.registeredBy}` : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
