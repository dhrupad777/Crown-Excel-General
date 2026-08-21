import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase is mocked entirely — these tests are about the local guarantees, not the network.
// In-app backup snapshots persist bundles to IndexedDB (absent in jsdom) — mock the tiny store so
// the orchestration (index management, pruning, deletion) is what's under test. `vi.hoisted` lets
// the shared Map exist above the hoisted vi.mock factory.
const { _idb } = vi.hoisted(() => ({ _idb: new Map() }));
vi.mock('../utils/backupStore', () => ({
  idbPutBundle: vi.fn(async (id, bundle) => { _idb.set(id, bundle); return true; }),
  idbGetBundle: vi.fn(async (id) => _idb.get(id) || null),
  idbDeleteBundle: vi.fn(async (id) => { _idb.delete(id); return true; })
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
const { firebaseService } = await import('./firebase');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  storageService.setCurrentUser(null);
});

describe('draft invoice lifecycle', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 'staff@b.com', role: 'standard', locationId: 'loc-1' });
  });

  const makeDraft = (over = {}) => storageService.saveInvoice({
    id: 'Dubai__D1', invoiceNo: 'D1', teamId: 'Dubai', customer: { company: 'ACME' },
    items: [{ name: 'W', imei: 'SND1', locationId: 'loc-1', locationName: 'HO' }],
    status: 'draft', draftExpiresAt: storageService.draftExpiry(), ...over
  });

  it('separates drafts from final invoices', () => {
    makeDraft();
    expect(storageService.getDrafts()).toHaveLength(1);
    expect(storageService.getFinalInvoices()).toHaveLength(0);
    expect(storageService.getDashboardStats().draftsCount).toBe(1);
    expect(storageService.getDashboardStats().invoicesCount).toBe(0); // drafts excluded from the archive count
  });

  it('a store only sees its own region\'s drafts; an admin sees every region', () => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([
      { id: 'loc-1', team: 'Dubai', active: true },
      { id: 'loc-9', team: 'Nigeria', active: true }
    ]));
    makeDraft();
    makeDraft({ id: 'Nigeria__N1', invoiceNo: 'N1', teamId: 'Nigeria' });

    // Dubai store
    expect(storageService.getDrafts().map((d) => d.id)).toEqual(['Dubai__D1']);
    // Nigeria store
    storageService.setCurrentUser({ email: 'ng@b.com', role: 'standard', locationId: 'loc-9' });
    expect(storageService.getDrafts().map((d) => d.id)).toEqual(['Nigeria__N1']);
    // Admin
    storageService.setCurrentUser({ email: 'admin@b.com', role: 'admin', locationId: 'loc-1' });
    expect(storageService.getDrafts()).toHaveLength(2);
  });

  it('isDraftExpired only past the window', () => {
    expect(storageService.isDraftExpired({ status: 'draft', draftExpiresAt: Date.now() + 1000 })).toBe(false);
    expect(storageService.isDraftExpired({ status: 'draft', draftExpiresAt: Date.now() - 1000 })).toBe(true);
    expect(storageService.isDraftExpired({ status: 'final', draftExpiresAt: Date.now() - 1000 })).toBe(false);
  });

  it('finalizeDraft flips status to final and registers serials', async () => {
    makeDraft();
    await storageService.finalizeDraft('Dubai__D1');
    expect(storageService.getInvoiceById('Dubai__D1').status).toBe('final');
    expect(storageService.getDrafts()).toHaveLength(0);
    expect(storageService.getFinalInvoices()).toHaveLength(1);
    expect(firebaseService.createIfAbsent).toHaveBeenCalled(); // serials registered on finalize
  });

  it('a standard user cannot finalize an EXPIRED draft', async () => {
    makeDraft({ draftExpiresAt: Date.now() - 1000 });
    await expect(storageService.finalizeDraft('Dubai__D1')).rejects.toThrow(/administrator/i);
  });

  it('an admin CAN finalize an expired draft', async () => {
    makeDraft({ draftExpiresAt: Date.now() - 1000 });
    storageService.setCurrentUser({ email: 'admin@b.com', role: 'admin', locationId: 'loc-1' });
    await storageService.finalizeDraft('Dubai__D1');
    expect(storageService.getInvoiceById('Dubai__D1').status).toBe('final');
  });

  it('cancelDraft is admin-only and voids (keeps a recoverable record)', async () => {
    makeDraft();
    await expect(storageService.cancelDraft('Dubai__D1')).rejects.toThrow(/administrator/i);

    storageService.setCurrentUser({ email: 'admin@b.com', role: 'admin', locationId: 'loc-1' });
    await storageService.cancelDraft('Dubai__D1', 'test');
    expect(storageService.getDrafts()).toHaveLength(0);           // gone from active views
    const raw = JSON.parse(localStorage.getItem('crown_excel_invoices_v2'));
    const rec = raw.find((r) => r.id === 'Dubai__D1');
    expect(rec.deleted).toBe(true);                                // but still on record
    expect(rec.status).toBe('cancelled');
  });

  it('a draft does NOT register serials until finalized', () => {
    makeDraft();
    expect(firebaseService.createIfAbsent).not.toHaveBeenCalled();
  });
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

describe('weekly backup bookkeeping', () => {
  it('is due when it has never run', () => {
    expect(storageService.getLastBackupAt()).toBeNull();
    expect(storageService.isWeeklyBackupDue()).toBe(true);
  });

  it('is not due right after a backup, and due again after 7+ days', () => {
    storageService.markBackupDone();
    expect(storageService.getLastBackupAt()).not.toBeNull();
    expect(storageService.isWeeklyBackupDue()).toBe(false);

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('crown_excel_backup_meta_v2', JSON.stringify({ lastBackupAt: eightDaysAgo }));
    expect(storageService.isWeeklyBackupDue()).toBe(true);
  });

  it('auto-backup is on by default and can be turned off', () => {
    expect(storageService.isAutoBackupEnabled()).toBe(true);
    storageService.setAutoBackupEnabled(false);
    expect(storageService.isAutoBackupEnabled()).toBe(false);
  });

  it('the bundle carries every collection plus counts', () => {
    const b = storageService.getBackupBundle();
    ['products', 'customers', 'invoices', 'serials', 'staff', 'locations', 'counts', 'exportedAt'].forEach((k) => {
      expect(b).toHaveProperty(k);
    });
  });
});

describe('in-app backup snapshots', () => {
  it('creates a snapshot, indexes it, and reads the bundle back', async () => {
    const entry = await storageService.createBackupSnapshot();
    expect(entry.id).toMatch(/^bk-/);
    const idx = storageService.getBackupIndex();
    expect(idx.length).toBe(1);
    expect(idx[0].counts).toBeDefined();
    const bundle = await storageService.getBackupSnapshotBundle(entry.id);
    expect(bundle).toHaveProperty('products');
  });

  it('deletes a snapshot from the index and the store', async () => {
    const entry = await storageService.createBackupSnapshot();
    await storageService.deleteBackupSnapshot(entry.id);
    expect(storageService.getBackupIndex().find((s) => s.id === entry.id)).toBeUndefined();
    expect(await storageService.getBackupSnapshotBundle(entry.id)).toBeNull();
  });

  it('marks the weekly clock so a fresh snapshot is not immediately due again', async () => {
    expect(storageService.isWeeklyBackupDue()).toBe(true);
    await storageService.createBackupSnapshot();
    expect(storageService.isWeeklyBackupDue()).toBe(false);
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

  // Multi-store bill: each serial must carry ITS OWN item's store, not one bill-level store.
  it('attributes each serial to its own item store', async () => {
    await storageService.registerSerialsFromInvoice({
      invoiceNo: 'X', teamId: 'Dubai', locationId: 'loc-1', customer: { company: 'ACME' },
      items: [
        { name: 'W', imei: 'SN-HO', locationId: 'loc-ho', locationName: 'HO' },
        { name: 'W', imei: 'SN-SHOP', locationId: 'loc-shop', locationName: 'Shop' }
      ]
    });
    const byId = Object.fromEntries(
      firebaseService.createIfAbsent.mock.calls.map((c) => [c[2].serial, c[2].locationId])
    );
    expect(byId['SN-HO']).toBe('loc-ho');
    expect(byId['SN-SHOP']).toBe('loc-shop');
  });

  // Provenance must survive onto the PERMANENT registry record, not just live on the bill: months
  // later it has to be clear that a unit arrived via the Excel importer, and whether an operator
  // override put it under this product.
  it('carries item source/remarks onto the registered serial', async () => {
    await storageService.registerSerialsFromInvoice({
      invoiceNo: 'X', teamId: 'Dubai', locationId: 'loc-1', customer: { company: 'ACME' },
      items: [
        { name: 'W', imei: 'SN-IMPORTED', source: 'import', remarks: 'Imported from "s.xlsx" — sheet code "NX.A" mapped to this product by Nadeem' },
        { name: 'W', imei: 'SN-SCANNED' }
      ]
    });
    const byId = Object.fromEntries(
      firebaseService.createIfAbsent.mock.calls.map((c) => [c[2].serial, c[2]])
    );
    expect(byId['SN-IMPORTED'].source).toBe('import');
    expect(byId['SN-IMPORTED'].remarks).toMatch(/mapped to this product by Nadeem/);
    // A gun-scanned unit is unaffected — it stays a plain billing registration.
    expect(byId['SN-SCANNED'].source).toBe('billing');
    expect(byId['SN-SCANNED'].remarks).toBe('');
  });

  // A continued bill (or a re-run) must only write the NEW units, not re-process everything.
  it('skips serials already in the registry', async () => {
    storageService._serialsCache = [{ id: 'SN-OLD', serial: 'SN-OLD', teamId: 'Dubai' }];
    const res = await storageService.registerSerialsFromInvoice({
      invoiceNo: 'X', teamId: 'Dubai', locationId: 'loc-1', customer: { company: 'ACME' },
      items: [{ name: 'W', imei: 'SN-OLD' }, { name: 'W', imei: 'SN-NEW' }]
    });
    expect(res.billed).toBe(2);
    expect(res.registered).toHaveLength(1);
    const written = firebaseService.createIfAbsent.mock.calls.map((c) => c[2].serial);
    expect(written).toEqual(['SN-NEW']);
    storageService._serialsCache = [];
  });
});

// Security: the local mirror is a cache of the cloud, and these terminals are shared between staff
// and between regions. Anything left in localStorage after sign-out is readable from devtools by
// the next person, without signing in at all.
describe('clearLocalMirror — shared-terminal data exposure', () => {
  const seed = () => {
    localStorage.setItem('crown_excel_products_v2', JSON.stringify([{ id: 'p', teamId: 'Dubai' }]));
    localStorage.setItem('crown_excel_customers_v2', JSON.stringify([{ id: 'c', company: 'ACME', whatsapp: '+971' }]));
    localStorage.setItem('crown_excel_invoices_v2', JSON.stringify([{ id: 'i', teamId: 'Dubai' }]));
    localStorage.setItem('crown_excel_staff_v2', JSON.stringify([{ email: 'a@b.com' }]));
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai' }]));
    localStorage.setItem('crown_excel_pending_writes_v2', JSON.stringify([{ id: 'x' }]));
    localStorage.setItem('crown_excel_device_id_v2', 'dev-1');
  };

  it('drops every business collection, partner contacts and the staff roster', () => {
    seed();
    storageService.clearLocalMirror();
    for (const k of ['products', 'customers', 'invoices', 'staff']) {
      expect(localStorage.getItem('crown_excel_' + k + '_v2')).toBeNull();
    }
    // Locations are deliberately kept — team resolution depends on them (see clearLocalMirror).
    expect(localStorage.getItem('crown_excel_locations_v2')).not.toBeNull();
  });

  // Data-safety invariant: a write the cloud has not confirmed must survive sign-out, or the bill
  // it represents is gone for good.
  it('KEEPS unconfirmed pending writes and the device id', () => {
    seed();
    storageService.clearLocalMirror();
    expect(localStorage.getItem('crown_excel_pending_writes_v2')).not.toBeNull();
    expect(localStorage.getItem('crown_excel_device_id_v2')).toBe('dev-1');
  });

  it('leaves the app reading empty rather than throwing', () => {
    seed();
    storageService.clearLocalMirror();
    expect(storageService.getProducts()).toEqual([]);
    expect(storageService.getInvoices()).toEqual([]);
  });
});

// A team reassignment mid-session used to null the current user before re-subscribing, so the new
// subscription resolved team '' — an unfiltered query the rules deny — and sync silently died.
describe('team reassignment re-scopes sync instead of breaking it', () => {
  it('keeps the identity across the restart and re-subscribes to the NEW team', () => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([
      { id: 'loc-1', team: 'Dubai', active: true },
      { id: 'loc-9', team: 'Nigeria', active: true }
    ]));
    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-1' });
    storageService._syncStarted = true;   // pretend sync is live

    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-9' });

    expect(storageService.getCurrentUser()).not.toBeNull();
    expect(storageService.getCurrentTeamId()).toBe('Nigeria');
    storageService._syncStarted = false;
  });
});
