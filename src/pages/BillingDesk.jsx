import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  Search,
  Clock,
  FileText,
  Sparkles,
  AlertCircle,
  ShoppingBag,
  Calculator,
  ArrowRight,
  Smartphone,
  Laptop,
  Headphones,
  Tag,
  Shield,
  Zap,
  Hash,
  Package,
  ScanLine
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Modal } from '../components/Modal';
import { storageService } from '../services/storage';
import { audioService } from '../services/audio';
import { guessProductDefaults } from '../utils/productDefaults';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';

export const BillingDesk = ({ onViewInvoice, onDirtyChange }) => {
  // Bill Items State
  const [items, setItems] = useState([]);

  // Active Product: the product currently selected for adding units to the bill.
  // Staff select it once (by name or barcode), then stream serial numbers (or a quantity) into it.
  const [activeProduct, setActiveProduct] = useState(null);
  const [activeSerial, setActiveSerial] = useState('');
  const [serialWarning, setSerialWarning] = useState('');
  const serialInputRef = useRef(null);
  const productSearchInputRef = useRef(null);

  // Partner (Customer) State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Product Manual Search State
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Modals State
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    barcode: '',
    name: '',
    sku: '',
    category: 'Mobile Phones',
    unit: 'Box'
  });

  // Tracks whether the operator manually overrode the auto-detected category, so typing more
  // of the product name doesn't clobber their explicit choice.
  const [categoryTouched, setCategoryTouched] = useState(false);

  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', company: '', whatsapp: '', email: '' });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState(null);
  // Outcome of the post-save warranty auto-registration (null while in flight)
  const [registryReport, setRegistryReport] = useState(null);

  // The invoice number for this bill. Starts blank — the operator types their own number every
  // time; it's required and must be unique (both enforced on save in handleFinalizeBill).
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // A bill with scanned items but no saved invoice is unfinalized work. Report that "dirty" state
  // up so App can warn before navigating away (the Billing Desk unmounts and the draft is lost),
  // and guard a browser refresh/close the same way — so an in-progress invoice is never silently
  // discarded. Cleared automatically once the bill is finalized/reset (items go back to empty).
  const isDirty = items.length > 0;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const warnOnUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warnOnUnload);
    return () => window.removeEventListener('beforeunload', warnOnUnload);
  }, [isDirty]);

  // Total unit count across all scanned items
  const totalUnits = items.reduce((acc, item) => acc + item.qty, 0);

  // How many units of the active product are already on this bill — derived from the bill
  // itself (not a separately tracked counter), so reactivating a product you already added
  // units for shows the true running total instead of resetting to 0.
  const activeUnitCount = activeProduct
    ? items.filter((i) => i.productId === activeProduct.id).reduce((s, i) => s + i.qty, 0)
    : 0;

  // Keyboard shortcut Ctrl+S to save bill
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (items.length > 0 && selectedCustomer && invoiceNumber.trim() && !finalizing) {
          handleFinalizeBill();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedCustomer, invoiceNumber, finalizing]);

  // Focus the serial input whenever a *different* product becomes active — keyed off the id
  // (a primitive), so this only fires on the actual selection transition, not on every
  // re-render (which would otherwise steal focus back mid-typing).
  useEffect(() => {
    if (activeProduct) {
      serialInputRef.current?.focus();
    }
  }, [activeProduct?.id]);

  // Selects a product as the active one for adding units, clearing any leftover in-progress
  // serial entry from whatever was active before.
  const selectActiveProduct = (product) => {
    setActiveProduct(product);
    setActiveSerial('');
    setSerialWarning('');
  };

  const handleChangeProduct = () => {
    setActiveProduct(null);
    setActiveSerial('');
    setSerialWarning('');
    productSearchInputRef.current?.focus();
  };

  // Every product is serial-tracked: one physical unit, one serial, one row per unit.
  const addItemToBill = (product, imei = '') => {
    setItems((prev) => [{
      id: product.id + '-' + Date.now() + Math.random().toString(36).slice(2, 6),
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      sku: product.sku || '',
      category: product.category || 'Electronics',
      qty: 1,
      unit: product.unit || 'Box',
      imei
    }, ...prev]);
  };

  // Commits whatever's in the serial input as one new unit of the active product, then clears
  // and refocuses so the gun can fire the next unit's serial with no click in between.
  const commitSerialUnit = () => {
    const serial = activeSerial.trim();
    if (!serial) {
      audioService.playError();
      return;
    }

    const dupOnBill = items.some((it) => it.imei && it.imei.trim().toLowerCase() === serial.toLowerCase());
    if (dupOnBill) {
      audioService.playError();
      setSerialWarning(`Serial "${serial}" is already on this bill.`);
      return;
    }

    // Hard block: a serial that's already registered in the warranty registry (any location) or
    // was sold on any past invoice cannot be added to a new bill — it's a used unit.
    const registryMatch = storageService.findSerial(serial);
    if (registryMatch) {
      audioService.playError();
      setSerialWarning(
        `Serial "${serial}" is already registered${registryMatch.date ? ` (${new Date(registryMatch.date).toLocaleDateString()})` : ''}${registryMatch.invoiceNo ? `, invoice ${registryMatch.invoiceNo}` : ''} — it cannot be added to a new bill.`
      );
      return;
    }
    const pastMatches = storageService.findInvoiceBySerial(serial);
    if (pastMatches.length > 0) {
      audioService.playError();
      setSerialWarning(`Serial "${serial}" was already sold on invoice ${pastMatches[0].invoice.id} — it cannot be added to a new bill.`);
      return;
    }

    setSerialWarning('');
    addItemToBill(activeProduct, serial);
    audioService.playBeep();
    setActiveSerial('');
    serialInputRef.current?.focus();
  };

  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSerialUnit();
    }
  };

  const updateItemImei = (index, newImei) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], imei: newImei };
      return updated;
    });
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Partner Search Autocomplete
  useEffect(() => {
    if (customerSearchQuery.trim().length > 0) {
      const results = storageService.searchCustomers(customerSearchQuery);
      setCustomerResults(results);
      setShowCustomerDropdown(true);
    } else {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
    }
  }, [customerSearchQuery]);

  // Product Manual Search Autocomplete
  useEffect(() => {
    if (productSearchQuery.trim().length > 0) {
      const results = storageService.getProducts().filter(p =>
        p.name?.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        p.barcode?.includes(productSearchQuery) ||
        p.category?.toLowerCase().includes(productSearchQuery.toLowerCase())
      );
      setProductResults(results);
      setShowProductDropdown(true);
    } else {
      setProductResults([]);
      setShowProductDropdown(false);
    }
  }, [productSearchQuery]);

  // Save New Product & make it the active product for this bill
  const handleSaveNewProduct = (e) => {
    e.preventDefault();
    if (!newProductForm.name) return;

    if (storageService.isBarcodeInUse(newProductForm.barcode)) {
      alert(`Barcode ${newProductForm.barcode} is already assigned to another device in the catalog. Please use a unique barcode.`);
      return;
    }

    const savedProd = storageService.saveProduct({ ...newProductForm });

    audioService.playBeep();
    selectActiveProduct(savedProd);
    setShowNewProductModal(false);
  };

  // Save New Partner & Attach to Bill
  const handleSaveNewCustomer = (e) => {
    e.preventDefault();
    if (!newCustomerForm.company.trim()) return;

    const savedCust = storageService.saveCustomer(newCustomerForm);
    setSelectedCustomer(savedCust);
    setShowNewCustomerModal(false);
    setCustomerSearchQuery('');
  };

  // Finalize & Save Invoice
  const handleFinalizeBill = async () => {
    if (finalizing) return; // a double-click (or a second Ctrl+S) must never mint two bills
    if (items.length === 0) {
      alert("Please add at least one item to the bill.");
      return;
    }
    if (!selectedCustomer) {
      alert("Please select or attach a partner to this bill.");
      return;
    }

    const missingImei = items.filter((item) => !item.imei?.trim());
    if (missingImei.length > 0) {
      alert(
        "Missing serial numbers — the following items need a serial number before this bill can be finalized:\n\n" +
        missingImei.map((item) => `• ${item.name}`).join('\n')
      );
      return;
    }

    const invNum = invoiceNumber.trim();
    if (!invNum) {
      alert("Please enter an invoice number for this bill.");
      return;
    }
    // The number becomes this bill's document id, so reject characters Firestore forbids in an id.
    if (invNum.includes('/') || invNum === '.' || invNum === '..') {
      alert("Invoice number can't contain a slash (/) or be '.' or '..'. Use letters, numbers, or dashes.");
      return;
    }
    const teamId = storageService.getCurrentTeamId();
    if (!teamId) {
      alert("Your store isn't assigned to a team/region yet. Ask an administrator to set your store's team before billing.");
      return;
    }
    if (storageService.isInvoiceNumberTaken(invNum, teamId)) {
      alert(`Invoice number "${invNum}" is already used by another bill in your team. Please enter a different number.`);
      return;
    }

    setFinalizing(true);
    let saved;
    try {
      // Per-team invoice identity: the doc id is namespaced by team so Dubai's "INV-1" and Nigeria's
      // "INV-1" are different documents; the human number lives in `invoiceNo`.
      const invoiceData = {
        id: `${teamId}__${invNum}`,
        invoiceNo: invNum,
        teamId,
        date: new Date().toISOString(),
        customer: selectedCustomer,
        items: items
      };
      saved = storageService.saveInvoice(invoiceData);
    } finally {
      setFinalizing(false);
    }

    if (!saved) {
      audioService.playError();
      alert("Failed to save this bill to local storage (device storage may be full). Please free up space or export a backup, then try again.");
      return;
    }
    audioService.playSuccess();

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 }
    });

    setSavedInvoice(saved);
    setShowSuccessModal(true);

    // Feed the warranty registry (best-effort — the sale is already saved; duplicates are
    // skipped by the registry's create-only guarantee, offline failures reported for later
    // registration via the Serial Capture screen). The report is keyed to this invoice so a
    // slow registration can't paint its result onto the NEXT bill's success modal.
    try {
      const reg = await storageService.registerSerialsFromInvoice(saved);
      setRegistryReport({ invoiceId: saved.id, ...reg });
    } catch (err) {
      console.warn('Warranty auto-registration failed:', err.message);
      setRegistryReport({ invoiceId: saved.id, registered: [], duplicates: [], failed: items.map((it) => ({ serial: it.imei })) });
    }
  };

  const resetForNextBill = () => {
    setItems([]);
    setSelectedCustomer(null);
    setActiveProduct(null);
    setActiveSerial('');
    setSerialWarning('');
    setShowSuccessModal(false);
    setSavedInvoice(null);
    setRegistryReport(null);
    setInvoiceNumber('');
  };

  // Generates a plausible 15-digit demo serial number for quick demo bills
  const generateDemoImei = () => Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');

  // Instantly fills a sample bill (random catalog items + a random existing partner)
  // Used for demos, training new operators, and quick UI testing.
  const handleLoadDemoBill = () => {
    const products = storageService.getProducts();
    if (products.length === 0) {
      alert('No products in the catalog yet — add a device before loading a demo bill.');
      return;
    }

    const shuffled = [...products].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(3, shuffled.length));

    // Every product is serial-tracked: one row per physical unit (each with its own unique
    // serial), matching the same rule the active-product serial stream enforces.
    const demoItems = picked.flatMap((product) => {
      const unitCount = Math.floor(1 + Math.random() * 2); // 1-2 units, each its own row
      return Array.from({ length: unitCount }, (_, i) => ({
        id: `${product.id}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        barcode: product.barcode,
        name: product.name,
        sku: product.sku || '',
        category: product.category || 'Electronics',
        qty: 1,
        unit: product.unit || 'Box',
        imei: generateDemoImei()
      }));
    });

    setItems((prev) => [...demoItems, ...prev]);
    setActiveProduct(null);
    setActiveSerial('');
    setSerialWarning('');

    if (!selectedCustomer) {
      const customers = storageService.getCustomers();
      if (customers.length > 0) {
        setSelectedCustomer(customers[Math.floor(Math.random() * customers.length)]);
      }
    }

    audioService.playBeep();
  };

  // Loads a single-product bill carrying a large batch of serials — for eyeballing the invoice /
  // PDF print layout under a heavy serial count. Serials are random throwaway values, so this
  // bypasses the scan-time duplicate guards by design.
  const SERIAL_STRESS_COUNT = 250;
  const handleLoadSerialStressBill = () => {
    const products = storageService.getProducts();
    if (products.length === 0) {
      alert('No products in the catalog yet — add a device before loading a demo bill.');
      return;
    }

    const product = products[Math.floor(Math.random() * products.length)];
    const ts = Date.now();
    const demoItems = Array.from({ length: SERIAL_STRESS_COUNT }, (_, i) => ({
      id: `${product.id}-${ts}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      sku: product.sku || '',
      category: product.category || 'Electronics',
      qty: 1,
      unit: product.unit || 'Box',
      imei: generateDemoImei()
    }));

    setItems((prev) => [...demoItems, ...prev]);
    setActiveProduct(null);
    setActiveSerial('');
    setSerialWarning('');

    if (!selectedCustomer) {
      const customers = storageService.getCustomers();
      if (customers.length > 0) {
        setSelectedCustomer(customers[Math.floor(Math.random() * customers.length)]);
      }
    }

    audioService.playBeep();
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Laptops': return <Laptop className="w-3.5 h-3.5 text-[#2563eb]" />;
      case 'Mobile Phones': return <Smartphone className="w-3.5 h-3.5 text-emerald-600" />;
      case 'Audio & Wearables': return <Headphones className="w-3.5 h-3.5 text-purple-600" />;
      default: return <Tag className="w-3.5 h-3.5 text-amber-600" />;
    }
  };

  // Derived (not tracked): recomputed from the live form field so it stays correct however this
  // modal was opened — including the header's "Add New Product" shortcut, which starts blank and
  // never ran the typed name past the catalog search at all.
  const newProductNameQuery = newProductForm.name.trim().toLowerCase();
  const similarExistingProducts = (showNewProductModal && newProductNameQuery.length >= 3)
    ? storageService.getProducts().filter((p) => p.name.toLowerCase().includes(newProductNameQuery)).slice(0, 5)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-body">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT & CENTER: Bill Items & Scanning Desk (Takes 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Top Control Bar: Invoice Date/Time & Manual Product Search */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 space-y-5 shadow-md border-t-4 border-t-[#2563eb]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-[#2563eb]/10 border border-[#2563eb]/20 text-[#2563eb] shadow-sm font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-bold block">Invoice Date & Time</span>
                  <span className="text-sm font-mono font-black text-slate-900">
                    {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm font-bold">
                  <Hash className="w-5 h-5" />
                </div>
                <div className="text-left sm:text-right">
                  <label htmlFor="invoiceNumberInput" className="text-[11px] text-slate-500 font-bold block">Invoice Number</label>
                  <input
                    id="invoiceNumberInput"
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-10001"
                    required
                    className="input-field mt-0.5 py-1.5 px-2.5 w-40 text-sm font-mono font-black text-emerald-700 bg-white border-emerald-300 sm:text-right"
                    title="Required — must be unique"
                  />
                </div>
              </div>
            </div>

            {/* Manual Product Search Bar */}
            <div className="relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-[#2563eb]" />
                  <span>Search Products</span>
                </label>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleLoadDemoBill}
                    title="Instantly fill a sample bill with random catalog items and a demo partner"
                    className="text-purple-700 hover:text-purple-900 font-heading text-xs flex items-center gap-1 font-black bg-purple-50 px-3 py-1.5 rounded-lg border-2 border-purple-200 shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Load Demo Bill
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSerialStressBill}
                    title="Load one product with 250 serials to preview the invoice / PDF print layout"
                    className="text-purple-700 hover:text-purple-900 font-heading text-xs flex items-center gap-1 font-black bg-purple-50 px-3 py-1.5 rounded-lg border-2 border-purple-200 shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Demo: 250 Serials
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProductForm({
                        barcode: Math.floor(1000000 + Math.random() * 9000000).toString(),
                        name: '',
                        sku: '',
                        category: 'Mobile Phones',
                        unit: 'Box'
                      });
                      setCategoryTouched(false);
                      setShowNewProductModal(true);
                    }}
                    className="text-[#2563eb] hover:text-blue-800 font-heading text-xs flex items-center gap-1 font-black bg-blue-50 px-3 py-1.5 rounded-lg border-2 border-blue-200 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add New Product
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={productSearchInputRef}
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Type product name or barcode to select it..."
                  className="input-field pl-11 pr-4 py-3.5 font-bold bg-white text-base border-slate-300 text-slate-900 shadow-inner w-full rounded-xl focus:border-[#2563eb]"
                  autoFocus
                />
              </div>

              {/* Product Autocomplete Dropdown */}
              {showProductDropdown && productResults.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {productResults.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        selectActiveProduct(prod);
                        setProductSearchQuery('');
                        setShowProductDropdown(false);
                      }}
                      className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold group-hover:scale-105 transition-transform">
                          {prod.barcode}
                        </span>
                        <div>
                          <div className="font-black text-sm text-slate-900 flex items-center gap-2">
                            <span>{prod.name}</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mt-0.5">
                            {getCategoryIcon(prod.category)}
                            <span>{prod.category}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-bold text-slate-500 block">{prod.unit || 'Box'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No results — offer to register it as a new product */}
              {showProductDropdown && productResults.length === 0 && productSearchQuery.trim().length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-2xl p-5 text-center space-y-3 shadow-2xl">
                  <p className="text-xs font-bold text-slate-600">No matching product found.</p>
                  <button
                    type="button"
                    onClick={() => {
                      const guess = guessProductDefaults(productSearchQuery);
                      setNewProductForm({
                        barcode: Math.floor(1000000 + Math.random() * 9000000).toString(),
                        name: productSearchQuery,
                        sku: '',
                        category: guess?.category || 'Mobile Phones',
                        unit: 'Box'
                      });
                      setCategoryTouched(false);
                      setShowNewProductModal(true);
                    }}
                    className="btn btn-primary w-full py-2.5 text-xs font-bold shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Register as New Product
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Product: select once, then stream serial numbers (or a quantity) into it */}
          {activeProduct && (
            <div className="bg-white border-2 border-purple-300 rounded-2xl p-6 space-y-4 shadow-md border-t-4 border-t-purple-600">
              <div className="flex items-start justify-between gap-3 border-b-2 border-slate-200 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 shadow-sm font-bold">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider block">Active Product</span>
                    <span className="font-heading font-black text-slate-900 text-base">{activeProduct.name}</span>
                    <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                      {getCategoryIcon(activeProduct.category)}
                      <span>{activeProduct.category}</span>
                      <span>•</span>
                      <span className="font-mono">{activeProduct.unit || 'Box'}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleChangeProduct}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap"
                >
                  Change Product
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ScanLine className="w-4 h-4 text-purple-600" />
                    <span>Scan or Enter Serial Number</span>
                  </label>
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200 whitespace-nowrap">
                    {activeUnitCount} unit{activeUnitCount === 1 ? '' : 's'} added
                  </span>
                </div>
                <input
                  ref={serialInputRef}
                  type="text"
                  value={activeSerial}
                  onChange={(e) => { setActiveSerial(e.target.value); setSerialWarning(''); }}
                  onKeyDown={handleSerialKeyDown}
                  placeholder="Scan the unit's serial/IMEI sticker, then press Enter..."
                  className="bg-white border-2 border-purple-300 rounded-xl px-4 py-3 text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600 shadow-inner w-full"
                />
                {serialWarning && (
                  <p className="text-[11px] text-amber-600 font-bold">⚠️ {serialWarning}</p>
                )}
                <p className="text-[11px] text-slate-500 font-semibold">Serial scanner ready — each scan adds one unit and clears for the next.</p>
              </div>
            </div>
          )}

          {/* Scanned Items Table */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden shadow-md border-t-4 border-t-emerald-600">
            <div className="p-5 border-b-2 border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">
                  Scanned Items
                </h3>
                <span className="bg-slate-200 text-slate-800 font-bold px-2.5 py-0.5 rounded-full text-[11px]">{items.length} items</span>
              </div>
              {items.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('Clear all scanned items from this bill? This cannot be undone.')) setItems([]); }}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 self-end sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-16 text-center text-slate-500 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-400 shadow-inner">
                  <Search className="w-8 h-8 animate-pulse" />
                </div>
                <div className="font-heading font-black text-slate-800 text-lg">No items added yet</div>
                <p className="text-xs font-semibold max-w-sm mx-auto text-slate-500">
                  Search for a product above and select it, then scan or enter a serial number for each unit (or a quantity for non-serial items).
                </p>
              </div>
            ) : (
              <div className="table-container border-0 rounded-none w-full overflow-x-auto">
                <table className="data-table w-full min-w-[650px]">
                  <thead>
                    <tr>
                      <th className="py-3.5 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider w-24">Barcode</th>
                      <th className="py-3.5 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider">Item & Serial Number</th>
                      <th className="py-3.5 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider text-center w-36">Quantity</th>
                      <th className="py-3.5 px-4 text-[11px] font-black text-slate-600 uppercase tracking-wider w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="py-4 px-4 font-mono font-bold text-xs text-slate-600">{item.barcode}</td>
                        <td className="py-4 px-4">
                          <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                            <span>{item.name}</span>
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                            {getCategoryIcon(item.category)}
                            <span>{item.category || 'Electronics'}</span>
                          </div>

                          {/* Serial Number Input (correction — primary entry is the Active Product panel above) */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-black uppercase px-2 py-1 rounded bg-blue-50 text-[#2563eb] border border-blue-200 flex items-center gap-1 whitespace-nowrap">
                              <Shield className="w-3 h-3 text-[#2563eb]" />
                              <span>Serial # Required:</span>
                            </span>
                            <input
                              type="text"
                              value={item.imei || ''}
                              onChange={(e) => updateItemImei(idx, e.target.value)}
                              placeholder="Serial number..."
                              className="bg-white border-2 border-slate-400 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-[#2563eb] w-full sm:max-w-xs shadow-inner placeholder:text-slate-400 placeholder:font-normal"
                            />
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div title="Each unit needs its own serial number — select this product above to add another." className="inline-flex flex-col items-center gap-1">
                            <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 shadow-inner text-sm font-black font-mono text-slate-500">
                              {item.qty}
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Select above for more</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Partner Attachment & Bill Finalization (1 Column) */}
        <div className="space-y-6">

          {/* Partner Selection Card */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 space-y-4 shadow-md border-t-4 border-t-amber-500">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3.5">
              <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-600" /> Partner
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(true)}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> New Partner
              </button>
            </div>

            {selectedCustomer ? (
              <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200 relative group shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-black text-slate-900 text-base">{customerPrimaryName(selectedCustomer)}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    {customerSecondaryName(selectedCustomer) && (
                      <div className="text-xs font-bold text-slate-700 mt-0.5">{customerSecondaryName(selectedCustomer)}</div>
                    )}
                    <div className="text-xs font-mono font-bold text-[#2563eb] mt-3 flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200 inline-block shadow-sm">
                      <span>{selectedCustomer.whatsapp}</span>
                    </div>
                    {selectedCustomer.email && (
                      <div className="text-[11px] font-semibold text-slate-500 mt-1.5">{selectedCustomer.email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-slate-600 hover:text-red-600 px-3 py-1.5 bg-white rounded-lg border border-slate-200 hover:border-red-200 transition-all font-bold shadow-sm"
                    title="Change Partner"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <label className="text-xs font-black text-slate-700 block mb-1.5 uppercase tracking-wider">
                  Search Partner Database
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Search by Phone #, Name, or Company..."
                    className="input-field pl-10 pr-4 py-3 text-sm bg-white border-slate-300 font-bold text-slate-900 rounded-xl shadow-inner focus:border-amber-500"
                  />
                </div>

                {/* Partner Results Dropdown */}
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {customerResults.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearchQuery('');
                          setShowCustomerDropdown(false);
                        }}
                        className="p-4 hover:bg-slate-50 cursor-pointer transition-all"
                      >
                        <div className="font-black text-sm text-slate-900 flex items-center justify-between">
                          <span>{customerPrimaryName(cust)}</span>
                          <span className="font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded border border-blue-200 font-bold">{cust.whatsapp}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-between mt-1">
                          <span>{customerSecondaryName(cust) || 'No contact name'}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">{cust.ordersCount || 0} past bills</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showCustomerDropdown && customerResults.length === 0 && customerSearchQuery.trim().length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-2xl p-5 text-center space-y-3 shadow-2xl">
                    <p className="text-xs font-bold text-slate-600">No matching partner found.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCustomerForm({ name: '', company: customerSearchQuery, whatsapp: '', email: '' });
                        setShowNewCustomerModal(true);
                      }}
                      className="btn btn-primary w-full py-2.5 text-xs font-bold shadow-md"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add as New Partner
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bill Summary & Final Checkout Card */}
          <div className="bg-white border-[3px] border-[#2563eb] rounded-2xl p-6 space-y-5 shadow-xl">
            <h3 className="font-heading font-black text-base text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b-2 border-slate-200 pb-3.5">
              <Calculator className="w-5 h-5 text-[#2563eb]" /> Bill Summary & Checkout
            </h3>

            <div className="flex justify-between items-center">
              <div>
                <span className="font-heading font-black text-lg text-slate-900 block">Total Units:</span>
                <span className="text-[11px] text-slate-500 font-bold">{items.length} line item{items.length !== 1 ? 's' : ''}</span>
              </div>
              <span className="font-heading font-black text-3xl text-[#2563eb] font-mono tracking-tight drop-shadow-sm">
                {totalUnits}
              </span>
            </div>

            {/* Finalize Button */}
            <button
              type="button"
              onClick={handleFinalizeBill}
              disabled={items.length === 0 || !selectedCustomer || !invoiceNumber.trim() || finalizing}
              className="btn btn-primary w-full py-4 text-base shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2.5 group font-black tracking-wide rounded-xl disabled:opacity-60"
            >
              <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
              <span>{finalizing ? 'Saving bill…' : 'Finalize & Save Bill (Ctrl+S)'}</span>
            </button>
            {(!selectedCustomer || items.length === 0 || !invoiceNumber.trim()) && (
              <p className="text-[11px] text-center text-amber-600 font-bold">
                ⚠️ Enter an invoice number, attach a partner, and add at least 1 item to unlock checkout.
              </p>
            )}

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] font-bold text-center text-slate-600 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-[#2563eb] flex-shrink-0" />
              <span>Instantly stores in queryable database & syncs with cloud.</span>
            </div>
          </div>

        </div>

      </div>

      {/* --- MODAL 1: Instant New Product Registration --- */}
      <Modal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        title="⚡ Register New Product"
        subtitle="Register a new product once — it'll be ready to select for this and every future bill."
        icon={Package}
      >
        <form onSubmit={handleSaveNewProduct} className="space-y-4 font-body">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3 text-xs font-bold text-amber-800 shadow-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>Barcode <b className="font-mono">{newProductForm.barcode}</b> is not in the database yet. Fill product details below to add it instantly!</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Barcode Number</label>
              <input
                type="text"
                value={newProductForm.barcode}
                onChange={(e) => setNewProductForm({ ...newProductForm, barcode: e.target.value })}
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                Category
                {!categoryTouched && newProductForm.name.trim() && (
                  <span className="text-[9px] normal-case font-bold text-emerald-600 ml-1.5">(auto-detected)</span>
                )}
              </label>
              <select
                value={newProductForm.category}
                onChange={(e) => {
                  setCategoryTouched(true);
                  setNewProductForm({ ...newProductForm, category: e.target.value });
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
              </select>
            </div>
          </div>

          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Product Name</label>
            <input
              type="text"
              value={newProductForm.name}
              onChange={(e) => {
                const name = e.target.value;
                const guess = !categoryTouched ? guessProductDefaults(name) : null;
                setNewProductForm((prev) => ({
                  ...prev,
                  name,
                  category: (!categoryTouched && guess) ? guess.category : prev.category
                }));
              }}
              placeholder="e.g. MacBook Air M3 (16GB RAM, 512GB SSD - Midnight)"
              className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              autoFocus
              required
            />
          </div>

          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Model / SKU (Optional)</label>
            <input
              type="text"
              value={newProductForm.sku}
              onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
              placeholder="e.g. MK1A3HN/A — used in warranty registry reports"
              className="input-field font-mono font-bold text-slate-900 bg-white border-slate-300 py-2.5"
            />
          </div>

          {/* Duplicate-catalog guard: this modal can be opened directly (header button) with a
              blank name, bypassing the main search entirely — so re-check against the database
              on every keystroke rather than assuming "no results" was already ruled out. */}
          {similarExistingProducts.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2.5 shadow-sm">
              <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Already in the database — use one of these instead of creating a duplicate?</span>
              </p>
              <div className="space-y-1.5">
                {similarExistingProducts.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      setShowNewProductModal(false);
                      selectActiveProduct(p);
                    }}
                    className="w-full text-left p-2.5 rounded-lg bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50/60 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="font-bold text-xs text-slate-900">{p.name}</span>
                    <span className="font-mono text-[10px] text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold whitespace-nowrap">{p.barcode}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Packaging</label>
              <div className="input-field font-bold text-slate-600 bg-slate-100 border-slate-300 py-2.5 flex items-center">
                1 Box per unit
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 mt-6">
            <button
              type="button"
              onClick={() => setShowNewProductModal(false)}
              className="btn btn-outline font-bold px-5 py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary font-bold px-6 py-2.5 shadow-md"
            >
              <Plus className="w-4 h-4" /> Save & Set as Active
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 2: Instant New Partner Registration --- */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="👥 Add New Partner"
        subtitle="Register partner details once. They'll be available to attach on every future bill."
        icon={UserPlus}
      >
        <form onSubmit={handleSaveNewCustomer} className="space-y-4 font-body">
          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Company / Business Name</label>
            <input
              type="text"
              value={newCustomerForm.company}
              onChange={(e) => setNewCustomerForm({ ...newCustomerForm, company: e.target.value })}
              placeholder="e.g. Omega Tech Solutions Ltd"
              className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              autoFocus
              required
            />
          </div>

          <div className="form-group mb-0">
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Partner / Contact Person Name (Optional)</label>
            <input
              type="text"
              value={newCustomerForm.name}
              onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
              placeholder="e.g. Rajesh Kumar"
              className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Phone Number (Optional)</label>
              <input
                type="text"
                value={newCustomerForm.whatsapp}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, whatsapp: e.target.value })}
                placeholder="+91 98765 43210"
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Email Address (Optional)</label>
              <input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="rajesh@omegatech.com"
                className="input-field font-mono font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 mt-6">
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(false)}
              className="btn btn-outline font-bold px-5 py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary font-bold px-6 py-2.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" /> Save & Attach Partner
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 3: Bill Finalized Confirmation --- */}
      <Modal
        isOpen={showSuccessModal}
        onClose={resetForNextBill}
        title="🎉 Bill Saved!"
        subtitle="Invoice has been saved to the database and synchronized with the cloud."
        icon={Sparkles}
        maxWidth="max-w-lg"
      >
        {savedInvoice && (
          <div className="space-y-6 text-center font-body">
            <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-md border-t-4 border-t-emerald-600">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>
              <h3 className="font-heading font-black text-2xl text-slate-900">
                Invoice #{savedInvoice.invoiceNo || savedInvoice.id}
              </h3>
              <div className="flex items-center justify-center gap-2 font-mono text-xs font-bold text-slate-600">
                <span>{new Date(savedInvoice.date).toLocaleString()}</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm px-4 font-bold">
                <span className="text-slate-500">Partner:</span>
                <span className="text-slate-900">{customerPrimaryName(savedInvoice.customer)}</span>
              </div>
              <div className="flex justify-between items-center text-sm px-4 font-bold">
                <span className="text-slate-500">Units Dispatched:</span>
                <span className="font-mono font-black text-2xl text-[#2563eb]">{savedInvoice.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0}</span>
              </div>
            </div>

            {/* Warranty registry outcome for this bill's serials */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-[#2563eb]" /> Warranty Registry
              </div>
              {!registryReport || registryReport.invoiceId !== savedInvoice.id ? (
                <p className="text-xs font-semibold text-slate-500">Registering serial numbers…</p>
              ) : (
                <div className="text-xs font-bold space-y-1">
                  {registryReport.registered.length > 0 && (
                    <p className="text-emerald-600">✓ {registryReport.registered.length} serial{registryReport.registered.length === 1 ? '' : 's'} registered</p>
                  )}
                  {registryReport.duplicates.length > 0 && (
                    <p className="text-amber-600">
                      ⚠ {registryReport.duplicates.length} already registered — skipped ({registryReport.duplicates.map((d) => d.serial).join(', ')})
                    </p>
                  )}
                  {registryReport.failed.length > 0 && (
                    <p className="text-red-500">
                      ✗ {registryReport.failed.length} not registered (offline/network) — register later via Serial Capture
                    </p>
                  )}
                  {registryReport.registered.length === 0 && registryReport.duplicates.length === 0 && registryReport.failed.length === 0 && (
                    <p className="text-slate-500">No serials to register.</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  onViewInvoice(savedInvoice.id);
                }}
                className="btn btn-outline font-bold w-full py-3.5"
              >
                <FileText className="w-4 h-4 text-slate-700" /> View in Archive / Print
              </button>
              <button
                type="button"
                onClick={resetForNextBill}
                className="btn btn-primary font-bold w-full py-3.5 shadow-md"
              >
                <span>Next Bill</span> <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
