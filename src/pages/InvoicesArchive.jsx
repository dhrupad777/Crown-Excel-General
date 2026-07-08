import React, { useState, useEffect, useRef } from 'react';
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
  Smartphone,
  CalendarRange,
  AlertTriangle,
  ChevronDown,
  MapPin,
  User
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';
import { DateRangeCalendar } from '../components/DateRangeCalendar';
import { exportInvoicesXlsx, exportInvoicesCsv, formatLocalDate } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';

export const InvoicesArchive = ({ initialInvoiceId }) => {
  const { isAdmin, user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customRangeStart, setCustomRangeStart] = useState(null);
  const [customRangeEnd, setCustomRangeEnd] = useState(null);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const calendarPopoverRef = useRef(null);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryNote, setQueryNote] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  // Opens an invoice's detail modal from a clean state (collapsed serial groups, no query form).
  const openInvoice = (inv) => {
    setSelectedInvoice(inv);
    setExpandedGroups(new Set());
    setShowQueryForm(false);
    setQueryNote('');
    setShowDetailModal(true);
  };

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

  const filteredInvoices = invoices.filter((inv) => {
    // 1. Search Query
    if (searchQuery.trim() && !searchMatchIds.has(inv.id)) return false;

    // 2. Date Filter
    if (dateFilter !== 'all') {
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
    }

    return true;
  });

  // Item-level matches for the "Matching Items" view — see storageService.searchInvoiceItems.
  // Deliberately not scoped to the active date-filter tab: it answers "show me every sale
  // matching this, ever," mirroring how the serial warranty lookup is already time-independent.
  const matchingItems = searchQuery.trim() ? storageService.searchInvoiceItems(searchQuery) : [];

  // Totals of Filtered Records
  const totalFilteredItems = filteredInvoices.reduce((acc, inv) => acc + (inv.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0), 0);
  const openQueryCount = filteredInvoices.filter((i) => i.query && !i.query.resolved).length;

  // Handle Delete
  const handleDeleteInvoice = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this invoice record?")) {
      storageService.deleteInvoice(id);
      loadInvoices();
      if (selectedInvoice && selectedInvoice.id === id) {
        setShowDetailModal(false);
      }
    }
  };

  // Export metadata + filename shared by every invoice export (bulk and per-invoice).
  const exportMeta = () => ({
    dateFilter: (dateFilter === 'custom' && customRangeStart && customRangeEnd)
      ? `${formatLocalDate(customRangeStart)} to ${formatLocalDate(customRangeEnd)}`
      : (dateFilter === 'all' ? 'All records' : dateFilter)
  });
  const exportFilename = (ext, tag) => {
    const datePart = (dateFilter === 'custom' && customRangeStart && customRangeEnd)
      ? `${formatLocalDate(customRangeStart)}_to_${formatLocalDate(customRangeEnd)}`
      : formatLocalDate(new Date());
    return `Crown_Excel_Invoices${tag ? '_' + tag : ''}_${datePart}.${ext}`;
  };

  // Full Excel workbook (Invoice Summary + Serial Details + Report Info) for the filtered set.
  const handleExportExcel = () => {
    if (filteredInvoices.length === 0) { alert("No invoices to export."); return; }
    exportInvoicesXlsx(filteredInvoices, exportFilename('xlsx'), exportMeta());
  };
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) { alert("No invoices to export."); return; }
    exportInvoicesCsv(filteredInvoices, exportFilename('csv'), exportMeta());
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
            className="btn btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
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
                    {invoice.id} • {new Date(invoice.date).toLocaleDateString()}
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-0.5">{invoice.customer?.name || 'Unknown'}</div>
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
                      <div className="font-heading font-black text-slate-900 text-sm flex items-center gap-2">
                        <span>{inv.id}</span>
                        {inv.query && !inv.query.resolved && (
                          <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 border border-red-200 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-red-500" /> Query
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {new Date(inv.date).toLocaleDateString()} • {new Date(inv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-black text-slate-900 text-sm">{inv.customer?.name || 'Unknown'}</div>
                      <div className="font-mono text-xs font-bold text-[#2563eb] mt-0.5">{inv.customer?.whatsapp || ''}</div>
                    </td>
                    <td className="py-4 px-6 text-center font-mono text-slate-700">
                      <span className="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-3 py-1 rounded-full text-xs">{inv.items?.length || 0} items</span>
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

      {/* --- INVOICE DETAILS & PRINT MODAL --- */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedInvoice ? `Invoice — ${selectedInvoice.id}` : 'Invoice'}
        subtitle={selectedInvoice ? new Date(selectedInvoice.date).toLocaleString() : ''}
        icon={FileText}
        maxWidth="max-w-3xl"
      >
        {selectedInvoice && (
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
                  <div className="bg-blue-50 text-[#2563eb] border border-blue-200 font-mono font-bold text-xs px-3 py-1 rounded-lg inline-block">Invoice #{selectedInvoice.id}</div>
                  <div className="font-mono text-xs font-bold text-slate-600 mt-1">
                    {new Date(selectedInvoice.date).toLocaleDateString()} • {new Date(selectedInvoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {/* Partner & Bill Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-black text-[10px] tracking-wider block mb-1">Billed To Partner:</span>
                  <div className="font-heading font-black text-base text-slate-900">{selectedInvoice.customer?.name}</div>
                  {selectedInvoice.customer?.company && (
                    <div className="font-bold text-slate-600">{selectedInvoice.customer.company}</div>
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
                                  className="no-print inline-flex items-center gap-1.5 font-bold text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-100"
                                >
                                  <Shield className="w-3.5 h-3.5" /> {g.serials.length} serial numbers
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </td>
                            <td className="p-3 text-center font-black text-slate-900 font-mono">{g.qty}</td>
                          </tr>
                          {!single && (
                            <tr className={`${expanded ? '' : 'hidden'} print:!table-row bg-slate-50/60`}>
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

              <button
                type="button"
                onClick={() => exportInvoicesXlsx([selectedInvoice], exportFilename('xlsx', selectedInvoice.id), exportMeta())}
                className="btn btn-outline font-bold py-2.5 px-4"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Download Excel
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
      </Modal>

    </div>
  );
};
