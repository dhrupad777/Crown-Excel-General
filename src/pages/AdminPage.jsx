import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  MapPin,
  Plus,
  Edit3,
  ShieldCheck,
  ShieldAlert,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Crown,
  Ban,
  AlertTriangle,
  FileText,
  Shield,
  Archive,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { storageService } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';
import { BOOTSTRAP_ADMIN_EMAILS, DELETION_RETENTION_DAYS } from '../config/appConfig';

const SectionCard = ({ title, subtitle, icon: Icon, accent, actions, children }) => (
  <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
    <div className="p-5 border-b-2 border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Icon className={`w-5 h-5 ${accent}`} />
        <div>
          <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">{title}</h3>
          {subtitle && <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
    {children}
  </div>
);

export const AdminPage = () => {
  const { user } = useAuth();
  const myEmail = (user?.email || '').toLowerCase();

  const [staffList, setStaffList] = useState(() => storageService.getStaff());
  const [locations, setLocations] = useState(() => storageService.getLocations());
  const [invoices, setInvoices] = useState(() => storageService.getInvoices());
  const [archived, setArchived] = useState(() => storageService.getArchivedRecords());

  // Invoice detail modal for active queries
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Staff modal
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({ email: '', displayName: '', role: 'standard', locationId: '', active: true });
  const [staffError, setStaffError] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);

  // Location modal
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: '', code: '', address: '', team: '', active: true });
  const [locationError, setLocationError] = useState('');
  const [locationSaving, setLocationSaving] = useState(false);
  const [addingRegion, setAddingRegion] = useState(false); // toggles the store form's region picker into free-text "add new" mode

  // Audit log + duplicate attempts (fetched on demand)
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [dupAttempts, setDupAttempts] = useState([]);
  const [dupLoading, setDupLoading] = useState(false);

  useEffect(() => {
    const handleDataChange = (e) => {
      const type = e.detail?.type;
      if (!type || type === 'staff' || type === 'all') setStaffList(storageService.getStaff());
      if (!type || type === 'locations' || type === 'all') setLocations(storageService.getLocations());
      if (!type || type === 'invoices' || type === 'all') setInvoices(storageService.getInvoices());
      if (!type || ['products', 'customers', 'invoices', 'all'].includes(type)) setArchived(storageService.getArchivedRecords());
    };
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditEntries(await storageService.fetchAuditLog(200));
    setAuditLoading(false);
  }, []);

  const loadDuplicates = useCallback(async () => {
    setDupLoading(true);
    setDupAttempts(await storageService.fetchDuplicateAttempts(100));
    setDupLoading(false);
  }, []);

  useEffect(() => {
    loadAudit();
    loadDuplicates();
  }, [loadAudit, loadDuplicates]);

  const activeAdmins = staffList.filter((s) => s.role === 'admin' && s.active !== false);

  // --- Archived (soft-deleted) records ---
  const archivedList = [
    ...archived.products.map((r) => ({ collection: 'products', typeLabel: 'Product', id: r.id, label: r.name || r.id, sub: r.barcode ? `#${r.barcode}` : '', deletedBy: r.deletedByName || r.deletedBy, deletedAt: r.deletedAt })),
    ...archived.customers.map((r) => ({ collection: 'customers', typeLabel: 'Customer', id: r.id, label: r.name || r.id, sub: r.whatsapp || '', deletedBy: r.deletedByName || r.deletedBy, deletedAt: r.deletedAt })),
    ...archived.invoices.map((r) => ({ collection: 'invoices', typeLabel: 'Invoice', id: r.id, label: r.id, sub: r.customer ? customerPrimaryName(r.customer) : '', deletedBy: r.deletedByName || r.deletedBy, deletedAt: r.deletedAt }))
  ].sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));

  const purgeDate = (deletedAt) =>
    deletedAt ? new Date(new Date(deletedAt).getTime() + DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000) : null;

  const handleRestore = (rec) => {
    storageService.restoreRecord(rec.collection, rec.id);
    loadAudit();
  };
  const handlePurgeNow = (rec) => {
    if (window.confirm(`Permanently delete this ${rec.typeLabel.toLowerCase()} ("${rec.label}")? This cannot be undone.`)) {
      storageService.purgeRecord(rec.collection, rec.id);
      loadAudit();
    }
  };

  // --- Staff management ---

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({ email: '', displayName: '', role: 'standard', locationId: locations[0]?.id || '', active: true });
    setStaffError('');
    setShowStaffModal(true);
  };

  const openEditStaff = (st) => {
    setEditingStaff(st);
    setStaffForm({
      email: st.email || st.id,
      displayName: st.displayName || '',
      role: st.role || 'standard',
      locationId: st.locationId || '',
      active: st.active !== false
    });
    setStaffError('');
    setShowStaffModal(true);
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    const email = staffForm.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStaffError('Enter a valid Google account email address.');
      return;
    }
    if (!editingStaff && staffList.some((s) => (s.email || s.id) === email)) {
      setStaffError('That email is already on the staff list — edit the existing entry instead.');
      return;
    }

    // Session-integrity guards: never lock yourself out, never orphan the system without an
    // active admin. (Bootstrap admins can always self-heal, but don't rely on that for UX.)
    const isSelf = email === myEmail;
    const wasActiveAdmin = editingStaff && editingStaff.role === 'admin' && editingStaff.active !== false;
    const staysActiveAdmin = staffForm.role === 'admin' && staffForm.active;
    if (isSelf && !staysActiveAdmin) {
      setStaffError('You cannot demote or deactivate your own account while signed in with it.');
      return;
    }
    if (wasActiveAdmin && !staysActiveAdmin && activeAdmins.length <= 1) {
      setStaffError('At least one active administrator must remain — promote someone else first.');
      return;
    }

    setStaffSaving(true);
    setStaffError('');
    try {
      const before = editingStaff ? { ...editingStaff } : null;
      const record = {
        email,
        displayName: staffForm.displayName.trim() || email,
        role: staffForm.role,
        locationId: staffForm.locationId,
        active: staffForm.active,
        addedBy: editingStaff?.addedBy || myEmail
      };
      await storageService.saveStaff(record);
      storageService.appendAudit(editingStaff ? 'staff.update' : 'staff.create', before, record, { entity: 'staff', entityId: email });
      setShowStaffModal(false);
      loadAudit();
    } catch (err) {
      setStaffError(`Could not save: ${err.message}`);
    }
    setStaffSaving(false);
  };

  // --- Location management ---

  const openAddLocation = () => {
    setEditingLocation(null);
    setLocationForm({ name: '', code: '', address: '', team: '', active: true });
    setAddingRegion(false);
    setLocationError('');
    setShowLocationModal(true);
  };

  const openEditLocation = (loc) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name || '', code: loc.code || '', address: loc.address || '', team: loc.team || '', active: loc.active !== false });
    setAddingRegion(false);
    setLocationError('');
    setShowLocationModal(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locationForm.name.trim()) {
      setLocationError('Location name is required.');
      return;
    }
    setLocationSaving(true);
    setLocationError('');
    try {
      const before = editingLocation ? { ...editingLocation } : null;
      const record = {
        id: editingLocation?.id,
        name: locationForm.name.trim(),
        code: locationForm.code.trim().toUpperCase(),
        address: locationForm.address.trim(),
        team: locationForm.team.trim(),
        active: locationForm.active
      };
      const saved = await storageService.saveLocation(record);
      storageService.appendAudit(editingLocation ? 'location.update' : 'location.create', before, saved, { entity: 'location', entityId: saved.id });
      setShowLocationModal(false);
      loadAudit();
    } catch (err) {
      setLocationError(`Could not save: ${err.message}`);
    }
    setLocationSaving(false);
  };

  const filteredAudit = auditEntries.filter((a) => {
    if (!auditFilter.trim()) return true;
    const q = auditFilter.toLowerCase();
    return (
      a.action?.toLowerCase().includes(q) ||
      a.createdBy?.toLowerCase().includes(q) ||
      a.userName?.toLowerCase().includes(q) ||
      a.entityId?.toLowerCase().includes(q)
    );
  });

  const queriedInvoices = invoices.filter(inv => inv.query && !inv.query.resolved);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">

      {/* Active Bill Queries / Concerns */}
      {queriedInvoices.length > 0 && (
        <SectionCard
          title="Pending Bill Concerns & Queries"
          subtitle="Staff members have raised concerns regarding these bills. Review and resolve them."
          icon={AlertTriangle}
          accent="text-red-600"
        >
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[750px]">
              <thead>
                <tr>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Bill ID</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Raised By</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Concern Note</th>
                  <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queriedInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-black text-slate-900 text-sm">{inv.invoiceNo || inv.id}</div>
                      <div className="text-[10px] font-bold text-slate-500">{new Date(inv.date).toLocaleDateString()}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="text-xs font-bold text-slate-800">{inv.query.raisedByName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{inv.query.raisedBy}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-xs font-semibold text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 max-w-lg">
                        {inv.query.note}
                      </p>
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setSelectedInvoice(inv); setShowDetailModal(true); }}
                          className="btn btn-outline text-xs py-1.5 px-3 font-bold"
                        >
                          View Bill
                        </button>
                        <button
                          onClick={async () => {
                            const updated = {
                              ...inv,
                              query: {
                                ...inv.query,
                                resolved: true,
                                resolvedBy: myEmail,
                                resolvedAt: new Date().toISOString()
                              }
                            };
                            await storageService.saveInvoice(updated);
                          }}
                          className="btn btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 shadow-none border-0 font-bold text-white"
                        >
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Staff */}
      <SectionCard
        title="Staff Access Allowlist"
        subtitle="Only these Google accounts can sign in. Roles are changeable here at any time."
        icon={Users}
        accent="text-[#2563eb]"
        actions={
          <button onClick={openAddStaff} className="btn btn-primary text-xs py-2.5 px-4 font-bold shadow-md shadow-blue-500/10 self-start sm:self-auto">
            <UserPlus className="w-4 h-4" /> Add Staff Member
          </button>
        }
      >
        <div className="table-container border-0 rounded-none w-full overflow-x-auto">
          <table className="data-table w-full min-w-[750px]">
            <thead>
              <tr>
                <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Staff Member</th>
                <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Role</th>
                <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Team</th>
                <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider text-center">Status</th>
                <th className="py-3.5 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.length === 0 && (
                <tr><td colSpan={5} className="p-10 text-center text-xs font-semibold text-slate-400">No staff yet — add the first member above.</td></tr>
              )}
              {staffList.map((st) => {
                const email = st.email || st.id;
                return (
                  <tr key={email} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                        {st.displayName || email}
                        {email === myEmail && <span className="text-[9px] font-black uppercase text-[#2563eb] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">You</span>}
                        {BOOTSTRAP_ADMIN_EMAILS.includes(email) && (
                          <span title="Bootstrap admin — can always self-recover access"><Crown className="w-3.5 h-3.5 text-amber-500" /></span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">{email}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      {st.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-[#2563eb] bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
                          <ShieldCheck className="w-3 h-3" /> Administrator
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">Standard User</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-xs font-bold text-slate-700">
                      {storageService.getLocationName(st.locationId) || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {st.active !== false ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase">Active</span>
                      ) : (
                        <span className="bg-red-50 text-red-600 border border-red-200 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase">Deactivated</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => openEditStaff(st)}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors shadow-sm"
                        title="Edit role / location / status"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Teams */}
      <SectionCard
        title="Teams"
        subtitle="Each team is an isolated world — its own products, partners, invoices & serials. Assign staff to a team above. Deactivate instead of deleting."
        icon={MapPin}
        accent="text-emerald-600"
        actions={
          <button onClick={openAddLocation} className="btn btn-primary text-xs py-2.5 px-4 font-bold shadow-md shadow-blue-500/10 self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Add Location
          </button>
        }
      >
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.length === 0 && (
            <p className="text-xs font-semibold text-slate-400 col-span-full text-center py-6">No locations yet.</p>
          )}
          {locations.map((loc) => (
            <div key={loc.id} className={`border-2 rounded-xl p-4 flex items-start justify-between gap-2 ${loc.active !== false ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
              <div>
                <div className="font-heading font-black text-sm text-slate-900 flex items-center gap-2">
                  {loc.name}
                  {loc.code && <span className="font-mono text-[10px] font-bold text-[#2563eb] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">{loc.code}</span>}
                </div>
                {loc.address && <div className="text-[11px] font-semibold text-slate-500 mt-1">{loc.address}</div>}
                <div className="mt-1.5">
                  {loc.team
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Team: {loc.team}</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">No team set</span>}
                </div>
                {loc.active === false && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-red-500 mt-1.5"><Ban className="w-3 h-3" /> Deactivated</span>
                )}
              </div>
              <button
                onClick={() => openEditLocation(loc)}
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors shadow-sm flex-shrink-0"
                title="Edit location"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Audit trail */}
      <SectionCard
        title="Audit Trail"
        subtitle="Complete log of record creation and modification — who, what, and when."
        icon={ScrollText}
        accent="text-purple-600"
        actions={
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <input
              type="text"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              placeholder="Filter by action / user / record..."
              className="input-field py-2 px-3 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-lg w-56"
            />
            <button onClick={loadAudit} disabled={auditLoading} className="btn btn-outline text-xs py-2 px-3 font-bold disabled:opacity-60">
              {auditLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-700" />}
            </button>
          </div>
        }
      >
        {filteredAudit.length === 0 ? (
          <p className="p-10 text-center text-xs font-semibold text-slate-400">
            {auditLoading ? 'Loading audit trail…' : 'No audit entries match.'}
          </p>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="data-table w-full min-w-[750px]">
              <thead>
                <tr>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">When</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">User</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Action</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Record</th>
                  <th className="py-3 px-5 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAudit.map((a) => (
                  <React.Fragment key={a.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                        {a.date ? new Date(a.date).toLocaleString() : ''}
                      </td>
                      <td className="py-3 px-5">
                        <div className="text-xs font-bold text-slate-800">{a.userName || ''}</div>
                        <div className="text-[10px] font-mono font-semibold text-slate-400">{a.createdBy}</div>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${
                          a.action?.includes('create') ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : a.action?.includes('update') ? 'text-amber-700 bg-amber-50 border-amber-200'
                            : 'text-slate-600 bg-slate-100 border-slate-200'
                        }`}>
                          {a.action}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-mono text-xs font-bold text-slate-700">{a.entityId}</td>
                      <td className="py-3 px-5 text-right">
                        {(a.before || a.after) && (
                          <button
                            onClick={() => setExpandedAuditId(expandedAuditId === a.id ? null : a.id)}
                            className="text-[11px] font-bold text-[#2563eb] hover:underline"
                          >
                            {expandedAuditId === a.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedAuditId === a.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Before</span>
                              <pre className="text-[10px] font-mono bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
                                {a.before ? JSON.stringify(a.before, null, 2) : '— (new record)'}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">After</span>
                              <pre className="text-[10px] font-mono bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
                                {a.after ? JSON.stringify(a.after, null, 2) : '—'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Duplicate attempts */}
      <SectionCard
        title="Duplicate Entry Attempts"
        subtitle="Every blocked duplicate scan, with who attempted it and the original registration."
        icon={ShieldAlert}
        accent="text-red-500"
        actions={
          <button onClick={loadDuplicates} disabled={dupLoading} className="btn btn-outline text-xs py-2 px-3 font-bold self-start sm:self-auto disabled:opacity-60">
            {dupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-700" />}
          </button>
        }
      >
        {dupAttempts.length === 0 ? (
          <p className="p-10 text-center text-xs font-semibold text-slate-400">
            {dupLoading ? 'Loading…' : 'No duplicate attempts recorded.'}
          </p>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="data-table w-full min-w-[750px]">
              <thead>
                <tr>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Serial</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Attempted By</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Source</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">When</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Original Registration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dupAttempts.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-5">
                      <span className="font-mono text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">{d.serial}</span>
                    </td>
                    <td className="py-3 px-5 text-xs font-bold text-slate-800">{d.attemptedByName || d.createdBy}</td>
                    <td className="py-3 px-5 text-[10px] font-black uppercase text-slate-600">{d.source}</td>
                    <td className="py-3 px-5 text-[11px] font-bold text-slate-500 whitespace-nowrap">{d.date ? new Date(d.date).toLocaleString() : ''}</td>
                    <td className="py-3 px-5 text-[11px] font-semibold text-slate-600">
                      {d.existing ? `${d.existing.productName || ''}${d.existing.invoiceNo ? ` • ${d.existing.invoiceNo}` : ''}${d.existing.registeredBy ? ` • by ${d.existing.registeredBy}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Archived (soft-deleted) records — recoverable until auto-purge. Nothing is ever lost by accident. */}
      <SectionCard
        title="Archived Records (Recycle Bin)"
        subtitle={`Deleted products, customers and invoices are kept here for ${DELETION_RETENTION_DAYS} days and can be restored. After that an admin session purges them for good.`}
        icon={Archive}
        accent="text-slate-600"
      >
        {archivedList.length === 0 ? (
          <p className="p-10 text-center text-xs font-semibold text-slate-400">Nothing archived — all deletions are recoverable here.</p>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto max-h-[440px] overflow-y-auto">
            <table className="data-table w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Record</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Archived By</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Archived On</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider">Auto-Purge On</th>
                  <th className="py-3 px-5 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedList.map((rec) => (
                  <tr key={`${rec.collection}-${rec.id}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-5">
                      <span className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">{rec.typeLabel}</span>
                    </td>
                    <td className="py-3 px-5">
                      <div className="font-black text-slate-900 text-xs max-w-[240px] truncate" title={rec.label}>{rec.label}</div>
                      {rec.sub && <div className="text-[10px] font-mono font-bold text-slate-500 mt-0.5">{rec.sub}</div>}
                    </td>
                    <td className="py-3 px-5 text-xs font-bold text-slate-700">{rec.deletedBy || '—'}</td>
                    <td className="py-3 px-5 text-[11px] font-bold text-slate-500 whitespace-nowrap">{rec.deletedAt ? new Date(rec.deletedAt).toLocaleString() : '—'}</td>
                    <td className="py-3 px-5 text-[11px] font-bold text-amber-600 whitespace-nowrap">{purgeDate(rec.deletedAt) ? purgeDate(rec.deletedAt).toLocaleDateString() : '—'}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestore(rec)}
                          className="btn btn-outline text-xs py-1.5 px-3 font-bold text-emerald-700 border-emerald-300 hover:bg-emerald-50 flex items-center gap-1"
                          title="Restore this record"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                        <button
                          onClick={() => handlePurgeNow(rec)}
                          className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 transition-colors"
                          title="Delete permanently now"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Staff add/edit modal */}
      <Modal
        isOpen={showStaffModal}
        onClose={() => setShowStaffModal(false)}
        title={editingStaff ? `Edit Staff — ${editingStaff.displayName || editingStaff.email}` : 'Add Staff Member'}
        subtitle="The email must be a Google-sign-in-capable account (Gmail or Google Workspace)."
        icon={Users}
      >
        <form onSubmit={handleSaveStaff} className="space-y-4 font-body">
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Google / Gmail Email</label>
            <input
              type="email"
              value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
              placeholder="staff.member@gmail.com"
              className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5 disabled:bg-slate-100 disabled:text-slate-500"
              disabled={!!editingStaff}
              required
              autoFocus={!editingStaff}
            />
          </div>
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Display Name</label>
            <input
              type="text"
              value={staffForm.displayName}
              onChange={(e) => setStaffForm({ ...staffForm, displayName: e.target.value })}
              placeholder="e.g. Nitesh Bandekar"
              className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">Role</span>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'standard', label: 'Standard User', desc: 'Add new records only' },
                { id: 'admin', label: 'Administrator', desc: 'Edit within 24h, manage staff' }
              ].map((r) => (
                <label key={r.id} className={`p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  staffForm.role === r.id ? 'border-[#2563eb] bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="staff-role"
                      checked={staffForm.role === r.id}
                      onChange={() => setStaffForm({ ...staffForm, role: r.id })}
                      className="accent-[#2563eb]"
                    />
                    <span className="text-xs font-black text-slate-900">{r.label}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1 ml-5">{r.desc}</p>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Team</label>
              <select
                value={staffForm.locationId}
                onChange={(e) => setStaffForm({ ...staffForm, locationId: e.target.value })}
                className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2.5"
              >
                <option value="">None</option>
                {locations.filter((l) => l.active !== false).map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Account Status</label>
              <label className={`input-field py-2.5 flex items-center gap-2 cursor-pointer font-bold ${staffForm.active ? 'text-emerald-700' : 'text-red-600'}`}>
                <input
                  type="checkbox"
                  checked={staffForm.active}
                  onChange={(e) => setStaffForm({ ...staffForm, active: e.target.checked })}
                  className="accent-emerald-600"
                />
                {staffForm.active ? 'Active — can sign in' : 'Deactivated — sign-in blocked'}
              </label>
            </div>
          </div>

          {staffError && (
            <p className="text-xs font-bold text-red-500 flex items-center gap-1.5" role="alert">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {staffError}
            </p>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t-2 border-slate-200 mt-2">
            <button type="button" onClick={() => setShowStaffModal(false)} className="btn btn-outline font-bold px-5 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={staffSaving} className="btn btn-primary font-bold px-6 py-2.5 shadow-md disabled:opacity-60">
              {staffSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingStaff ? 'Update Staff' : 'Add Staff'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Location add/edit modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title={editingLocation ? `Edit Location — ${editingLocation.name}` : 'Add Location'}
        subtitle="Retail outlets and warehouses sharing the one centralized database."
        icon={MapPin}
      >
        <form onSubmit={handleSaveLocation} className="space-y-4 font-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Location Name</label>
              <input
                type="text"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder="e.g. Deira Shop"
                className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
                autoFocus
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Short Code (Optional)</label>
              <input
                type="text"
                value={locationForm.code}
                onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
                placeholder="e.g. DXB1"
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
              />
            </div>
          </div>
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Address (Optional)</label>
            <input
              type="text"
              value={locationForm.address}
              onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
              className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
            />
          </div>
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Team / Region</label>
            {addingRegion ? (
              // Free-text mode: type a brand-new region name (e.g. "Dubai", "Nigeria").
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={locationForm.team}
                  onChange={(e) => setLocationForm({ ...locationForm, team: e.target.value })}
                  placeholder="New region name, e.g. Dubai"
                  className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => { setAddingRegion(false); setLocationForm((f) => ({ ...f, team: '' })); }}
                  className="btn btn-outline text-xs py-2.5 px-3 font-bold whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            ) : (
              // Pick an existing region (so every store in a region shares one dataset — no typo splits),
              // or choose "Add new region…" to define one.
              <select
                value={locationForm.team}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setAddingRegion(true);
                    setLocationForm((f) => ({ ...f, team: '' }));
                  } else {
                    setLocationForm({ ...locationForm, team: e.target.value });
                  }
                }}
                className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
                required
              >
                <option value="">Select region…</option>
                {[...new Set([...storageService.getTeams(), locationForm.team].filter(Boolean))].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__new__">➕ Add new region…</option>
              </select>
            )}
            <p className="text-[10px] font-semibold text-slate-500 mt-1">
              All stores sharing a region see one isolated dataset (products, partners, invoices &amp; serials). Give every Dubai store the same region so they share data.
            </p>
          </div>
          <label className={`input-field py-2.5 flex items-center gap-2 cursor-pointer font-bold ${locationForm.active ? 'text-emerald-700' : 'text-red-600'}`}>
            <input
              type="checkbox"
              checked={locationForm.active}
              onChange={(e) => setLocationForm({ ...locationForm, active: e.target.checked })}
              className="accent-emerald-600"
            />
            {locationForm.active ? 'Active — selectable for new registrations' : 'Deactivated — hidden from new registrations'}
          </label>

          {locationError && (
            <p className="text-xs font-bold text-red-500 flex items-center gap-1.5" role="alert">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {locationError}
            </p>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t-2 border-slate-200 mt-2">
            <button type="button" onClick={() => setShowLocationModal(false)} className="btn btn-outline font-bold px-5 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={locationSaving} className="btn btn-primary font-bold px-6 py-2.5 shadow-md disabled:opacity-60">
              {locationSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingLocation ? 'Update Location' : 'Add Location'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- INVOICE DETAILS MODAL FOR QUERIES --- */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedInvoice ? `Invoice — ${selectedInvoice.invoiceNo || selectedInvoice.id}` : 'Invoice'}
        subtitle={selectedInvoice ? new Date(selectedInvoice.date).toLocaleString() : ''}
        icon={FileText}
        maxWidth="max-w-3xl"
      >
        {selectedInvoice && (
          <div className="space-y-6 font-body">
            <div className="p-6 rounded-2xl bg-white border-2 border-slate-300 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-slate-200 pb-4 gap-2">
                <div>
                  <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">
                    CROWN EXCEL ELECTRONICS
                  </h2>
                  <p className="text-xs font-bold text-slate-500">Enterprise Laptops, Mobile Phones & Gadgets Billing</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="bg-blue-50 text-[#2563eb] border border-blue-200 font-mono font-bold text-xs px-3 py-1 rounded-lg inline-block">Invoice #{selectedInvoice.invoiceNo || selectedInvoice.id}</div>
                  <div className="font-mono text-xs font-bold text-slate-600 mt-1">
                    {new Date(selectedInvoice.date).toLocaleDateString()} • {new Date(selectedInvoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

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
              </div>

              <div className="border-2 border-slate-300 rounded-xl overflow-x-auto mt-4">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-heading font-black text-[10px] border-b-2 border-slate-300">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3">Serial Number</th>
                      <th className="p-3 text-center">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {selectedInvoice.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-3 font-sans">
                          <div className="font-black text-slate-900 text-sm">{item.name}</div>
                          <div className="text-[11px] font-bold text-slate-500 font-mono">#{item.barcode} ({item.category || 'Electronics'})</div>
                        </td>
                        <td className="p-3">
                          {item.imei ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                              <Shield className="w-3.5 h-3.5 text-[#2563eb]" />
                              <span>{item.imei}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-semibold italic text-[11px]">No serial recorded</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-black text-slate-900">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t-2 border-slate-200">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="btn btn-outline font-bold py-2.5 px-5"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
