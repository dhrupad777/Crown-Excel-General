import { describe, it, expect, vi, beforeEach } from 'vitest';

// The device's copy of products, partners, invoices and RMA cases lives in IndexedDB, which jsdom
// does not have — so the store is mocked here. The point of this file is the behaviour that one
// failure proved was missing: a bill must save even when localStorage refuses every write, which
// is exactly what a full device does, and what stopped a counter mid-sale.
const { _disk } = vi.hoisted(() => ({ _disk: new Map() }));
vi.mock('../utils/mirrorStore', () => ({
  mirrorAvailable: () => true,
  mirrorReadAll: vi.fn(async (keys) => new Map(keys.filter((k) => _disk.has(k)).map((k) => [k, _disk.get(k)]))),
  mirrorWrite: vi.fn(async (key, rows) => { _disk.set(key, rows); return true; }),
  mirrorDelete: vi.fn(async (key) => { _disk.delete(key); return true; })
}));

vi.mock('../utils/backupStore', () => ({
  idbPutBundle: vi.fn(async () => true),
  idbGetBundle: vi.fn(async () => null),
  idbDeleteBundle: vi.fn(async () => true)
}));

vi.mock('./firebase', () => ({
  serverTimestamp: () => 'ts',
  firebaseService: {
    isInitialized: false,
    saveToCloud: vi.fn(async () => true),
    saveToCloudStrict: vi.fn(async () => true),
    updateDocStrict: vi.fn(async () => true),
    createIfAbsent: vi.fn(async () => ({ ok: true })),
    getDocOnce: vi.fn(async () => ({ exists: false, data: null })),
    getCollectionCount: vi.fn(async () => null),
    subscribeToCollection: vi.fn(() => () => {}),
    deleteFromCloud: vi.fn(async () => true),
    unsubscribeAll: vi.fn()
  }
}));

const { storageService } = await import('./storage');

const INVOICES = 'crown_excel_invoices_v2';
const PRODUCTS = 'crown_excel_products_v2';

const makeInvoice = (over = {}) => ({
  id: 'Dubai__INV-1', invoiceNo: 'INV-1', teamId: 'Dubai', status: 'final',
  customer: { company: 'ACME' },
  items: [{ name: 'MacBook Pro 16', imei: 'SN-1', locationId: 'loc-1' }],
  ...over
});

beforeEach(async () => {
  localStorage.clear();
  _disk.clear();
  vi.clearAllMocks();
  storageService._mirror = new Map();
  storageService._mirrorReady = false;
  storageService._persist = 'local';
  storageService._mirrorTroubleNoted = false;
  storageService._issues = null;
  localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
  storageService.setCurrentUser({ email: 'staff@b.com', role: 'standard', locationId: 'loc-1' });
});

describe('the local mirror moves off localStorage', () => {
  it('migrates what localStorage already held, then stops using it for those collections', async () => {
    localStorage.setItem(INVOICES, JSON.stringify([makeInvoice()]));
    localStorage.setItem(PRODUCTS, JSON.stringify([{ id: 'p1', name: 'MacBook' }]));

    await storageService.initLocalMirror();
    await storageService._migration; // the move happens after the app is already rendering

    // Moved across…
    expect(_disk.get(INVOICES)).toHaveLength(1);
    expect(_disk.get(PRODUCTS)).toHaveLength(1);
    // …and the old copy dropped, which is what frees the 5MB for the small keys that stayed.
    expect(localStorage.getItem(INVOICES)).toBeNull();
    expect(localStorage.getItem(PRODUCTS)).toBeNull();
    // Reads are unchanged as far as every caller is concerned.
    expect(storageService.getInvoices()).toHaveLength(1);
    expect(storageService.getProducts()).toHaveLength(1);
  });

  it('keeps what the device database already has, without re-reading localStorage', async () => {
    _disk.set(INVOICES, [makeInvoice({ invoiceNo: 'FROM-DB' })]);
    localStorage.setItem(INVOICES, JSON.stringify([makeInvoice({ invoiceNo: 'STALE' })]));

    await storageService.initLocalMirror();
    await storageService._migration;

    expect(storageService.getInvoices()[0].invoiceNo).toBe('FROM-DB');
    expect(localStorage.getItem(INVOICES)).toBeNull();
  });

  it('leaves a corrupt localStorage collection alone rather than migrating rubbish', async () => {
    localStorage.setItem(INVOICES, '{not json');
    await storageService.initLocalMirror();
    expect(_disk.has(INVOICES)).toBe(false);
    expect(localStorage.getItem(INVOICES)).toBe('{not json'); // kept for the cloud snapshot to replace
  });

  it('serves the data from memory and keeps writing to localStorage when the database will not open', async () => {
    const { mirrorReadAll } = await import('../utils/mirrorStore');
    mirrorReadAll.mockRejectedValueOnce(new Error('no IndexedDB for you'));
    localStorage.setItem(INVOICES, JSON.stringify([makeInvoice()]));

    expect(await storageService.initLocalMirror()).toBe(true);
    expect(storageService.getInvoices()).toHaveLength(1);

    expect(storageService.saveInvoice(makeInvoice({ id: 'Dubai__INV-2', invoiceNo: 'INV-2' }))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(INVOICES))).toHaveLength(2); // written down where it can be
  });

  // The guarantee the shop actually needs: no database, no room in the browser, nothing writable
  // at all — and not one storage error reaches the operator.
  it('keeps working with no database AND no room in the browser', async () => {
    const { mirrorReadAll } = await import('../utils/mirrorStore');
    mirrorReadAll.mockRejectedValueOnce(new Error('no IndexedDB for you'));
    await storageService.initLocalMirror();

    const onBanner = vi.fn();
    window.addEventListener('crown-storage-error', onBanner);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(storageService.saveInvoice(makeInvoice())).not.toBeNull();
    expect(storageService.saveProduct({ name: 'MacBook', barcode: '123' })).not.toBeNull();
    expect(storageService.saveCustomer({ company: 'ACME' })).not.toBeNull();

    // Readable for the rest of the session, straight from memory.
    expect(storageService.getInvoices()).toHaveLength(1);
    expect(storageService.getProducts()).toHaveLength(1);
    // And nothing was thrown at the person at the counter.
    expect(onBanner).not.toHaveBeenCalled();

    setItem.mockRestore();
    window.removeEventListener('crown-storage-error', onBanner);
  });
});

describe('a full localStorage can no longer stop a sale', () => {
  beforeEach(async () => {
    await storageService.initLocalMirror();
  });

  it('saves the bill even when every localStorage write throws', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const saved = storageService.saveInvoice(makeInvoice());

    expect(saved).not.toBeNull();            // null is what made the Billing Desk refuse the sale
    expect(saved.invoiceNo).toBe('INV-1');
    expect(storageService.getInvoices()).toHaveLength(1);
    expect(_disk.get(INVOICES)).toHaveLength(1);
    setItem.mockRestore();
  });

  it('a bill of any size goes to the device database, never to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const items = Array.from({ length: 300 }, (_, i) => ({
      name: 'ACER NITRO LITE NL16-71G-76SE, Intel Core i7-13620H, 16GB RAM, 512GB SSD',
      imei: `SN-${i}`, locationId: 'loc-1'
    }));

    expect(storageService.saveInvoice(makeInvoice({ items }))).not.toBeNull();
    expect(_disk.get(INVOICES)[0].items).toHaveLength(300);
    expect(setItem.mock.calls.some(([key]) => key === INVOICES)).toBe(false);
    setItem.mockRestore();
  });

  it('hands callers their own array, so nothing can reach in and edit the mirror', () => {
    storageService.saveInvoice(makeInvoice());
    const rows = storageService._readRaw(INVOICES);
    rows.push({ id: 'ghost' });
    expect(storageService._readRaw(INVOICES)).toHaveLength(1);
  });

  it('signing out clears the device database too, not just localStorage', async () => {
    storageService.saveInvoice(makeInvoice());
    expect(_disk.get(INVOICES)).toHaveLength(1);

    storageService.clearLocalMirror();
    await Promise.resolve();

    expect(storageService.getInvoices()).toHaveLength(0);
    const { mirrorDelete } = await import('../utils/mirrorStore');
    expect(mirrorDelete).toHaveBeenCalledWith(INVOICES);
  });

  it('reports a device-database failure as a sync issue instead of losing it silently', async () => {
    const { mirrorWrite } = await import('../utils/mirrorStore');
    mirrorWrite.mockRejectedValueOnce(new Error('disk is full'));

    storageService.saveInvoice(makeInvoice());
    await Promise.resolve();
    await Promise.resolve();

    expect(storageService.getIssues().some((i) => i.kind === 'storage')).toBe(true);
    expect(storageService.getInvoices()).toHaveLength(1); // the sale itself is unaffected
  });
});
