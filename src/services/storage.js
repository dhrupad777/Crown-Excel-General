// High-Speed Dual-Mode Storage Engine (Local IndexedDB/localStorage + Live Firebase Cloud Sync)
// Guarantees 0ms latency for scanning and querying while syncing everything in real-time to Firebase.
// Domain: Electronics (Laptops, Mobile Phones, Tablets, Audio, Wearables & Accessories)

import { firebaseService, serverTimestamp } from './firebase';
import { normalizeSerial, BOOTSTRAP_ADMIN_EMAILS, DELETION_RETENTION_DAYS } from '../config/appConfig';

const STORAGE_KEYS = {
  PRODUCTS: 'crown_excel_products_v2',
  CUSTOMERS: 'crown_excel_customers_v2',
  INVOICES: 'crown_excel_invoices_v2',
  SETTINGS: 'crown_excel_settings_v2',
  INVOICE_COUNTER: 'crown_excel_invoice_counter_v2',
  STAFF: 'crown_excel_staff_v2',
  LOCATIONS: 'crown_excel_locations_v2',
  DEVICE_ID: 'crown_excel_device_id_v2'
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
    ]
  },
  {
    id: 'INV-88902',
    date: new Date(Date.now() - 86400000).toISOString(),
    customer: { id: 'cust-2', name: 'Vikram Mehta (Apex Mobile & Gadgets)', whatsapp: '+91 91234 56789', email: 'vikram@apexgadgets.com' },
    items: [
      { id: 'prod-101', barcode: '8801001', name: 'MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)', qty: 1, unit: 'Box', imei: 'SN: C02G9012MD6R' }
    ]
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
    const prev = this._currentUser;
    this._currentUser = user
      ? {
          email: (user.email || '').toLowerCase(),
          displayName: user.displayName || user.email || '',
          role: user.role || 'standard',
          locationId: user.locationId || ''
        }
      : null;
    // If the team or role changed while already synced (e.g. an admin reassigned this user's team),
    // restart cloud sync so the per-team subscription re-scopes to the new team. Skipped on sign-out
    // (stopCloudSync handles that) and on the first login (sync not started yet).
    const teamChanged = (prev?.locationId || '') !== (this._currentUser?.locationId || '')
      || (prev?.role || '') !== (this._currentUser?.role || '');
    if (this._syncStarted && teamChanged && this._currentUser) {
      this.stopCloudSync();
      this.initCloudSync();
    }
  }

  getCurrentUser() {
    return this._currentUser;
  }

  // Unique record id. The random suffix matters: bulk import creates dozens of records inside a
  // SINGLE millisecond, so a bare `prefix-${Date.now()}` handed them all the same id and each
  // cloud write (setDoc merge on that id) silently overwrote the previous row — a 65-row import
  // landed as 25 records. Same idiom as the audit/duplicate-attempt ids below.
  _newId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // --- Team (tenant) identity ---
  // Every operator belongs to a team (their locationId). Business data is stamped with `teamId` on
  // create, and for non-admins only their own team's data is synced down (Firestore query +
  // firestore.rules enforce it), so the local mirror is already team-scoped. Admins sync every
  // team's data and narrow it with the UI's Team filter.
  // The caller's TEAM is the REGION their store belongs to (each location carries a `team` field,
  // e.g. "Dubai" or "Nigeria"). So every store in a region shares one team's data — anything a
  // Dubai store creates is visible to all Dubai stores. Falls back to '' when unresolved.
  _currentTeamId() {
    const locId = this._currentUser?.locationId;
    if (!locId) return '';
    return this.getLocations().find(l => l.id === locId)?.team || '';
  }

  // Public accessor for the UI (e.g. the Billing Desk stamps the bill's team).
  getCurrentTeamId() {
    return this._currentTeamId();
  }

  _isAdmin() {
    return this._currentUser?.role === 'admin';
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

    // Non-admins only sync their OWN team's data — the subscription issues a
    // where('teamId','==',team) query and the Firestore rules enforce it. Admins pass `null` and
    // stream every team, narrowing with the UI's Team filter. A new team simply starts empty; we no
    // longer push local seed data to the cloud (it would be un-teamed and rejected by the rules).
    const team = this._isAdmin() ? null : this._currentTeamId();

    firebaseService.subscribeToCollection('products', (cloudProducts) => {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(cloudProducts || []));
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));
    }, team);

    firebaseService.subscribeToCollection('customers', (cloudCustomers) => {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(cloudCustomers || []));
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));
    }, team);

    firebaseService.subscribeToCollection('invoices', (cloudInvoices) => {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(cloudInvoices || []));
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));
    }, team);

    // Serial Registrations — kept IN MEMORY (a busy registry would blow the localStorage quota).
    // Also team-scoped for display; the doc id stays the bare serial so the create-only transaction
    // still guarantees one physical unit is registered once across the whole business.
    firebaseService.subscribeToCollection('serials', (cloudSerials) => {
      this._serialsCache = cloudSerials || [];
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'serials' } }));
    }, team);

    // Staff & locations are the shared roster + team list — every signed-in user needs them, so
    // they stay whole-collection.
    firebaseService.subscribeToCollection('staff', (cloudStaff) => {
      this._setItem(STORAGE_KEYS.STAFF, cloudStaff || []);
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'staff' } }));
    });

    firebaseService.subscribeToCollection('locations', (cloudLocations) => {
      this._setItem(STORAGE_KEYS.LOCATIONS, cloudLocations || []);
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'locations' } }));
    });

    // Opportunistic hard-purge of records archived past the retention window. Delayed so the
    // initial cloud snapshots settle first; no-op unless this is an admin session (rules).
    setTimeout(() => this.purgeExpiredDeletions(), 8000);
  }

  stopCloudSync() {
    firebaseService.unsubscribeAll();
    this._syncStarted = false;
    this._serialsCache = [];
    this._currentUser = null;
  }

  // Raw list read INCLUDING soft-deleted (archived) records. Used by every mutation so that
  // writing the list back never drops archived rows; the public getters below hide them.
  _readRaw(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // --- PRODUCTS ---
  getProducts() {
    return this._readRaw(STORAGE_KEYS.PRODUCTS).filter((p) => !p.deleted);
  }

  getArchivedProducts() {
    return this._readRaw(STORAGE_KEYS.PRODUCTS).filter((p) => p.deleted);
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
    const products = this._readRaw(STORAGE_KEYS.PRODUCTS);
    let updated;
    const isNew = !product.id || !products.some(p => p.id === product.id);
    const existing = isNew ? null : products.find(p => p.id === product.id);
    const savedProd = {
      ...product,
      id: product.id || this._newId('prod'),
      barcode: product.barcode || Math.floor(1000000 + Math.random() * 9000000).toString(),
      // Owning team. Preserved on edit (so an admin editing another team's product can't reassign
      // it); new products inherit the creator's team.
      teamId: product.teamId || existing?.teamId || this._currentTeamId()
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
    return this._archive(STORAGE_KEYS.PRODUCTS, 'products', id);
  }

  // --- SOFT DELETE / ARCHIVE / RESTORE / PURGE (so nothing is ever lost by accident) ---

  _collectionKey(collection) {
    return { products: STORAGE_KEYS.PRODUCTS, customers: STORAGE_KEYS.CUSTOMERS, invoices: STORAGE_KEYS.INVOICES }[collection];
  }

  // Flags a record as archived (recoverable) instead of destroying it. It vanishes from every
  // normal view immediately; an admin can restore it, and it's purged for good only after the
  // retention window. Writing back the RAW list keeps other archived rows intact.
  _archive(key, collection, id, reason = '') {
    const user = this._currentUser || {};
    const all = this._readRaw(key);
    const before = all.find((r) => r.id === id);
    if (!before) return false;
    const archived = {
      ...before,
      deleted: true,
      deletedBy: user.email || '',
      deletedByName: user.displayName || '',
      deletedAt: new Date().toISOString(),
      deleteReason: String(reason || '').trim()
    };
    if (!this._setItem(key, all.map((r) => (r.id === id ? archived : r)))) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: collection } }));
    firebaseService.saveToCloud(collection, id, archived); // an admin update per rules — not a hard delete
    this.appendAudit(`${collection.replace(/s$/, '')}.archive`, before, archived, { entity: collection, entityId: id });
    return true;
  }

  getArchivedRecords() {
    return {
      products: this.getArchivedProducts(),
      customers: this._readRaw(STORAGE_KEYS.CUSTOMERS).filter((c) => c.deleted),
      invoices: this._readRaw(STORAGE_KEYS.INVOICES).filter((i) => i.deleted)
    };
  }

  restoreRecord(collection, id) {
    const key = this._collectionKey(collection);
    if (!key) return false;
    const user = this._currentUser || {};
    const all = this._readRaw(key);
    const before = all.find((r) => r.id === id);
    if (!before) return false;
    // Set deleted:false (not delete the field) so a Firestore merge write actually clears it.
    const restored = { ...before, deleted: false, deletedAt: null, restoredBy: user.email || '', restoredAt: new Date().toISOString() };
    if (!this._setItem(key, all.map((r) => (r.id === id ? restored : r)))) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: collection } }));
    firebaseService.saveToCloud(collection, id, restored);
    this.appendAudit(`${collection.replace(/s$/, '')}.restore`, before, restored, { entity: collection, entityId: id });
    return true;
  }

  // Permanently removes records archived longer than the retention window. Deletes require admin
  // (per rules), so this only does anything in an admin session — a best-effort stand-in for a
  // backend cron (admins sign in regularly). Also usable as an immediate "purge now" per record.
  purgeExpiredDeletions() {
    if (this._currentUser?.role !== 'admin') return 0;
    const cutoff = Date.now() - DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let purged = 0;
    ['products', 'customers', 'invoices'].forEach((collection) => {
      const key = this._collectionKey(collection);
      const all = this._readRaw(key);
      const isExpired = (r) => r.deleted && r.deletedAt && new Date(r.deletedAt).getTime() < cutoff;
      const expired = all.filter(isExpired);
      if (expired.length === 0) return;
      if (this._setItem(key, all.filter((r) => !isExpired(r)))) {
        window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: collection } }));
      }
      expired.forEach((r) => {
        firebaseService.deleteFromCloud(collection, r.id);
        this.appendAudit(`${collection.replace(/s$/, '')}.purge`, r, null, { entity: collection, entityId: r.id });
        purged += 1;
      });
    });
    return purged;
  }

  // Hard-delete one archived record immediately (admin "delete permanently now").
  purgeRecord(collection, id) {
    if (this._currentUser?.role !== 'admin') return false;
    const key = this._collectionKey(collection);
    if (!key) return false;
    const all = this._readRaw(key);
    const before = all.find((r) => r.id === id);
    if (!this._setItem(key, all.filter((r) => r.id !== id))) return false;
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: collection } }));
    firebaseService.deleteFromCloud(collection, id);
    this.appendAudit(`${collection.replace(/s$/, '')}.purge`, before, null, { entity: collection, entityId: id });
    return true;
  }

  // --- CUSTOMERS ---
  getCustomers() {
    return this._readRaw(STORAGE_KEYS.CUSTOMERS).filter((c) => !c.deleted);
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
    const customers = this._readRaw(STORAGE_KEYS.CUSTOMERS);
    let updated;
    const isNew = !customer.id || !customers.some(c => c.id === customer.id);
    const existing = isNew ? null : customers.find(c => c.id === customer.id);
    const savedCust = {
      ...customer,
      id: customer.id || this._newId('cust'),
      ordersCount: customer.ordersCount || 0,
      // Owning team — preserved on edit, inherited from the creator on a new partner.
      teamId: customer.teamId || existing?.teamId || this._currentTeamId()
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
    return this._archive(STORAGE_KEYS.CUSTOMERS, 'customers', id);
  }

  // --- INVOICES ---
  getInvoices() {
    return this._readRaw(STORAGE_KEYS.INVOICES).filter((i) => !i.deleted);
  }

  getInvoiceById(id) {
    const invoices = this.getInvoices();
    return invoices.find(inv => inv.id === id) || null;
  }

  // True if a bill in the given team already carries this number. Numbers are per-team now (Dubai's
  // "INV-1" is independent of Nigeria's), so the scan is scoped to `teamId`. Matches the human
  // `invoiceNo` (falling back to the raw id for legacy bills), case-insensitively, and reads the RAW
  // list so a voided number still counts as spent.
  isInvoiceNumberTaken(num, teamId = null) {
    const q = String(num || '').trim().toLowerCase();
    if (!q) return false;
    const team = teamId != null ? teamId : this._currentTeamId();
    return this._readRaw(STORAGE_KEYS.INVOICES).some(inv => {
      if (team && (inv.teamId || '') !== team) return false;
      return String(inv.invoiceNo || inv.id || '').trim().toLowerCase() === q;
    });
  }

  searchInvoices(query) {
    const invoices = this.getInvoices();
    if (!query || !query.trim()) return invoices;
    const q = query.toLowerCase().trim();
    return invoices.filter(inv =>
      inv.id?.toLowerCase().includes(q) ||
      inv.invoiceNo?.toLowerCase().includes(q) ||
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

  // Stable per-browser tag, used only to keep offline-issued invoice numbers from colliding
  // with numbers another terminal issues while this one is disconnected.
  _deviceId() {
    try {
      let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        id = Math.random().toString(36).slice(2, 5).toUpperCase();
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
      }
      return id;
    } catch {
      return 'LOC';
    }
  }

  // Highest invoice number this browser knows about. Reads the RAW list so an archived (voided)
  // bill still holds its number — filtering deleted rows here would let the next bill re-use the
  // number of a voided one, which is exactly the duplicate an auditor looks for.
  _localCounter() {
    // The highest auto-series number this browser knows about. We only parse ids of our own
    // "INV-<n>" shape (optionally with an offline device tag like INV-10005-AB3) so a custom,
    // operator-typed invoice number — which can contain unrelated digits, e.g. CE-2024-01 — never
    // inflates the next suggestion. Take the max of the cached counter and what the invoices show,
    // since the cached counter is no longer actively bumped now that numbers are operator-entered.
    const stored = parseInt(localStorage.getItem(STORAGE_KEYS.INVOICE_COUNTER), 10);
    const fromInvoices = this._readRaw(STORAGE_KEYS.INVOICES)
      .map((inv) => {
        const m = /^INV-(\d+)/.exec(String(inv.id || ''));
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter((n) => !Number.isNaN(n));
    const derived = fromInvoices.length > 0 ? Math.max(...fromInvoices) : INVOICE_NUMBER_START;
    return Number.isNaN(stored) ? derived : Math.max(stored, derived);
  }

  // Read-only preview of the next number, for the on-screen bill header. Reserves nothing.
  getNextInvoiceNumber() {
    try {
      return `INV-${this._localCounter() + 1}`;
    } catch {
      return 'INV-' + Math.floor(10000 + Math.random() * 90000);
    }
  }

  // Consumes the next invoice number. Online, the number comes from a Firestore transaction on
  // counters/invoices, so two terminals finalising at the same instant can never be handed the
  // same one. Offline (transactions can't run), we fall back to the local sequence and tag the
  // number with this device — a bill is never blocked, and the tag guarantees the number is still
  // unique when the write syncs. Tagged numbers are the audit signal that it was issued offline.
  async reserveInvoiceNumber() {
    // Seed/heal the shared counter from the highest number this terminal has ever seen, so the
    // first cloud allocation can't land on top of bills that were numbered locally before this.
    const floor = Math.max(this._localCounter(), INVOICE_NUMBER_START);
    const allocated = await firebaseService.allocateSequentialNumber('invoices', floor);
    if (Number.isFinite(allocated)) {
      try { this._setItem(STORAGE_KEYS.INVOICE_COUNTER, allocated); } catch { /* preview only */ }
      return `INV-${allocated}`;
    }
    const next = this._localCounter() + 1;
    try { this._setItem(STORAGE_KEYS.INVOICE_COUNTER, next); } catch { /* preview only */ }
    return `INV-${next}-${this._deviceId()}`;
  }

  saveInvoice(invoice) {
    const invoices = this._readRaw(STORAGE_KEYS.INVOICES);
    let updated;
    const isNew = !invoice.id || !invoices.some(i => i.id === invoice.id);
    const me = this._currentUser || {};
    if (isNew && !invoice.id) {
      // Every caller that creates a bill must reserve its number first (reserveInvoiceNumber),
      // so the number comes from the shared Firestore counter rather than this browser.
      console.warn('saveInvoice: new invoice without a reserved number — falling back to the local sequence.');
    }
    const savedInv = {
      ...invoice,
      id: invoice.id || `${this.getNextInvoiceNumber()}-${this._deviceId()}`,
      date: invoice.date || new Date().toISOString(),
      // Stamp who billed it and from which store — but only on a brand-new invoice, and only if
      // not already set, so later updates (e.g. raising/resolving a query) never overwrite the
      // original biller/location.
      ...(isNew && !invoice.billedBy
        ? {
            billedBy: me.email || '',
            billedByName: me.displayName || '',
            // teamId = the REGION (isolation key); locationId/name = the actual STORE that billed it.
            // Keeping these distinct so a bill still records which store issued it, not just the region.
            teamId: invoice.teamId || this._currentTeamId() || '',
            locationId: me.locationId || '',
            locationName: this.getLocationName(me.locationId) || ''
          }
        : {})
    };

    if (!isNew) {
      updated = invoices.map(inv => inv.id === savedInv.id ? savedInv : inv);
    } else {
      updated = [savedInv, ...invoices];
      
      // Update customer stats if matched
      if (savedInv.customer && savedInv.customer.id) {
        const customers = this._readRaw(STORAGE_KEYS.CUSTOMERS);
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

    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('invoices', savedInv.id, savedInv);

    return savedInv;
  }

  // Admin correction of a finalized bill. Merges `patch` into the existing invoice, stamps who
  // edited it and when, and writes an append-only audit entry with the full before/after — so
  // every change to a sale record is traceable and can't be erased. Security is enforced by
  // firestore.rules (only admins may update an invoice's non-query fields). Line items / serials
  // stay out of `patch` on purpose: they're coupled to the create-only warranty registry, so a
  // wrong bill is corrected by delete + re-bill, and serial typos via the registry.
  editInvoice(invoiceId, patch) {
    const before = this.getInvoiceById(invoiceId);
    if (!before) return null;
    const user = this._currentUser || {};
    const updated = {
      ...before,
      ...patch,
      editedBy: user.email || '',
      editedByName: user.displayName || '',
      editedAt: new Date().toISOString()
    };
    const saved = this.saveInvoice(updated); // existing id → updates in place, no re-stamp of biller
    if (saved) {
      this.appendAudit('invoice.update', before, saved, { entity: 'invoice', entityId: invoiceId });
    }
    return saved;
  }

  // Voiding a bill is an accounting event: it keeps its number, stays in the record, and must
  // carry a stated reason. Nothing is ever destroyed here — see purgeExpiredDeletions.
  deleteInvoice(id, reason = '') {
    return this._archive(STORAGE_KEYS.INVOICES, 'invoices', id, reason);
  }

  // Every bill this browser knows about, voided ones included. Exports use this so a voided
  // invoice can never silently disappear from the audit trail.
  getInvoicesIncludingArchived() {
    return this._readRaw(STORAGE_KEYS.INVOICES);
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
      s.customer?.company?.toLowerCase().includes(q) ||
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
          company: customer?.company || '',
          whatsapp: customer?.whatsapp || '',
          email: customer?.email || ''
        },
        invoiceNo: invoiceNo || '',
        teamId: this._currentTeamId(),
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
    const storeId = this._currentUser?.locationId || '';
    for (const item of items) {
      const invNo = invoice.invoiceNo || invoice.id;
      const res = await this.registerSerials({
        product: { id: item.productId || item.id, name: item.name, sku: item.sku || '', category: item.category || '', barcode: item.barcode || '' },
        serials: [item.imei],
        customer: invoice.customer,
        invoiceNo: invNo,
        locationId: storeId,
        locationName: this.getLocationName(storeId),
        remarks: '',
        source: 'billing',
        batchId: invNo
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

  // Distinct region names (teams) currently in use, e.g. ['Dubai', 'Nigeria'].
  // These values match the `teamId` stamped on every business doc, so they're the
  // correct options for the admin cross-team filters (a location id would never match).
  getTeams() {
    return [...new Set(this.getActiveLocations().map(l => l.team).filter(Boolean))].sort();
  }

  getLocationName(locationId) {
    return this.getLocations().find(l => l.id === locationId)?.name || '';
  }

  async saveLocation(location) {
    const rec = { active: true, ...location, id: location.id || this._newId('loc') };
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
    // The mirror is already team-scoped (non-admin) or full (admin), so no extra filtering here.
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
    // Every read below is already team-scoped by the mirror (non-admin) or full (admin).
    const invoices = this.getInvoices();
    const products = this.getProducts();
    const customers = this.getCustomers();
    const serials = this._serialsCache;

    const totalItemsSold = invoices.reduce((sum, inv) => sum + (inv.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0), 0);
    const openQueries = invoices.filter((inv) => inv.query && !inv.query.resolved).length;

    return {
      invoicesCount: invoices.length,
      productsCount: products.length,
      customersCount: customers.length,
      serialsCount: serials.length,
      totalItemsSold,
      openQueries
    };
  }

  resetToDemoData() {
    // Stamp the seed with the current admin's team so it isn't orphaned/rejected under the
    // per-team rules; invoices also get a human `invoiceNo` mirroring their id.
    const team = this._currentTeamId();
    const products = INITIAL_PRODUCTS.map(p => ({ ...p, teamId: team }));
    const customers = INITIAL_CUSTOMERS.map(c => ({ ...c, teamId: team }));
    const invoices = INITIAL_INVOICES.map(inv => ({ ...inv, teamId: team, invoiceNo: inv.invoiceNo || inv.id }));
    const ok = [
      this._setItem(STORAGE_KEYS.PRODUCTS, products),
      this._setItem(STORAGE_KEYS.CUSTOMERS, customers),
      this._setItem(STORAGE_KEYS.INVOICES, invoices)
    ].every(Boolean);
    if (!ok) return false;

    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'all' } }));

    // Push reset seed data to live Firebase cloud!
    products.forEach(p => firebaseService.saveToCloud('products', p.id, p));
    customers.forEach(c => firebaseService.saveToCloud('customers', c.id, c));
    invoices.forEach(inv => firebaseService.saveToCloud('invoices', inv.id, inv));
    return true;
  }

  // One-time migration to the team model. Stamps `teamId` on every existing record:
  //  • invoices & serials keep the team that created them (their existing locationId);
  //  • the shared product & partner catalog (which has no team) goes to `catalogTeamId`;
  //  • legacy invoices also get an `invoiceNo` mirroring their id (so the display is uniform).
  // Runs from an ADMIN session — the admin mirror holds every team's data, and the rules permit an
  // admin to write these (incl. a dedicated exception to add teamId to old serials). Returns counts;
  // safe to re-run (records that already carry a teamId are left as-is).
  async migrateToTeams(catalogTeamId) {
    if (this._currentUser?.role !== 'admin') throw new Error('Only an administrator can run the team migration.');
    if (!catalogTeamId) throw new Error('Pick the team that should own the existing products & partners.');
    const report = { products: 0, customers: 0, invoices: 0, serials: 0, serialsFailed: 0 };

    const products = this._readRaw(STORAGE_KEYS.PRODUCTS).map(p => ({ ...p, teamId: p.teamId || catalogTeamId }));
    this._setItem(STORAGE_KEYS.PRODUCTS, products);
    products.forEach(p => { firebaseService.saveToCloud('products', p.id, p); report.products++; });

    const customers = this._readRaw(STORAGE_KEYS.CUSTOMERS).map(c => ({ ...c, teamId: c.teamId || catalogTeamId }));
    this._setItem(STORAGE_KEYS.CUSTOMERS, customers);
    customers.forEach(c => { firebaseService.saveToCloud('customers', c.id, c); report.customers++; });

    const regionOf = (locId) => this.getLocations().find(l => l.id === locId)?.team || '';
    const invoices = this._readRaw(STORAGE_KEYS.INVOICES).map(inv => ({
      ...inv,
      teamId: inv.teamId || regionOf(inv.locationId) || catalogTeamId,
      invoiceNo: inv.invoiceNo || inv.id
    }));
    this._setItem(STORAGE_KEYS.INVOICES, invoices);
    invoices.forEach(inv => { firebaseService.saveToCloud('invoices', inv.id, inv); report.invoices++; });

    // Serials are create-only; add teamId via the admin update path (the rules' migration exception
    // allows an admin to set teamId on a serial that predates the team model). Sequential + awaited.
    for (const s of [...this._serialsCache]) {
      if (s.teamId) continue;
      const teamId = regionOf(s.locationId) || catalogTeamId;
      try {
        await firebaseService.updateDocStrict('serials', s.id, { teamId });
        report.serials++;
      } catch {
        report.serialsFailed++;
      }
    }
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'all' } }));
    return report;
  }

  // Counts of business records per region — powers the admin Regions overview. Reads the local
  // mirror, which for an admin holds every team's data. Returns { [team]: {products, customers,
  // invoices, serials} }.
  getTeamDataCounts() {
    const blank = () => ({ products: 0, customers: 0, invoices: 0, serials: 0 });
    const out = {};
    const bump = (team, key) => {
      const t = team || '';
      if (!t) return;
      (out[t] || (out[t] = blank()))[key]++;
    };
    this.getProducts().forEach(p => bump(p.teamId, 'products'));
    this.getCustomers().forEach(c => bump(c.teamId, 'customers'));
    this.getInvoices().forEach(i => bump(i.teamId, 'invoices'));
    this.getSerials().forEach(s => bump(s.teamId, 'serials'));
    return out;
  }

  // Renames a region EVERYWHERE at once: every store in it, plus every product / partner / invoice /
  // serial tagged with it, are re-stamped from `oldName` to `newName`. Admin-only (the rules let an
  // admin rewrite these, including the serial teamId-migration exception). If `newName` is an
  // existing region the two are effectively merged — the caller must confirm that. Returns counts.
  async renameTeam(oldName, newName) {
    if (this._currentUser?.role !== 'admin') throw new Error('Only an administrator can rename a region.');
    const from = String(oldName || '').trim();
    const to = String(newName || '').trim();
    if (!from) throw new Error('Missing the region to rename.');
    if (!to) throw new Error('Enter the new region name.');
    if (from === to) return { unchanged: true, locations: 0, products: 0, customers: 0, invoices: 0, serials: 0, serialsFailed: 0 };
    const report = { locations: 0, products: 0, customers: 0, invoices: 0, serials: 0, serialsFailed: 0 };

    // 1. Stores (saveLocation mirrors + syncs each).
    for (const loc of this.getLocations()) {
      if ((loc.team || '') === from) {
        await this.saveLocation({ ...loc, team: to });
        report.locations++;
      }
    }

    // 2. Products / partners / invoices — merge-write only the ones that changed.
    const restamp = (key, collection) => {
      const changed = [];
      const rows = this._readRaw(key).map(r => {
        if (r.teamId === from) { const nr = { ...r, teamId: to }; changed.push(nr); return nr; }
        return r;
      });
      this._setItem(key, rows);
      changed.forEach(r => { firebaseService.saveToCloud(collection, r.id, r); });
      return changed.length;
    };
    report.products = restamp(STORAGE_KEYS.PRODUCTS, 'products');
    report.customers = restamp(STORAGE_KEYS.CUSTOMERS, 'customers');
    report.invoices = restamp(STORAGE_KEYS.INVOICES, 'invoices');

    // 3. Serials are create-only; teamId is changed via the admin update path (rules migration
    // exception permits touching ONLY teamId). Sequential + awaited so a failure is counted.
    for (const s of [...this._serialsCache]) {
      if (s.teamId !== from) continue;
      try {
        await firebaseService.updateDocStrict('serials', s.id, { teamId: to });
        report.serials++;
      } catch {
        report.serialsFailed++;
      }
    }
    this._serialsCache = this._serialsCache.map(s => (s.teamId === from ? { ...s, teamId: to } : s));

    this.appendAudit('region.rename', { team: from }, { team: to, ...report }, { entity: 'region', entityId: to });
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'all' } }));
    return report;
  }

  exportAllData() {
    // Raw reads so a full backup includes archived (soft-deleted) records too — a backup should
    // never quietly drop data that's still recoverable in the app.
    return JSON.stringify({
      products: this._readRaw(STORAGE_KEYS.PRODUCTS),
      customers: this._readRaw(STORAGE_KEYS.CUSTOMERS),
      invoices: this._readRaw(STORAGE_KEYS.INVOICES),
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
