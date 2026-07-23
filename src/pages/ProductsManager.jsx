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
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Upload,
  Layers
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Modal } from '../components/Modal';
import { ImportExcelModal } from '../components/ImportExcelModal';
import TeamTag from '../components/TeamTag';
import { guessProductDefaults } from '../utils/productDefaults';
import { importProducts, PRODUCT_TEMPLATE_HEADERS } from '../utils/importUtils';
import { exportToCsv, exportToXlsx, exportToPdf, formatLocalDate } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';

export const ProductsManager = () => {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [teamFilter, setTeamFilter] = useState('all'); // admin-only cross-team filter
  const [showImportModal, setShowImportModal] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    barcode: '',
    name: '',
    sku: '',
    category: 'Mobile Phones',
    unit: 'Box',
    team: ''
  });

  // Tracks manual overrides so auto-detect (new products only) doesn't clobber an explicit choice
  const [categoryTouched, setCategoryTouched] = useState(false);

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
    // Admins see every team's catalog merged; this narrows to one team.
    if (isAdmin && teamFilter !== 'all' && (p.teamId || '') !== teamFilter) return false;
    if (selectedCategory !== 'All' && p.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = ['All', 'Laptops', 'Mobile Phones', 'Tablets', 'Audio & Wearables', 'Accessories', 'Gaming', 'Peripherals', 'General'];

  // Handle Save
  const handleSaveProduct = (e) => {
    e.preventDefault();
    if (!formData.name) return;

    if (storageService.isBarcodeInUse(formData.barcode, editingProduct?.id)) {
      alert(`Barcode ${formData.barcode} is already assigned to another device in the catalog. Please use a unique barcode.`);
      return;
    }

    // Admins aren't bound to one region, so they must pick which team owns the product —
    // otherwise it would save untagged. Standard staff have their region stamped automatically.
    if (isAdmin && !formData.team) {
      alert('Please select which region (team) this product belongs to.');
      return;
    }

    const { team, ...productFields } = formData;
    storageService.saveProduct({
      ...productFields,
      teamId: team || undefined,
      id: editingProduct ? editingProduct.id : undefined
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
      sku: prod.sku || '',
      category: prod.category || 'Mobile Phones',
      unit: prod.unit || 'Box',
      team: prod.teamId || ''
    });
    // Editing an existing, already-correctly-categorized product should never be auto-reclassified
    setCategoryTouched(true);
    setShowModal(true);
  };

  // Open Create Modal
  const handleCreateNew = () => {
    setEditingProduct(null);
    setFormData({
      barcode: Math.floor(1000000 + Math.random() * 9000000).toString(),
      name: '',
      sku: '',
      category: 'Mobile Phones',
      unit: 'Box',
      team: storageService.getCurrentTeamId() || ''
    });
    setCategoryTouched(false);
    setShowModal(true);
  };

  // "Region" is included so an export can be re-imported without losing which team owns each device.
  const exportHeaders = ["ID", "Barcode", "Device Name", "Model / SKU", "Category", "Unit Type", "Region"];
  const exportRows = () => products.map(p => [
    p.id,
    p.barcode,
    p.name,
    p.sku || '',
    p.category,
    p.unit || 'Box',
    p.teamId || ''
  ]);

  const handleExport = async (kind) => {
    if (products.length === 0) return;
    const base = `Crown_Excel_Electronics_Catalog_${formatLocalDate(new Date())}`;
    if (kind === 'csv') exportToCsv({ filename: `${base}.csv`, headers: exportHeaders, rows: exportRows() });
    if (kind === 'xlsx') {
      try {
        await exportToXlsx({
          filename: `${base}.xlsx`,
          subtitle: `Product Master · ${products.length} devices · Generated ${new Date().toLocaleString()}`,
          sheets: [{ name: 'Products', headers: exportHeaders, rows: exportRows() }]
        });
      } catch (err) {
        alert(`Could not build the Excel file: ${err.message}`);
      }
    }
    if (kind === 'pdf') exportToPdf({
      filename: `${base}.pdf`,
      title: 'Crown Excel — Product Master',
      subtitle: `Exported ${new Date().toLocaleString()} • ${products.length} devices`,
      headers: exportHeaders,
      rows: exportRows()
    });
  };

  const handleImport = async (rows, options) => {
    const result = await importProducts(rows, options);
    storageService.appendAudit('import.products', null, {
      created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length
    }, { entity: 'products', entityId: 'bulk-import' });
    loadProducts();
    return result;
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Laptops': return <Laptop className="w-3.5 h-3.5 text-[#2563eb]" />;
      case 'Mobile Phones': return <Smartphone className="w-3.5 h-3.5 text-emerald-600" />;
      case 'Audio & Wearables': return <Headphones className="w-3.5 h-3.5 text-purple-600" />;
      default: return <Tag className="w-3.5 h-3.5 text-amber-600" />;
    }
  };

  // Derived (not tracked): "Add New Device" always opens this modal blank, with no chance to
  // have already searched the catalog first — so re-check against the database on every
  // keystroke instead of assuming a duplicate name would've been caught elsewhere.
  const productNameQuery = formData.name.trim().toLowerCase();
  const similarExistingProducts = (showModal && !editingProduct && productNameQuery.length >= 3)
    ? products.filter((p) => p.name.toLowerCase().includes(productNameQuery)).slice(0, 5)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-body">
      
      {/* Header & Actions */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border-l-4 border-l-[#2563eb]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 shadow-sm font-bold">
            <Package className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">
                Electronics & Devices Database
              </h2>
              <span className="bg-blue-100 text-[#2563eb] font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">SERIAL TRACKED</span>
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Manage barcodes and mandatory serial/IMEI warranty tracking for laptops, mobile phones, and gadgets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {isAdmin && (
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
              title="Bulk import the product master from Excel"
            >
              <Upload className="w-4 h-4 text-slate-700" /> Import Excel
            </button>
          )}
          <button
            onClick={() => handleExport('xlsx')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export catalog as Excel workbook"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-700" /> Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export catalog as CSV"
          >
            <Download className="w-4 h-4 text-slate-700" /> CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="btn btn-outline text-xs py-2.5 px-4 font-bold flex-1 sm:flex-initial"
            title="Export catalog as PDF"
          >
            <FileText className="w-4 h-4 text-slate-700" /> PDF
          </button>
          <button
            onClick={handleCreateNew}
            className="btn btn-primary text-xs py-2.5 px-5 font-bold flex-1 sm:flex-initial shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Add New Device
          </button>
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search devices by Model, Barcode, or Category..."
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
              className="input-field py-3 px-3 text-sm bg-white border-slate-400 font-bold text-slate-800 rounded-xl w-full lg:w-52"
              title="Filter by team — admins see every team"
            >
              <option value="all">All Teams</option>
              {storageService.getTeams().map((team) => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Layers className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input-field pl-8 pr-8 py-2 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-lg"
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-bold text-slate-500 pt-3 border-t-2 border-slate-200 gap-2">
          <span className="flex items-center gap-1.5 text-[#2563eb]">
            <Check className="w-4 h-4" /> High-Speed Electronics Lookup Engine Active
          </span>
          <span>Showing <b className="text-slate-900">{filteredProducts.length}</b> of <b className="text-slate-900">{products.length}</b> total devices</span>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm">
        {filteredProducts.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <Package className="w-12 h-12 mx-auto text-slate-400 animate-pulse" />
            <div className="font-heading font-black text-slate-800 text-lg">No electronics found</div>
            <p className="text-xs font-semibold max-w-md mx-auto text-slate-500">
              No devices match your search or category filter. Click "Add New Device" above to register one.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none w-full overflow-x-auto">
            <table className="data-table w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider w-36">Barcode</th>
                  <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Device Model & Specs</th>
                  {isAdmin && <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider">Team</th>}
                  {isAdmin && <th className="py-4 px-6 text-[11px] font-black text-slate-600 uppercase tracking-wider text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 font-mono text-xs text-[#2563eb] font-bold shadow-sm">
                        <Barcode className="w-3.5 h-3.5 text-[#2563eb]" />
                        <span>{prod.barcode}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-heading font-black text-slate-900 text-sm">{prod.name}</div>
                      <div className="text-[11px] font-bold text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                        {prod.sku && (
                          <>
                            <span className="font-mono text-[#2563eb] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">{prod.sku}</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="flex items-center gap-1 text-slate-700">
                          {getCategoryIcon(prod.category)}
                          <span>{prod.category}</span>
                        </span>
                        <span>•</span>
                        <span>Unit: {prod.unit || 'Box'}</span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="py-4 px-6">
                        <TeamTag team={prod.teamId} />
                      </td>
                    )}
                    {isAdmin && (
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(prod)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-[#2563eb] transition-colors shadow-sm"
                            title="Edit Device"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(prod.id, prod.name)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 transition-colors shadow-sm"
                            title="Delete Device (admin only)"
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

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProduct ? `Edit Device — ${editingProduct.name}` : 'Register New Electronics Device'}
        subtitle="Barcodes will be automatically matched during WhatsApp invoice billing."
        icon={Package}
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 font-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Barcode Number</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
                placeholder="e.g. 8801001"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                Category
                {!editingProduct && !categoryTouched && formData.name.trim() && (
                  <span className="text-[9px] normal-case font-bold text-emerald-600 ml-1.5">(auto-detected)</span>
                )}
              </label>
              <select
                value={formData.category}
                onChange={(e) => {
                  setCategoryTouched(true);
                  setFormData({ ...formData, category: e.target.value });
                }}
                className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2.5"
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

          {/* Admins aren't tied to one region, so they choose which team owns this product. Standard
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

          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Device Model Name & Specs</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                const name = e.target.value;
                const guess = (!editingProduct && !categoryTouched) ? guessProductDefaults(name) : null;
                setFormData((prev) => ({
                  ...prev,
                  name,
                  category: (!categoryTouched && guess) ? guess.category : prev.category
                }));
              }}
              placeholder="e.g. MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)"
              className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              autoFocus
              required
            />
          </div>

          {similarExistingProducts.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2.5 shadow-sm">
              <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{isAdmin ? 'Already in the database — edit one of these instead of creating a duplicate?' : 'Already in the database — check before creating a duplicate.'}</span>
              </p>
              <div className="space-y-1.5">
                {similarExistingProducts.map((p) => (
                  // Admins can jump straight to editing; standard staff (who can't edit) see it as
                  // an informational duplicate warning only.
                  isAdmin ? (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleEdit(p)}
                      className="w-full text-left p-2.5 rounded-lg bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50/60 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="font-bold text-xs text-slate-900">{p.name}</span>
                      <span className="font-mono text-[10px] text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold whitespace-nowrap">{p.barcode}</span>
                    </button>
                  ) : (
                    <div
                      key={p.id}
                      className="w-full text-left p-2.5 rounded-lg bg-white border border-amber-200 flex items-center justify-between gap-2"
                    >
                      <span className="font-bold text-xs text-slate-900">{p.name}</span>
                      <span className="font-mono text-[10px] text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold whitespace-nowrap">{p.barcode}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Model / SKU (Optional)</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="e.g. MK1A3HN/A"
                className="input-field font-mono font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              />
            </div>
          </div>

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
              className="btn btn-primary font-bold px-6 py-2.5 shadow-md"
            >
              <Check className="w-4 h-4" /> {editingProduct ? 'Update Device' : 'Save Device'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- BULK IMPORT MODAL (admin only) --- */}
      <ImportExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityLabel="Product Master"
        templateHeaders={PRODUCT_TEMPLATE_HEADERS}
        onImport={handleImport}
      />

    </div>
  );
};
