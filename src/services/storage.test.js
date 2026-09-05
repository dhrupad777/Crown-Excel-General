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

// A brand-new shop terminal has no cached locations, so the caller's region resolves to '' and the
// team-scoped subscription becomes an unfiltered query the rules deny. Login now loads them first.
describe('ensureLocationsLoaded - fresh terminal', () => {
  it('fetches the location list when the device has never synced', async () => {
    firebaseService.fetchCollectionOnce = vi.fn(async () => [{ id: 'loc-1', team: 'Dubai', active: true }]);
    expect(storageService.getLocations()).toHaveLength(0);

    const ok = await storageService.ensureLocationsLoaded();

    expect(ok).toBe(true);
    expect(firebaseService.fetchCollectionOnce).toHaveBeenCalledWith('locations');
    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-1' });
    expect(storageService.getCurrentTeamId()).toBe('Dubai'); // would be '' before the fetch
  });

  it('does not hit the network when the list is already cached', async () => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai' }]));
    firebaseService.fetchCollectionOnce = vi.fn(async () => []);
    expect(await storageService.ensureLocationsLoaded()).toBe(true);
    expect(firebaseService.fetchCollectionOnce).not.toHaveBeenCalled();
  });
});

// Per-staff data permissions gate downloads and analytics only. Default is nothing granted, so a
// brand-new account can bill and look records up, but cannot take data out of the system.
describe('data permissions - can()', () => {
  const KEYS = ['invoicesView', 'invoicesExport', 'serialsView', 'serialsExport',
                'partnersView', 'partnersExport', 'analytics'];

  it('grants nothing to a staff doc written before permissions existed', () => {
    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-1' });
    for (const k of KEYS) expect(storageService.can(k)).toBe(false);
  });

  it('grants everything to an admin, whatever the map says', () => {
    storageService.setCurrentUser({
      email: 'a@b.com', role: 'admin', locationId: 'loc-1',
      permissions: { invoicesExport: false, serialsExport: false, partnersExport: false, analytics: false }
    });
    for (const k of KEYS) expect(storageService.can(k)).toBe(true);
  });

  it('grants exactly the keys an admin turned on', () => {
    storageService.setCurrentUser({
      email: 's@b.com', role: 'standard', locationId: 'loc-1',
      permissions: { invoicesView: true, invoicesExport: true, analytics: true }
    });
    expect(storageService.can('invoicesView')).toBe(true);
    expect(storageService.can('invoicesExport')).toBe(true);
    expect(storageService.can('analytics')).toBe(true);
    expect(storageService.can('serialsView')).toBe(false);
    expect(storageService.can('partnersView')).toBe(false);
  });

  // A tab someone cannot open cannot have a working download button on it. The pair is collapsed
  // on read as well as write, so a hand-edited doc can't produce the impossible state either.
  it('drops a download grant whose view is switched off', () => {
    storageService.setCurrentUser({
      email: 's@b.com', role: 'standard', locationId: 'loc-1',
      permissions: { invoicesView: false, invoicesExport: true, serialsView: true, serialsExport: true }
    });
    expect(storageService.can('invoicesExport')).toBe(false);   // view off => download off
    expect(storageService.can('serialsExport')).toBe(true);     // view on  => download stands
  });

  // Anything other than a literal true is a denial - a truthy string from a hand-edited doc, or a
  // key nobody has heard of, must never open a door.
  it('only a literal true grants, and unknown keys never do', () => {
    storageService.setCurrentUser({
      email: 's@b.com', role: 'standard', locationId: 'loc-1',
      permissions: { invoicesView: 'yes', serialsView: 1, somethingElse: true }
    });
    expect(storageService.can('invoicesView')).toBe(false);
    expect(storageService.can('serialsView')).toBe(false);
    expect(storageService.can('somethingElse')).toBe(false);
  });

  it('denies everything when nobody is signed in', () => {
    storageService.setCurrentUser(null);
    for (const k of KEYS) expect(storageService.can(k)).toBe(false);
  });

  it('round-trips a permissions map through saveStaff', async () => {
    storageService.setCurrentUser({ email: 'a@b.com', role: 'admin', locationId: 'loc-1' });
    await storageService.saveStaff({
      email: 'S@B.com', displayName: 'Nadeem', role: 'standard', locationId: 'loc-1', active: true,
      permissions: { invoicesView: true, invoicesExport: true, serialsView: false, analytics: false }
    });
    const saved = storageService.getStaffByEmail('s@b.com');
    expect(saved.permissions.invoicesExport).toBe(true);
    expect(saved.permissions.serialsView).toBe(false);
    expect(firebaseService.updateDocStrict).toHaveBeenCalled();  // cloud-confirmed, not fire-and-forget
  });

  it('records every export in the audit trail', () => {
    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-1' });
    storageService.logExport('invoices', 'xlsx', 42);
    const call = firebaseService.saveToCloud.mock.calls.find((c) => c[0] === 'auditLog');
    expect(call).toBeTruthy();
    expect(call[2].action).toBe('data.export');
    expect(call[2].after).toMatchObject({ domain: 'invoices', format: 'xlsx', rowCount: 42 });
    expect(call[2].createdBy).toBe('s@b.com');
  });
});

// saveStaff REPLACES the stored document. Every caller that builds a staff record must therefore
// carry the permissions map through explicitly - the Staff modal edits name/store/role and would
// otherwise revoke someone's access as a side effect of a rename.
describe('data permissions survive an unrelated staff edit', () => {
  it('a record that omits permissions wipes them - so callers must pass them', async () => {
    storageService.setCurrentUser({ email: 'a@b.com', role: 'admin', locationId: 'loc-1' });
    await storageService.saveStaff({
      email: 's@b.com', displayName: 'Nadeem', role: 'standard', locationId: 'loc-1', active: true,
      permissions: { invoicesView: true, invoicesExport: true }
    });
    expect(storageService.getStaffByEmail('s@b.com').permissions.invoicesExport).toBe(true);

    // The trap: a rename that forgets `permissions`.
    await storageService.saveStaff({
      email: 's@b.com', displayName: 'Nadeem Khan', role: 'standard', locationId: 'loc-1', active: true
    });
    expect(storageService.getStaffByEmail('s@b.com').permissions).toBeUndefined();

    // ...which is why the UI passes them through. Same edit, done correctly:
    await storageService.saveStaff({
      email: 's@b.com', displayName: 'Nadeem Khan', role: 'standard', locationId: 'loc-1', active: true,
      permissions: { invoicesView: true, invoicesExport: true }
    });
    expect(storageService.getStaffByEmail('s@b.com').permissions.invoicesExport).toBe(true);
  });
});

// Registering a large bill used to cost TWO cloud writes per serial: the transaction, plus a full
// duplicate of the record in the audit log. That second write had grown to 96% of the audit
// collection (4,735 of 4,915 entries) for information the serial document already carries.
describe('serial registration cost and progress', () => {
  const invoiceWith = (n) => ({
    invoiceNo: 'BIG', teamId: 'Dubai', locationId: 'loc-1', customer: { company: 'ACME' },
    items: Array.from({ length: n }, (_, i) => ({ name: 'W', imei: `SN${i}`, qty: 1 }))
  });

  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 's@b.com', role: 'standard', locationId: 'loc-1' });
    storageService._serialsCache = [];
  });

  const auditCalls = () => firebaseService.saveToCloud.mock.calls.filter((c) => c[0] === 'auditLog');

  it('writes ONE audit entry for a whole batch, not one per serial', async () => {
    const res = await storageService.registerSerialsFromInvoice(invoiceWith(50));
    expect(res.registered).toHaveLength(50);
    expect(firebaseService.createIfAbsent).toHaveBeenCalledTimes(50);  // one transaction per serial
    expect(auditCalls()).toHaveLength(1);                              // but a single audit line
    expect(auditCalls()[0][2].action).toBe('serial.registerBatch');
    expect(auditCalls()[0][2].after).toMatchObject({ invoiceNo: 'BIG', registered: 50 });
  });

  it('reports progress from 0 up to the total', async () => {
    const seen = [];
    await storageService.registerSerialsFromInvoice(invoiceWith(45), {
      onProgress: (p) => seen.push(p)
    });
    expect(seen[0]).toEqual({ done: 0, total: 45 });
    expect(seen[seen.length - 1]).toEqual({ done: 45, total: 45 });
    // monotonic, never past the total
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i].done).toBeGreaterThanOrEqual(seen[i - 1].done);
      expect(seen[i].done).toBeLessThanOrEqual(45);
    }
  });

  // The cache used to be rebuilt per serial (a filter over every existing record), which is O(n^2)
  // across a batch. It is now spliced once - this guards that the result is still correct.
  it('leaves every registered serial in the cache exactly once', async () => {
    storageService._serialsCache = [{ id: 'OLD1', serial: 'OLD1', teamId: 'Dubai' }];
    await storageService.registerSerialsFromInvoice(invoiceWith(30));

    const ids = storageService._serialsCache.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);        // no duplicates
    expect(ids).toContain('OLD1');                      // pre-existing rows survive
    for (let i = 0; i < 30; i += 1) expect(ids).toContain(`SN${i}`);
    expect(storageService.findSerial('SN29')).toBeTruthy();
  });

  it('re-running an already-registered bill writes nothing at all', async () => {
    const inv = invoiceWith(10);
    await storageService.registerSerialsFromInvoice(inv);
    vi.clearAllMocks();

    const again = await storageService.registerSerialsFromInvoice(inv);
    expect(again.registered).toHaveLength(0);
    expect(firebaseService.createIfAbsent).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });
});

// "3 of 40 missing" told an admin there was a problem but not which units, on a bill that could
// have 40 lines. The finding now names them.
describe('data health names the missing serials', () => {
  it('reports which invoice, which serials, and where', async () => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([
      { id: 'loc-1', team: 'Dubai', name: 'Crown Excel Shop', active: true }
    ]));
    storageService.setCurrentUser({ email: 'a@b.com', role: 'admin', locationId: 'loc-1' });
    localStorage.setItem('crown_excel_invoices_v2', JSON.stringify([{
      id: 'Dubai__305', invoiceNo: '305', teamId: 'Dubai', date: '2026-08-12T10:00:00.000Z',
      status: 'final', customer: { company: 'ACME' },
      items: [
        { name: 'W', imei: 'HERE1', qty: 1, locationId: 'loc-1' },
        { name: 'W', imei: 'GONE1', qty: 1, locationId: 'loc-1' },
        { name: 'W', imei: 'GONE2', qty: 1, locationId: 'loc-1' }
      ]
    }]));
    storageService._serialsCache = [{ id: 'HERE1', serial: 'HERE1', teamId: 'Dubai' }];

    const report = await storageService.runDataHealthCheck({ includeCloudCounts: false });
    const warranty = report.findings.find((f) => f.key === 'warranty');

    expect(warranty.severity).toBe('error');
    expect(warranty.items).toHaveLength(1);
    expect(warranty.items[0]).toMatchObject({
      label: '305', billed: 3, missing: 2, teamId: 'Dubai', store: 'Crown Excel Shop'
    });
    expect(warranty.items[0].missingSerials).toEqual(['GONE1', 'GONE2']);
    expect(warranty.itemNoun).toBe('invoice');
    storageService._serialsCache = [];
  });
});

describe('partner edits follow onto invoices and serials', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 'admin@b.com', role: 'admin', locationId: 'loc-1' });
  });

  it('rewrites billed-to and registry partner when the partner record is renamed', () => {
    const partner = storageService.saveCustomer({ company: 'OLD CO', name: 'Ali', whatsapp: '971', teamId: 'Dubai' });
    storageService.saveInvoice({
      id: 'Dubai__101', invoiceNo: '101', teamId: 'Dubai',
      customer: { id: partner.id, company: 'OLD CO', name: 'Ali', whatsapp: '971' },
      items: [{ name: 'W', imei: 'SN-KEEP' }],
      status: 'final'
    });
    storageService.saveInvoice({
      id: 'Dubai__202', invoiceNo: '202', teamId: 'Dubai',
      customer: { id: 'someone-else', company: 'OTHER', name: 'Bo', whatsapp: '1' },
      items: [{ name: 'W', imei: 'SN-OTHER' }],
      status: 'final'
    });
    storageService._serialsCache = [
      { id: 'SN-KEEP', serial: 'SN-KEEP', invoiceNo: '101', teamId: 'Dubai', customer: { id: partner.id, company: 'OLD CO', name: 'Ali' } },
      { id: 'SN-OTHER', serial: 'SN-OTHER', invoiceNo: '202', teamId: 'Dubai', customer: { id: 'someone-else', company: 'OTHER', name: 'Bo' } }
    ];

    storageService.saveCustomer({ ...partner, company: 'NEW CO', name: 'Aliya' });

    expect(storageService.getInvoiceById('Dubai__101').customer).toMatchObject({
      id: partner.id, company: 'NEW CO', name: 'Aliya'
    });
    expect(storageService.getInvoiceById('Dubai__202').customer.company).toBe('OTHER');
    expect(storageService.findSerial('SN-KEEP').customer).toMatchObject({ company: 'NEW CO', name: 'Aliya' });
    expect(storageService.findSerial('SN-OTHER').customer.company).toBe('OTHER');
  });

  it('rewrites registry partner when the invoice billed-to is edited', () => {
    storageService.saveInvoice({
      id: 'Dubai__101', invoiceNo: '101', teamId: 'Dubai',
      customer: { id: 'c1', company: 'OLD CO', name: 'Ali', whatsapp: '971' },
      items: [{ name: 'W', imei: 'SN1' }],
      status: 'final', date: new Date().toISOString()
    });
    storageService._serialsCache = [
      { id: 'SN1', serial: 'SN1', invoiceNo: '101', teamId: 'Dubai', customer: { id: 'c1', company: 'OLD CO', name: 'Ali' } }
    ];

    storageService.editInvoice('Dubai__101', {
      customer: { id: 'c2', company: 'NEW CO', name: 'Bo', whatsapp: '123' }
    });

    expect(storageService.getInvoiceById('Dubai__101').customer.company).toBe('NEW CO');
    expect(storageService.findSerial('SN1').customer).toMatchObject({ id: 'c2', company: 'NEW CO', name: 'Bo' });
  });
});

describe('voiding an invoice releases its serials', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 'admin@b.com', role: 'admin', locationId: 'loc-1' });
  });

  it('drops registry rows and no longer treats the units as sold', async () => {
    storageService.saveInvoice({
      id: 'Dubai__101', invoiceNo: '101', teamId: 'Dubai',
      customer: { company: 'ACME' },
      items: [{ name: 'W', imei: 'SN-VOID' }, { name: 'W', imei: 'SN-VOID-2' }],
      status: 'final'
    });
    storageService._serialsCache = [
      { id: 'SN-VOID', serial: 'SN-VOID', invoiceNo: '101', teamId: 'Dubai', customer: { company: 'ACME', name: 'ACME' } },
      { id: 'SN-VOID-2', serial: 'SN-VOID-2', invoiceNo: '101', teamId: 'Dubai', customer: { company: 'ACME', name: 'ACME' } },
      { id: 'SN-KEEP', serial: 'SN-KEEP', invoiceNo: '999', teamId: 'Dubai', customer: { company: 'OTHER', name: 'OTHER' } }
    ];

    const result = await storageService.deleteInvoice('Dubai__101', 'order cancelled');
    expect(result.ok).toBe(true);
    expect(result.released.sort()).toEqual(['SN-VOID', 'SN-VOID-2']);
    expect(storageService.findSerial('SN-VOID')).toBeNull();
    expect(storageService.findSerial('SN-VOID-2')).toBeNull();
    expect(storageService.findSerial('SN-KEEP')).toBeTruthy();
    expect(storageService.findInvoiceBySerial('SN-VOID')).toEqual([]);
    expect(storageService.getInvoiceById('Dubai__101')).toBeNull();
    const archived = JSON.parse(localStorage.getItem('crown_excel_invoices_v2')).find((r) => r.id === 'Dubai__101');
    expect(archived.deleted).toBe(true);
  });

  it('re-registers serials when a voided final invoice is restored', async () => {
    storageService.saveInvoice({
      id: 'Dubai__101', invoiceNo: '101', teamId: 'Dubai',
      customer: { company: 'ACME' },
      items: [{ name: 'W', imei: 'SN-BACK' }],
      status: 'final'
    });
    await storageService.deleteInvoice('Dubai__101', 'oops');
    await storageService.restoreRecord('invoices', 'Dubai__101');
    expect(firebaseService.createIfAbsent).toHaveBeenCalled();
    const serials = firebaseService.createIfAbsent.mock.calls.map((c) => c[2].serial);
    expect(serials).toContain('SN-BACK');
  });

  it('data-health repair releases serials left on already-voided bills', async () => {
    storageService.saveInvoice({
      id: 'Dubai__101', invoiceNo: '101', teamId: 'Dubai',
      customer: { company: 'ACME' },
      items: [{ name: 'W', imei: 'SN-OLDVOID' }],
      status: 'final'
    });
    const all = JSON.parse(localStorage.getItem('crown_excel_invoices_v2'));
    localStorage.setItem('crown_excel_invoices_v2', JSON.stringify(all.map((r) => (
      r.id === 'Dubai__101' ? { ...r, deleted: true, deleteReason: 'legacy void' } : r
    ))));
    storageService._serialsCache = [
      { id: 'SN-OLDVOID', serial: 'SN-OLDVOID', invoiceNo: '101', teamId: 'Dubai', customer: { company: 'ACME', name: 'ACME' } }
    ];
    const report = await storageService.runDataHealthCheck({ includeCloudCounts: false });
    expect(report.findings.find((f) => f.key === 'voidedSerials').severity).toBe('error');
    const r = await storageService.repairMissingRegistrations();
    expect(r.released).toBe(1);
    expect(storageService.findSerial('SN-OLDVOID')).toBeNull();
  });
});

// Company is the only required partner field here, so most partners have an empty `name`. Serials
// store `name || company` (their rules demand a non-empty identifier) while invoices store the raw
// record - comparing those two directly marked every company-only partner as permanently
// "renamed", which is hundreds of false alarms and a Repair that rewrites them all for nothing.
describe('partner drift detection - company-only partners', () => {
  beforeEach(() => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 'a@b.com', role: 'admin', locationId: 'loc-1' });
  });

  const seedCompanyOnly = () => {
    localStorage.setItem('crown_excel_customers_v2', JSON.stringify([
      { id: 'c1', name: '', company: 'ACME', whatsapp: '', email: '', teamId: 'Dubai' }
    ]));
    localStorage.setItem('crown_excel_invoices_v2', JSON.stringify([{
      id: 'Dubai__1', invoiceNo: '1', teamId: 'Dubai', status: 'final',
      customer: { id: 'c1', name: '', company: 'ACME', whatsapp: '', email: '' },   // raw copy
      items: [{ name: 'W', imei: 'S1', qty: 1 }]
    }]));
    // the serial stores the fallen-back name, as registerSerials writes it
    storageService._serialsCache = [{
      id: 'S1', serial: 'S1', teamId: 'Dubai',
      customer: { id: 'c1', name: 'ACME', company: 'ACME', whatsapp: '', email: '' }
    }];
  };

  it('does NOT report a company-only partner as drifted', () => {
    seedCompanyOnly();
    expect(storageService._partnersWithStaleCopies()).toEqual([]);
    storageService._serialsCache = [];
  });

  it('still reports a genuine rename', () => {
    seedCompanyOnly();
    localStorage.setItem('crown_excel_customers_v2', JSON.stringify([
      { id: 'c1', name: '', company: 'ACME TRADING', whatsapp: '', email: '', teamId: 'Dubai' }
    ]));
    const stale = storageService._partnersWithStaleCopies();
    expect(stale).toHaveLength(1);
    expect(stale[0].company).toBe('ACME TRADING');
    storageService._serialsCache = [];
  });

  // The Excel partner import calls saveCustomer per duplicate row under the "update" policy. Without
  // a no-op guard that sweeps every invoice and every cached serial once per row.
  it('saving an unchanged partner writes nothing', () => {
    seedCompanyOnly();
    const before = localStorage.getItem('crown_excel_invoices_v2');
    vi.clearAllMocks();

    storageService.saveCustomer({ id: 'c1', name: '', company: 'ACME', whatsapp: '', email: '', teamId: 'Dubai' });

    expect(localStorage.getItem('crown_excel_invoices_v2')).toBe(before);      // invoice untouched
    expect(firebaseService.updateDocStrict).not.toHaveBeenCalled();            // no serial writes
    storageService._serialsCache = [];
  });

  it('a real rename does reach both the invoice and the serial', () => {
    seedCompanyOnly();
    // The serial cloud-patch is skipped when Firebase isn't up, so turn it on to cover that path.
    firebaseService.isInitialized = true;
    try {
      storageService.saveCustomer({ id: 'c1', name: '', company: 'ACME TRADING', whatsapp: '', email: '', teamId: 'Dubai' });

      const inv = JSON.parse(localStorage.getItem('crown_excel_invoices_v2'))[0];
      expect(inv.customer.company).toBe('ACME TRADING');
      expect(storageService._serialsCache[0].customer.company).toBe('ACME TRADING');
      expect(firebaseService.updateDocStrict).toHaveBeenCalledWith(
        'serials', 'S1', expect.objectContaining({ customer: expect.objectContaining({ company: 'ACME TRADING' }) })
      );
    } finally {
      firebaseService.isInitialized = false;
      storageService._serialsCache = [];
    }
  });
});

describe('voiding reports failure honestly', () => {
  it('returns ok:false when there is no such invoice to void', async () => {
    localStorage.setItem('crown_excel_locations_v2', JSON.stringify([{ id: 'loc-1', team: 'Dubai', active: true }]));
    storageService.setCurrentUser({ email: 'a@b.com', role: 'admin', locationId: 'loc-1' });
    const res = await storageService.deleteInvoice('does-not-exist', 'nope');
    expect(res.ok).toBe(false);
  });
});
