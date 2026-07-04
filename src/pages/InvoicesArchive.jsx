import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FileText, 
  Printer, 
  Download, 
  Trash2, 
  Calendar, 
  User, 
  DollarSign, 
  Filter, 
  Eye, 
  CheckCircle2,
  ExternalLink,
  Archive,
  Shield,
  Smartphone
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';

export const InvoicesArchive = ({ initialInvoiceId }) => {
  const [invoices, setInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month'
  
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Load Invoices
  const loadInvoices = () => {
    const data = storageService.getInvoices();
    setInvoices(data);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  // Open specific invoice if requested via initialInvoiceId
  useEffect(() => {
    if (initialInvoiceId) {
      const inv = storageService.getInvoiceById(initialInvoiceId);
      if (inv) {
        setSelectedInvoice(inv);
        setShowDetailModal(true);
      }
    }
  }, [initialInvoiceId]);

  // Filtered Invoices
  const filteredInvoices = invoices.filter((inv) => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRef = inv.whatsappRef?.toLowerCase().includes(q) || inv.id?.toLowerCase().includes(q);
      const matchCust = inv.customer?.name?.toLowerCase().includes(q) || inv.customer?.whatsapp?.toLowerCase().includes(q) || inv.customer?.company?.toLowerCase().includes(q);
      const matchItems = inv.items?.some(item => 
        item.name?.toLowerCase().includes(q) || 
        item.barcode?.toLowerCase().includes(q) ||
        item.imei?.toLowerCase().includes(q)
      );
      if (!matchRef && !matchCust && !matchItems) return false;
    }

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
    }

    return true;
  });

  // Totals of Filtered Records
  const totalFilteredRevenue = filteredInvoices.reduce((acc, inv) => acc + (inv.total || 0), 0);
  const totalFilteredItems = filteredInvoices.reduce((acc, inv) => acc + (inv.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0), 0);

  // Handle Delete
  const handleDeleteInvoice = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this warranty invoice record?")) {
      storageService.deleteInvoice(id);
      loadInvoices();
      if (selectedInvoice && selectedInvoice.id === id) {
        setShowDetailModal(false);
      }
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      alert("No invoices to export.");
      return;
    }

    const headers = ["Invoice ID", "WhatsApp Ref", "Date", "Customer Name", "WhatsApp Number", "Devices Count", "IMEI / Serials Recorded", "Subtotal ($)", "Tax ($)", "Discount ($)", "Total Paid ($)", "Notes"];
    const rows = filteredInvoices.map(inv => [
      inv.id,
      inv.whatsappRef || '',
      new Date(inv.date).toLocaleString(),
      `"${inv.customer?.name || ''}"`,
      `"${inv.customer?.whatsapp || ''}"`,
      inv.items?.length || 0,
      `"${inv.items?.map(i => i.imei ? `${i.name}: [${i.imei}]` : '').filter(Boolean).join('; ') || 'N/A'}"`,
      inv.subtotal?.toFixed(2) || '0.00',
      inv.taxAmount?.toFixed(2) || '0.00',
      inv.discount?.toFixed(2) || '0.00',
      inv.total?.toFixed(2) || '0.00',
      `"${inv.notes || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Crown_Excel_Electronics_Invoices_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Invoice Function
  const handlePrintInvoice = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-5 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 border-l-4 border-l-emerald-500 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Filtered Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-heading font-black text-2xl text-white font-mono mt-2">
            ${totalFilteredRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">Across {filteredInvoices.length} warranty bills</div>
        </div>

        <div className="glass-panel p-5 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-slate-950 border-l-4 border-l-cyan-500 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Invoices Count</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="font-heading font-black text-2xl text-white font-mono mt-2">
            {filteredInvoices.length}
          </div>
          <div className="text-[11px] text-cyan-400 mt-1">Total indexed records</div>
        </div>

        <div className="glass-panel p-5 bg-gradient-to-br from-purple-500/15 via-slate-900 to-slate-950 border-l-4 border-l-purple-500 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Devices Sold</span>
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-heading font-black text-2xl text-white font-mono mt-2">
            {totalFilteredItems}
          </div>
          <div className="text-[11px] text-purple-400 mt-1">Laptops, phones & gadgets</div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-center gap-2 border-l-4 border-l-slate-600 shadow-lg">
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary w-full py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md"
          >
            <Download className="w-4 h-4" /> Export Invoices & IMEIs (CSV)
          </button>
          <div className="text-[10px] text-center text-slate-400 font-medium">
            Includes warranty serial numbers
          </div>
        </div>
      </div>

      {/* Queryable Search Bar & Filters */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Instant Search Box */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by WhatsApp Ref, Customer, IMEI / Serial #, Model..."
              className="input-field pl-10 pr-4 py-2.5 text-sm bg-slate-900 border-emerald-500/30 focus:border-emerald-500 font-medium"
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

          {/* Date Range Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-2xl border border-white/10 w-full md:w-auto overflow-x-auto shadow-inner">
            {[
              { id: 'all', label: 'All Records' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDateFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-heading font-semibold transition-all whitespace-nowrap ${
                  dateFilter === tab.id 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 scale-105' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <span>⚡ Instant 0ms Local Query Engine Active</span>
          <span>Showing <b>{filteredInvoices.length}</b> of <b>{invoices.length}</b> total warranty invoices</span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="glass-panel overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <FileText className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
            <div className="font-heading font-semibold text-slate-300 text-base">No matching invoices found</div>
            <p className="text-xs max-w-md mx-auto">
              Try searching for a different WhatsApp Ref, customer name, device IMEI serial number, or adjust the date filters above.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>WhatsApp Ref</th>
                  <th>Invoice ID & Date</th>
                  <th>Customer Details</th>
                  <th className="text-center">Devices</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr 
                    key={inv.id} 
                    onClick={() => { setSelectedInvoice(inv); setShowDetailModal(true); }}
                    className="hover:bg-slate-800/60 cursor-pointer transition-colors group"
                  >
                    <td>
                      <span className="badge badge-success font-mono text-xs px-2 py-1 shadow-sm">
                        {inv.whatsappRef || '#WA-N/A'}
                      </span>
                    </td>
                    <td>
                      <div className="font-heading font-bold text-white text-sm">{inv.id}</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(inv.date).toLocaleDateString()} • {new Date(inv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold text-white">{inv.customer?.name || 'Unknown'}</div>
                      <div className="font-mono text-[11px] text-cyan-300">{inv.customer?.whatsapp || ''}</div>
                    </td>
                    <td className="text-center font-mono text-slate-300">
                      <span className="badge badge-purple">{inv.items?.length || 0} items</span>
                    </td>
                    <td className="text-right font-mono font-black text-emerald-400 text-base">
                      ${inv.total?.toFixed(2)}
                    </td>
                    <td className="text-center">
                      <span className="badge badge-info text-[10px]">
                        {inv.status || 'Paid'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setShowDetailModal(true); }}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-colors shadow-sm"
                          title="View Invoice & IMEIs"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteInvoice(inv.id, e)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors shadow-sm"
                          title="Delete Record"
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

      {/* --- INVOICE DETAILS & PRINT MODAL --- */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedInvoice ? `Warranty Invoice — ${selectedInvoice.id}` : 'Invoice'}
        subtitle={selectedInvoice ? `WhatsApp Reference: ${selectedInvoice.whatsappRef}` : ''}
        icon={FileText}
        maxWidth="max-w-3xl"
      >
        {selectedInvoice && (
          <div className="space-y-6">
            
            {/* Printable Invoice Header Box */}
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4 shadow-xl">
              <div className="flex justify-between items-start border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-heading font-black text-2xl text-white tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    CROWN EXCEL ELECTRONICS
                  </h2>
                  <p className="text-xs text-slate-400">Enterprise Laptops, Mobile Phones & Gadgets Billing</p>
                </div>
                <div className="text-right">
                  <div className="badge badge-success font-mono text-xs">{selectedInvoice.whatsappRef}</div>
                  <div className="font-mono text-xs text-slate-300 mt-1">
                    Date: {new Date(selectedInvoice.date).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Customer & Bill Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[10px] block mb-1">Billed To Customer:</span>
                  <div className="font-heading font-bold text-sm text-white">{selectedInvoice.customer?.name}</div>
                  {selectedInvoice.customer?.company && (
                    <div className="text-slate-300">{selectedInvoice.customer.company}</div>
                  )}
                  <div className="font-mono text-cyan-300 mt-0.5">WhatsApp: {selectedInvoice.customer?.whatsapp}</div>
                  {selectedInvoice.customer?.email && (
                    <div className="text-slate-400">{selectedInvoice.customer.email}</div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-400 uppercase font-bold text-[10px] block mb-1">Payment Status:</span>
                  <div className="badge badge-info text-xs inline-block mb-2 shadow-sm">PAID / WARRANTY VERIFIED</div>
                  {selectedInvoice.notes && (
                    <div className="text-slate-300 italic max-w-xs ml-auto bg-slate-950 p-2 rounded border border-white/5">"{selectedInvoice.notes}"</div>
                  )}
                </div>
              </div>

              {/* Itemized Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden mt-4">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800 text-slate-300 uppercase font-heading text-[10px]">
                    <tr>
                      <th className="p-3">Device Model & Specs</th>
                      <th className="p-3">IMEI / Serial Number</th>
                      <th className="p-3 text-right">Price</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {selectedInvoice.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="p-3 font-sans">
                          <div className="font-bold text-white text-sm">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">#{item.barcode} ({item.category || 'Electronics'})</div>
                        </td>
                        <td className="p-3">
                          {item.imei ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-bold">
                              <Shield className="w-3 h-3 text-cyan-400" />
                              <span>{item.imei}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">No serial recorded</span>
                          )}
                        </td>
                        <td className="p-3 text-right">${item.price?.toFixed(2)}</td>
                        <td className="p-3 text-center font-bold text-white">{item.qty}</td>
                        <td className="p-3 text-right font-bold text-emerald-400 text-sm">${item.total?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="space-y-1.5 text-xs text-right pt-2">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono">${selectedInvoice.subtotal?.toFixed(2)}</span>
                </div>
                {selectedInvoice.taxAmount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Tax ({selectedInvoice.taxRate || 0}%):</span>
                    <span className="font-mono">+${selectedInvoice.taxAmount?.toFixed(2)}</span>
                  </div>
                )}
                {selectedInvoice.discount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount:</span>
                    <span className="font-mono">-${selectedInvoice.discount?.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-3 flex justify-between items-center text-sm font-bold text-white">
                  <span>Total Amount Paid:</span>
                  <span className="font-heading font-black text-2xl text-emerald-400 font-mono drop-shadow">
                    ${selectedInvoice.total?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleDeleteInvoice(selectedInvoice.id, { stopPropagation: () => {} })}
                className="btn btn-outline text-red-400 border-red-500/30 hover:bg-red-500/10 mr-auto"
              >
                <Trash2 className="w-4 h-4" /> Delete Invoice
              </button>
              
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="btn btn-outline"
              >
                Close
              </button>
              
              <button
                type="button"
                onClick={handlePrintInvoice}
                className="btn btn-primary"
              >
                <Printer className="w-4 h-4" /> Print Warranty PDF
              </button>
            </div>

          </div>
        )}
      </Modal>

    </div>
  );
};
