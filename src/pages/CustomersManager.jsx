import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  Edit3,
  Download,
  Phone,
  Mail,
  Building,
  User,
  Check,
  FileSpreadsheet,
  FileText,
  Upload
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';
import { ImportExcelModal } from '../components/ImportExcelModal';
import TeamTag from '../components/TeamTag';
import { importCustomers, CUSTOMER_TEMPLATE_HEADERS } from '../utils/importUtils';
import { exportToCsv, exportToXlsx, exportToPdf, formatLocalDate } from '../utils/exportUtils';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';
import { useAuth } from '../context/AuthContext';

export const CustomersManager = () => {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all'); // admin-only cross-team filter
  const [showImportModal, setShowImportModal] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    whatsapp: '',
    email: '',
    team: ''
  });

  const loadCustomers = () => {
    setCustomers(storageService.getCustomers());
  };

  useEffect(() => {
    loadCustomers();
    const handleDataChange = () => loadCustomers();
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  // Filter customers
  const filteredCustomers = customers.filter(c => {
    if (isAdmin && teamFilter !== 'all' && (c.teamId || '') !== teamFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.whatsapp?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  // Handle Save
  const handleSaveCustomer = (e) => {
    e.preventDefault();
    if (!formData.company.trim()) return;

    // Admins aren't bound to one region, so they choose which team owns this partner —
    // otherwise it saves untagged. Standard staff have their region stamped automatically.
    if (isAdmin && !formData.team) {
      alert('Please select which region (team) this partner belongs to.');
      return;
    }

    const { team, ...customerFields } = formData;
    storageService.saveCustomer({
      ...customerFields,
      teamId: team || undefined,
      id: editingCustomer ? editingCustomer.id : undefined,
      ordersCount: editingCustomer ? editingCustomer.ordersCount : 0
    });

    loadCustomers();
    setShowModal(false);
    setEditingCustomer(null);
  };

  // Handle Delete
  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete customer "${name}"?`)) {
      storageService.deleteCustomer(id);
      loadCustomers();
    }
  };

  // Open Edit Modal
  const handleEdit = (cust) => {
    setEditingCustomer(cust);
    setFormData({
      name: cust.name || '',
      company: cust.company || '',
      whatsapp: cust.whatsapp || '',
      email: cust.email || '',
      team: cust.teamId || ''
    });
    setShowModal(true);
  };

  // Open Create Modal
  const handleCreateNew = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      company: '',
      whatsapp: '',
      email: '',
      team: storageService.getCurrentTeamId() || ''
    });
    setShowModal(true);
  };

  // "Region" is included so an export can be re-imported without losing which team owns each partner.
  const exportHeaders = ["ID", "Customer Name", "Company", "WhatsApp / Phone", "Email", "Region", "Total Orders"];
  const exportRows = () => customers.map(c => [
    c.id,
    c.name,
    c.company || '',
    c.whatsapp,
    c.email || '',
    c.teamId || '',
    c.ordersCount || 0
  ]);

  const handleExport = async (kind) => {
    if (customers.length === 0) return;
    const base = `Crown_Excel_Customers_${formatLocalDate(new Date())}`;
    if (kind === 'csv') exportToCsv({ filename: `${base}.csv`, headers: exportHeaders, rows: exportRows() });
    if (kind === 'xlsx') {
      try {
        await exportToXlsx({
          filename: `${base}.xlsx`,
          subtitle: `Customer Master · ${customers.length} customers · Generated ${new Date().toLocaleString()}`,
          sheets: [{ name: 'Customers', headers: exportHeaders, rows: exportRows() }]
        });
      } catch (err) {
        alert(`Could not build the Excel file: ${err.message}`);
      }
    }
    if (kind === 'pdf') exportToPdf({
      filename: `${base}.pdf`,
      title: 'Crown Excel — Customer Master',
      subtitle: `Exported ${new Date().toLocaleString()} • ${customers.length} customers`,
      headers: exportHeaders,
      rows: exportRows()
    });
  };

  const handleImport = async (rows, options) => {
    const result = await importCustomers(rows, options);
    storageService.appendAudit('import.customers', null, {
      created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length
    }, { entity: 'customers', entityId: 'bulk-import' });
    loadCustomers();
    return result;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">
      
      {/* Header & Actions */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-[#2563eb]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 shadow-sm font-bold">
            <Users className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">
                Customer CRM Database
              </h2>
              <span className="bg-blue-100 text-[#2563eb] font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">VIP CLIENTS</span>
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Manage WhatsApp contact details and electronics purchase histories. Matched instantly during billing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {isAdmin && (
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
              title="Bulk import the customer master from Excel"
            >
              <Upload className="w-4 h-4 text-slate-700" /> Import Excel
            </button>
          )}
          <button
            onClick={() => handleExport('xlsx')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export customer list as Excel workbook"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-700" /> Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export customer list as CSV"
          >
            <Download className="w-4 h-4 text-slate-700" /> CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export customer list as PDF"
          >
            <FileText className="w-4 h-4 text-slate-700" /> PDF
          </button>
          <button
            onClick={handleCreateNew}
            className="btn btn-primary text-xs py-2.5 px-5 font-bold flex-1 sm:flex-initial shadow-md shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" /> Add New Customer
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by Name, WhatsApp Number, Company, or Email..."
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
            className="input-field py-2.5 px-3 text-sm bg-white border-slate-400 font-bold text-slate-800 rounded-xl w-full sm:w-56"
            title="Filter by team — admins see every team"
          >
            <option value="all">All Teams</option>
            {storageService.getTeams().map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-bold text-slate-500 pt-3 border-t-2 border-slate-200 gap-2">
          <span className="flex items-center gap-1.5 text-[#2563eb]">
            <Check className="w-4 h-4" /> Instant Customer Matching Active
          </span>
          <span>Showing <b className="text-slate-900">{filteredCustomers.length}</b> of <b className="text-slate-900">{customers.length}</b> total customers</span>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {filteredCustomers.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <Users className="w-12 h-12 mx-auto text-slate-400 animate-pulse" />
            <div className="font-heading font-black text-slate-800 text-lg">No customers found</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              No customers match your search query. Click "Add New Customer" above to register one.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Company & Contact</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">WhatsApp / Phone #</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Email Address</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider text-center">Total Bills</th>
                  {isAdmin && <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Team</th>}
                  {isAdmin && <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="font-heading font-black text-slate-900 text-sm flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-[#2563eb]" />
                        <span>{customerPrimaryName(cust)}</span>
                      </div>
                      {customerSecondaryName(cust) && (
                        <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{customerSecondaryName(cust)}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="inline-flex items-center gap-1.5 font-mono text-xs text-[#2563eb] bg-blue-50 px-3 py-1 rounded-lg border border-blue-200 font-bold">
                        <Phone className="w-3.5 h-3.5 text-[#2563eb]" />
                        <span>{cust.whatsapp}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {cust.email ? (
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cust.email}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold italic">No email provided</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center font-mono text-xs font-bold text-slate-800">
                      <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-1 rounded-full border border-slate-200">{cust.ordersCount || 0} bills</span>
                    </td>
                    {isAdmin && (
                      <td className="py-4 px-6">
                        <TeamTag team={cust.teamId} />
                      </td>
                    )}
                    {isAdmin && (
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(cust)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors"
                            title="Edit Customer Details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cust.id, customerPrimaryName(cust))}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 transition-colors"
                            title="Delete Customer (admin only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- ADD / EDIT CUSTOMER MODAL --- */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? `Edit Customer — ${customerPrimaryName(editingCustomer)}` : 'Register New Customer'}
        subtitle="Customer details will be indexed for instant autocomplete during billing."
        icon={Users}
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4 font-body">
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Company / Business Name</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="e.g. Omega Construction Ltd"
              className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              autoFocus
              required
            />
          </div>

          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Partner / Contact Name (Optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Rajesh Kumar"
              className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">WhatsApp / Phone # (Optional)</label>
              <input
                type="text"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="+91 98765 43210"
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Email Address (Optional)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="rajesh@omega.com"
                className="input-field font-mono font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
              />
            </div>
          </div>

          {/* Admins aren't tied to one region, so they choose which team owns this partner. Standard
              staff don't see this — their own region is stamped automatically. */}
          {isAdmin && (
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                Region / Team <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2.5"
                required
              >
                <option value="">Select region…</option>
                {storageService.getTeams().map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t-2 border-slate-200 mt-6">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn btn-outline font-bold px-5 py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary font-bold px-6 py-2.5"
            >
              <Check className="w-4 h-4" /> {editingCustomer ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- BULK IMPORT MODAL (admin only) --- */}
      <ImportExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityLabel="Customer Master"
        templateHeaders={CUSTOMER_TEMPLATE_HEADERS}
        onImport={handleImport}
      />

    </div>
  );
};
