import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase is mocked entirely — these tests are about the local guarantees, not the network.
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
const { firebaseService } = await import('./firebase');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  storageService.setCurrentUser(null);
});

describe('_newId — the bulk-import ID collision', () => {
  // The original `prefix-${Date.now()}` handed every record created inside one millisecond the
  // SAME id; each cloud write then overwrote the previous one and a 65-row import landed as 25.
  it('produces unique ids in a tight loop', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i += 1) ids.add(storageService._newId('cust'));
    expect(ids.size).toBe(1000);
  });

  it('keeps the prefix', () => {
    expect(storageService._newId('prod')).toMatch(/^prod-/);
  });
});

describe('validateRecord — keeps the app and firestore.rules in agreement', () => {
  it('accepts a partner identified only by company', () => {
    expect(() => storageService.validateRecord('customers', { company: 'ACME', teamId: 'Dubai' })).not.toThrow();
  });

  it('rejects a partner with neither company nor name', () => {
    expect(() => storageService.validateRecord('customers', { teamId: 'Dubai' })).toThrow(/company or contact name/i);
  });

  // The exact bug that made every serial on INV-101 fail: rules demanded customer.name > 0 while
  // the app allowed company-only partners.
  it('accepts a serial whose partner has only a company', () => {
    expect(() => storageService.validateRecord('serials', {
      serial: 'ABC123', productName: 'Widget', teamId: 'Dubai', locationId: '',
      customer: { company: 'TECHCHIPS COMPUTER', name: '' }
    })).not.toThrow();
  });

  it('rejects a serial with no partner identity at all', () => {
    expect(() => storageService.validateRecord('serials', {
      serial: 'ABC123', productName: 'Widget', teamId: 'Dubai', locationId: '', customer: {}
    })).toThrow(/company or contact name/i);
  });

  it('rejects any record without a region — it would be invisible to every store', () => {
    expect(() => storageService.validateRecord('products', { name: 'Widget' })).toThrow(/region/i);
    expect(() => storageService.validateRecord('invoices', { invoiceNo: '101' })).toThrow(/region/i);
  });
});

describe('pending writes — an unconfirmed record must survive a resync', () => {
  it('tracks a pending write and clears it once confirmed', async () => {
    storageService._markPending('customers', 'c1', { id: 'c1', company: 'ACME' });
    expect(storageService.getPendingCount()).toBe(1);
    expect(storageService.isPending('customers', 'c1')).toBe(true);
    storageService._clearPending('customers', 'c1');
    expect(storageService.getPendingCount()).toBe(0);
  });

  // The mechanism behind the original loss: the snapshot REPLACES the mirror, so a record the
  // cloud has not accepted yet would simply disappear.
  it('merges a pending record into an incoming cloud snapshot', () => {
    storageService._markPending('customers', 'c-new', { id: 'c-new', company: 'PENDING CO' });
    const merged = storageService._mergePending('customers', [{ id: 'c-old', company: 'CLOUD CO' }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === 'c-new')).toBeTruthy();
    expect(merged.find((r) => r.id === 'c-new')._pendingSync).toBe(true);
  });

  it('does not duplicate a record the cloud already has', () => {
    storageService._markPending('customers', 'c1', { id: 'c1', company: 'ACME' });
    const merged = storageService._mergePending('customers', [{ id: 'c1', company: 'ACME (cloud)' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].company).toBe('ACME (cloud)');
  });

  it('retryPendingWrites clears entries that succeed', async () => {
    storageService._markPending('customers', 'c1', { id: 'c1', company: 'ACME' });
    const res = await storageService.retryPendingWrites();
    expect(res.ok).toBe(1);
    expect(storageService.getPendingCount()).toBe(0);
  });
});

describe('issues — errors must not expire on a timer', () => {
  it('records and retains issues until explicitly cleared', () => {
    storageService.logIssue('sync', 'could not save customers/c1');
    expect(storageService.getIssues()).toHaveLength(1);
    storageService.clearIssues();
    expect(storageService.getIssues()).toHaveLength(0);
  });
});

describe('corrupted local data is never overwritten', () => {
  it('_readRawSafe throws instead of returning an empty list', () => {
    localStorage.setItem('crown_excel_customers_v2', '{ this is not json');
    expect(() => storageService._readRawSafe('crown_excel_customers_v2')).toThrow(/corrupted/i);
  });

  it('saveCustomer refuses to write over an unreadable collection', () => {
    localStorage.setItem('crown_excel_customers_v2', 'BROKEN');
    expect(() => storageService.saveCustomer({ company: 'ACME', teamId: 'Dubai' })).toThrow(/corrupted/i);
  });
});

describe('writes stamp a region and confirm when asked', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Nigeria', active: true }]));
    storageService.setCurrentUser({ email: 'a@b.com', role: 'standard', locationId: 'loc-1' });
  });

  it('stamps the caller region on a new partner', () => {
    const saved = storageService.saveCustomer({ company: 'ACME' });
    expect(saved.teamId).toBe('Nigeria');
  });

  it('awaits the cloud when confirm:true', async () => {
    await storageService.saveCustomer({ company: 'ACME' }, { confirm: true });
    expect(firebaseService.saveToCloudStrict).toHaveBeenCalled();
  });

  it('leaves a non-confirmed write tracked as pending', () => {
    storageService.saveCustomer({ company: 'ACME' });
    expect(storageService.getPendingCount()).toBe(1);
  });
});

describe('registerSerialsFromInvoice — completeness', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Nigeria', active: true }]));
    storageService.setCurrentUser({ email: 'a@b.com', role: 'standard', locationId: 'loc-1' });
  });

  // 250 sequential round-trips took ~8 minutes and got cut off at 16; batching must register all.
  it('registers every serial on a 250-item bill and reports the billed total', async () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
      productId: 'p1', name: 'Widget', imei: `SN${String(i).padStart(4, '0')}`
    }));
    const res = await storageService.registerSerialsFromInvoice({
      invoiceNo: '101', teamId: 'Nigeria', locationId: 'loc-1',
      customer: { company: 'ST CHIDONS', name: '' }, items
    });
    expect(res.billed).toBe(250);
    expect(res.registered).toHaveLength(250);
    expect(res.failed).toHaveLength(0);
  });

  it("uses the invoice's own region, not the operator's", async () => {
    await storageService.registerSerialsFromInvoice({
      invoiceNo: 'CS-1', teamId: 'Dubai', locationId: 'loc-1',
      customer: { company: 'ACME' }, items: [{ productId: 'p1', name: 'W', imei: 'SN1' }]
    });
    const written = firebaseService.createIfAbsent.mock.calls[0][2];
    expect(written.teamId).toBe('Dubai');
  });

  // A company-only partner previously registered ZERO serials.
  it('registers for a partner that has only a company name', async () => {
    const res = await storageService.registerSerialsFromInvoice({
      invoiceNo: 'INV-101', teamId: 'Dubai', locationId: 'loc-1',
      customer: { company: 'TECHCHIPS COMPUTER', name: '' },
      items: [{ productId: 'p1', name: 'W', imei: 'SN-A' }, { productId: 'p1', name: 'W', imei: 'SN-B' }]
    });
    expect(res.registered).toHaveLength(2);
    const written = firebaseService.createIfAbsent.mock.calls[0][2];
    expect(written.customer.name).toBe('TECHCHIPS COMPUTER');
  });

  it('skips items with no serial rather than inventing one', async () => {
    const res = await storageService.registerSerialsFromInvoice({
      invoiceNo: 'X', teamId: 'Dubai', locationId: 'loc-1', customer: { company: 'ACME' },
      items: [{ name: 'W', imei: 'SN1' }, { name: 'W', imei: '' }]
    });
    expect(res.billed).toBe(1);
  });
});
