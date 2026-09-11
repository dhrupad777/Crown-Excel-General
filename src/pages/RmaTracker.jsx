import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wrench, Search, Plus, FileSpreadsheet, Upload, Lock, Loader2, CheckCircle2, AlertCircle,
  X, ShieldCheck, ShieldAlert, MessageSquare, Trash2, Camera, History
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { ImportExcelModal } from '../components/ImportExcelModal';
import TeamTag from '../components/TeamTag';
import { storageService } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { importRmaCases } from '../utils/importUtils';
import { exportRmaXlsx, formatLocalDate } from '../utils/exportUtils';
import {
  RMA_STATUSES, RMA_CUSTOMER_TYPES, RMA_QUOTE_DECISIONS, RMA_WARRANTY_STATUSES, RMA_RESOLUTION_TYPES,
  RMA_FORM_HEADERS, blankRmaCase, rmaStatus, rmaStatusClasses, rmaCustomerTypeLabel, rmaDisplayDate,
  isRmaOpen
} from '../config/rma';

const RENDER_CAP_STEP = 100;

// Generated client-side, before the first save, so a photo can be attached while a brand-new case
// is still being filled in — same shape as storage.js's own _newId('rma').
const newRmaId = () => `rma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// An <input type="date"> wants YYYY-MM-DD in LOCAL time; toISOString would hand it a UTC day and
// shift the date by one for anyone behind Greenwich.
const dateInputValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateInputToIso = (v) => {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};

const daysOpen = (rmaCase) => {
  const from = new Date(rmaCase.receivedDate || rmaCase.date || Date.now()).getTime();
  return Math.max(0, Math.floor((Date.now() - from) / 86400000));
};

const LABEL_CLS = 'text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1';
const INPUT_CLS = 'input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5 disabled:bg-slate-50 disabled:text-slate-500';

// One field renderer for the ~20 near-identical inputs on the form.
const Field = ({ label, value, onChange, disabled, textarea, rows = 2, mono, placeholder, hint }) => (
  <div className="form-group mb-0">
    <label className={LABEL_CLS}>{label}</label>
    {textarea ? (
      <textarea
        rows={rows}
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLS} font-semibold text-slate-800 resize-none`}
      />
    ) : (
      <input
        type="text"
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLS} ${mono ? 'font-mono text-[#2563eb]' : ''}`}
      />
    )}
    {hint && <p className="text-[10px] font-semibold text-slate-500 mt-1">{hint}</p>}
  </div>
);

const Select = ({ label, value, onChange, disabled, options, blankOption, sub }) => (
  <div className="form-group mb-0">
    <label className={LABEL_CLS}>{label} {sub && <span className="text-[9px] normal-case font-bold text-slate-400">({sub})</span>}</label>
    <select value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS}>
      {blankOption && <option value="">{blankOption}</option>}
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  </div>
);

// A photo attached to the case. Uploads straight to Cloud Storage on file pick; shows a thumbnail
// + link once attached, with a remove button that also deletes the stored file (best-effort).
const PhotoField = ({ label, url, uploading, disabled, onUpload, onRemove }) => (
  <div className="form-group mb-0">
    <label className={LABEL_CLS}>{label}</label>
    {url ? (
      <div className="flex items-center gap-3 p-2 border-2 border-slate-200 rounded-xl bg-slate-50">
        <img src={url} alt={label} className="w-14 h-14 object-cover rounded-lg border border-slate-300 flex-shrink-0" />
        <a href={url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#2563eb] hover:underline flex-1 truncate">
          View full photo
        </a>
        {!disabled && (
          <button type="button" onClick={onRemove} title="Remove photo"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    ) : (
      <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-4 text-xs font-bold transition-colors ${
        disabled || uploading ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-500 hover:border-[#2563eb] hover:text-[#2563eb] cursor-pointer'
      }`}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {uploading ? 'Uploading…' : 'Attach a photo'}
        <input type="file" accept="image/*" className="hidden" disabled={disabled || uploading}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
      </label>
    )}
  </div>
);

const Group = ({ title, owner, children, cols = 2 }) => (
  <div className="border-2 border-slate-200 rounded-xl p-4 bg-white space-y-3">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
      <h4 className="font-heading font-black text-xs text-slate-900 uppercase tracking-wider">{title}</h4>
      {owner && (
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
          {owner}
        </span>
      )}
    </div>
    <div className={`grid grid-cols-1 ${cols === 2 ? 'sm:grid-cols-2' : ''} gap-4`}>{children}</div>
  </div>
);

export const RmaTracker = () => {
  const { isAdmin, can } = useAuth();
  const canExport = can('rmaExport');

  const [cases, setCases] = useState(() => storageService.getRmaCases());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [typeFilter, setTypeFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [renderCap, setRenderCap] = useState(RENDER_CAP_STEP);
  const [showImport, setShowImport] = useState(false);

  // Detail / edit modal
  const [draft, setDraft] = useState(null);       // the case being viewed or created
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolvedNote, setResolvedNote] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(''); // '' | 'condition' | 'creditnote'
  const [logText, setLogText] = useState('');
  const [logInternal, setLogInternal] = useState(false);
  const [logStatus, setLogStatus] = useState('');
  const [logBusy, setLogBusy] = useState(false);
  const [logView, setLogView] = useState('all');
  const serialInputRef = useRef(null);

  useEffect(() => {
    const handleDataChange = (e) => {
      const type = e.detail?.type;
      if (!type || type === 'rmaCases' || type === 'all') setCases(storageService.getRmaCases());
    };
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  // Keep the open case in step with live updates from another terminal, without stomping on fields
  // the operator is mid-edit. Only the timeline is re-read — that is the part someone else appends.
  useEffect(() => {
    if (!draft?.id) return;
    const fresh = cases.find((c) => c.id === draft.id);
    if (fresh && fresh.timeline?.length !== draft.timeline?.length) {
      setDraft((d) => (d ? { ...d, timeline: fresh.timeline } : d));
    }
  }, [cases, draft?.id, draft?.timeline?.length]);

  const teams = storageService.getTeams();

  // Fields the server allows a non-admin to change only while CREATING; once a case exists, only
  // an admin can rewrite it (they can still add log entries and move the status, always).
  const fieldsDisabled = !isAdmin && !isNew;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter === 'open' && !isRmaOpen(c)) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (typeFilter !== 'all' && c.customerType !== typeFilter) return false;
      if (isAdmin && teamFilter !== 'all' && (c.teamId || '') !== teamFilter) return false;
      if (!q) return true;
      return [
        c.rmaNo, c.customerName, c.customerPhone, c.productName, c.productSku, c.saleInvoiceNo,
        c.supplierName, c.supplierInvoiceNo, c.serviceProvider, c.technicianName, c.remarks,
        ...(c.serials || [])
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [cases, searchQuery, statusFilter, typeFilter, teamFilter, isAdmin]);

  const visible = filtered.slice(0, renderCap);

  const openCase = (rmaCase) => {
    setDraft(rmaCase ? { ...rmaCase, serials: [...(rmaCase.serials || [])] } : { ...blankRmaCase(), id: newRmaId(), receivedDate: new Date().toISOString() });
    setIsNew(!rmaCase);
    setFormError('');
    setSerialInput('');
    setResolvedNote('');
    setLogText('');
    setLogInternal(false);
    setLogStatus('');
    setLogView('all');
  };

  const closeCase = () => {
    setDraft(null);
    setIsNew(false);
    setFormError('');
  };

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Adding a serial is also how the sale gets attached: if we registered this unit, everything the
  // invoice already knows is filled in. A serial we've never seen is normal — marketplace returns
  // were never registered here — so it is accepted and simply marked as such.
  const addSerial = async () => {
    const raw = serialInput.trim();
    if (!raw) return;
    const serial = raw.toUpperCase();
    setSerialInput('');
    if ((draft.serials || []).includes(serial)) return;

    const nextSerials = [...(draft.serials || []), serial];
    set({ serials: nextSerials });

    setResolving(true);
    setResolvedNote('');
    try {
      const found = await storageService.resolveRmaFromSerial(serial);
      if (found) {
        setDraft((d) => ({
          ...d,
          productId: d.productId || found.productId,
          productName: d.productName || found.productName,
          productSku: d.productSku || found.productSku,
          customerName: d.customerName || found.customerName,
          customerId: d.customerId || found.customerId,
          customerPhone: d.customerPhone || found.customerPhone,
          saleInvoiceNo: d.saleInvoiceNo || found.saleInvoiceNo,
          saleDate: d.saleDate || found.saleDate
        }));
        setResolvedNote(`${serial} found in the registry — sold on ${found.saleInvoiceNo || 'an unnumbered bill'}${found.soldFromLocation ? ` from ${found.soldFromLocation}` : ''}.`);
      } else {
        setResolvedNote(`${serial} is not in our warranty registry. That's fine for a marketplace return — fill the sale details in by hand.`);
      }
    } catch {
      setResolvedNote(`Could not reach the registry to look up ${serial}. The serial is saved; the sale details stay editable.`);
    }
    setResolving(false);
    serialInputRef.current?.focus();
  };

  const handlePhotoUpload = async (kind, urlKey, pathKey, file) => {
    setUploadingPhoto(kind);
    setFormError('');
    try {
      const { url, path } = await storageService.uploadRmaPhoto(draft.id, kind, file);
      set({ [urlKey]: url, [pathKey]: path });
    } catch (err) {
      setFormError(err.message);
    }
    setUploadingPhoto('');
  };

  const handlePhotoRemove = (urlKey, pathKey) => {
    const path = draft[pathKey];
    set({ [urlKey]: '', [pathKey]: '' });
    if (path) storageService.deleteRmaPhoto(path);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!draft.customerName.trim() && (draft.serials || []).length === 0) {
      setFormError('Give the case a customer name or at least one serial number, so it can be found again.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const toSave = { ...draft };
      if (isNew) toSave.rmaNo = await storageService.reserveRmaNumber(new Date(toSave.receivedDate));
      const saved = await storageService.saveRmaCase(toSave, { confirm: true });
      setDraft({ ...saved });
      setIsNew(false);
    } catch (err) {
      setFormError(
        err.code === 'permission-denied' || String(err.message).includes('permission')
          ? 'The server refused that change. Standard accounts can add a log entry and move the status, but not edit the rest of a case.'
          : `Could not save: ${err.message}`
      );
    }
    setSaving(false);
  };

  const handleAddLog = async () => {
    if (!logText.trim() || !draft?.id) return;
    setLogBusy(true);
    setFormError('');
    try {
      const saved = await storageService.appendRmaEntry(draft.id, {
        text: logText,
        internal: logInternal,
        status: logStatus || undefined
      });
      setDraft({ ...saved });
      setLogText('');
      setLogStatus('');
      setLogInternal(false);
    } catch (err) {
      setFormError(`Could not add that entry: ${err.message}`);
    }
    setLogBusy(false);
  };

  const handleDelete = async () => {
    if (!draft?.id) return;
    const reason = window.prompt(`Remove RMA ${draft.rmaNo}?\n\nIt is archived, not destroyed — an admin can restore it from the Recycle Bin.\n\nWhy is it being removed?`);
    if (reason === null) return;
    if (!reason.trim()) { alert('A reason is required.'); return; }
    storageService.deleteRmaCase(draft.id, reason);
    closeCase();
  };

  const handleExport = async () => {
    if (filtered.length === 0) {
      alert('No RMA cases match the current filters — nothing to export.');
      return;
    }
    try {
      await exportRmaXlsx(filtered, `Crown_Excel_RMA_${formatLocalDate(new Date())}.xlsx`);
    } catch (err) {
      alert(`Could not build the Excel file: ${err.message}`);
      return;
    }
    storageService.logExport('rma', 'xlsx', filtered.length);
  };

  const timeline = useMemo(() => {
    const all = [...(draft?.timeline || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (logView === 'internal') return all.filter((e) => e.internal);
    if (logView === 'customer') return all.filter((e) => !e.internal);
    return all;
  }, [draft?.timeline, logView]);

  const statusTabs = [
    { id: 'open', label: `Open (${cases.filter(isRmaOpen).length})` },
    { id: 'all', label: `All (${cases.length})` },
    ...RMA_STATUSES.map((s) => ({ id: s.key, label: s.label, count: cases.filter((c) => c.status === s.key).length }))
      .filter((t) => t.count > 0)
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">

      {/* Header */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-[#2563eb]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 shadow-sm">
            <Wrench className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">RMA Tracker</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Warranty returns from receipt to resolution, linked to the serial registry.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => openCase(null)}
            className="btn btn-primary text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial shadow-md shadow-blue-500/10"
          >
            <Plus className="w-4 h-4" /> New RMA Case
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowImport(true)}
              className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
              title="Import RMA cases from a spreadsheet"
            >
              <Upload className="w-4 h-4 text-slate-700" /> Import
            </button>
          )}
          {canExport ? (
            <button
              onClick={handleExport}
              className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
              title="Download the filtered cases as Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-700" /> Excel
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 border-2 border-slate-200 px-3 py-2 rounded-xl">
              <Lock className="w-3.5 h-3.5 text-slate-400" /> Downloads not enabled for your account
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setRenderCap(RENDER_CAP_STEP); }}
              placeholder="Search RMA number, serial, customer, product, invoice…"
              className="input-field pl-10 pr-16 py-3 text-sm bg-white border-slate-400 focus:border-[#2563eb] font-bold text-slate-900 w-full rounded-xl shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field py-3 px-3 text-sm bg-white border-slate-400 font-bold text-slate-800 rounded-xl w-full lg:w-52"
          >
            <option value="all">All customer types</option>
            {RMA_CUSTOMER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {isAdmin && (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="input-field py-3 px-3 text-sm bg-white border-slate-400 font-bold text-slate-800 rounded-xl w-full lg:w-44"
            >
              <option value="all">All regions</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-300 overflow-x-auto shadow-inner">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setRenderCap(RENDER_CAP_STEP); }}
              className={`px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all whitespace-nowrap text-center ${
                statusFilter === tab.id
                  ? 'bg-[#2563eb] text-white shadow-md shadow-blue-500/20 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <Wrench className="w-12 h-12 mx-auto text-slate-400" />
            <div className="font-heading font-black text-slate-800 text-lg">No RMA cases found</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              {cases.length === 0
                ? 'Log a warranty return with “New RMA Case”, or import a spreadsheet.'
                : 'Adjust the filters above — there are cases here, just not matching this view.'}
            </p>
          </div>
        ) : (
          <>
            <div className="table-container border-0 rounded-none w-full overflow-x-auto">
              <table className="data-table w-full min-w-[1150px]">
                <thead>
                  <tr>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">RMA No</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Received</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Customer</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Product</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Serial</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Latest Update</th>
                    {isAdmin && <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Region</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((c) => {
                    const latest = [...(c.timeline || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
                    const age = daysOpen(c);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openCase(c)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                            {c.rmaNo}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-bold text-slate-800 font-mono">{rmaDisplayDate(c.receivedDate)}</div>
                          {isRmaOpen(c) && (
                            <div className={`text-[10px] font-black mt-0.5 ${age > 30 ? 'text-red-600' : 'text-slate-400'}`}>
                              {age} day{age === 1 ? '' : 's'} open
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-bold text-slate-900">{c.customerName || <span className="text-slate-300">—</span>}</div>
                          {c.customerType && (
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-0.5">
                              {rmaCustomerTypeLabel(c.customerType)}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 max-w-[240px]">
                          <div className="text-xs font-semibold text-slate-700 truncate" title={c.productName}>
                            {c.productName || <span className="text-slate-300">—</span>}
                          </div>
                          {c.productSku && <div className="text-[10px] font-mono font-bold text-slate-500 mt-0.5">{c.productSku}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          {(c.serials || []).length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="space-y-1">
                              {c.serials.slice(0, 2).map((s) => (
                                <div key={s} className="font-mono text-[11px] font-bold text-slate-800">{s}</div>
                              ))}
                              {c.serials.length > 2 && (
                                <div className="text-[10px] font-bold text-slate-400">+{c.serials.length - 2} more</div>
                              )}
                              {!c.customerId && !c.saleInvoiceNo && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <ShieldAlert className="w-3 h-3" /> not in registry
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${rmaStatusClasses(c.status)}`}>
                            {rmaStatus(c.status).label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[280px]">
                          {latest ? (
                            <>
                              <div className="text-[11px] font-semibold text-slate-700 truncate" title={latest.text}>{latest.text}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">{rmaDisplayDate(latest.date)}</div>
                            </>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        {isAdmin && <td className="py-3.5 px-4"><TeamTag team={c.teamId} /></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > visible.length && (
              <div className="p-4 border-t-2 border-slate-200 text-center">
                <button
                  onClick={() => setRenderCap((n) => n + RENDER_CAP_STEP)}
                  className="btn btn-outline text-xs py-2 px-5 font-bold"
                >
                  Show {Math.min(RENDER_CAP_STEP, filtered.length - visible.length)} more
                  <span className="text-slate-400"> ({visible.length} of {filtered.length})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- CASE DETAIL --- */}
      <Modal
        isOpen={Boolean(draft)}
        onClose={closeCase}
        title={isNew ? 'New RMA Case' : `RMA ${draft?.rmaNo || ''}`}
        subtitle={isNew ? 'The case number is issued when you save.' : `Received ${rmaDisplayDate(draft?.receivedDate)}`}
        icon={Wrench}
        maxWidth="max-w-4xl"
      >
        {draft && (
          <form onSubmit={handleSave} className="space-y-4 font-body">

            {fieldsDisabled && (
              <p className="text-[11px] font-semibold text-slate-600 bg-slate-50 border-2 border-slate-200 rounded-xl p-3">
                You can add log entries and move the status. Editing the rest of an existing case is
                restricted to administrators — the server enforces that, so the fields below are shown read-only.
              </p>
            )}

            <Group title="Case" owner="RMA Coordinator">
              <Field label="Customer Name" value={draft.customerName} disabled={fieldsDisabled}
                onChange={(v) => set({ customerName: v })} placeholder="e.g. Unisystem Sri Lanka" />
              <Select label="Customer Type" value={draft.customerType} disabled={fieldsDisabled}
                onChange={(v) => set({ customerType: v })} options={RMA_CUSTOMER_TYPES} blankOption="Not set" />
              <Field label="Customer #" value={draft.customerPhone} disabled={fieldsDisabled} mono
                onChange={(v) => set({ customerPhone: v })} />
              <div className="form-group mb-0">
                <label className={LABEL_CLS}>Date received</label>
                <input type="date" value={dateInputValue(draft.receivedDate)} disabled={fieldsDisabled}
                  onChange={(e) => set({ receivedDate: dateInputToIso(e.target.value) })} className={INPUT_CLS} />
              </div>
              <Select label="RMA Status" value={draft.status} disabled={false}
                onChange={(v) => set({ status: v })} options={RMA_STATUSES} sub="stack — see log below" />
            </Group>

            <Group title="Unit & Complaint" owner="RMA Coordinator" cols={1}>
              <div className="form-group mb-0">
                <label className={LABEL_CLS}>Serial #</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(draft.serials || []).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                      {s}
                      {!fieldsDisabled && (
                        <button type="button" onClick={() => set({ serials: draft.serials.filter((x) => x !== s) })}
                          className="text-slate-400 hover:text-red-600" aria-label={`Remove ${s}`}>
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {(draft.serials || []).length === 0 && (
                    <span className="text-xs font-semibold text-slate-400">None attached yet.</span>
                  )}
                </div>
                {!fieldsDisabled && (
                  <div className="flex gap-2">
                    <input
                      ref={serialInputRef}
                      type="text"
                      value={serialInput}
                      onChange={(e) => setSerialInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSerial(); } }}
                      placeholder="Scan or type a serial, then press Enter"
                      className={`${INPUT_CLS} font-mono flex-1`}
                    />
                    <button type="button" onClick={addSerial} disabled={resolving || !serialInput.trim()}
                      className="btn btn-outline px-4 py-2.5 text-xs font-bold disabled:opacity-60">
                      {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                    </button>
                  </div>
                )}
                {resolvedNote && (
                  <p className="text-[11px] font-semibold text-slate-600 mt-2 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2563eb] flex-shrink-0 mt-0.5" /> {resolvedNote}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Part #" value={draft.productSku} disabled={fieldsDisabled} mono
                  onChange={(v) => set({ productSku: v })} />
                <Field label="Part Description" value={draft.productName} disabled={fieldsDisabled}
                  onChange={(v) => set({ productName: v })} />
              </div>
              <Field label="Customer Complaint" value={draft.complaint} disabled={fieldsDisabled}
                textarea rows={2} onChange={(v) => set({ complaint: v })} />
              <Field label="Product Condition" value={draft.physicalCondition} disabled={fieldsDisabled}
                textarea rows={2} onChange={(v) => set({ physicalCondition: v })}
                placeholder={'e.g. Full box received, small scratches on body'} />
              <PhotoField
                label="Product Condition Photo"
                url={draft.physicalConditionPhotoUrl}
                uploading={uploadingPhoto === 'condition'}
                disabled={fieldsDisabled}
                onUpload={(f) => handlePhotoUpload('condition', 'physicalConditionPhotoUrl', 'physicalConditionPhotoPath', f)}
                onRemove={() => handlePhotoRemove('physicalConditionPhotoUrl', 'physicalConditionPhotoPath')}
              />
            </Group>

            <Group title="CE Invoice (Sale)" owner="RMA Coordinator">
              <Field label="CE Invoice #" value={draft.saleInvoiceNo} disabled={fieldsDisabled} mono
                onChange={(v) => set({ saleInvoiceNo: v })}
                hint={draft.customerId ? 'Filled from the serial registry.' : undefined} />
              <div className="form-group mb-0">
                <label className={LABEL_CLS}>CE Invoice Date</label>
                <input type="date" value={dateInputValue(draft.saleDate)} disabled={fieldsDisabled}
                  onChange={(e) => set({ saleDate: dateInputToIso(e.target.value) })} className={INPUT_CLS} />
              </div>
            </Group>

            <Group title="Supplier & Warranty" owner="Accounts">
              <Field label="Supplier Name" value={draft.supplierName} disabled={fieldsDisabled}
                onChange={(v) => set({ supplierName: v })} />
              <Field label="Supplier Invoice #" value={draft.supplierInvoiceNo} disabled={fieldsDisabled} mono
                onChange={(v) => set({ supplierInvoiceNo: v })} />
              <div className="form-group mb-0">
                <label className={LABEL_CLS}>Supplier Invoice Date</label>
                <input type="date" value={dateInputValue(draft.supplierInvoiceDate)} disabled={fieldsDisabled}
                  onChange={(e) => set({ supplierInvoiceDate: dateInputToIso(e.target.value) })} className={INPUT_CLS} />
              </div>
              <Field label="Service Provider" value={draft.serviceProvider} disabled={fieldsDisabled}
                onChange={(v) => set({ serviceProvider: v })} placeholder="Supplier / brand service centre" />
              <Select label="Warranty Status" value={draft.warrantyStatus} disabled={fieldsDisabled}
                onChange={(v) => set({ warrantyStatus: v })} options={RMA_WARRANTY_STATUSES} />
            </Group>

            <Group title="Repair & Approval" owner="Management">
              <Field label="Local Technician" value={draft.technicianName} disabled={fieldsDisabled}
                onChange={(v) => set({ technicianName: v })} />
              <Field label="Technician Quote" value={draft.technicianQuote} disabled={fieldsDisabled} mono
                onChange={(v) => set({ technicianQuote: v })} placeholder="e.g. 370 AED" />
              <Select label="Approval Status" value={draft.quoteDecision} disabled={fieldsDisabled}
                onChange={(v) => set({ quoteDecision: v })} options={RMA_QUOTE_DECISIONS} />
              <Field label="Approved By" value={draft.quoteDecisionBy} disabled={fieldsDisabled}
                onChange={(v) => set({ quoteDecisionBy: v })} />
            </Group>

            <Group title="Resolution" owner="RMA Coordinator" cols={1}>
              <Select label="Repair / Replacement / Credit Note" value={draft.resolutionType} disabled={fieldsDisabled}
                onChange={(v) => set({ resolutionType: v })} options={RMA_RESOLUTION_TYPES} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Laptop Return Details" value={draft.handoverDetails} disabled={fieldsDisabled}
                  textarea onChange={(v) => set({ handoverDetails: v })} />
                <Field label="Remarks" value={draft.remarks} disabled={fieldsDisabled}
                  textarea onChange={(v) => set({ remarks: v })} />
              </div>
              <Field label="Credit Note Details" value={draft.creditNoteDetails} disabled={fieldsDisabled}
                textarea onChange={(v) => set({ creditNoteDetails: v })} />
              <PhotoField
                label="Credit Note Photo"
                url={draft.creditNotePhotoUrl}
                uploading={uploadingPhoto === 'creditnote'}
                disabled={fieldsDisabled}
                onUpload={(f) => handlePhotoUpload('creditnote', 'creditNotePhotoUrl', 'creditNotePhotoPath', f)}
                onRemove={() => handlePhotoRemove('creditNotePhotoUrl', 'creditNotePhotoPath')}
              />
            </Group>

            {/* --- TIMELINE (RMA STATUS, in stack format) --- */}
            <div className="border-2 border-slate-200 rounded-xl p-4 bg-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <h4 className="font-heading font-black text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-[#2563eb]" /> RMA Status Log
                </h4>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'customer', label: 'Customer-facing' },
                    { id: 'internal', label: 'Internal' }
                  ].map((v) => (
                    <button key={v.id} type="button" onClick={() => setLogView(v.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        logView === v.id ? 'bg-white text-[#2563eb] shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {isNew ? (
                <p className="text-[11px] font-semibold text-slate-500">Save the case first, then log what happens to it.</p>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={logText}
                    onChange={(e) => setLogText(e.target.value)}
                    placeholder="What happened today? e.g. Unit submitted to supplier for warranty claim, slip no. 20409"
                    className={`${INPUT_CLS} font-semibold text-slate-800 resize-none w-full`}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 flex-shrink-0">
                      <input type="checkbox" checked={logInternal} onChange={(e) => setLogInternal(e.target.checked)}
                        className="accent-[#2563eb] w-4 h-4" />
                      Internal only
                    </label>
                    <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)}
                      className={`${INPUT_CLS} py-2 text-xs flex-1`}>
                      <option value="">Leave status as “{rmaStatus(draft.status).label}”</option>
                      {RMA_STATUSES.filter((s) => s.key !== draft.status).map((s) => (
                        <option key={s.key} value={s.key}>Move to “{s.label}”</option>
                      ))}
                    </select>
                    <button type="button" onClick={handleAddLog} disabled={logBusy || !logText.trim()}
                      className="btn btn-primary py-2 px-4 text-xs font-bold disabled:opacity-60 flex-shrink-0">
                      {logBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Add Entry
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {timeline.length === 0 ? (
                  <p className="text-[11px] font-semibold text-slate-400 py-2">Nothing logged yet.</p>
                ) : timeline.map((e) => (
                  <div key={e.id} className={`rounded-xl border-2 p-3 ${e.internal ? 'border-slate-200 bg-slate-50' : 'border-blue-100 bg-blue-50/40'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black font-mono text-slate-500">{rmaDisplayDate(e.date)}</span>
                      <div className="flex items-center gap-2">
                        {e.byName && <span className="text-[10px] font-bold text-slate-400">{e.byName}</span>}
                        {e.internal && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            Internal
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap">{e.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-xs font-bold text-red-500 flex items-center gap-1.5" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {formError}
              </p>
            )}

            <div className="pt-4 flex flex-col sm:flex-row justify-between gap-3 border-t-2 border-slate-200 mt-2">
              <div>
                {isAdmin && !isNew && (
                  <button type="button" onClick={handleDelete}
                    className="btn btn-outline text-xs py-2.5 px-4 font-bold text-red-600 border-red-300 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" /> Remove Case
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeCase} className="btn btn-outline font-bold px-5 py-2.5">Close</button>
                {!fieldsDisabled && (
                  <button type="submit" disabled={saving} className="btn btn-primary font-bold px-6 py-2.5 shadow-md disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {isNew ? 'Create Case' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </Modal>

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        entityLabel="RMA Cases"
        templateHeaders={RMA_FORM_HEADERS}
        onImport={importRmaCases}
        notice="Matches columns by header name — download the blank template above to get the exact layout. Serials are matched against the warranty registry where we can, and accepted as-is where we can't."
        renderResultExtras={(result) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
            {[
              { label: 'Serials matched', value: result.serialsMatched, cls: 'text-emerald-700 border-emerald-200 bg-emerald-50', icon: ShieldCheck },
              { label: 'Not in registry', value: result.serialsUnmatched, cls: 'text-amber-700 border-amber-200 bg-amber-50', icon: ShieldAlert }
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border-2 p-3 ${c.cls}`}>
                <div className="font-heading font-black text-lg font-mono">{c.value}</div>
                <div className="text-[10px] font-black uppercase tracking-wider">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
};
