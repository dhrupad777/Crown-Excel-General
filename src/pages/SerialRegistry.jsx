import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  FileText,
  CalendarRange,
  MapPin,
  User,
  Edit3,
  Layers,
  List,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';
import { SerialCheckModal } from '../components/SerialCheckModal';
import TeamTag from '../components/TeamTag';
import { DateRangeCalendar } from '../components/DateRangeCalendar';
import { useAuth } from '../context/AuthContext';
import { exportSerialsXlsx, exportSerialsCsv, exportSerialsPdf, formatLocalDate } from '../utils/exportUtils';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';
import { EDIT_WINDOW_HOURS } from '../config/appConfig';

const RENDER_CAP_STEP = 200;

export const SerialRegistry = () => {
  const { isAdmin } = useAuth();

  const [serials, setSerials] = useState(() => storageService.getSerials());
  const [staffList, setStaffList] = useState(() => storageService.getStaff());
  const [locations, setLocations] = useState(() => storageService.getLocations());

  // Combinable filters
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all'); // admin-only region (Dubai/Nigeria) filter
  const [locationFilter, setLocationFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all | today | week | month | custom
  const [customRangeStart, setCustomRangeStart] = useState(null);
  const [customRangeEnd, setCustomRangeEnd] = useState(null);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const calendarPopoverRef = useRef(null);

  const [viewMode, setViewMode] = useState('flat'); // flat | grouped
  const [renderCap, setRenderCap] = useState(RENDER_CAP_STEP);
  const [showCheckModal, setShowCheckModal] = useState(false);

  // Admin edit modal
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const handleDataChange = (e) => {
      const type = e.detail?.type;
      if (!type || type === 'serials' || type === 'all') setSerials(storageService.getSerials());
      if (type === 'staff') setStaffList(storageService.getStaff());
      if (type === 'locations') setLocations(storageService.getLocations());
    };
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

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

  // Text match is centralized in storageService.searchSerials; the other dimensions AND on top,
  // mirroring how InvoicesArchive combines its filters.
  const textMatchIds = new Set(storageService.searchSerials(searchQuery).map((s) => s.id));

  const filteredSerials = serials.filter((s) => {
    if (searchQuery.trim() && !textMatchIds.has(s.id)) return false;
    if (isAdmin && teamFilter !== 'all' && (s.teamId || '') !== teamFilter) return false;
    if (locationFilter !== 'all' && s.locationId !== locationFilter) return false;
    if (userFilter !== 'all' && (s.createdBy || '') !== userFilter) return false;

    if (dateFilter !== 'all') {
      const d = new Date(s.date);
      const nowD = new Date();
      if (dateFilter === 'today') return d.toDateString() === nowD.toDateString();
      if (dateFilter === 'week') return d >= new Date(nowD.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'month') return d.getMonth() === nowD.getMonth() && d.getFullYear() === nowD.getFullYear();
      if (dateFilter === 'custom') {
        if (!customRangeStart || !customRangeEnd) return true;
        // Clamp the bare calendar end-day to end-of-day (same off-by-one guard as InvoicesArchive).
        const start = new Date(customRangeStart.getFullYear(), customRangeStart.getMonth(), customRangeStart.getDate(), 0, 0, 0, 0);
        const end = new Date(customRangeEnd.getFullYear(), customRangeEnd.getMonth(), customRangeEnd.getDate(), 23, 59, 59, 999);
        return d >= start && d <= end;
      }
    }
    return true;
  });

  const visibleSerials = filteredSerials.slice(0, renderCap);

  // Grouped-by-model view: model → units, so multiple serials per model are visible at a glance.
  const groupedByModel = (() => {
    if (viewMode !== 'grouped') return [];
    const map = new Map();
    for (const s of filteredSerials) {
      const key = `${s.sku || '—'}|${s.productName || 'Unknown product'}`;
      if (!map.has(key)) map.set(key, { sku: s.sku || '', productName: s.productName || 'Unknown product', records: [] });
      map.get(key).records.push(s);
    }
    return [...map.values()].sort((a, b) => b.records.length - a.records.length);
  })();

  const exportSubtitle = () => {
    const parts = [`${filteredSerials.length} records`];
    if (dateFilter === 'custom' && customRangeStart && customRangeEnd) {
      parts.push(`${formatLocalDate(customRangeStart)} to ${formatLocalDate(customRangeEnd)}`);
    } else if (dateFilter !== 'all') {
      parts.push(dateFilter);
    }
    return `Exported ${new Date().toLocaleString()} • ${parts.join(' • ')}`;
  };

  const exportFilename = (ext) => {
    const datePart = (dateFilter === 'custom' && customRangeStart && customRangeEnd)
      ? `${formatLocalDate(customRangeStart)}_to_${formatLocalDate(customRangeEnd)}`
      : formatLocalDate(new Date());
    return `Crown_Excel_Serial_Registrations_${datePart}.${ext}`;
  };

  const handleExport = async (kind) => {
    if (filteredSerials.length === 0) {
      alert('No registrations match the current filters — nothing to export.');
      return;
    }
    if (kind === 'xlsx') {
      try {
        await exportSerialsXlsx(filteredSerials, exportFilename('xlsx'));
      } catch (err) {
        alert(`Could not build the Excel file: ${err.message}`);
      }
    }
    if (kind === 'csv') exportSerialsCsv(filteredSerials, exportFilename('csv'));
    if (kind === 'pdf') exportSerialsPdf(filteredSerials, exportFilename('pdf'), exportSubtitle());
  };

  const isEditable = (record) =>
    isAdmin && record.date && (Date.now() - new Date(record.date).getTime()) < EDIT_WINDOW_HOURS * 60 * 60 * 1000;

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditForm({
      customerName: record.customer?.name || '',
      customerWhatsapp: record.customer?.whatsapp || '',
      customerEmail: record.customer?.email || '',
      invoiceNo: record.invoiceNo || '',
      locationId: record.locationId || '',
      remarks: record.remarks || ''
    });
    setEditError('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.customerName.trim() || !editForm.customerWhatsapp.trim()) {
      setEditError('Customer name and mobile number are mandatory.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await storageService.updateSerial(editingRecord.id, {
        customer: {
          ...(editingRecord.customer || {}),
          name: editForm.customerName.trim(),
          whatsapp: editForm.customerWhatsapp.trim(),
          email: editForm.customerEmail.trim()
        },
        invoiceNo: editForm.invoiceNo.trim(),
        locationId: editForm.locationId,
        locationName: storageService.getLocationName(editForm.locationId),
        remarks: editForm.remarks.trim()
      });
      setEditingRecord(null);
      setEditForm(null);
    } catch (err) {
      setEditError(
        err.code === 'permission-denied' || String(err.message).includes('permission')
          ? `The ${EDIT_WINDOW_HOURS}-hour edit window for this record has passed — it is now read-only.`
          : `Could not save: ${err.message}`
      );
    }
    setEditSaving(false);
  };

  const dateTabs = [
    { id: 'all', label: 'All Records' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">

      {/* Header + exports */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-[#2563eb]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 shadow-sm">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">Serial Number Registry</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Central warranty registrations across all store locations — {serials.length} serials on record.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setShowCheckModal(true)}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial border-[#2563eb] text-[#2563eb] hover:bg-blue-50"
            title="Upload a list of invoiced serials and see which are already registered"
          >
            <ShieldCheck className="w-4 h-4" /> Check Serials
          </button>
          <button onClick={() => handleExport('xlsx')} className="btn btn-primary text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial shadow-md shadow-blue-500/10">
            <FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)
          </button>
          <button onClick={() => handleExport('csv')} className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial">
            <Download className="w-4 h-4 text-slate-700" /> CSV
          </button>
          <button onClick={() => handleExport('pdf')} className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial">
            <FileText className="w-4 h-4 text-slate-700" /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3">

          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Serial, Customer, Mobile, Email, Invoice #, Model, Product... (partial matches supported)"
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Non-admins only ever see their own team's serials (the sync is team-scoped), so both
                pickers are admin-only. Region narrows to a team (Dubai/Nigeria); Location narrows
                further to a single store within any team. */}
            {isAdmin && (
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="input-field pl-8 pr-8 py-2.5 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-xl"
                  title="Filter by team / region"
                >
                  <option value="all">All Teams</option>
                  {storageService.getTeams().map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </div>
            )}

            {isAdmin && (
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="input-field pl-8 pr-8 py-2.5 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-xl"
                  title="Filter by store location"
                >
                  <option value="all">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="input-field pl-8 pr-8 py-2.5 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-xl"
              >
                <option value="all">All Users</option>
                {staffList.map((st) => (
                  <option key={st.email || st.id} value={(st.email || st.id || '').toLowerCase()}>
                    {st.displayName || st.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border-2 border-slate-300">
              <button
                onClick={() => setViewMode('flat')}
                title="Flat list — one row per serial"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${viewMode === 'flat' ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:bg-white/80'}`}
              >
                <List className="w-3.5 h-3.5" /> Flat
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                title="Grouped — serials stacked under their product model"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${viewMode === 'grouped' ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:bg-white/80'}`}
              >
                <Layers className="w-3.5 h-3.5" /> By Model
              </button>
            </div>
          </div>
        </div>

        {/* Date range tabs + calendar (same pattern/clamping as InvoicesArchive) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative" ref={calendarPopoverRef}>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-300 overflow-x-auto shadow-inner">
              {dateTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateFilter(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all whitespace-nowrap text-center ${
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
                className={`px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all whitespace-nowrap text-center flex items-center justify-center gap-1.5 ${
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
              <div className="absolute z-30 top-full left-0 mt-2">
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

          <span className="text-xs font-bold text-slate-500">
            Showing <b className="text-slate-900">{Math.min(renderCap, filteredSerials.length)}</b> of{' '}
            <b className="text-slate-900">{filteredSerials.length}</b> matching registrations
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {filteredSerials.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-slate-400 animate-pulse" />
            <div className="font-heading font-black text-slate-800 text-lg">No registrations found</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              Adjust the filters above, or register serials from the Serial Capture screen.
            </p>
          </div>
        ) : viewMode === 'grouped' ? (
          <div className="divide-y divide-slate-200">
            {groupedByModel.map((group) => (
              <div key={`${group.sku}|${group.productName}`} className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <span className="font-heading font-black text-sm text-slate-900">{group.productName}</span>
                    {group.sku && (
                      <span className="ml-2 font-mono text-[11px] font-bold text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {group.sku}
                      </span>
                    )}
                  </div>
                  <span className="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-3 py-1 rounded-full text-xs">
                    {group.records.length} unit{group.records.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.records.map((s) => (
                    <span
                      key={s.id}
                      title={`${s.customer ? customerPrimaryName(s.customer) : ''} • ${s.invoiceNo || 'no invoice'} • ${s.date ? new Date(s.date).toLocaleString() : ''}`}
                      className="font-mono text-[11px] font-bold text-slate-800 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg"
                    >
                      {s.serial}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Serial Number</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Product / Model</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Customer</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Invoice #</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Location</th>
                  {isAdmin && <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Team</th>}
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Registered By</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Date &amp; Time</th>
                  <th className="py-4 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Remarks</th>
                  {isAdmin && <th className="py-4 px-4 w-14"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSerials.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> {s.serial}
                      </span>
                      {s.updatedBy && (
                        <span className="ml-1.5 text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title={`Edited by ${s.updatedBy}`}>
                          Edited
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-black text-slate-900 text-xs max-w-[220px] truncate" title={s.productName}>{s.productName}</div>
                      <div className="text-[10px] font-bold text-slate-500 font-mono mt-0.5">{s.sku || s.barcode || ''}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-xs">{customerPrimaryName(s.customer)}</div>
                      {customerSecondaryName(s.customer) && (
                        <div className="text-[10px] font-semibold text-slate-500">{customerSecondaryName(s.customer)}</div>
                      )}
                      <div className="text-[10px] font-mono font-bold text-[#2563eb] mt-0.5">{s.customer?.whatsapp}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                      {s.invoiceNo || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-bold text-slate-700">{s.locationName || s.locationId}</td>
                    {isAdmin && (
                      <td className="py-3.5 px-4">
                        <TeamTag team={s.teamId} />
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <div className="text-xs font-bold text-slate-700">{s.registeredByName || s.createdBy}</div>
                      {s.source === 'billing' && (
                        <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">via billing</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      {s.date ? `${new Date(s.date).toLocaleDateString()} ${new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] font-semibold text-slate-600 max-w-[160px] truncate" title={s.remarks}>
                      {s.remarks || <span className="text-slate-300">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right">
                        {isEditable(s) && (
                          <button
                            onClick={() => openEdit(s)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors shadow-sm"
                            title={`Edit (within ${EDIT_WINDOW_HOURS}h of entry)`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'flat' && filteredSerials.length > renderCap && (
          <div className="p-4 border-t-2 border-slate-200 text-center">
            <button
              onClick={() => setRenderCap((c) => c + RENDER_CAP_STEP)}
              className="btn btn-outline text-xs font-bold px-6 py-2.5"
            >
              Show {Math.min(RENDER_CAP_STEP, filteredSerials.length - renderCap)} more
            </button>
          </div>
        )}
      </div>

      {/* Admin edit modal */}
      <Modal
        isOpen={!!editingRecord}
        onClose={() => { setEditingRecord(null); setEditForm(null); }}
        title={editingRecord ? `Edit Registration — ${editingRecord.serial}` : 'Edit'}
        subtitle={`Admins can correct contact/context fields within ${EDIT_WINDOW_HOURS} hours of entry. The serial number itself cannot change — to fix a wrong serial, register the correct one.`}
        icon={Edit3}
      >
        {editForm && (
          <form onSubmit={handleSaveEdit} className="space-y-4 font-body">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Customer Name</label>
              <input
                type="text"
                value={editForm.customerName}
                onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={editForm.customerWhatsapp}
                  onChange={(e) => setEditForm({ ...editForm, customerWhatsapp: e.target.value })}
                  className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
                  required
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                  className="input-field font-mono font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={editForm.invoiceNo}
                  onChange={(e) => setEditForm({ ...editForm, invoiceNo: e.target.value })}
                  className="input-field font-mono font-bold text-slate-900 bg-white border-slate-300 py-2.5"
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Location</label>
                <select
                  value={editForm.locationId}
                  onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}
                  className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2.5"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Remarks</label>
              <textarea
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                rows={2}
                className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5 resize-none"
              />
            </div>

            {editError && (
              <p className="text-xs font-bold text-red-500 flex items-center gap-1.5" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {editError}
              </p>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t-2 border-slate-200 mt-2">
              <button
                type="button"
                onClick={() => { setEditingRecord(null); setEditForm(null); }}
                className="btn btn-outline font-bold px-5 py-2.5"
              >
                Cancel
              </button>
              <button type="submit" disabled={editSaving} className="btn btn-primary font-bold px-6 py-2.5 shadow-md disabled:opacity-60">
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      <SerialCheckModal isOpen={showCheckModal} onClose={() => setShowCheckModal(false)} />
    </div>
  );
};
