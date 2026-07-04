import React, { useState, useEffect } from 'react';
import { 
  Scan, 
  Plus, 
  Trash2, 
  UserPlus, 
  CheckCircle2, 
  Search, 
  MessageSquare, 
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
  Info
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BarcodeListener } from '../components/BarcodeListener';
import { Modal } from '../components/Modal';
import { storageService } from '../services/storage';
import { audioService } from '../services/audio';

export const BillingDesk = ({ onViewInvoice }) => {
  // Invoice Header State
  const [whatsappRef, setWhatsappRef] = useState('#WA-' + Math.floor(1000 + Math.random() * 9000));
  const [notes, setNotes] = useState('');
  
  // Bill Items State
  const [items, setItems] = useState([]);
  
  // Customer State
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
    category: 'Mobile Phones', 
    price: '', 
    stock: '50', 
    unit: 'Unit',
    imeiRequired: true 
  });
  
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', company: '', whatsapp: '', email: '' });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState(null);

  // Totals & Calculations
  const [taxRate, setTaxRate] = useState(10); // 10% default
  const [discount, setDiscount] = useState(0);

  const subtotal = items.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = Math.max(0, subtotal + taxAmount - discount);

  // Keyboard shortcut Ctrl+S to save bill
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (items.length > 0 && selectedCustomer) {
          handleFinalizeBill();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedCustomer, whatsappRef, notes, taxRate, discount]);

  // Handle Hardware Barcode Scan
  const handleBarcodeScan = (scannedBarcode) => {
    const barcode = scannedBarcode.trim();
    if (!barcode) return;

    const existingProd = storageService.getProductByBarcode(barcode);

    if (existingProd) {
      audioService.playBeep();
      addItemToBill(existingProd);
    } else {
      // Unknown barcode -> play error and open registration modal!
      audioService.playError();
      setNewProductForm({
        barcode: barcode,
        name: '',
        category: 'Mobile Phones',
        price: '',
        stock: '30',
        unit: 'Unit',
        imeiRequired: true
      });
      setShowNewProductModal(true);
    }
  };

  const addItemToBill = (product, qtyToAdd = 1) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex(item => item.id === product.id || item.barcode === product.barcode);
      if (existingIdx >= 0 && !product.imeiRequired) {
        // For accessories/non-IMEI items, increment qty
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: updated[existingIdx].qty + qtyToAdd,
          total: (updated[existingIdx].qty + qtyToAdd) * updated[existingIdx].price
        };
        return updated;
      } else {
        // For laptops/phones requiring IMEI, add as distinct line item or standard item
        return [{
          id: product.id + (product.imeiRequired ? '-' + Date.now() : ''),
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          category: product.category || 'Electronics',
          price: Number(product.price),
          qty: qtyToAdd,
          unit: product.unit || 'Unit',
          total: Number(product.price) * qtyToAdd,
          imei: '',
          imeiRequired: product.imeiRequired
        }, ...prev];
      }
    });
    setProductSearchQuery('');
    setShowProductDropdown(false);
  };

  const updateItemQty = (index, newQty) => {
    const qty = Math.max(1, Number(newQty) || 1);
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qty: qty, total: qty * updated[index].price };
      return updated;
    });
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

  // Customer Search Autocomplete
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

  // Save New Product & Attach to Bill
  const handleSaveNewProduct = (e) => {
    e.preventDefault();
    if (!newProductForm.name || !newProductForm.price) return;

    const savedProd = storageService.saveProduct({
      ...newProductForm,
      price: Number(newProductForm.price),
      stock: Number(newProductForm.stock)
    });

    audioService.playBeep();
    addItemToBill(savedProd);
    setShowNewProductModal(false);
  };

  // Save New Customer & Attach to Bill
  const handleSaveNewCustomer = (e) => {
    e.preventDefault();
    if (!newCustomerForm.name || !newCustomerForm.whatsapp) return;

    const savedCust = storageService.saveCustomer(newCustomerForm);
    setSelectedCustomer(savedCust);
    setShowNewCustomerModal(false);
    setCustomerSearchQuery('');
  };

  // Finalize & Save Invoice
  const handleFinalizeBill = () => {
    if (items.length === 0) {
      alert("Please scan or add at least one electronics item to the bill.");
      return;
    }
    if (!selectedCustomer) {
      alert("Please select or attach a customer to this bill.");
      return;
    }

    const invoiceData = {
      whatsappRef: whatsappRef.trim() || '#WA-' + Math.floor(1000 + Math.random() * 9000),
      date: new Date().toISOString(),
      customer: selectedCustomer,
      items: items,
      subtotal: subtotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      discount: discount,
      total: total,
      status: 'Paid',
      notes: notes
    };

    const saved = storageService.saveInvoice(invoiceData);
    audioService.playSuccess();
    
    // Launch celebratory confetti
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 }
    });

    setSavedInvoice(saved);
    setShowSuccessModal(true);
  };

  const resetForNextBill = () => {
    setItems([]);
    setSelectedCustomer(null);
    setWhatsappRef('#WA-' + Math.floor(1000 + Math.random() * 9000));
    setNotes('');
    setDiscount(0);
    setShowSuccessModal(false);
    setSavedInvoice(null);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Hardware Scanner Listener & Banner */}
      <BarcodeListener onScan={handleBarcodeScan} isEnabled={!showNewProductModal && !showNewCustomerModal && !showSuccessModal} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT & CENTER: Bill Items & Scanning Desk (Takes 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Top Control Bar: WhatsApp Ref & Manual Product Search */}
          <div className="glass-panel p-5 space-y-4 border-t-2 border-t-emerald-500/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1 sm:flex-initial">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    WhatsApp Invoice Ref #
                  </label>
                  <input
                    type="text"
                    value={whatsappRef}
                    onChange={(e) => setWhatsappRef(e.target.value)}
                    placeholder="#WA-1234"
                    className="bg-slate-900/90 border border-white/20 rounded-xl px-3.5 py-1.5 font-mono font-bold text-emerald-400 text-sm focus:outline-none focus:border-emerald-500 w-full sm:w-48 mt-1 shadow-inner"
                  />
                </div>
              </div>

              <div className="text-right hidden sm:block">
                <span className="text-[11px] text-slate-400 font-medium block">Billing Timestamp</span>
                <span className="text-xs font-mono font-bold text-slate-200 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/5 inline-block mt-0.5">
                  {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Manual Product Search Bar */}
            <div className="relative">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Scan className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Scan Barcode or Search Electronics (Laptops, Phones)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewProductForm({ 
                      barcode: Math.floor(1000000 + Math.random() * 9000000).toString(), 
                      name: '', 
                      category: 'Mobile Phones', 
                      price: '', 
                      stock: '30', 
                      unit: 'Unit',
                      imeiRequired: true 
                    });
                    setShowNewProductModal(true);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-heading lowercase text-xs flex items-center gap-1 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
                >
                  <Plus className="w-3.5 h-3.5" /> add custom device
                </button>
              </label>
              
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Type device model (e.g. iPhone 15, MacBook Pro), barcode, or category..."
                  className="input-field pl-10 pr-28 py-3.5 font-medium bg-slate-900/95 text-base border-emerald-500/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (productSearchQuery.trim()) {
                      handleBarcodeScan(productSearchQuery);
                      setProductSearchQuery('');
                    }
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md hover:from-emerald-400 hover:to-teal-500 text-xs font-bold font-heading flex items-center gap-1.5 transition-all"
                >
                  <Scan className="w-3.5 h-3.5" /> Scan/Add
                </button>
              </div>

              {/* Product Autocomplete Dropdown */}
              {showProductDropdown && productResults.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-[#0c1322] border border-white/20 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-white/5">
                  {productResults.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => addItemToBill(prod)}
                      className="p-3.5 hover:bg-slate-800/90 cursor-pointer flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30 font-bold group-hover:scale-105 transition-transform">
                          {prod.barcode}
                        </span>
                        <div>
                          <div className="font-semibold text-sm text-white flex items-center gap-2">
                            <span>{prod.name}</span>
                            {prod.imeiRequired && (
                              <span className="badge badge-info text-[9px] px-1.5 py-0.5">IMEI REQ</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {getCategoryIcon(prod.category)}
                            <span>{prod.category}</span>
                            <span>•</span>
                            <span className={prod.stock > 10 ? 'text-emerald-400' : 'text-amber-400'}>{prod.stock} in stock</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold font-mono text-emerald-400 text-base">${Number(prod.price).toFixed(2)}</span>
                        <span className="text-[11px] text-slate-400 block">per {prod.unit || 'Unit'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Scanned Items Table */}
          <div className="glass-panel overflow-hidden border-t-2 border-t-cyan-500/50">
            <div className="p-4 border-b border-white/10 bg-slate-900/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-cyan-400" />
                <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
                  Scanned Devices & Electronics
                </h3>
                <span className="badge badge-info text-[11px]">{items.length} items</span>
              </div>
              {items.length > 0 && (
                <button
                  onClick={() => setItems([])}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-14 text-center text-slate-500 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-white/10 mx-auto flex items-center justify-center text-cyan-400 shadow-inner">
                  <Scan className="w-8 h-8 animate-pulse" />
                </div>
                <div className="font-heading font-semibold text-slate-300 text-base">No devices scanned yet</div>
                <p className="text-xs max-w-sm mx-auto text-slate-400">
                  Scan a barcode using your physical scanner gun or use the search box above to add laptops, mobile phones, or accessories.
                </p>
              </div>
            ) : (
              <div className="table-container border-0 rounded-none">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th className="w-24">Barcode</th>
                      <th>Device & IMEI / Serial Number</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-center w-36">Quantity</th>
                      <th className="text-right">Total</th>
                      <th className="w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id || idx} className="group">
                        <td className="font-mono text-xs text-slate-400">{item.barcode}</td>
                        <td>
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{item.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {getCategoryIcon(item.category)}
                            <span>{item.category || 'Electronics'}</span>
                          </div>
                          
                          {/* IMEI / Serial Number Warranty Input */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                              <Shield className="w-2.5 h-2.5 text-cyan-400" />
                              <span>{item.imeiRequired ? 'IMEI / SN Req:' : 'Serial # (Opt):'}</span>
                            </span>
                            <input
                              type="text"
                              value={item.imei || ''}
                              onChange={(e) => updateItemImei(idx, e.target.value)}
                              placeholder={item.imeiRequired ? "Scan or enter 15-digit IMEI..." : "Warranty serial number..."}
                              className="bg-slate-900/90 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400 w-full max-w-xs shadow-inner placeholder:text-slate-600"
                            />
                          </div>
                        </td>
                        <td className="text-right font-mono text-slate-300 font-semibold">
                          ${item.price.toFixed(2)}
                        </td>
                        <td className="text-center">
                          <div className="inline-flex items-center bg-slate-900 border border-white/15 rounded-xl p-0.5 shadow-inner">
                            <button
                              type="button"
                              onClick={() => updateItemQty(idx, item.qty - 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold transition-colors"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => updateItemQty(idx, e.target.value)}
                              className="w-12 text-center bg-transparent text-sm font-bold font-mono text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(idx, item.qty + 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="text-right font-mono font-black text-emerald-400 text-lg">
                          ${item.total.toFixed(2)}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-all"
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

        {/* RIGHT COLUMN: Customer Attachment & Bill Finalization (1 Column) */}
        <div className="space-y-6">
          
          {/* Customer Selection Card */}
          <div className="glass-panel p-5 space-y-4 border-t-2 border-t-amber-500/50">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" /> Customer Attachment
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(true)}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20"
              >
                <Plus className="w-3.5 h-3.5" /> New Customer
              </button>
            </div>

            {selectedCustomer ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/40 relative group shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-white text-base">{selectedCustomer.name}</span>
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    </div>
                    {selectedCustomer.company && (
                      <div className="text-xs text-slate-300 font-medium mt-0.5">{selectedCustomer.company}</div>
                    )}
                    <div className="text-xs font-mono text-amber-300 mt-2.5 flex items-center gap-2 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/5 inline-block">
                      <span>WhatsApp: {selectedCustomer.whatsapp}</span>
                    </div>
                    {selectedCustomer.email && (
                      <div className="text-[11px] text-slate-400 mt-1">{selectedCustomer.email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-slate-400 hover:text-red-400 px-2.5 py-1 bg-slate-800 rounded-lg border border-white/10 hover:border-red-500/30 transition-all font-semibold"
                    title="Change Customer"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Search Past Customer Database
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Search by WhatsApp #, Name, or Company..."
                    className="input-field pl-10 pr-4 py-3 text-sm bg-slate-900/90 border-amber-500/30"
                  />
                </div>

                {/* Customer Results Dropdown */}
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-[#0c1322] border border-white/20 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/5">
                    {customerResults.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearchQuery('');
                          setShowCustomerDropdown(false);
                        }}
                        className="p-3.5 hover:bg-slate-800 cursor-pointer transition-all"
                      >
                        <div className="font-semibold text-sm text-white flex items-center justify-between">
                          <span>{cust.name}</span>
                          <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{cust.whatsapp}</span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center justify-between mt-1">
                          <span>{cust.company || 'Individual'}</span>
                          <span>{cust.ordersCount || 0} past bills</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showCustomerDropdown && customerResults.length === 0 && customerSearchQuery.trim().length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-[#0c1322] border border-white/20 rounded-2xl p-5 text-center space-y-3 shadow-2xl">
                    <p className="text-xs text-slate-400">No matching customer found.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCustomerForm({ name: customerSearchQuery, company: '', whatsapp: '', email: '' });
                        setShowNewCustomerModal(true);
                      }}
                      className="btn btn-secondary w-full py-2 text-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add as New Customer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bill Summary & Final Checkout Card */}
          <div className="glass-panel p-6 space-y-5 border-emerald-500/40 shadow-2xl shadow-emerald-500/10 bg-gradient-to-br from-[#0c1322] via-[#080e1a] to-[#04070d]">
            <h3 className="font-heading font-bold text-base text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3.5">
              <Calculator className="w-5 h-5 text-emerald-400" /> Bill Calculation & Checkout
            </h3>

            {/* Calculations Breakdown */}
            <div className="space-y-3.5 text-sm font-medium">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} devices):</span>
                <span className="font-mono text-base">${subtotal.toFixed(2)}</span>
              </div>

              {/* Tax Selector */}
              <div className="flex justify-between items-center text-slate-300">
                <div className="flex items-center gap-2">
                  <span>Tax / GST:</span>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="bg-slate-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% GST</option>
                    <option value={10}>10% Standard</option>
                    <option value={18}>18% Electronics GST</option>
                  </select>
                </div>
                <span className="font-mono text-base">+${taxAmount.toFixed(2)}</span>
              </div>

              {/* Discount Input */}
              <div className="flex justify-between items-center text-slate-300">
                <span>Discount ($):</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-right font-mono text-sm font-bold text-white focus:outline-none focus:border-emerald-500 shadow-inner"
                />
              </div>

              <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                <div>
                  <span className="font-heading font-bold text-lg text-white block">Total Payable:</span>
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">0ms Instant Indexed Save</span>
                </div>
                <span className="font-heading font-black text-3xl text-emerald-400 font-mono tracking-tight drop-shadow-md">
                  ${total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Notes Field */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Warranty Notes / Delivery Instructions
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. 1 Year AppleCare warranty included. WhatsApp delivery receipt confirmed."
                className="input-field text-xs py-2 bg-slate-900/90 resize-none border-white/15"
              />
            </div>

            {/* Finalize Button */}
            <button
              type="button"
              onClick={handleFinalizeBill}
              disabled={items.length === 0 || !selectedCustomer}
              className="btn btn-primary w-full py-4 text-base shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2.5 group font-bold tracking-wide rounded-xl"
            >
              <Sparkles className="w-5 h-5 animate-pulse text-yellow-300" />
              <span>Finalize & Save Bill (Ctrl+S)</span>
            </button>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 text-[11px] text-center text-slate-400 flex items-center justify-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>Instantly stores in queryable database & syncs with cloud.</span>
            </div>
          </div>

        </div>

      </div>

      {/* --- MODAL 1: Instant New Product Registration --- */}
      <Modal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        title="⚡ Instant Electronics Registration"
        subtitle="New device barcode detected! Register it once and it will automatically attach to this bill."
        icon={Scan}
      >
        <form onSubmit={handleSaveNewProduct} className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-center gap-3 text-xs text-amber-300 shadow-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <span>Barcode <b>{newProductForm.barcode}</b> is not in the database yet. Fill device details below to add it instantly!</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="form-label">Barcode Number</label>
              <input
                type="text"
                value={newProductForm.barcode}
                onChange={(e) => setNewProductForm({ ...newProductForm, barcode: e.target.value })}
                className="input-field font-mono font-bold text-emerald-400"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Device Category</label>
              <select
                value={newProductForm.category}
                onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                className="input-field font-semibold"
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
            <label className="form-label">Model Name & Specs Description</label>
            <input
              type="text"
              value={newProductForm.name}
              onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
              placeholder="e.g. MacBook Air M3 (16GB RAM, 512GB SSD - Midnight)"
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
                value={newProductForm.price}
                onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })}
                placeholder="1199.00"
                className="input-field font-mono font-bold text-emerald-400"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Initial Stock</label>
              <input
                type="number"
                min="0"
                value={newProductForm.stock}
                onChange={(e) => setNewProductForm({ ...newProductForm, stock: e.target.value })}
                className="input-field font-mono"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Unit Type</label>
              <select
                value={newProductForm.unit}
                onChange={(e) => setNewProductForm({ ...newProductForm, unit: e.target.value })}
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
          <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-xs font-bold text-white block">Requires IMEI / Serial Number Tracking</span>
                <span className="text-[11px] text-slate-400">Prompt operators to scan or input IMEI for warranty during billing</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={newProductForm.imeiRequired}
              onChange={(e) => setNewProductForm({ ...newProductForm, imeiRequired: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-white/10 mt-6">
            <button
              type="button"
              onClick={() => setShowNewProductModal(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" /> Save & Attach to Bill
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 2: Instant New Customer Registration --- */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="👥 Add New Customer"
        subtitle="Register customer details once. All future WhatsApp invoices will match instantly!"
        icon={UserPlus}
      >
        <form onSubmit={handleSaveNewCustomer} className="space-y-4">
          <div className="form-group mb-0">
            <label className="form-label">Customer / Contact Person Name</label>
            <input
              type="text"
              value={newCustomerForm.name}
              onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
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
              value={newCustomerForm.company}
              onChange={(e) => setNewCustomerForm({ ...newCustomerForm, company: e.target.value })}
              placeholder="e.g. Omega Tech Solutions Ltd"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label className="form-label">WhatsApp / Phone #</label>
              <input
                type="text"
                value={newCustomerForm.whatsapp}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, whatsapp: e.target.value })}
                placeholder="+91 98765 43210"
                className="input-field font-mono font-bold text-cyan-400"
                required
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Email Address (Optional)</label>
              <input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="rajesh@omegatech.com"
                className="input-field font-mono"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-white/10 mt-6">
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
            >
              <CheckCircle2 className="w-4 h-4" /> Save & Attach Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 3: Bill Finalized Confirmation --- */}
      <Modal
        isOpen={showSuccessModal}
        onClose={resetForNextBill}
        title="🎉 Electronics Bill Saved!"
        subtitle="Warranty invoice has been indexed in the database and synchronized with the cloud."
        icon={Sparkles}
        maxWidth="max-w-lg"
      >
        {savedInvoice && (
          <div className="space-y-6 text-center">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-slate-900 to-cyan-500/20 border border-emerald-500/40 space-y-3 shadow-xl">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>
              <h3 className="font-heading font-black text-2xl text-white">
                Invoice #{savedInvoice.id}
              </h3>
              <div className="flex items-center justify-center gap-2 font-mono text-xs text-slate-300">
                <span className="badge badge-success">{savedInvoice.whatsappRef}</span>
                <span>•</span>
                <span>{new Date(savedInvoice.date).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm px-4">
                <span className="text-slate-400">Customer:</span>
                <span className="font-bold text-white">{savedInvoice.customer.name}</span>
              </div>
              <div className="flex justify-between items-center text-sm px-4">
                <span className="text-slate-400">Total Paid:</span>
                <span className="font-mono font-black text-xl text-emerald-400">${savedInvoice.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  onViewInvoice(savedInvoice.id);
                }}
                className="btn btn-secondary w-full py-3"
              >
                <FileText className="w-4 h-4" /> View in Archive / Print
              </button>
              <button
                type="button"
                onClick={resetForNextBill}
                className="btn btn-primary w-full py-3"
              >
                <span>Next WhatsApp Bill</span> <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
