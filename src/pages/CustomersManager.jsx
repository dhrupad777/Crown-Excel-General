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
  ShoppingBag,
  DollarSign,
  Check
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';

export const CustomersManager = () => {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    whatsapp: '',
    email: ''
  });

  const loadCustomers = () => {
    setCustomers(storageService.getCustomers());
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Filter customers
  const filteredCustomers = customers.filter(c => {
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
    if (!formData.name || !formData.whatsapp) return;

    storageService.saveCustomer({
      ...formData,
      id: editingCustomer ? editingCustomer.id : undefined,
      totalSpent: editingCustomer ? editingCustomer.totalSpent : 0,
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
      email: cust.email || ''
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
      email: ''
    });
    setShowModal(true);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (customers.length === 0) return;
    const headers = ["ID", "Customer Name", "Company", "WhatsApp / Phone", "Email", "Total Orders", "Total Spent ($)"];
    const rows = customers.map(c => [
      c.id,
      `"${c.name}"`,
      `"${c.company || ''}"`,
      `"${c.whatsapp}"`,
      `"${c.email || ''}"`,
      c.ordersCount || 0,
      c.totalSpent?.toFixed(2) || '0.00'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Crown_Excel_Customers_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header & Actions */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-md">
            <Users className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-2xl text-white tracking-tight">
                Customer CRM Database
              </h2>
              <span className="badge badge-warning text-[10px]">VIP CLIENTS</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage WhatsApp contact details and electronics purchase histories. Matched instantly during billing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportCSV}
            className="btn btn-outline text-xs py-2.5 flex-1 sm:flex-initial"
            title="Export customer list to spreadsheet"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleCreateNew}
            className="btn btn-secondary text-xs py-2.5 flex-1 sm:flex-initial shadow-lg shadow-cyan-500/20"
          >
            <UserPlus className="w-4 h-4" /> Add New Customer
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-panel p-5 space-y-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by Name, WhatsApp Number, Company, or Email..."
            className="input-field pl-10 pr-4 py-2.5 text-sm bg-slate-900 border-amber-500/30 focus:border-amber-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <span>⚡ Instant Customer Matching Active</span>
          <span>Showing <b>{filteredCustomers.length}</b> of <b>{customers.length}</b> total customers</span>
        </div>
      </div>

      {/* Customers Table */}
      <div className="glass-panel overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <Users className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
            <div className="font-heading font-semibold text-slate-300 text-base">No customers found</div>
            <p className="text-xs max-w-md mx-auto">
              No customers match your search query. Click "Add New Customer" above to register one.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Customer Name & Company</th>
                  <th>WhatsApp / Phone #</th>
                  <th>Email Address</th>
                  <th className="text-center">Total Bills</th>
                  <th className="text-right">Total Value</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-800/60 transition-colors group">
                    <td>
                      <div className="font-heading font-bold text-white text-sm">{cust.name}</div>
                      {cust.company && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-amber-400" />
                          <span>{cust.company}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20 font-bold">
                        <Phone className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{cust.whatsapp}</span>
                      </div>
                    </td>
                    <td>
                      {cust.email ? (
                        <div className="text-xs text-slate-300 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cust.email}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No email provided</span>
                      )}
                    </td>
                    <td className="text-center font-mono text-xs text-slate-300">
                      <span className="badge badge-info">{cust.ordersCount || 0} bills</span>
                    </td>
                    <td className="text-right font-mono font-black text-emerald-400 text-base">
                      ${(cust.totalSpent || 0).toFixed(2)}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(cust)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 transition-colors"
                          title="Edit Customer Details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cust.id, cust.name)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete Customer"
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
      </div>

      {/* --- ADD / EDIT CUSTOMER MODAL --- */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? `Edit Customer — ${editingCustomer.name}` : 'Register New Customer'}
        subtitle="Customer details will be indexed for instant autocomplete during billing."
        icon={Users}
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="form-group mb-0">
            <label className="form-label">Customer / Contact Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Rajesh Kumar"
              className="input-field font-semibold"
              autoFocus
              required
            />
          </div>

          <div className="form-group mb-0">
            <label className="form-label">Company / Business Name (Optional)</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="e.g. Omega Construction Ltd"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="form-label">WhatsApp / Phone #</label>
              <input
                type="text"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="+91 98765 43210"
                className="input-field font-mono font-bold text-cyan-400"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Email Address (Optional)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="rajesh@omega.com"
                className="input-field font-mono"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-white/10 mt-6">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
            >
              <Check className="w-4 h-4" /> {editingCustomer ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
