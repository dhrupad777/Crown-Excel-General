// High-Speed Dual-Mode Storage Engine (Local IndexedDB/localStorage + Live Firebase Cloud Sync)
// Guarantees 0ms latency for scanning and querying while syncing everything in real-time to Firebase.
// Domain: Electronics (Laptops, Mobile Phones, Tablets, Audio, Wearables & Accessories)

import { firebaseService, serverTimestamp } from './firebase';
import { normalizeSerial, BOOTSTRAP_ADMIN_EMAILS } from '../config/appConfig';

const STORAGE_KEYS = {
  PRODUCTS: 'crown_excel_products_v2',
  CUSTOMERS: 'crown_excel_customers_v2',
  INVOICES: 'crown_excel_invoices_v2',
  SETTINGS: 'crown_excel_settings_v2',
  INVOICE_COUNTER: 'crown_excel_invoice_counter_v2',
  STAFF: 'crown_excel_staff_v2',
  LOCATIONS: 'crown_excel_locations_v2'
};

const INVOICE_NUMBER_START = 10000;

// Every product is sold as exactly one box per unit — there is no separate stock count to
// maintain here; the Invoices Archive (searchable by serial) is the real record of what's sold.
const INITIAL_PRODUCTS = [
  { id: 'prod-101', barcode: '8801001', name: 'MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)', category: 'Laptops', unit: 'Box' },
  { id: 'prod-102', barcode: '8801002', name: 'iPhone 15 Pro Max (256GB - Natural Titanium)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-103', barcode: '8801003', name: 'Samsung Galaxy S24 Ultra (512GB - Titanium Black)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-104', barcode: '8801004', name: 'iPad Pro 13-inch M4 (256GB - Wi-Fi + Cellular)', category: 'Tablets', unit: 'Box' },
  { id: 'prod-105', barcode: '8801005', name: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-106', barcode: '8801006', name: 'Dell XPS 15 (i9-13900H, RTX 4070, 32GB RAM, 1TB OLED)', category: 'Laptops', unit: 'Box' },
  { id: 'prod-107', barcode: '8801007', name: 'Apple Watch Ultra 2 (49mm Titanium - Ocean Band)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-108', barcode: '8801008', name: 'AirPods Pro (2nd Gen with MagSafe USB-C)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-109', barcode: '8801009', name: 'PlayStation 5 Slim Console (1TB Disc Edition)', category: 'Gaming', unit: 'Box' },
  { id: 'prod-110', barcode: '8801010', name: 'Anker 140W 3-Port USB-C High-Speed Fast Charger', category: 'Accessories', unit: 'Box' },
  // Apple lineup
  { id: 'prod-111', barcode: '8801011', name: 'iPhone 15 (128GB - Blue)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-112', barcode: '8801012', name: 'iPhone 15 Plus (256GB - Pink)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-113', barcode: '8801013', name: 'iPhone 15 Pro (256GB - Blue Titanium)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-114', barcode: '8801014', name: 'iPhone 16 Pro Max (256GB - Desert Titanium)', category: 'Mobile Phones', unit: 'Box' },
  { id: 'prod-115', barcode: '8801015', name: 'iPad (10th Gen, 64GB - Wi-Fi, Blue)', category: 'Tablets', unit: 'Box' },
  { id: 'prod-116', barcode: '8801016', name: 'iPad Air 13-inch (M2, 256GB - Wi-Fi, Starlight)', category: 'Tablets', unit: 'Box' },
  { id: 'prod-117', barcode: '8801017', name: 'iPad mini (A17 Pro, 128GB - Starlight)', category: 'Tablets', unit: 'Box' },
  { id: 'prod-118', barcode: '8801018', name: 'MacBook Air 15-inch (M3, 16GB RAM, 512GB SSD - Midnight)', category: 'Laptops', unit: 'Box' },
  { id: 'prod-119', barcode: '8801019', name: 'MacBook Pro 14-inch (M3 Pro, 18GB RAM, 512GB SSD - Space Black)', category: 'Laptops', unit: 'Box' },
  { id: 'prod-120', barcode: '8801020', name: 'Apple Watch Series 10 (46mm GPS + Cellular - Jet Black)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-121', barcode: '8801021', name: 'Apple Watch SE (40mm GPS - Starlight)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-122', barcode: '8801022', name: 'AirPods 4 (Active Noise Cancellation)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-123', barcode: '8801023', name: 'AirPods Max (USB-C - Midnight)', category: 'Audio & Wearables', unit: 'Box' },
  { id: 'prod-124', barcode: '8801024', name: 'Apple 20W USB-C Power Adapter', category: 'Accessories', unit: 'Box' },
  { id: 'prod-125', barcode: '8801025', name: 'Apple MagSafe Charger (USB-C)', category: 'Accessories', unit: 'Box' }
];

const INITIAL_CUSTOMERS = [
  { id: 'cust-1', name: 'Rajesh Kumar', company: 'Omega Tech Solutions Ltd', whatsapp: '+91 98765 43210', email: 'rajesh@omegatech.com', ordersCount: 4 },
  { id: 'cust-2', name: 'Vikram Mehta', company: 'Apex Mobile & Gadgets Hub', whatsapp: '+91 91234 56789', email: 'vikram@apexgadgets.com', ordersCount: 5 },
  { id: 'cust-3', name: 'Sarah Jenkins', company: 'Global Electronics Enterprises', whatsapp: '+1 415 555 0199', email: 's.jenkins@globalelec.com', ordersCount: 11 },
  { id: 'cust-4', name: 'Anil Sharma', company: 'Metro IT & Cloud Infrastructure', whatsapp: '+91 98111 22334', email: 'anil@metroit.in', ordersCount: 2 }
];

const INITIAL_INVOICES = [
  {
    id: 'INV-88901',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    customer: { id: 'cust-1', name: 'Rajesh Kumar (Omega Tech Solutions)', whatsapp: '+91 98765 43210', email: 'rajesh@omegatech.com' },
    items: [
      { id: 'prod-102', barcode: '8801002', name: 'iPhone 15 Pro Max (256GB - Natural Titanium)', qty: 2, unit: 'Box', imei: '358923009182391 / 358923009182392' },
      { id: 'prod-108', barcode: '8801008', name: 'AirPods Pro (2nd Gen with MagSafe USB-C)', qty: 2, unit: 'Box', imei: '' }
    ],
    status: 'Paid'
  },
  {
    id: 'INV-88902',
    date: new Date(Date.now() - 86400000).toISOString(),
    customer: { id: 'cust-2', name: 'Vikram Mehta (Apex Mobile & Gadgets)', whatsapp: '+91 91234 56789', email: 'vikram@apexgadgets.com' },
    items: [
      { id: 'prod-101', barcode: '8801001', name: 'MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)', qty: 1, unit: 'Box', imei: 'SN: C02G9012MD6R' }
    ],
    status: 'Paid'
  }
];

class StorageService {
  constructor() {
    this.initSeedData();
    // Cloud sync no longer auto-starts here: Firestore is locked behind staff authentication,
    // so AuthContext calls initCloudSync() after a verified login (and stopCloudSync() on
    // sign-out). Starting it unauthenticated would just spin permission-denied listeners.
    this._syncStarted = false;
    this._serialsCache = [];
    this._currentUser = null;
  }

  // Identity of the logged-in operator, stamped onto serial registrations, audit entries and
  // duplicate-attempt logs. Set by AuthContext when auth resolves; cleared on sign-out.
  setCurrentUser(user) {
    this._currentUser = user
      ? {
          email: (user.email || '').toLowerCase(),
          displayName: user.displayName || user.email || '',
          role: user.role || 'standard',
          locationId: user.locationId || ''
        }
      : null;
  }

  getCurrentUser() {
    return this._currentUser;
  }

  initSeedData() {
    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
      this._setItem(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
      this._setItem(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.INVOICES)) {
      this._setItem(STORAGE_KEYS.INVOICES, INITIAL_INVOICES);
    }
  }

  // Persists to localStorage, surfacing quota/private-browsing failures instead of losing data silently.
  _setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Failed to persist [${key}] to local storage:`, e);
      window.dispatchEvent(new CustomEvent('crown-storage-error', { detail: { key, error: e.message } }));
      return false;
    }
  }

  // Real-Time Firebase Cloud Synchronization. Idempotent: called by AuthContext every time a
  // login resolves, but only ever wires the listeners once per session.
  initCloudSync() {
    if (this._syncStarted || !firebaseService.isInitialized) return;
    this._syncStarted = true;

    console.log("⚡ Stitching local storage with live Firebase database...");

    // Subscribe to Products
    firebaseService.subscribeToCollection('products', (cloudProducts) => {
      if (cloudProducts && cloudProducts.length > 0) {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(cloudProducts));
        window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));
      } else {
        // If cloud collection is empty, push our local seed inventory to Firebase!
        const localProds = this.getProducts();
        localProds.forEach(p => firebaseService.saveToCloud('products', p.id, p));
      }
    });

    // Subscribe to Customers
    firebaseService.subscribeToCollection('customers', (cloudCustomers) => {
      if (cloudCustomers && cloudCustomers.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(cloudCustomers));
        window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));
      } else {
        // If cloud collection is empty, push seed customers to Firebase!
        const localCusts = this.getCustomers();
        localCusts.forEach(c => firebaseService.saveToCloud('customers', c.id, c));
      }
    });

    // Subscribe to Invoices
    firebaseService.subscribeToCollection('invoices', (cloudInvoices) => {
      if (cloudInvoices && cloudInvoices.length > 0) {
        localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(cloudInvoices));
        window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));
      } else {
        // If cloud collection is empty, push seed invoices to Firebase!
        const localInvs = this.getInvoices();
        localInvs.forEach(inv => firebaseService.saveToCloud('invoices', inv.id, inv));
      }
    });

    // Subscribe to Serial Registrations. Kept IN MEMORY (not localStorage): a busy registry
    // would blow the ~5MB localStorage quota shared with products/invoices, and Firestore's
    // own IndexedDB persistence already gives us the durable local copy.
    firebaseService.subscribeToCollection('serials', (cloudSerials) => {
      this._serialsCache = cloudSerials || [];
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'serials' } }));
    });

    // Subscribe to Staff allowlist (small; mirrored for filter dropdowns + role refresh).
    firebaseService.subscribeToCollection('staff', (cloudStaff) => {
      this._setItem(STORAGE_KEYS.STAFF, cloudStaff || []);
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'staff' } }));
    });

    // Subscribe to Locations (small; mirrored for the capture form + filters). The default
    // location is seeded by the admin bootstrap in auth.js, not here — standard users lack
    // rules permission to create locations.
    firebaseService.subscribeToCollection('locations', (cloudLocations) => {
      this._setItem(STORAGE_KEYS.LOCATIONS, cloudLocations || []);
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'locations' } }));
    });
  }

  stopCloudSync() {
    firebaseService.unsubscribeAll();
    this._syncStarted = false;
    this._serialsCache = [];
    this._currentUser = null;
  }

  // --- PRODUCTS ---
  getProducts() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching products:', e);
      return [];
    }
  }

  getProductByBarcode(barcode) {
    const products = this.getProducts();
    return products.find(p => p.barcode.trim() === barcode.trim()) || null;
  }

  isBarcodeInUse(barcode, excludeId = null) {
    const products = this.getProducts();
    return products.some(p => p.barcode?.trim() === barcode?.trim() && p.id !== excludeId);
  }

  saveProduct(product) {
    const products = this.getProducts();
    let updated;
    const isNew = !product.id || !products.some(p => p.id === product.id);
    const savedProd = {
      ...product,
      id: product.id || 'prod-' + Date.now(),
      barcode: product.barcode || Math.floor(1000000 + Math.random() * 9000000).toString()
    };

    if (!isNew) {
      updated = products.map(p => p.id === savedProd.id ? savedProd : p);
    } else {
      updated = [savedProd, ...products];
    }

    // 1. Instant 0ms Local Save
    if (!this._setItem(STORAGE_KEYS.PRODUCTS, updated)) return null;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('products', savedProd.id, savedProd);

    return savedProd;
  }

  deleteProduct(id) {
    const products = this.getProducts().filter(p => p.id !== id);
    if (!this._setItem(STORAGE_KEYS.PRODUCTS, products)) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));

    // Delete from live Firebase cloud
    firebaseService.deleteFromCloud('products', id);
    return true;
  }

  // --- CUSTOMERS ---
  getCustomers() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  searchCustomers(query) {
    if (!query) return this.getCustomers();
    const q = query.toLowerCase().trim();
    return this.getCustomers().filter(c => 
      c.name?.toLowerCase().includes(q) || 
      c.company?.toLowerCase().includes(q) || 
      c.whatsapp?.toLowerCase().includes(q) || 
      c.email?.toLowerCase().includes(q)
    );
  }

  saveCustomer(customer) {
    const customers = this.getCustomers();
    let updated;
    const isNew = !customer.id || !customers.some(c => c.id === customer.id);
    const savedCust = {
      ...customer,
      id: customer.id || 'cust-' + Date.now(),
      ordersCount: customer.ordersCount || 0
    };

    if (!isNew) {
      updated = customers.map(c => c.id === savedCust.id ? savedCust : c);
    } else {
      updated = [savedCust, ...customers];
    }

    // 1. Instant 0ms Local Save
    if (!this._setItem(STORAGE_KEYS.CUSTOMERS, updated)) return null;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('customers', savedCust.id, savedCust);

    return savedCust;
  }

  deleteCustomer(id) {
    const customers = this.getCustomers().filter(c => c.id !== id);
    if (!this._setItem(STORAGE_KEYS.CUSTOMERS, customers)) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));

    // Delete from live Firebase cloud
    firebaseService.deleteFromCloud('customers', id);
    return true;
  }

  // --- INVOICES ---
  getInvoices() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INVOICES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getInvoiceById(id) {
    const invoices = this.getInvoices();
    return invoices.find(inv => inv.id === id) || null;
  }

  searchInvoices(query) {
    const invoices = this.getInvoices();
    if (!query || !query.trim()) return invoices;
    const q = query.toLowerCase().trim();
    return invoices.filter(inv =>
      inv.id?.toLowerCase().includes(q) ||
      inv.customer?.name?.toLowerCase().includes(q) ||
      inv.customer?.whatsapp?.toLowerCase().includes(q) ||
      inv.customer?.company?.toLowerCase().includes(q) ||
      inv.items?.some(item =>
        item.name?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q) ||
        item.imei?.toLowerCase().includes(q)
      )
    );
  }

  // Precise warranty lookup: given a serial/IMEI, find which invoice(s)/line item it belongs to.
  // Splits on common separators to tolerate legacy rows that crammed multiple serials into one
  // string (before "one row per physical unit" was enforced), and matches exactly rather than by
  // substring so a partial serial can't false-positive. Returns an array, not a single match,
  // since a serial legitimately appearing on more than one invoice (data error, or a returned and
  // resold unit) should be visible rather than silently hidden behind a first-match lookup.
  findInvoiceBySerial(serial) {
    const q = String(serial || '').trim().toLowerCase();
    if (!q) return [];
    const matches = [];
    for (const inv of this.getInvoices()) {
      for (const item of inv.items || []) {
        const tokens = String(item.imei || '').split(/[/,;]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
        if (tokens.includes(q)) matches.push({ invoice: inv, item });
      }
    }
    return matches;
  }

  // Item-level search for the Invoices Archive's "Matching Items" view: flattens every line
  // item across every invoice and substring-matches name/barcode/imei (mirroring searchInvoices'
  // matching style, but at item grain instead of invoice grain), so e.g. searching "macbook"
  // surfaces every sold MacBook unit directly instead of just the invoices containing one.
  // Deliberately doesn't match on customer/partner fields — that dimension is already fully
  // covered at invoice grain by searchInvoices(), which still drives the main table.
  searchInvoiceItems(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    const results = [];
    for (const inv of this.getInvoices()) {
      for (const item of inv.items || []) {
        const matches =
          item.name?.toLowerCase().includes(q) ||
          item.barcode?.toLowerCase().includes(q) ||
          item.imei?.toLowerCase().includes(q);
        if (matches) results.push({ invoice: inv, item });
      }
    }
    return results.sort((a, b) => new Date(b.invoice.date) - new Date(a.invoice.date));
  }

  // Sequential invoice numbering (INV-10001, INV-10002, ...) — read-only preview of what the
  // *next* saved invoice will be numbered. Doesn't reserve/consume the number; the counter is
  // only committed in saveInvoice() so an abandoned bill never leaves a gap in the sequence.
  getNextInvoiceNumber() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.INVOICE_COUNTER);
      let counter = stored !== null ? parseInt(stored, 10) : NaN;
      if (Number.isNaN(counter)) {
        const existingNums = this.getInvoices()
          .map(inv => parseInt(String(inv.id).replace(/\D/g, ''), 10))
          .filter(n => !Number.isNaN(n));
        counter = existingNums.length > 0 ? Math.max(...existingNums) : INVOICE_NUMBER_START;
      }
      return `INV-${counter + 1}`;
    } catch (e) {
      return 'INV-' + Math.floor(10000 + Math.random() * 90000);
    }
  }

  saveInvoice(invoice) {
    const invoices = this.getInvoices();
    let updated;
    const isNew = !invoice.id || !invoices.some(i => i.id === invoice.id);
    const savedInv = {
      ...invoice,
      id: invoice.id || this.getNextInvoiceNumber(),
      date: invoice.date || new Date().toISOString()
    };

    if (!isNew) {
      updated = invoices.map(inv => inv.id === savedInv.id ? savedInv : inv);
    } else {
      updated = [savedInv, ...invoices];
      
      // Update customer stats if matched
      if (savedInv.customer && savedInv.customer.id) {
        const customers = this.getCustomers();
        const updatedCusts = customers.map(c => {
          if (c.id === savedInv.customer.id) {
            const newCustObj = {
              ...c,
              ordersCount: (c.ordersCount || 0) + 1
            };
            // Sync updated customer stats to Firebase!
            firebaseService.saveToCloud('customers', newCustObj.id, newCustObj);
            return newCustObj;
          }
          return c;
        });
        if (this._setItem(STORAGE_KEYS.CUSTOMERS, updatedCusts)) {
          window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));
        }
      }

    }

    // 1. Instant 0ms Local Save — the invoice write is the source of truth for this bill,
    // so a failure here must be surfaced to the operator rather than swallowed.
    if (!this._setItem(STORAGE_KEYS.INVOICES, updated)) return null;

    // Commit the sequence counter only now that the invoice is actually persisted,
    // so an abandoned/failed bill never burns a number and leaves a gap.
    if (isNew) {
      const num = parseInt(String(savedInv.id).replace(/\D/g, ''), 10);
      if (!Number.isNaN(num)) {
        this._setItem(STORAGE_KEYS.INVOICE_COUNTER, num);
      }
    }

    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('invoices', savedInv.id, savedInv);

    return savedInv;
  }

  deleteInvoice(id) {
    const invoices = this.getInvoices().filter(inv => inv.id !== id);
    if (!this._setItem(STORAGE_KEYS.INVOICES, invoices)) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));

    // Delete from live Firebase cloud
    firebaseService.deleteFromCloud('invoices', id);
    return true;
  }

  // --- SERIAL REGISTRY (warranty registrations; cloud-authoritative) ---

  // Newest first; UI sorts/filters on the ISO `date` field (createdAt is a Firestore Timestamp
  // reserved for the security rules' 24h edit window).
  getSerials() {
    return [...this._serialsCache].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  // Exact-match lookup by normalized serial (the doc ID). Used for instant scan-time duplicate
  // feedback; the registering transaction remains the authoritative check.
  findSerial(serial) {
    const id = normalizeSerial(serial);
    if (!id) return null;
    return this._serialsCache.find(s => s.id === id || s.serial === id) || null;
  }

  // Partial, combinable free-text search across every reportable dimension (mirrors the
  // matching style of searchInvoices).
  searchSerials(query) {
    const q = String(query || '').toLowerCase().trim();
    const all = this.getSerials();
    if (!q) return all;
    return all.filter(s =>
      s.serial?.toLowerCase().includes(q) ||
      s.productName?.toLowerCase().includes(q) ||
      s.sku?.toLowerCase().includes(q) ||
      s.barcode?.toLowerCase().includes(q) ||
      s.customer?.name?.toLowerCase().includes(q) ||
      s.customer?.whatsapp?.toLowerCase().includes(q) ||
      s.customer?.email?.toLowerCase().includes(q) ||
      s.invoiceNo?.toLowerCase().includes(q) ||
      s.locationName?.toLowerCase().includes(q) ||
      s.registeredByName?.toLowerCase().includes(q) ||
      s.createdBy?.toLowerCase().includes(q) ||
      s.remarks?.toLowerCase().includes(q)
    );
  }

  // Registers a batch of serial numbers against one product/customer. Each serial becomes a
  // Firestore doc whose ID is the normalized serial — created via a server transaction so a
  // duplicate can never be written, no matter how many terminals are scanning at once. This is
  // deliberately NOT offline-first: uniqueness cannot be promised from a queue, so the
  // transaction (which refuses to run offline) is the mechanism as well as the check.
  // Returns { registered: [{serial}], duplicates: [{serial, existing}], failed: [{serial, error}] }.
  async registerSerials({ product, serials, customer, invoiceNo, locationId, locationName, remarks, source = 'capture', batchId }) {
    const user = this._currentUser || {};
    const results = { registered: [], duplicates: [], failed: [] };
    const bid = batchId || 'batch-' + Date.now();
    const seen = new Set();

    for (const raw of serials || []) {
      const id = normalizeSerial(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const record = {
        serial: id,
        serialRaw: String(raw).trim(),
        productId: product?.id || '',
        productName: product?.name || '',
        sku: product?.sku || '',
        category: product?.category || '',
        barcode: product?.barcode || '',
        customer: {
          id: customer?.id || '',
          name: customer?.name || '',
          whatsapp: customer?.whatsapp || '',
          email: customer?.email || ''
        },
        invoiceNo: invoiceNo || '',
        locationId: locationId || '',
        locationName: locationName || '',
        registeredByName: user.displayName || '',
        remarks: remarks || '',
        source,
        batchId: bid,
        date: new Date().toISOString(),
        createdBy: user.email || ''
      };

      const res = await firebaseService.createIfAbsent('serials', id, {
        ...record,
        createdAt: serverTimestamp()
      });

      if (res.ok) {
        results.registered.push({ serial: id });
        // Optimistic cache insert so the very next scan sees it; the live snapshot replaces
        // the whole cache moments later with the server copy (incl. resolved createdAt).
        this._serialsCache = [{ ...record, id }, ...this._serialsCache.filter(s => s.id !== id)];
        this.appendAudit('serial.create', null, record, { entity: 'serial', entityId: id });
      } else if (res.exists) {
        results.duplicates.push({ serial: id, existing: res.existing });
        this.logDuplicateAttempt({
          serial: id,
          source,
          locationId: locationId || user.locationId || '',
          invoiceNoAttempted: invoiceNo || '',
          productIdAttempted: product?.id || '',
          existing: res.existing
        });
      } else {
        results.failed.push({ serial: id, error: res.error || 'network' });
      }
    }

    if (results.registered.length > 0) {
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'serials' } }));
    }
    return results;
  }

  // Admin-only correction of a registration's contact/context fields (never the serial itself —
  // it is the doc ID). Throws on failure: firestore.rules reject edits past the 24h window, and
  // the caller must show that to the operator rather than pretend it saved.
  async updateSerial(serialId, changes) {
    const user = this._currentUser || {};
    const id = normalizeSerial(serialId);
    const before = this.findSerial(id);

    await firebaseService.updateDocStrict('serials', id, {
      ...changes,
      updatedBy: user.email || '',
      updatedAt: serverTimestamp()
    });

    const after = { ...(before || {}), ...changes, updatedBy: user.email || '' };
    this._serialsCache = this._serialsCache.map(s => (s.id === id ? { ...s, ...after } : s));
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'serials' } }));
    this.appendAudit('serial.update', before, after, { entity: 'serial', entityId: id });
    return after;
  }

  // Feeds the warranty registry from a finalized bill: every line item's scanned serial becomes
  // a registration (source 'billing', grouped under the invoice number). Best-effort by design —
  // the sale is already saved; duplicates/offline failures are reported back, never thrown.
  async registerSerialsFromInvoice(invoice) {
    const items = (invoice?.items || []).filter(it => String(it.imei || '').trim());
    if (items.length === 0) return { registered: [], duplicates: [], failed: [] };

    const totals = { registered: [], duplicates: [], failed: [] };
    for (const item of items) {
      const res = await this.registerSerials({
        product: { id: item.productId || item.id, name: item.name, sku: item.sku || '', category: item.category || '', barcode: item.barcode || '' },
        serials: [item.imei],
        customer: invoice.customer,
        invoiceNo: invoice.id,
        locationId: this._currentUser?.locationId || '',
        locationName: this.getLocationName(this._currentUser?.locationId),
        remarks: '',
        source: 'billing',
        batchId: invoice.id
      });
      totals.registered.push(...res.registered);
      totals.duplicates.push(...res.duplicates);
      totals.failed.push(...res.failed);
    }
    return totals;
  }

  // --- STAFF & LOCATIONS (admin-managed masters) ---

  getStaff() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STAFF);
      const list = data ? JSON.parse(data) : [];
      const existingEmails = new Set(list.map(s => (s.email || s.id || '').toLowerCase()));
      const bootstrapEntries = BOOTSTRAP_ADMIN_EMAILS
        .filter(email => !existingEmails.has(email.toLowerCase()))
        .map(email => ({
          id: email.toLowerCase(),
          email: email.toLowerCase(),
          displayName: email.split('@')[0],
          role: 'admin',
          active: true,
          addedBy: 'system'
        }));
      return [...list, ...bootstrapEntries];
    } catch (e) {
      return [];
    }
  }

  getStaffByEmail(email) {
    const key = String(email || '').trim().toLowerCase();
    return this.getStaff().find(s => (s.email || s.id || '').toLowerCase() === key) || null;
  }

  // Awaited + throwing (updateDocStrict): the admin doing staff management must see failures.
  async saveStaff(staffRecord) {
    const email = String(staffRecord.email || '').trim().toLowerCase();
    if (!email) throw new Error('Staff email is required.');
    const rec = { ...staffRecord, email, id: email };

    await firebaseService.updateDocStrict('staff', email, { ...rec, addedAt: rec.addedAt || serverTimestamp() });

    const mirror = this.getStaff().filter(s => (s.email || s.id) !== email);
    this._setItem(STORAGE_KEYS.STAFF, [{ ...rec, addedAt: rec.addedAt || null }, ...mirror]);
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'staff' } }));
    return rec;
  }

  getLocations() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOCATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getActiveLocations() {
    return this.getLocations().filter(l => l.active !== false);
  }

  getLocationName(locationId) {
    return this.getLocations().find(l => l.id === locationId)?.name || '';
  }

  async saveLocation(location) {
    const rec = { active: true, ...location, id: location.id || 'loc-' + Date.now() };
    await firebaseService.updateDocStrict('locations', rec.id, rec);

    const mirror = this.getLocations().filter(l => l.id !== rec.id);
    this._setItem(STORAGE_KEYS.LOCATIONS, [rec, ...mirror]);
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'locations' } }));
    return rec;
  }

  // --- AUDIT TRAIL & DUPLICATE-ATTEMPT LOG (append-only, best-effort) ---

  // Fire-and-forget: an audit write must never block or fail the business action it describes.
  // firestore.rules make these collections append-only regardless.
  appendAudit(action, before, after, meta = {}) {
    const user = this._currentUser || {};
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    firebaseService.saveToCloud('auditLog', id, {
      action,
      entity: meta.entity || '',
      entityId: meta.entityId || '',
      before: before || null,
      after: after || null,
      userName: user.displayName || '',
      date: new Date().toISOString(),
      createdAt: serverTimestamp(),
      createdBy: user.email || ''
    });
  }

  logDuplicateAttempt({ serial, source, locationId, invoiceNoAttempted, productIdAttempted, existing }) {
    const user = this._currentUser || {};
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    firebaseService.saveToCloud('duplicateAttempts', id, {
      serial: normalizeSerial(serial),
      source: source || 'capture',
      attemptedByName: user.displayName || '',
      locationId: locationId || user.locationId || '',
      invoiceNoAttempted: invoiceNoAttempted || '',
      productIdAttempted: productIdAttempted || '',
      existing: existing
        ? {
            registeredBy: existing.registeredByName || existing.createdBy || '',
            date: existing.date || '',
            invoiceNo: existing.invoiceNo || '',
            productName: existing.productName || '',
            locationName: existing.locationName || ''
          }
        : null,
      date: new Date().toISOString(),
      createdAt: serverTimestamp(),
      createdBy: user.email || ''
    });
  }

  fetchAuditLog(max = 200) {
    return firebaseService.fetchCollectionOrdered('auditLog', { max });
  }

  fetchDuplicateAttempts(max = 200) {
    return firebaseService.fetchCollectionOrdered('duplicateAttempts', { max });
  }

  getDuplicateAttemptCount() {
    return firebaseService.getCollectionCount('duplicateAttempts');
  }

  // Registration analytics for the Dashboard tab, computed from the live in-memory registry.
  getSerialStats() {
    const serials = this._serialsCache;
    const now = new Date();
    const todayKey = now.toDateString();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

    const stats = {
      total: serials.length,
      today: 0,
      month: 0,
      byLocation: {},
      byUser: {},
      byModel: {}
    };

    for (const s of serials) {
      const d = s.date ? new Date(s.date) : null;
      if (d && d.toDateString() === todayKey) stats.today += 1;
      if (d && `${d.getFullYear()}-${d.getMonth()}` === monthKey) stats.month += 1;

      const loc = s.locationName || s.locationId || 'Unassigned';
      stats.byLocation[loc] = (stats.byLocation[loc] || 0) + 1;

      const who = s.registeredByName || s.createdBy || 'Unknown';
      stats.byUser[who] = (stats.byUser[who] || 0) + 1;

      const model = s.sku || s.productName || 'Unknown model';
      stats.byModel[model] = (stats.byModel[model] || 0) + 1;
    }

    stats.topModels = Object.entries(stats.byModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, count]) => ({ model, count }));

    return stats;
  }

  // --- STATS & UTILS ---
  getDashboardStats() {
    const invoices = this.getInvoices();
    const products = this.getProducts();
    const customers = this.getCustomers();

    const totalItemsSold = invoices.reduce((sum, inv) => sum + (inv.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0), 0);

    return {
      invoicesCount: invoices.length,
      productsCount: products.length,
      customersCount: customers.length,
      serialsCount: this._serialsCache.length,
      totalItemsSold
    };
  }

  resetToDemoData() {
    const ok = [
      this._setItem(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS),
      this._setItem(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS),
      this._setItem(STORAGE_KEYS.INVOICES, INITIAL_INVOICES)
    ].every(Boolean);
    if (!ok) return false;

    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'all' } }));

    // Push reset seed data to live Firebase cloud!
    INITIAL_PRODUCTS.forEach(p => firebaseService.saveToCloud('products', p.id, p));
    INITIAL_CUSTOMERS.forEach(c => firebaseService.saveToCloud('customers', c.id, c));
    INITIAL_INVOICES.forEach(inv => firebaseService.saveToCloud('invoices', inv.id, inv));
    return true;
  }

  exportAllData() {
    return JSON.stringify({
      products: this.getProducts(),
      customers: this.getCustomers(),
      invoices: this.getInvoices(),
      serials: this.getSerials(),
      staff: this.getStaff(),
      locations: this.getLocations(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  // Restores products/customers/invoices only. Serial registrations are deliberately NOT
  // restored from a backup: the serials collection is create-only by security rule (that is the
  // duplicate guarantee), so re-imports would be rejected — Firestore itself is the registry's
  // single source of truth. Staff/locations are likewise managed live via the Admin tab.
  importAllData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.products) {
        if (!this._setItem(STORAGE_KEYS.PRODUCTS, data.products)) return false;
        data.products.forEach(p => firebaseService.saveToCloud('products', p.id, p));
      }
      if (data.customers) {
        if (!this._setItem(STORAGE_KEYS.CUSTOMERS, data.customers)) return false;
        data.customers.forEach(c => firebaseService.saveToCloud('customers', c.id, c));
      }
      if (data.invoices) {
        if (!this._setItem(STORAGE_KEYS.INVOICES, data.invoices)) return false;
        data.invoices.forEach(inv => firebaseService.saveToCloud('invoices', inv.id, inv));
      }
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'all' } }));
      return true;
    } catch (e) {
      console.error("Import failed:", e);
      return false;
    }
  }
}

export const storageService = new StorageService();
