import React, { useState, useEffect, useRef } from 'react';
import {
  ScanLine,
  Search,
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Package,
  MapPin,
  Clock,
  Hash,
  User,
  ShieldCheck,
  ShieldAlert,
  WifiOff,
  Loader2,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { storageService } from '../services/storage';
import { audioService } from '../services/audio';
import { firebaseService } from '../services/firebase';
import { guessProductDefaults } from '../utils/productDefaults';
import { useAuth } from '../context/AuthContext';
import { normalizeSerial, SERIAL_MIN_LENGTH } from '../config/appConfig';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';

export const SerialCapture = () => {
  const { user, staff } = useAuth();

  // Product selection
  const [activeProduct, setActiveProduct] = useState(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchInputRef = useRef(null);

  // Serial scanning
  const [serialInput, setSerialInput] = useState('');
  const [serialError, setSerialError] = useState(null); // { message, existing? }
  const [pendingSerials, setPendingSerials] = useState([]);
  const serialInputRef = useRef(null);

  // Customer
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Context fields
  const [invoiceNo, setInvoiceNo] = useState('');
  const [locationId, setLocationId] = useState(staff?.locationId || '');
  const [remarks, setRemarks] = useState('');
  const [locations, setLocations] = useState(() => storageService.getActiveLocations());

  // Submission
  const [validationError, setValidationError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [isOnline, setIsOnline] = useState(firebaseService.isOnline);

  // Quick-add modals (same patterns as BillingDesk)
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ barcode: '', name: '', sku: '', category: 'Mobile Phones', unit: 'Box' });
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', company: '', whatsapp: '', email: '' });

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const handleNetwork = (e) => setIsOnline(e.detail?.online ?? navigator.onLine);
    window.addEventListener('network-status-change', handleNetwork);
    return () => window.removeEventListener('network-status-change', handleNetwork);
  }, []);

  useEffect(() => {
    const refreshLocations = (e) => {
      if (e.detail?.type === 'locations') setLocations(storageService.getActiveLocations());
    };
    window.addEventListener('crown-data-change', refreshLocations);
    return () => window.removeEventListener('crown-data-change', refreshLocations);
  }, []);

  // Default the location once the mirror arrives (first login on a fresh browser).
  useEffect(() => {
    if (!locationId && locations.length > 0) {
      setLocationId(staff?.locationId && locations.some(l => l.id === staff.locationId) ? staff.locationId : locations[0].id);
    }
  }, [locations, locationId, staff?.locationId]);

  // Focus the scan input on product selection — same discipline as BillingDesk.
  useEffect(() => {
    if (activeProduct) serialInputRef.current?.focus();
  }, [activeProduct?.id]);

  // Product autocomplete (name / barcode / sku / category)
  useEffect(() => {
    if (productSearchQuery.trim().length > 0) {
      const q = productSearchQuery.toLowerCase();
      setProductResults(storageService.getProducts().filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.includes(productSearchQuery) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      ));
      setShowProductDropdown(true);
    } else {
      setProductResults([]);
      setShowProductDropdown(false);
    }
  }, [productSearchQuery]);

  // Customer autocomplete
  useEffect(() => {
    if (customerSearchQuery.trim().length > 0) {
      setCustomerResults(storageService.searchCustomers(customerSearchQuery));
      setShowCustomerDropdown(true);
    } else {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
    }
  }, [customerSearchQuery]);

  // Invoice cross-reference: matching an archive invoice is a convenience, not a requirement —
  // registrations may reference invoices from an external/older billing system.
  const invoiceMatch = invoiceNo.trim() ? storageService.getInvoiceById(invoiceNo.trim()) : null;

  const selectActiveProduct = (product) => {
    setActiveProduct(product);
    setSerialInput('');
    setSerialError(null);
  };

  // Scan-time validation: blocks batch-internal repeats and anything already in the registry,
  // logging the attempt immediately (requirement: duplicate attempts are tracked even if the
  // operator never hits Register).
  const commitSerial = () => {
    const raw = serialInput.trim();
    const normalized = normalizeSerial(raw);

    if (!normalized || normalized.length < SERIAL_MIN_LENGTH) {
      audioService.playError();
      setSerialError({ message: `Serial must be at least ${SERIAL_MIN_LENGTH} characters.` });
      return;
    }
    if (pendingSerials.some(s => s.normalized === normalized)) {
      audioService.playError();
      setSerialError({ message: `"${raw}" is already in this batch.` });
      return;
    }
    const existing = storageService.findSerial(normalized);
    if (existing) {
      audioService.playError();
      setSerialError({ message: `"${raw}" is already registered — duplicate blocked.`, existing });
      storageService.logDuplicateAttempt({
        serial: normalized,
        source: 'capture',
        locationId,
        invoiceNoAttempted: invoiceNo.trim(),
        productIdAttempted: activeProduct?.id || '',
        existing
      });
      return;
    }

    setPendingSerials(prev => [...prev, { raw, normalized }]);
    setSerialInput('');
    setSerialError(null);
    audioService.playBeep();
    serialInputRef.current?.focus();
  };

  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSerial();
    }
  };

  const removePendingSerial = (normalized) => {
    setPendingSerials(prev => prev.filter(s => s.normalized !== normalized));
  };

  const handleSaveNewProduct = (e) => {
    e.preventDefault();
    if (!newProductForm.name) return;
    if (storageService.isBarcodeInUse(newProductForm.barcode)) {
      alert(`Barcode ${newProductForm.barcode} is already assigned to another device in the catalog. Please use a unique barcode.`);
      return;
    }
    const saved = storageService.saveProduct({ ...newProductForm });
    audioService.playBeep();
    selectActiveProduct(saved);
    setShowNewProductModal(false);
  };

  const handleSaveNewCustomer = (e) => {
    e.preventDefault();
    if (!newCustomerForm.company.trim()) return;
    const saved = storageService.saveCustomer(newCustomerForm);
    setSelectedCustomer(saved);
    setShowNewCustomerModal(false);
    setCustomerSearchQuery('');
  };

  // Mandatory-field validation (requirement 13), then the cloud-authoritative batch write.
  const handleRegister = async () => {
    const problems = [];
    if (!activeProduct) problems.push('select a product');
    if (pendingSerials.length === 0) problems.push('scan at least one serial number');
    if (!selectedCustomer) problems.push('attach a customer');
    if (selectedCustomer && !selectedCustomer.whatsapp) problems.push('customer needs a mobile number');
    if (!locationId) problems.push('choose a store location');
    if (problems.length > 0) {
      audioService.playError();
      setValidationError(`Before registering: ${problems.join(', ')}.`);
      return;
    }

    setValidationError('');
    setRegistering(true);
    const result = await storageService.registerSerials({
      product: activeProduct,
      serials: pendingSerials.map(s => s.raw),
      customer: selectedCustomer,
      invoiceNo: invoiceNo.trim(),
      locationId,
      locationName: storageService.getLocationName(locationId),
      remarks: remarks.trim(),
      source: 'capture'
    });
    setRegistering(false);
    setBatchResult(result);

    if (result.registered.length > 0 && result.duplicates.length === 0 && result.failed.length === 0) {
      audioService.playSuccess();
    } else {
      audioService.playError();
    }
  };

  // Clears the registered/duplicate serials from the batch. Network-failed serials stay queued
  // (as the result modal promises) — and if any exist, the product/customer context is kept too,
  // since those serials still need it to register.
  const startNextBatch = ({ keepContext }) => {
    const failedSet = new Set((batchResult?.failed || []).map((f) => f.serial));
    const hasFailures = failedSet.size > 0;
    setPendingSerials((prev) => prev.filter((s) => failedSet.has(s.normalized)));
    setSerialInput('');
    setSerialError(null);
    setBatchResult(null);
    if (!keepContext && !hasFailures) {
      setActiveProduct(null);
      setSelectedCustomer(null);
      setInvoiceNo('');
      setRemarks('');
    } else {
      serialInputRef.current?.focus();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-body">

      {!isOnline && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-sm font-bold text-amber-800 shadow-sm">
          <WifiOff className="w-5 h-5 flex-shrink-0 text-amber-600" />
          <span>
            Internet connection required — serial uniqueness is verified live against the central database,
            so registration is paused while offline. Scanned serials stay in the batch below and can be
            registered the moment the connection returns.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT (2 cols): product + serial scanning */}
        <div className="lg:col-span-2 space-y-6">

          {/* Product selector */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 space-y-4 shadow-md border-t-4 border-t-[#2563eb]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-4 h-4 text-[#2563eb]" />
                <span>Product to Register</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewProductForm({
                    barcode: Math.floor(1000000 + Math.random() * 9000000).toString(),
                    name: '', sku: '', category: 'Mobile Phones', unit: 'Box'
                  });
                  setCategoryTouched(false);
                  setShowNewProductModal(true);
                }}
                className="text-[#2563eb] hover:text-blue-800 font-heading text-xs flex items-center gap-1 font-black bg-blue-50 px-3 py-1.5 rounded-lg border-2 border-blue-200 shadow-sm self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Product
              </button>
            </div>

            {activeProduct ? (
              <div className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-blue-50/60 border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white border border-blue-200 text-[#2563eb] shadow-sm">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-heading font-black text-slate-900 text-base block">{activeProduct.name}</span>
                    <div className="text-[11px] font-bold text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      {activeProduct.sku && (
                        <span className="font-mono text-[#2563eb] bg-white px-2 py-0.5 rounded border border-blue-200">SKU: {activeProduct.sku}</span>
                      )}
                      <span className="font-mono">#{activeProduct.barcode}</span>
                      <span>•</span>
                      <span>{activeProduct.category}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setActiveProduct(null); productSearchInputRef.current?.focus(); }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={productSearchInputRef}
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Search by model name, SKU, or barcode..."
                  className="input-field pl-11 pr-4 py-3.5 font-bold bg-white text-base border-slate-300 text-slate-900 shadow-inner w-full rounded-xl focus:border-[#2563eb]"
                  autoFocus
                />

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
                        className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                            {prod.sku || prod.barcode}
                          </span>
                          <div>
                            <div className="font-black text-sm text-slate-900">{prod.name}</div>
                            <div className="text-xs font-semibold text-slate-500 mt-0.5">{prod.category}</div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300" />
                      </div>
                    ))}
                  </div>
                )}

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
            )}
          </div>

          {/* Serial scanner panel */}
          {activeProduct && (
            <div className="bg-white border-2 border-purple-300 rounded-2xl p-6 space-y-4 shadow-md border-t-4 border-t-purple-600">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ScanLine className="w-4 h-4 text-purple-600" />
                  <span>Scan or Enter Serial Numbers</span>
                </label>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200 whitespace-nowrap">
                  {pendingSerials.length} in batch
                </span>
              </div>

              <input
                ref={serialInputRef}
                type="text"
                value={serialInput}
                onChange={(e) => { setSerialInput(e.target.value); setSerialError(null); }}
                onKeyDown={handleSerialKeyDown}
                placeholder="Scan the unit's serial/IMEI sticker, then press Enter..."
                className="bg-white border-2 border-purple-300 rounded-xl px-4 py-3 text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600 shadow-inner w-full"
              />

              {serialError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3.5 space-y-1.5">
                  <p className="text-xs font-black text-red-600 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" /> {serialError.message}
                  </p>
                  {serialError.existing && (
                    <p className="text-[11px] font-bold text-red-500 pl-5.5 ml-5">
                      Registered {serialError.existing.date ? new Date(serialError.existing.date).toLocaleString() : ''} by{' '}
                      {serialError.existing.registeredByName || serialError.existing.createdBy || 'unknown'}
                      {serialError.existing.invoiceNo ? ` • Invoice ${serialError.existing.invoiceNo}` : ''}
                      {serialError.existing.locationName ? ` • ${serialError.existing.locationName}` : ''}
                      {serialError.existing.productName ? ` • ${serialError.existing.productName}` : ''}
                    </p>
                  )}
                </div>
              )}

              <p className="text-[11px] text-slate-500 font-semibold">
                Hardware scanner ready — each scan validates instantly against every store location and adds to the batch.
              </p>

              {pendingSerials.length > 0 && (
                <div className="border-2 border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {pendingSerials.map((s, idx) => (
                    <div key={s.normalized} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 w-5">{idx + 1}.</span>
                        <span className="font-mono font-bold text-sm text-slate-900">{s.normalized}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingSerial(s.normalized)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Remove from batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT (1 col): customer + context + register */}
        <div className="space-y-6">

          {/* Customer card */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 space-y-4 shadow-md border-t-4 border-t-amber-500">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3.5">
              <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-600" /> Customer
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(true)}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            {selectedCustomer ? (
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-heading font-black text-slate-900 text-base flex items-center gap-2">
                      {customerPrimaryName(selectedCustomer)} <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </span>
                    {customerSecondaryName(selectedCustomer) && (
                      <div className="text-xs font-bold text-slate-600 mt-0.5">{customerSecondaryName(selectedCustomer)}</div>
                    )}
                    <div className="text-xs font-mono font-bold text-[#2563eb] mt-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200 inline-block shadow-sm">
                      {selectedCustomer.whatsapp || 'No mobile number!'}
                    </div>
                    {selectedCustomer.email && (
                      <div className="text-[11px] font-semibold text-slate-500 mt-1.5">{selectedCustomer.email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-slate-600 hover:text-red-600 px-3 py-1.5 bg-white rounded-lg border border-slate-200 hover:border-red-200 transition-all font-bold shadow-sm"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Search by Name, Mobile, or Email..."
                    className="input-field pl-10 pr-4 py-3 text-sm bg-white border-slate-300 font-bold text-slate-900 rounded-xl shadow-inner focus:border-amber-500"
                  />
                </div>

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
                        className="p-3.5 hover:bg-slate-50 cursor-pointer transition-all"
                      >
                        <div className="font-black text-sm text-slate-900 flex items-center justify-between">
                          <span>{customerPrimaryName(cust)}</span>
                          <span className="font-mono text-xs text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">{cust.whatsapp}</span>
                        </div>
                        {customerSecondaryName(cust) && (
                          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{customerSecondaryName(cust)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {showCustomerDropdown && customerResults.length === 0 && customerSearchQuery.trim().length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-white border-2 border-slate-300 rounded-2xl p-4 text-center space-y-2.5 shadow-2xl">
                    <p className="text-xs font-bold text-slate-600">No matching customer found.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCustomerForm({ name: customerSearchQuery, company: '', whatsapp: '', email: '' });
                        setShowNewCustomerModal(true);
                      }}
                      className="btn btn-primary w-full py-2.5 text-xs font-bold shadow-md"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add as New Customer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Registration context */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 space-y-4 shadow-md">
            <h3 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b-2 border-slate-200 pb-3.5">
              <Hash className="w-4 h-4 text-[#2563eb]" /> Registration Details
            </h3>

            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Invoice Number</label>
              <input
                type="text"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-10021"
                className="input-field font-mono font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              />
              {invoiceNo.trim() && (
                invoiceMatch ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Found in archive — {customerPrimaryName(invoiceMatch.customer)}
                    </span>
                    {invoiceMatch.customer && !selectedCustomer && (
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(invoiceMatch.customer)}
                        className="text-[11px] font-bold text-[#2563eb] hover:underline whitespace-nowrap"
                      >
                        Use its customer
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Not in the invoice archive — external invoice numbers are accepted.
                  </p>
                )
              )}
            </div>

            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#2563eb]" /> Store / Warehouse Location
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2.5"
              >
                <option value="">Select location…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}{loc.code ? ` (${loc.code})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Date &amp; Time
                </span>
                <span className="font-mono font-bold text-slate-900 block mt-1">
                  {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Operator
                </span>
                <span className="font-bold text-slate-900 block mt-1 truncate" title={user?.email}>
                  {user?.displayName || user?.email}
                </span>
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Remarks (Optional)
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                placeholder="Warranty notes, delivery info, condition..."
                className="input-field font-semibold text-slate-800 bg-white border-slate-300 py-2.5 resize-none"
              />
            </div>
          </div>

          {/* Register button */}
          <div className="bg-white border-[3px] border-[#2563eb] rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <span className="font-heading font-black text-lg text-slate-900">Batch Total:</span>
              <span className="font-heading font-black text-3xl text-[#2563eb] font-mono">{pendingSerials.length}</span>
            </div>
            <button
              type="button"
              onClick={handleRegister}
              disabled={registering || !isOnline || pendingSerials.length === 0}
              className="btn btn-primary w-full py-4 text-base shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2.5 font-black tracking-wide rounded-xl disabled:opacity-50"
            >
              {registering ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              <span>{registering ? 'Registering…' : `Register ${pendingSerials.length || ''} Serial${pendingSerials.length === 1 ? '' : 's'}`}</span>
            </button>
            {validationError && (
              <p className="text-[11px] text-center text-red-500 font-bold" role="alert">⚠️ {validationError}</p>
            )}
            {!isOnline && (
              <p className="text-[11px] text-center text-amber-600 font-bold">Registration resumes automatically when back online.</p>
            )}
          </div>
        </div>
      </div>

      {/* New product modal (with SKU) */}
      <Modal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        title="⚡ Register New Product"
        subtitle="Added to the shared product master — available in billing and serial capture immediately."
        icon={Package}
      >
        <form onSubmit={handleSaveNewProduct} className="space-y-4 font-body">
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
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Model / SKU (Optional)</label>
              <input
                type="text"
                value={newProductForm.sku}
                onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                placeholder="e.g. MK1A3HN/A"
                className="input-field font-mono font-bold text-slate-900 bg-white border-slate-300 py-2.5"
              />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Category</label>
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
                <option value="General">General</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 mt-6">
            <button type="button" onClick={() => setShowNewProductModal(false)} className="btn btn-outline font-bold px-5 py-2.5">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary font-bold px-6 py-2.5 shadow-md">
              <Plus className="w-4 h-4" /> Save &amp; Select
            </button>
          </div>
        </form>
      </Modal>

      {/* New customer modal */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="👥 Add New Customer"
        subtitle="Added to the shared customer master — available everywhere immediately."
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
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Customer / Contact Name (Optional)</label>
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
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Mobile Number (Optional)</label>
              <input
                type="text"
                value={newCustomerForm.whatsapp}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, whatsapp: e.target.value })}
                placeholder="+971 50 123 4567"
                className="input-field font-mono font-bold text-[#2563eb] bg-white border-slate-300 py-2.5"
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">Email (Optional)</label>
              <input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="customer@email.com"
                className="input-field font-mono font-semibold text-slate-800 bg-white border-slate-300 py-2.5"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 mt-6">
            <button type="button" onClick={() => setShowNewCustomerModal(false)} className="btn btn-outline font-bold px-5 py-2.5">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary font-bold px-6 py-2.5 shadow-md">
              <CheckCircle2 className="w-4 h-4" /> Save &amp; Attach
            </button>
          </div>
        </form>
      </Modal>

      {/* Batch result modal */}
      <Modal
        isOpen={!!batchResult}
        onClose={() => startNextBatch({ keepContext: true })}
        title={batchResult?.registered.length > 0 ? '✅ Batch Registered' : '⚠️ Nothing Registered'}
        subtitle="Result of the duplicate-checked registration against the central database."
        icon={ShieldCheck}
        maxWidth="max-w-lg"
      >
        {batchResult && (
          <div className="space-y-5 font-body">
            {batchResult.registered.length > 0 && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-black text-emerald-700 flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-4 h-4" /> {batchResult.registered.length} registered successfully
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {batchResult.registered.map((r) => (
                    <span key={r.serial} className="font-mono text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded">
                      {r.serial}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {batchResult.duplicates.length > 0 && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-black text-red-600 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> {batchResult.duplicates.length} blocked as duplicates (attempt logged)
                </p>
                {batchResult.duplicates.map((d) => (
                  <div key={d.serial} className="text-[11px] font-bold text-red-500 bg-white border border-red-200 rounded-lg px-3 py-2">
                    <span className="font-mono">{d.serial}</span> — already registered
                    {d.existing?.date ? ` on ${new Date(d.existing.date).toLocaleDateString()}` : ''}
                    {d.existing?.invoiceNo ? ` (Invoice ${d.existing.invoiceNo})` : ''}
                    {d.existing?.registeredByName ? ` by ${d.existing.registeredByName}` : ''}
                  </div>
                ))}
              </div>
            )}

            {batchResult.failed.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <p className="text-xs font-black text-amber-700 flex items-center gap-1.5 mb-1.5">
                  <WifiOff className="w-4 h-4" /> {batchResult.failed.length} failed (network) — kept in the batch, retry when online
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {batchResult.failed.map((f) => (
                    <span key={f.serial} className="font-mono text-[11px] font-bold text-amber-700 bg-white border border-amber-200 px-2 py-0.5 rounded">
                      {f.serial}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => startNextBatch({ keepContext: true })}
                className="btn btn-outline font-bold w-full py-3"
              >
                Same Customer, Next Batch
              </button>
              <button
                type="button"
                onClick={() => startNextBatch({ keepContext: false })}
                className="btn btn-primary font-bold w-full py-3 shadow-md"
              >
                <span>New Registration</span> <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
