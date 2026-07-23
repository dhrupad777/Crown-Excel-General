import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  FileText,
  FileSpreadsheet,
  Printer,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  Shield,
  ShieldCheck,
  Loader2,
  Smartphone,
  CalendarRange,
  AlertTriangle,
  ChevronDown,
  MapPin,
  User,
  Edit3,
  Pencil
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';
import { DateRangeCalendar } from '../components/DateRangeCalendar';
import { exportInvoicesXlsx, exportInvoicesCsv, formatLocalDate, countInvoiceUnits } from '../utils/exportUtils';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';
import { InvoicePrintDocument } from '../components/InvoicePrintDocument';
import TeamTag from '../components/TeamTag';
import { useAuth } from '../context/AuthContext';
import { EDIT_WINDOW_HOURS } from '../config/appConfig';

export const InvoicesArchive = ({ initialInvoiceId }) => {
  const { isAdmin, user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [teamFilter, setTeamFilter] = useState('all'); // admin-only cross-team filter
  const [customRangeStart, setCustomRangeStart] = useState(null);
  const [customRangeEnd, setCustomRangeEnd] = useState(null);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const calendarPopoverRef = useRef(null);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryNote, setQueryNote] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

  // Invoice edit (admin, within the edit window) — secure (admin-only per rules) + traceable
  // (every change is written to the append-only audit log with before/after).
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editCustSearch, setEditCustSearch] = useState('');
  const [editError, setEditError] = useState('');

  // Opens an invoice's detail modal from a clean state (collapsed serial groups, no query/edit).
  const openInvoice = (inv) => {
    setSelectedInvoice(inv);
    setExpandedGroups(new Set());
    setShowQueryForm(false);
    setQueryNote('');
    setEditMode(false);
    setEditForm(null);
    setEditError('');
    setShowDetailModal(true);
  };

  // An invoice is editable by an admin only within EDIT_WINDOW_HOURS of when the bill was created
  // (mirrors the serial-registration rule / client requirement 8B). After that it's read-only.
  const isInvoiceEditable = (inv) =>
    isAdmin && inv?.date && (Date.now() - new Date(inv.date).getTime()) < EDIT_WINDOW_HOURS * 60 * 60 * 1000;

  const startEdit = (inv) => {
    const c = inv.customer || {};
    setEditForm({
      customerId: c.id || '',
      name: c.name || '',
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      company: c.company || '',
      reason: ''
    });
    setEditCustSearch('');
    setEditError('');
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!editForm.name.trim() || !editForm.whatsapp.trim()) {
      setEditError('Customer name and mobile number are required.');
      return;
    }
    if (!editForm.reason.trim()) {
      setEditError('A reason for the edit is required (kept in the audit trail).');
      return;
    }
    const patch = {
      customer: {
        id: editForm.customerId || '',
        name: editForm.name.trim(),
        whatsapp: editForm.whatsapp.trim(),
        email: editForm.email.trim(),
        company: editForm.company.trim()
      },
      editReason: editForm.reason.trim()
    };
    const saved = storageService.editInvoice(selectedInvoice.id, patch);
    if (saved) {
      setSelectedInvoice(saved);
      loadInvoices();
      setEditMode(false);
      setEditForm(null);
    } else {
      setEditError('Could not save the edit. Please try again.');
    }
  };

  const editCustResults = (editMode && editCustSearch.trim())
    ? storageService.searchCustomers(editCustSearch).slice(0, 6)
    : [];

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Collapses one invoice's line items into per-product groups, each carrying the running unit
  // count and every serial in the order it was scanned — so 100 identical phones show as one
  // row (Qty 100) with an expandable serial list instead of 100 rows.
  const groupInvoiceItems = (items) => {
    const groups = [];
    const byKey = new Map();
    (items || []).forEach((item) => {
      const key = item.productId || item.barcode || `${item.name}|${item.sku || ''}`;
      let g = byKey.get(key);
      if (!g) {
        g = { key, name: item.name, sku: item.sku || '', barcode: item.barcode || '', category: item.category || 'Electronics', qty: 0, serials: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      g.qty += item.qty || 1;
      String(item.imei || '').split(/[/,;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => g.serials.push(s));
    });
    return groups;
  };

  // Close the calendar popover on an outside click — no dropdown elsewhere in this app needs
  // this (they close via explicit selection instead), but a calendar left open until you
  // deliberately hit Apply/Cancel/Clear would feel broken next to a real booking-site picker.
  useEffect(() => {
    if (!showCalendarPopover) return;
    const handleClickOutside = (e) => {
      if (calendarPopoverRef.current && !calendarPopoverRef.current.contains(e.target)) {
        setShowCalendarPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendarPopover]);

  // Load Invoices
  const loadInvoices = () => {
    const data = storageService.getInvoices();
    setInvoices(data);
  };

  useEffect(() => {
    loadInvoices();
    const handleDataChange = () => loadInvoices();
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  // Warranty-registration completeness per bill. Registration is best-effort and runs after the
  // sale is saved, so it can come up short (a slow connection, or the tab closed mid-run). Compare
  // the bill's own serials against the registry rather than trusting a stored count.
  const registeredSerials = useMemo(
    () => new Set(storageService.getSerials().map((s) => String(s.serial || s.id).trim().toUpperCase())),
    [invoices]
  );
  const regStatus = (inv) => {
    const items = (inv?.items || []).filter((i) => String(i.imei || '').trim());
    const registered = items.filter((i) => registeredSerials.has(String(i.imei).trim().toUpperCase())).length;
    return { billed: items.length, registered, missing: items.length - registered };
  };

  // Re-runs registration for this bill. Already-registered serials return as harmless duplicates,
  // so this is safe to press repeatedly and is the repair path for under-registered invoices.
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const handleRegisterMissing = async () => {
    if (!selectedInvoice) return;
    setRepairing(true);
    setRepairResult(null);
    try {
      const res = await storageService.registerSerialsFromInvoice(selectedInvoice);
      setRepairResult(res);
      loadInvoices();
    } catch (err) {
      setRepairResult({ error: err.message });
    }
    setRepairing(false);
  };

  // Open specific invoice if requested via initialInvoiceId (e.g. navigated from the dashboard
  // query alert or a finalized bill).
  useEffect(() => {
    if (initialInvoiceId) {
      const inv = storageService.getInvoiceById(initialInvoiceId);
      if (inv) openInvoice(inv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoiceId]);

  // Filtered Invoices — text-match dimension is centralized in storageService.searchInvoices
  // (also used elsewhere for serial-number warranty lookups), date-range tabs stay local to this page.
  const searchMatchIds = new Set(storageService.searchInvoices(searchQuery).map(inv => inv.id));

  const passesDateFilter = (inv) => {
    if (dateFilter === 'all') return true;
    const invDate = new Date(inv.date);
    const now = new Date();
    if (dateFilter === 'today') {
      return invDate.toDateString() === now.toDateString();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return invDate >= weekAgo;
    }
    if (dateFilter === 'month') {
      return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
    }
    if (dateFilter === 'custom') {
      if (!customRangeStart || !customRangeEnd) return true;
      // The end date arrives as a bare calendar day (midnight) — clamp it to the end of that
      // day before comparing, otherwise every invoice with a real time-of-day later than
      // midnight would be wrongly excluded (picking "today" as both ends would show 0 results).
      const start = new Date(customRangeStart.getFullYear(), customRangeStart.getMonth(), customRangeStart.getDate(), 0, 0, 0, 0);
      const end = new Date(customRangeEnd.getFullYear(), customRangeEnd.getMonth(), customRangeEnd.getDate(), 23, 59, 59, 999);
      return invDate >= start && invDate <= end;
    }
    return true;
  };

  const filteredInvoices = invoices.filter(
    (inv) => (!isAdmin || teamFilter === 'all' || (inv.teamId || '') === teamFilter)
      && (!searchQuery.trim() || searchMatchIds.has(inv.id)) && passesDateFilter(inv)
  );

  // storageService.searchInvoices only sees active bills, so voided ones need their own (simpler)
  // text match — enough to keep a searched export honest.
  const archivedMatchesSearch = (inv) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${inv.invoiceNo || inv.id} ${inv.customer?.name || ''} ${inv.customer?.company || ''} ${inv.customer?.whatsapp || ''}`.toLowerCase().includes(q)
      || (inv.items || []).some((i) => `${i.name || ''} ${i.imei || ''}`.toLowerCase().includes(q));
  };

  // Exports carry the voided bills too — a bill that vanishes from the record is exactly what an
  // audit flags. They're tagged "Archived (Voided)" in the workbook's Record Status column.
  const exportInvoices = storageService
    .getInvoicesIncludingArchived()
    .filter((inv) => (inv.deleted
      ? passesDateFilter(inv) && archivedMatchesSearch(inv)
      : filteredInvoices.some((f) => f.id === inv.id)));

  // Item-level matches for the "Matching Items" view — see storageService.searchInvoiceItems.
  // Deliberately not scoped to the active date-filter tab: it answers "show me every sale
  // matching this, ever," mirroring how the serial warranty lookup is already time-independent.
  // A restricted store only sees matches from its own invoices (searchInvoiceItems is global, so
  // filter it down to the visible set).
  const visibleInvoiceIds = new Set(invoices.map((inv) => inv.id));
  const matchingItems = searchQuery.trim()
    ? storageService.searchInvoiceItems(searchQuery).filter((r) => visibleInvoiceIds.has(r.invoice.id))
    : [];

  // Totals of Filtered Records
  const totalFilteredItems = filteredInvoices.reduce((acc, inv) => acc + countInvoiceUnits(inv), 0);
  const openQueryCount = filteredInvoices.filter((i) => i.query && !i.query.resolved).length;

  // Handle Delete
  // Voiding keeps the bill and its number in the record; a reason is mandatory, because "why was
  // this invoice cancelled" is the first question asked about any voided document.
  const handleDeleteInvoice = (id, e) => {
    e.stopPropagation();
    const reason = window.prompt(
      `Void invoice ${id}?\n\nThe bill keeps its number and stays in the record (marked "Voided") — it is not erased.\n\nReason for voiding (required):`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required to void an invoice.');
      return;
    }
    storageService.deleteInvoice(id, reason.trim());
    loadInvoices();
    if (selectedInvoice && selectedInvoice.id === id) {
      setShowDetailModal(false);
    }
  };

  // Export metadata + filename shared by every invoice export (bulk and per-invoice).
  // `serialLookup` lets the workbook cross-reference each serial against the warranty registry;
  // `generatedBy` records who downloaded it on the Report Info sheet.
  const exportMeta = () => ({
    dateFilter: (dateFilter === 'custom' && customRangeStart && customRangeEnd)
      ? `${formatLocalDate(customRangeStart)} to ${formatLocalDate(customRangeEnd)}`
      : (dateFilter === 'all' ? 'All records' : dateFilter),
    serialLookup: (serial) => storageService.findSerial(serial),
    generatedBy: storageService.getCurrentUser()
  });
  const exportFilename = (ext, tag) => {
    const datePart = (dateFilter === 'custom' && customRangeStart && customRangeEnd)
      ? `${formatLocalDate(customRangeStart)}_to_${formatLocalDate(customRangeEnd)}`
      : formatLocalDate(new Date());
    return `Crown_Excel_Invoices${tag ? '_' + tag : ''}_${datePart}.${ext}`;
  };

  // Styled 4-sheet workbook for the filtered set. Async: ExcelJS is lazy-loaded on first use.
  const handleExportExcel = async () => {
    if (exportInvoices.length === 0) { alert("No invoices to export."); return; }
    setExporting(true);
    try {
      await exportInvoicesXlsx(exportInvoices, exportFilename('xlsx'), exportMeta());
    } catch (err) {
      alert(`Could not build the Excel file: ${err.message}`);
    }
    setExporting(false);
  };
  const handleExportCSV = () => {
    if (exportInvoices.length === 0) { alert("No invoices to export."); return; }
    exportInvoicesCsv(exportInvoices, exportFilename('csv'), exportMeta());
  };

  // Print Invoice Function
  const handlePrintInvoice = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">

      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 shadow-sm border-l-4 border-l-[#2563eb] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-black uppercase tracking-wider">
            <span>Invoices Count</span>
            <FileText className="w-4 h-4 text-[#2563eb]" />
          </div>
          <div className="font-heading font-black text-2xl text-slate-900 font-mono mt-2">
            {filteredInvoices.length}
          </div>
          <div className="text-[11px] font-bold text-[#2563eb] mt-1">Total indexed records</div>
        </div>

        <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 shadow-sm border-l-4 border-l-red-500 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-black uppercase tracking-wider">
            <span>Open Queries</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="font-heading font-black text-2xl text-slate-900 font-mono mt-2">
            {openQueryCount}
          </div>
          <div className="text-[11px] font-bold text-red-500 mt-1">{openQueryCount > 0 ? 'Need admin action' : 'All clear'}</div>
        </div>

        <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 shadow-sm border-l-4 border-l-purple-600 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-black uppercase tracking-wider">
            <span>Items Sold</span>
            <Smartphone className="w-4 h-4 text-purple-600" />
          </div>
          <div className="font-heading font-black text-2xl text-slate-900 font-mono mt-2">
            {totalFilteredItems}
          </div>
          <div className="text-[11px] font-bold text-purple-600 mt-1">Across all filtered bills</div>
        </div>

        <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 flex flex-col justify-center gap-2 shadow-sm border-l-4 border-l-slate-700">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="btn btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 disabled:opacity-60"
          >
            <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Building…' : 'Export Excel'}
          </button>
          <button
            onClick={handleExportCSV}
            className="btn btn-outline w-full py-1.5 text-[11px] font-bold flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-700" /> CSV
          </button>
          <div className="text-[10px] text-center text-slate-500 font-bold leading-tight">
            Every serial, barcode, staff &amp; store
          </div>
        </div>
      </div>

      {/* Queryable Search Bar & Filters */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">

          {/* Instant Search Box */}
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Invoice #, Partner, Serial #, Item..."
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

          {isAdmin && (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="input-field py-3 px-3 text-sm bg-white border-slate-400 font-bold text-slate-800 rounded-xl w-full lg:w-48"
              title="Filter by team — admins see every team"
            >
              <option value="all">All Teams</option>
              {storageService.getTeams().map((team) => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          )}

          {/* Date Range Tabs — the calendar popover is rendered outside the
              overflow-x-auto container so it isn't clipped by the scroll boundary. */}
          <div className="relative" ref={calendarPopoverRef}>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-300 w-full lg:w-auto overflow-x-auto shadow-inner">
              {[
                { id: 'all', label: 'All Records' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateFilter(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all whitespace-nowrap flex-1 lg:flex-initial text-center ${
                    dateFilter === tab.id
                      ? 'bg-[#2563eb] text-white shadow-md shadow-blue-500/20 font-black'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowCalendarPopover((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={showCalendarPopover}
                className={`px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all whitespace-nowrap flex-1 lg:flex-initial text-center flex items-center justify-center gap-1.5 ${
                  dateFilter === 'custom'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-500/20 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>
                  {dateFilter === 'custom' && customRangeStart && customRangeEnd
                    ? `${customRangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${customRangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'Custom Range'}
                </span>
              </button>
            </div>

            {showCalendarPopover && (
              <div className="absolute z-30 top-full right-0 mt-2">
                <DateRangeCalendar
                  initialStart={customRangeStart}
                  initialEnd={customRangeEnd}
                  onApplyRange={(start, end) => {
                    setCustomRangeStart(start);
                    setCustomRangeEnd(end);
                    setDateFilter('custom');
                    setShowCalendarPopover(false);
                  }}
                  onSelectExistingTab={(id) => {
                    setDateFilter(id);
                    setShowCalendarPopover(false);
                  }}
                  onCancel={() => setShowCalendarPopover(false)}
                  onClear={() => {
                    setCustomRangeStart(null);
                    setCustomRangeEnd(null);
                    setDateFilter('all');
                    setShowCalendarPopover(false);
                  }}
                />
              </div>
            )}
          </div>

        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-bold text-slate-500 pt-3 border-t-2 border-slate-200 gap-2">
          <span className="flex items-center gap-1.5 text-[#2563eb]">
            <CheckCircle2 className="w-4 h-4" /> Instant 0ms Local Query Engine Active
          </span>
          <span>Showing <b className="text-slate-900">{filteredInvoices.length}</b> of <b className="text-slate-900">{invoices.length}</b> total invoices</span>
        </div>
      </div>

      {/* Matching Items — item-level search results, e.g. searching "macbook" surfaces every
          sold MacBook directly with its invoice, date, and buyer, instead of only the invoices
          containing one. Intentionally ignores the date-filter tab (see matchingItems above). */}
      {searchQuery.trim() && matchingItems.length > 0 && (
        <div className="bg-white border-2 border-purple-300 rounded-2xl overflow-hidden shadow-sm border-t-4 border-t-purple-600">
          <div className="p-4 border-b-2 border-slate-200 bg-slate-50 flex items-center gap-2.5">
            <Search className="w-4 h-4 text-purple-600" />
            <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">Matching Items</h3>
            <span className="bg-purple-100 text-purple-700 font-bold px-2.5 py-0.5 rounded-full text-[11px]">{matchingItems.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {matchingItems.map(({ invoice, item }, idx) => (
              <div
                key={`${invoice.id}-${idx}`}
                onClick={() => openInvoice(invoice)}
                className="p-4 hover:bg-slate-50 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
              >
                <div>
                  <div className="font-black text-sm text-slate-900">{item.name}</div>
                  <div className="mt-0.5">
                    {item.imei ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                        <Shield className="w-3 h-3" /> {item.imei}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-semibold italic">No serial recorded</span>
                    )}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="font-mono text-xs font-bold text-slate-700">
                    {invoice.invoiceNo || invoice.id} • {new Date(invoice.date).toLocaleDateString()}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-0.5">{customerPrimaryName(invoice.customer)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {filteredInvoices.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <FileText className="w-12 h-12 mx-auto text-slate-400 animate-pulse" />
            <div className="font-heading font-black text-slate-800 text-lg">No matching invoices found</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              Try searching for a different invoice number, partner name, serial number, or adjust the date filters above.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Invoice # & Date/Time</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Partner Details</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider text-center">Items</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => openInvoice(inv)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="font-heading font-black text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                        <span>{inv.invoiceNo || inv.id}</span>
                        {isAdmin && <TeamTag team={inv.teamId} />}
                        {inv.query && !inv.query.resolved && (
                          <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 border border-red-200 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-red-500" /> Query
                          </span>
                        )}
                        {inv.editedBy && (
                          <span
                            className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
                            title={`Edited by ${inv.editedByName || inv.editedBy}${inv.editedAt ? ' on ' + new Date(inv.editedAt).toLocaleString() : ''}`}
                          >
                            <Pencil className="w-3 h-3" /> Edited
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {new Date(inv.date).toLocaleDateString()} • {new Date(inv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-black text-slate-900 text-sm">{customerPrimaryName(inv.customer)}</div>
                      {customerSecondaryName(inv.customer) && (
                        <div className="text-[11px] font-semibold text-slate-500">{customerSecondaryName(inv.customer)}</div>
                      )}
                      <div className="font-mono text-xs font-bold text-[#2563eb] mt-0.5">{inv.customer?.whatsapp || ''}</div>
                    </td>
                    <td className="py-4 px-6 text-center font-mono text-slate-700">
                      <span className="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-3 py-1 rounded-full text-xs">{inv.items?.length || 0} items</span>
                      {(() => {
                        const st = regStatus(inv);
                        if (!st.billed || st.missing <= 0) return null;
                        return (
                          <div
                            className="mt-1.5 inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap"
                            title={`${st.missing} of ${st.billed} serials are not in the warranty registry — open the bill to register them.`}
                          >
                            <AlertTriangle className="w-3 h-3" /> {st.registered}/{st.billed} registered
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openInvoice(inv); }}
                          className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors shadow-sm"
                          title="View Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDeleteInvoice(inv.id, e)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 transition-colors shadow-sm"
                            title="Delete Record (admin only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compact, print-only invoice document rendered into a body-level portal. In print we hide
          the whole app (#root) and show only this, so a bill isn't padded out with blank space
          from the invisible on-screen UI. See index.css + InvoicePrintDocument. */}
      {showDetailModal && !editMode && selectedInvoice && createPortal(
        <div id="print-root">
          <InvoicePrintDocument
            invoice={selectedInvoice}
            groups={groupInvoiceItems(selectedInvoice.items)}
          />
        </div>,
        document.body
      )}

      {/* --- INVOICE DETAILS & PRINT MODAL --- */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedInvoice ? `Invoice — ${selectedInvoice.invoiceNo || selectedInvoice.id}` : 'Invoice'}
        subtitle={selectedInvoice ? new Date(selectedInvoice.date).toLocaleString() : ''}
        icon={FileText}
        maxWidth="max-w-3xl"
      >
        {selectedInvoice && !editMode && (
          <div className="space-y-6 font-body">

            {/* Printable Invoice Header Box */}
            <div className="p-6 rounded-2xl bg-white border-2 border-slate-300 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-slate-200 pb-4 gap-2">
                <div>
                  <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">
                    CROWN EXCEL ELECTRONICS
                  </h2>
                  <p className="text-xs font-bold text-slate-500">Enterprise Laptops, Mobile Phones & Gadgets Billing</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="flex items-center gap-2 sm:justify-end flex-wrap">
                    <div className="bg-blue-50 text-[#2563eb] border border-blue-200 font-mono font-bold text-xs px-3 py-1 rounded-lg inline-block">Invoice #{selectedInvoice.invoiceNo || selectedInvoice.id}</div>
                    {isAdmin && <TeamTag team={selectedInvoice.teamId} />}
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-600 mt-1">
                    {new Date(selectedInvoice.date).toLocaleDateString()} • {new Date(selectedInvoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {selectedInvoice.editedBy && (
                    <div className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1 sm:justify-end">
                      <Pencil className="w-3 h-3" /> Edited by {selectedInvoice.editedByName || selectedInvoice.editedBy}
                      {selectedInvoice.editedAt ? ` • ${new Date(selectedInvoice.editedAt).toLocaleString()}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Warranty-registration shortfall + one-click repair. Re-running is safe: serials
                  already on record come back as duplicates and are left untouched. */}
              {(() => {
                const st = regStatus(selectedInvoice);
                if (!st.billed) return null;
                const done = st.missing <= 0;
                if (done && !repairResult) return null;
                return (
                  <div className={`rounded-xl border-2 p-4 space-y-3 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="text-xs font-bold flex items-start gap-2">
                        {done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />}
                        <span className={done ? 'text-emerald-800' : 'text-amber-800'}>
                          {done
                            ? <>All <b>{st.billed}</b> serials on this bill are registered for warranty.</>
                            : <><b>{st.missing}</b> of <b>{st.billed}</b> serials on this bill are <b>not</b> in the warranty registry.</>}
                        </span>
                      </div>
                      {isAdmin && !done && (
                        <button
                          onClick={handleRegisterMissing}
                          disabled={repairing}
                          className="btn btn-primary text-xs py-2 px-4 font-bold disabled:opacity-60 flex items-center gap-2"
                        >
                          {repairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          {repairing ? 'Registering…' : 'Register Missing Serials'}
                        </button>
                      )}
                    </div>
                    {repairResult && (
                      <p className="text-[11px] font-bold text-slate-700">
                        {repairResult.error
                          ? `Could not register: ${repairResult.error}`
                          : `Registered ${repairResult.registered.length} · already on record ${repairResult.duplicates.length}${repairResult.failed.length ? ` · failed ${repairResult.failed.length} (retry when back online)` : ''}.`}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Partner & Bill Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-black text-[10px] tracking-wider block mb-1">Billed To Partner:</span>
                  <div className="font-heading font-black text-base text-slate-900">{customerPrimaryName(selectedInvoice.customer)}</div>
                  {customerSecondaryName(selectedInvoice.customer) && (
                    <div className="font-bold text-slate-600">{customerSecondaryName(selectedInvoice.customer)}</div>
                  )}
                  <div className="font-mono font-bold text-[#2563eb] mt-0.5">{selectedInvoice.customer?.whatsapp}</div>
                  {selectedInvoice.customer?.email && (
                    <div className="text-slate-500 font-medium">{selectedInvoice.customer.email}</div>
                  )}
                </div>
                <div className="sm:text-right space-y-1.5">
                  <div>
                    <span className="text-slate-400 uppercase font-black text-[10px] tracking-wider flex items-center gap-1 sm:justify-end">
                      <User className="w-3 h-3" /> Billed By
                    </span>
                    <div className="font-bold text-slate-800">{selectedInvoice.billedByName || selectedInvoice.billedBy || '—'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase font-black text-[10px] tracking-wider flex items-center gap-1 sm:justify-end">
                      <MapPin className="w-3 h-3" /> Store Location
                    </span>
                    <div className="font-bold text-slate-800">{selectedInvoice.locationName || selectedInvoice.locationId || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Itemized Table — grouped by product: identical units collapse into one row with a
                  Qty and an expandable, ordered serial list (so 100 phones aren't 100 rows). */}
              <div className="border-2 border-slate-300 rounded-xl overflow-x-auto mt-4">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-heading font-black text-[10px] border-b-2 border-slate-300">
                    <tr>
                      <th className="p-3">Product & Model</th>
                      <th className="p-3">Serial Numbers</th>
                      <th className="p-3 text-center w-16">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupInvoiceItems(selectedInvoice.items).map((g) => {
                      const expanded = expandedGroups.has(g.key);
                      const single = g.serials.length <= 1;
                      return (
                        <React.Fragment key={g.key}>
                          <tr
                            className={`hover:bg-slate-50/80 ${single ? '' : 'cursor-pointer'}`}
                            onClick={single ? undefined : () => toggleGroup(g.key)}
                          >
                            <td className="p-3">
                              <div className="font-black text-slate-900 text-sm">{g.name}</div>
                              <div className="text-[11px] font-bold text-slate-500 font-mono">
                                {g.sku ? `${g.sku} • ` : ''}#{g.barcode} ({g.category})
                              </div>
                            </td>
                            <td className="p-3">
                              {single ? (
                                g.serials[0] ? (
                                  <span className="inline-flex items-center gap-1 font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                                    <Shield className="w-3.5 h-3.5 text-[#2563eb]" /> {g.serials[0]}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-semibold italic text-[11px]">No serial recorded</span>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleGroup(g.key); }}
                                  className="inline-flex items-center gap-1.5 font-bold text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-100"
                                >
                                  <Shield className="w-3.5 h-3.5" /> {g.serials.length} serial numbers
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </td>
                            <td className="p-3 text-center font-black text-slate-900 font-mono">{g.qty}</td>
                          </tr>
                          {!single && (
                            <tr className={`${expanded ? '' : 'hidden'} bg-slate-50/60`}>
                              <td colSpan={3} className="px-3 pb-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
                                  {g.serials.map((s, i) => (
                                    <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded px-2 py-1">
                                      <span className="text-slate-400 w-5 text-right">{i + 1}.</span>
                                      <span className="truncate" title={s}>{s}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Active Query Display / Concern Form */}
              {selectedInvoice.query && (
                <div className="p-4 rounded-xl border-2 border-red-200 bg-red-50 text-red-800 space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-black text-xs uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-500" /> Active Query / Concern
                    </span>
                    {selectedInvoice.query.resolved ? (
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded font-bold uppercase">Resolved</span>
                    ) : (
                      <span className="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded font-bold uppercase">Pending Admin Action</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold">"{selectedInvoice.query.note}"</p>
                  <div className="text-[10px] font-bold text-slate-500">
                    Raised by {selectedInvoice.query.raisedByName} ({selectedInvoice.query.raisedBy}) on {new Date(selectedInvoice.query.raisedAt).toLocaleString()}
                    {selectedInvoice.query.resolved && selectedInvoice.query.resolvedBy && (
                      <span className="block mt-1 font-bold text-emerald-700">✓ Resolved by {selectedInvoice.query.resolvedBy} on {new Date(selectedInvoice.query.resolvedAt).toLocaleString()}</span>
                    )}
                  </div>
                  {!selectedInvoice.query.resolved && isAdmin && (
                    <button
                      onClick={async () => {
                        const updated = {
                          ...selectedInvoice,
                          query: {
                            ...selectedInvoice.query,
                            resolved: true,
                            resolvedBy: user?.email || 'Admin',
                            resolvedAt: new Date().toISOString()
                          }
                        };
                        const saved = await storageService.saveInvoice(updated);
                        if (saved) {
                          setSelectedInvoice(saved);
                          loadInvoices();
                        }
                      }}
                      className="btn btn-primary text-xs py-1.5 px-3 font-bold bg-emerald-600 hover:bg-emerald-700 shadow-none border-0 text-white mt-1"
                    >
                      Resolve Query
                    </button>
                  )}
                </div>
              )}

              {(!selectedInvoice.query || selectedInvoice.query.resolved) && (
                <div className="no-print pt-3 mt-4">
                  {!showQueryForm ? (
                    <button
                      type="button"
                      onClick={() => setShowQueryForm(true)}
                      className="btn btn-outline text-amber-700 border-amber-300 hover:bg-amber-50 font-bold text-xs py-2 px-3.5"
                    >
                      ⚠️ Raise Concern / Query
                    </button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <label className="text-[11px] font-black text-amber-800 uppercase tracking-wider block">
                        Describe the concern or mistake with this bill:
                      </label>
                      <textarea
                        value={queryNote}
                        onChange={(e) => setQueryNote(e.target.value)}
                        placeholder="e.g. Scanned device serial numbers are correct, but selected partner is wrong. Need to change partner to Rajesh Kumar."
                        rows={2}
                        className="w-full text-xs font-semibold p-2.5 rounded-lg border border-amber-300 bg-white text-slate-900 focus:outline-none focus:border-amber-500 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowQueryForm(false); setQueryNote(''); }}
                          className="btn btn-outline text-slate-600 py-1.5 px-3 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!queryNote.trim()) return;
                            const updated = {
                              ...selectedInvoice,
                              query: {
                                note: queryNote.trim(),
                                raisedBy: user?.email || 'unknown',
                                raisedByName: user?.displayName || user?.email || 'Staff Member',
                                raisedAt: new Date().toISOString(),
                                resolved: false
                              }
                            };
                            const saved = await storageService.saveInvoice(updated);
                            if (saved) {
                              setSelectedInvoice(saved);
                              setShowQueryForm(false);
                              setQueryNote('');
                              loadInvoices();
                            }
                          }}
                          className="btn btn-primary text-xs py-1.5 px-3 bg-amber-600 hover:bg-amber-700 shadow-none border-0 text-white font-bold"
                        >
                          Submit Query
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="no-print flex flex-wrap items-center justify-end gap-3 pt-4 border-t-2 border-slate-200">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDeleteInvoice(selectedInvoice.id, { stopPropagation: () => {} })}
                  className="btn btn-outline text-red-600 border-red-300 hover:bg-red-50 font-bold py-2.5 px-4 mr-auto"
                >
                  <Trash2 className="w-4 h-4" /> Delete Invoice
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="btn btn-outline font-bold py-2.5 px-5"
              >
                Close
              </button>

              {isInvoiceEditable(selectedInvoice) && (
                <button
                  type="button"
                  onClick={() => startEdit(selectedInvoice)}
                  className="btn btn-outline font-bold py-2.5 px-4"
                  title={`Admins can correct the customer within ${EDIT_WINDOW_HOURS}h of billing`}
                >
                  <Edit3 className="w-4 h-4 text-[#2563eb]" /> Edit Invoice
                </button>
              )}

              <button
                type="button"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportInvoicesXlsx(
                      [selectedInvoice],
                      exportFilename('xlsx', selectedInvoice.invoiceNo || selectedInvoice.id),
                      { ...exportMeta(), scope: `Single bill (${selectedInvoice.invoiceNo || selectedInvoice.id})` }
                    );
                  } catch (err) {
                    alert(`Could not build the Excel file: ${err.message}`);
                  }
                  setExporting(false);
                }}
                className="btn btn-outline font-bold py-2.5 px-4 disabled:opacity-60"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {exporting ? 'Building…' : 'Download Excel'}
              </button>

              <button
                type="button"
                onClick={handlePrintInvoice}
                className="btn btn-primary font-bold py-2.5 px-6 shadow-md"
              >
                <Printer className="w-4 h-4" /> Print Invoice
              </button>
            </div>

          </div>
        )}

        {/* --- ADMIN EDIT MODE (within the edit window; every change is audit-logged) --- */}
        {selectedInvoice && editMode && editForm && (
          <div className="space-y-5 font-body">
            <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200 flex items-start gap-3">
              <Edit3 className="w-5 h-5 text-[#2563eb] flex-shrink-0 mt-0.5" />
              <div className="text-xs font-semibold text-slate-700">
                <span className="font-black text-slate-900">Editing invoice {selectedInvoice.invoiceNo || selectedInvoice.id}.</span> You can correct the
                customer / partner attached to this bill. Scanned items and serial numbers are locked to the warranty
                registry and can't be changed here — for those, delete &amp; re-bill. Every change is recorded in the audit
                trail with your name, the time, and a before/after snapshot.
              </div>
            </div>

            {/* Swap to a different customer from the master */}
            <div className="form-group mb-0 relative">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Swap Customer (search the database)</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={editCustSearch}
                  onChange={(e) => setEditCustSearch(e.target.value)}
                  placeholder="Search by name, mobile, company, or email to attach a different partner..."
                  className="input-field pl-10 py-2.5 text-sm bg-white border-slate-300 font-bold text-slate-900"
                />
              </div>
              {editCustResults.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border-2 border-slate-300 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {editCustResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setEditForm((f) => ({ ...f, customerId: c.id, name: c.name || '', whatsapp: c.whatsapp || '', email: c.email || '', company: c.company || '' }));
                        setEditCustSearch('');
                      }}
                      className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <span className="font-bold text-xs text-slate-900">{customerPrimaryName(c)}{customerSecondaryName(c) ? ` — ${customerSecondaryName(c)}` : ''}</span>
                      <span className="font-mono text-[11px] text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">{c.whatsapp}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Editable snapshot fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Customer Name</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5" required />
              </div>
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Mobile Number</label>
                <input type="text" value={editForm.whatsapp} onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                  className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5" required />
              </div>
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Email (Optional)</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="input-field font-mono font-semibold text-slate-800 bg-white border-slate-300 py-2.5" />
              </div>
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Company (Optional)</label>
                <input type="text" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5" />
              </div>
            </div>

            {/* Required reason — kept in the audit trail */}
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Reason for this edit (required — saved to the audit trail)</label>
              <textarea value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} rows={2}
                placeholder="e.g. Wrong partner attached at billing — corrected to the actual buyer."
                className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5 resize-none" />
            </div>

            {editError && (
              <p className="text-xs font-bold text-red-500 flex items-center gap-1.5" role="alert">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {editError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t-2 border-slate-200">
              <button type="button" onClick={() => { setEditMode(false); setEditForm(null); setEditError(''); }} className="btn btn-outline font-bold px-5 py-2.5">
                Cancel
              </button>
              <button type="button" onClick={handleSaveEdit} className="btn btn-primary font-bold px-6 py-2.5 shadow-md">
                <CheckCircle2 className="w-4 h-4" /> Save &amp; Log Change
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
