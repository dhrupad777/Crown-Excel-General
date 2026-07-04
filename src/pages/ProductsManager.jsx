import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Download, 
  Barcode, 
  Check, 
  Tag,
  Smartphone,
  Laptop,
  Headphones,
  Shield
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';

export const ProductsManager = () => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    barcode: '',
    name: '',
    category: 'Mobile Phones',
    price: '',
    stock: '50',
    unit: 'Unit',
    imeiRequired: true
  });

  const loadProducts = () => {
    setProducts(storageService.getProducts());
  };

  useEffect(() => {
    loadProducts();
    const handleDataChange = () => loadProducts();
    window.addEventListener('crown-data-change', handleDataChange);
    return () => window.removeEventListener('crown-data-change', handleDataChange);
  }, []);

  // Filter products
  const filteredProducts = products.filter(p => {
    if (selectedCategory !== 'All' && p.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = ['All', 'Laptops', 'Mobile Phones', 'Tablets', 'Audio & Wearables', 'Accessories', 'Gaming', 'Peripherals', 'General'];

  // Handle Save
  const handleSaveProduct = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) return;

    storageService.saveProduct({
      ...formData,
      id: editingProduct ? editingProduct.id : undefined,
      price: Number(formData.price),
      stock: Number(formData.stock),
      imeiRequired: Boolean(formData.imeiRequired)
    });

    loadProducts();
    setShowModal(false);
    setEditingProduct(null);
  };

  // Handle Delete
  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}" from the electronics catalog?`)) {
      storageService.deleteProduct(id);
      loadProducts();
    }
  };

  // Open Edit Modal
  const handleEdit = (prod) => {
    setEditingProduct(prod);
    setFormData({
      barcode: prod.barcode || '',
      name: prod.name || '',
      category: prod.category || 'Mobile Phones',
      price: prod.price?.toString() || '0',
      stock: prod.stock?.toString() || '0',
      unit: prod.unit || 'Unit',
      imeiRequired: prod.imeiRequired ?? true
    });
    setShowModal(true);
  };

  // Open Create Modal
  const handleCreateNew = () => {
    setEditingProduct(null);
    setFormData({
      barcode: Math.floor(1000000 + Math.random() * 9000000).toString(),
      name: '',
      category: 'Mobile Phones',
      price: '',
      stock: '50',
      unit: 'Unit',
      imeiRequired: true
    });
    setShowModal(true);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (products.length === 0) return;
    const headers = ["ID", "Barcode", "Device Name", "Category", "Unit Price ($)", "Stock Qty", "Unit Type", "IMEI Required"];
    const rows = products.map(p => [
      p.id,
      `"${p.barcode}"`,
      `"${p.name}"`,
      `"${p.category}"`,
      p.price?.toFixed(2) || '0.00',
      p.stock || 0,
      `"${p.unit || 'Unit'}"`,
      p.imeiRequired ? "YES" : "NO"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Crown_Excel_Electronics_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Laptops': return <Laptop className="w-3.5 h-3.5 text-cyan-400" />;
      case 'Mobile Phones': return <Smartphone className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Audio & Wearables': return <Headphones className="w-3.5 h-3.5 text-purple-400" />;
      default: return <Tag className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header & Actions */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-purple-500">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-md">
            <Package className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-2xl text-white tracking-tight">
                Electronics & Devices Database
              </h2>
              <span className="badge badge-purple text-[10px]">IMEI READY</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage barcodes, stock levels, and IMEI warranty tracking for laptops, mobile phones, and gadgets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportCSV}
            className="btn btn-outline text-xs py-2.5 flex-1 sm:flex-initial"
            title="Export electronics catalog to spreadsheet"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleCreateNew}
            className="btn btn-primary text-xs py-2.5 flex-1 sm:flex-initial shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" /> Add New Device
          </button>
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search devices by Model, Barcode, or Category..."
              className="input-field pl-10 pr-4 py-2.5 text-sm bg-slate-900 border-purple-500/30 focus:border-purple-500"
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

          {/* Category Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-2xl border border-white/10 w-full md:w-auto overflow-x-auto shadow-inner">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-heading font-semibold transition-all whitespace-nowrap ${
                  selectedCategory === cat 
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30 scale-105' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <span>⚡ High-Speed Electronics Lookup Engine Active</span>
          <span>Showing <b>{filteredProducts.length}</b> of <b>{products.length}</b> total devices</span>
        </div>
      </div>

      {/* Products Table */}
      <div className="glass-panel overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <Package className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
            <div className="font-heading font-semibold text-slate-300 text-base">No electronics found</div>
            <p className="text-xs max-w-md mx-auto">
              No devices match your search or category filter. Click "Add New Device" above to register one.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table-modern">
              <thead>
                <tr>
                  <th className="w-32">Barcode</th>
                  <th>Device Model & Specs</th>
                  <th className="text-center">IMEI / Warranty</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-center">Stock Level</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-800/60 transition-colors group">
                    <td>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 font-mono text-xs text-purple-400 font-bold group-hover:scale-105 transition-transform">
                        <Barcode className="w-3.5 h-3.5 text-slate-400" />
                        <span>{prod.barcode}</span>
                      </div>
                    </td>
                    <td>
                      <div className="font-heading font-bold text-white text-sm">{prod.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-slate-300">
                          {getCategoryIcon(prod.category)}
                          <span>{prod.category}</span>
                        </span>
                        <span>•</span>
                        <span>Unit: {prod.unit || 'Unit'}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      {prod.imeiRequired ? (
                        <span className="badge badge-info text-[10px] px-2 py-0.5 shadow-sm">
                          <Shield className="w-3 h-3" /> IMEI REQUIRED
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Optional</span>
                      )}
                    </td>
                    <td className="text-right font-mono font-black text-emerald-400 text-base">
                      ${Number(prod.price).toFixed(2)}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${
                        prod.stock > 20 ? 'badge-success' : prod.stock > 5 ? 'badge-warning' : 'badge-danger'
                      } font-mono text-xs shadow-sm`}>
                        {prod.stock} in stock
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(prod)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-purple-500/20 text-slate-300 hover:text-purple-400 transition-colors shadow-sm"
                          title="Edit Device"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(prod.id, prod.name)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors shadow-sm"
                          title="Delete Device"
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

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProduct ? `Edit Device — ${editingProduct.name}` : 'Register New Electronics Device'}
        subtitle="Barcodes will be automatically matched during WhatsApp invoice billing."
        icon={Package}
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="form-label">Barcode Number</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="input-field font-mono font-bold text-purple-400"
                placeholder="e.g. 8801001"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field font-semibold"
              >
                <option value="Laptops">Laptops</option>
                <option value="Mobile Phones">Mobile Phones</option>
                <option value="Tablets">Tablets</option>
                <option value="Audio & Wearables">Audio & Wearables</option>
                <option value="Accessories">Accessories</option>
                <option value="Gaming">Gaming</option>
                <option value="Peripherals">Peripherals</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          <div className="form-group mb-0">
            <label className="form-label">Device Model Name & Specs</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)"
              className="input-field font-semibold"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="form-group mb-0">
              <label className="form-label">Unit Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                className="input-field font-mono font-bold text-emerald-400"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Stock Quantity</label>
              <input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="input-field font-mono"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Unit Type</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="input-field"
              >
                <option value="Unit">Unit</option>
                <option value="Piece">Piece</option>
                <option value="Pair">Pair</option>
                <option value="Box">Box</option>
              </select>
            </div>
          </div>

          {/* IMEI Requirement Checkbox */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between mt-2">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-xs font-bold text-white block">Requires IMEI / Serial Number Tracking</span>
                <span className="text-[11px] text-slate-400">Prompt operators to record IMEI during invoice checkout</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.imeiRequired}
              onChange={(e) => setFormData({ ...formData, imeiRequired: e.target.checked })}
              className="w-5 h-5 accent-purple-500 rounded cursor-pointer"
            />
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
              className="btn btn-primary"
            >
              <Check className="w-4 h-4" /> {editingProduct ? 'Update Device' : 'Save Device'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
