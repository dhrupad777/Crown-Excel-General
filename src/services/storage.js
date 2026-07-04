// High-Speed Dual-Mode Storage Engine (Local IndexedDB/localStorage + Live Firebase Cloud Sync)
// Guarantees 0ms latency for scanning and querying while syncing everything in real-time to Firebase.
// Domain: Electronics (Laptops, Mobile Phones, Tablets, Audio, Wearables & Accessories)

import { firebaseService } from './firebase';

const STORAGE_KEYS = {
  PRODUCTS: 'crown_excel_products_v2',
  CUSTOMERS: 'crown_excel_customers_v2',
  INVOICES: 'crown_excel_invoices_v2',
  SETTINGS: 'crown_excel_settings_v2'
};

const INITIAL_PRODUCTS = [
  { id: 'prod-101', barcode: '8801001', name: 'MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)', category: 'Laptops', price: 3499.00, stock: 15, unit: 'Unit', imeiRequired: true },
  { id: 'prod-102', barcode: '8801002', name: 'iPhone 15 Pro Max (256GB - Natural Titanium)', category: 'Mobile Phones', price: 1199.00, stock: 45, unit: 'Unit', imeiRequired: true },
  { id: 'prod-103', barcode: '8801003', name: 'Samsung Galaxy S24 Ultra (512GB - Titanium Black)', category: 'Mobile Phones', price: 1299.00, stock: 30, unit: 'Unit', imeiRequired: true },
  { id: 'prod-104', barcode: '8801004', name: 'iPad Pro 13-inch M4 (256GB - Wi-Fi + Cellular)', category: 'Tablets', price: 1499.00, stock: 20, unit: 'Unit', imeiRequired: true },
  { id: 'prod-105', barcode: '8801005', name: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', category: 'Audio & Wearables', price: 399.00, stock: 60, unit: 'Piece', imeiRequired: false },
  { id: 'prod-106', barcode: '8801006', name: 'Dell XPS 15 (i9-13900H, RTX 4070, 32GB RAM, 1TB OLED)', category: 'Laptops', price: 2399.00, stock: 12, unit: 'Unit', imeiRequired: true },
  { id: 'prod-107', barcode: '8801007', name: 'Apple Watch Ultra 2 (49mm Titanium - Ocean Band)', category: 'Audio & Wearables', price: 799.00, stock: 25, unit: 'Unit', imeiRequired: true },
  { id: 'prod-108', barcode: '8801008', name: 'AirPods Pro (2nd Gen with MagSafe USB-C)', category: 'Audio & Wearables', price: 249.00, stock: 80, unit: 'Pair', imeiRequired: false },
  { id: 'prod-109', barcode: '8801009', name: 'PlayStation 5 Slim Console (1TB Disc Edition)', category: 'Gaming', price: 499.00, stock: 35, unit: 'Unit', imeiRequired: true },
  { id: 'prod-110', barcode: '8801010', name: 'Anker 140W 3-Port USB-C High-Speed Fast Charger', category: 'Accessories', price: 89.99, stock: 120, unit: 'Piece', imeiRequired: false }
];

const INITIAL_CUSTOMERS = [
  { id: 'cust-1', name: 'Rajesh Kumar', company: 'Omega Tech Solutions Ltd', whatsapp: '+91 98765 43210', email: 'rajesh@omegatech.com', totalSpent: 4947.00, ordersCount: 4 },
  { id: 'cust-2', name: 'Vikram Mehta', company: 'Apex Mobile & Gadgets Hub', whatsapp: '+91 91234 56789', email: 'vikram@apexgadgets.com', totalSpent: 7197.00, ordersCount: 5 },
  { id: 'cust-3', name: 'Sarah Jenkins', company: 'Global Electronics Enterprises', whatsapp: '+1 415 555 0199', email: 's.jenkins@globalelec.com', totalSpent: 12450.00, ordersCount: 11 },
  { id: 'cust-4', name: 'Anil Sharma', company: 'Metro IT & Cloud Infrastructure', whatsapp: '+91 98111 22334', email: 'anil@metroit.in', totalSpent: 2399.00, ordersCount: 2 }
];

const INITIAL_INVOICES = [
  {
    id: 'INV-88901',
    whatsappRef: '#WA-9012',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    customer: { id: 'cust-1', name: 'Rajesh Kumar (Omega Tech Solutions)', whatsapp: '+91 98765 43210', email: 'rajesh@omegatech.com' },
    items: [
      { id: 'prod-102', barcode: '8801002', name: 'iPhone 15 Pro Max (256GB - Natural Titanium)', price: 1199.00, qty: 2, total: 2398.00, unit: 'Unit', imei: '358923009182391 / 358923009182392' },
      { id: 'prod-108', barcode: '8801008', name: 'AirPods Pro (2nd Gen with MagSafe USB-C)', price: 249.00, qty: 2, total: 498.00, unit: 'Pair', imei: '' }
    ],
    subtotal: 2896.00,
    taxRate: 10,
    taxAmount: 289.60,
    discount: 50.00,
    total: 3135.60,
    status: 'Paid',
    notes: 'WhatsApp Order confirmed. All IMEI serials recorded on warranty invoice.'
  },
  {
    id: 'INV-88902',
    whatsappRef: '#WA-9015',
    date: new Date(Date.now() - 86400000).toISOString(),
    customer: { id: 'cust-2', name: 'Vikram Mehta (Apex Mobile & Gadgets)', whatsapp: '+91 91234 56789', email: 'vikram@apexgadgets.com' },
    items: [
      { id: 'prod-101', barcode: '8801001', name: 'MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD - Space Black)', price: 3499.00, qty: 1, total: 3499.00, unit: 'Unit', imei: 'SN: C02G9012MD6R' }
    ],
    subtotal: 3499.00,
    taxRate: 10,
    taxAmount: 349.90,
    discount: 0,
    total: 3848.90,
    status: 'Paid',
    notes: 'Delivered by priority courier with AppleCare+ documentation.'
  }
];

class StorageService {
  constructor() {
    this.initSeedData();
    // Stitch with Firebase: start real-time cloud sync after short delay for Firestore initialization
    setTimeout(() => this.initCloudSync(), 1500);
  }

  initSeedData() {
    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INVOICES)) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(INITIAL_INVOICES));
    }
  }

  // Real-Time Firebase Cloud Synchronization
  initCloudSync() {
    if (!firebaseService.isInitialized) return;

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
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('products', savedProd.id, savedProd);

    return savedProd;
  }

  deleteProduct(id) {
    const products = this.getProducts().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
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
      totalSpent: customer.totalSpent || 0,
      ordersCount: customer.ordersCount || 0
    };

    if (!isNew) {
      updated = customers.map(c => c.id === savedCust.id ? savedCust : c);
    } else {
      updated = [savedCust, ...customers];
    }

    // 1. Instant 0ms Local Save
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('customers', savedCust.id, savedCust);

    return savedCust;
  }

  deleteCustomer(id) {
    const customers = this.getCustomers().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
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
    if (!query) return invoices;
    const q = query.toLowerCase().trim();
    return invoices.filter(inv => 
      inv.whatsappRef?.toLowerCase().includes(q) || 
      inv.id?.toLowerCase().includes(q) ||
      inv.customer?.name?.toLowerCase().includes(q) || 
      inv.customer?.whatsapp?.toLowerCase().includes(q) ||
      inv.items?.some(item => 
        item.name?.toLowerCase().includes(q) || 
        item.barcode?.toLowerCase().includes(q) ||
        item.imei?.toLowerCase().includes(q)
      )
    );
  }

  saveInvoice(invoice) {
    const invoices = this.getInvoices();
    let updated;
    const isNew = !invoice.id || !invoices.some(i => i.id === invoice.id);
    const savedInv = {
      ...invoice,
      id: invoice.id || 'INV-' + Math.floor(10000 + Math.random() * 90000),
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
              totalSpent: (c.totalSpent || 0) + (savedInv.total || 0),
              ordersCount: (c.ordersCount || 0) + 1
            };
            // Sync updated customer stats to Firebase!
            firebaseService.saveToCloud('customers', newCustObj.id, newCustObj);
            return newCustObj;
          }
          return c;
        });
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updatedCusts));
        window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'customers' } }));
      }

      // Decrement product stock & sync to Firebase
      const products = this.getProducts();
      const updatedProds = products.map(p => {
        const itemInBill = savedInv.items?.find(i => i.id === p.id || i.barcode === p.barcode);
        if (itemInBill) {
          const newProdObj = { ...p, stock: Math.max(0, (p.stock || 0) - (itemInBill.qty || 1)) };
          // Sync decremented stock to Firebase!
          firebaseService.saveToCloud('products', newProdObj.id, newProdObj);
          return newProdObj;
        }
        return p;
      });
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updatedProds));
      window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'products' } }));
    }

    // 1. Instant 0ms Local Save
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));

    // 2. Live Cloud Firebase Sync
    firebaseService.saveToCloud('invoices', savedInv.id, savedInv);

    return savedInv;
  }

  deleteInvoice(id) {
    const invoices = this.getInvoices().filter(inv => inv.id !== id);
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
    window.dispatchEvent(new CustomEvent('crown-data-change', { detail: { type: 'invoices' } }));

    // Delete from live Firebase cloud
    firebaseService.deleteFromCloud('invoices', id);
    return true;
  }

  // --- STATS & UTILS ---
  getDashboardStats() {
    const invoices = this.getInvoices();
    const products = this.getProducts();
    const customers = this.getCustomers();

    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalItemsSold = invoices.reduce((sum, inv) => sum + (inv.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0), 0);

    return {
      totalRevenue,
      invoicesCount: invoices.length,
      productsCount: products.length,
      customersCount: customers.length,
      totalItemsSold
    };
  }

  resetToDemoData() {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(INITIAL_INVOICES));
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
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  importAllData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.products) {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data.products));
        data.products.forEach(p => firebaseService.saveToCloud('products', p.id, p));
      }
      if (data.customers) {
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
        data.customers.forEach(c => firebaseService.saveToCloud('customers', c.id, c));
      }
      if (data.invoices) {
        localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(data.invoices));
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
