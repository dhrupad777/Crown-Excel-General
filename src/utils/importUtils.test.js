import { describe, it, expect, vi, beforeEach } from 'vitest';

// The storage service pulls in Firebase; the parsing/import logic under test doesn't need it.
vi.mock('../services/storage', () => ({
  storageService: {
    getProducts: vi.fn(() => []),
    getCustomers: vi.fn(() => []),
    getTeams: vi.fn(() => ['Dubai', 'Nigeria']),
    saveProduct: vi.fn(async (r) => ({ ...r, id: r.id || 'prod-x', barcode: r.barcode || '999' })),
    saveCustomer: vi.fn(async (r) => ({ ...r, id: r.id || 'cust-x' }))
  }
}));

const { storageService } = await import('../services/storage');
const { importCustomers, importProducts, columnValueCounts, planSerialImport, PROBLEM_KINDS, isResolvable, isWarning, RESOLUTIONS, describeImportedUnit } = await import('./importUtils');

beforeEach(() => { vi.clearAllMocks(); });

describe('spreadsheet parsing', () => {
  // A failed VLOOKUP arrives as { error: '#N/A' }; String()-ing it produced the literal
  // "[object Object]", which was then imported as if it were real data (84 cells in one file).
  it('columnValueCounts ignores blank cells', () => {
    const rows = [{ A: 'x', B: '' }, { A: 'y', B: 'z' }];
    expect(columnValueCounts(rows)).toEqual({ A: 2, B: 1 });
  });
});

describe('importCustomers', () => {
  const row = (over = {}) => ({ Company: 'ACME LTD', 'WhatsApp / Phone': '0801', ...over });

  it('imports a company-only row (Company is the only required field)', async () => {
    const res = await importCustomers([{ Company: 'SOLO CO' }], { defaultTeamId: 'Nigeria' });
    expect(res.created).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects a row with no company', async () => {
    const res = await importCustomers([{ 'Customer Name': 'No Company' }], { defaultTeamId: 'Nigeria' });
    expect(res.created).toBe(0);
    expect(res.errors[0].reason).toMatch(/company/i);
  });

  it('stamps the region from the Region column, overriding the default', async () => {
    await importCustomers([row({ Region: 'Dubai' })], { defaultTeamId: 'Nigeria' });
    expect(storageService.saveCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'Dubai' }),
      { confirm: true }
    );
  });

  it('falls back to the default region when the Region cell is blank', async () => {
    await importCustomers([row()], { defaultTeamId: 'Nigeria' });
    expect(storageService.saveCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'Nigeria' }),
      { confirm: true }
    );
  });

  it('rejects an unknown region instead of silently misfiling it', async () => {
    const res = await importCustomers([row({ Region: 'Atlantis' })], { defaultTeamId: 'Nigeria' });
    expect(res.created).toBe(0);
    expect(res.errors[0].reason).toMatch(/Atlantis/);
  });

  // The core regression: a row must only count as created once the CLOUD confirms it.
  it('counts a failed cloud write as an error, never as created', async () => {
    storageService.saveCustomer.mockRejectedValueOnce(new Error('permission-denied'));
    const res = await importCustomers([row()], { defaultTeamId: 'Nigeria' });
    expect(res.created).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].reason).toMatch(/permission-denied/);
  });

  it('writes with confirm:true so nothing is reported optimistically', async () => {
    await importCustomers([row()], { defaultTeamId: 'Nigeria' });
    expect(storageService.saveCustomer).toHaveBeenCalledWith(expect.anything(), { confirm: true });
  });

  it('de-duplicates within the file', async () => {
    const res = await importCustomers([row(), row()], { defaultTeamId: 'Nigeria' });
    expect(res.created).toBe(1);
    expect(res.errors).toHaveLength(1);
  });
});

describe('importProducts', () => {
  it('stamps the region and confirms the write', async () => {
    const res = await importProducts(
      [{ 'Device Name': 'Widget', Barcode: '123', Region: 'Dubai' }],
      { defaultTeamId: 'Nigeria' }
    );
    expect(res.created).toBe(1);
    expect(storageService.saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'Dubai' }),
      { confirm: true }
    );
  });

  it('counts a rejected cloud write as an error, not a success', async () => {
    storageService.saveProduct.mockRejectedValueOnce(new Error('offline'));
    const res = await importProducts([{ 'Device Name': 'Widget' }], { defaultTeamId: 'Dubai' });
    expect(res.created).toBe(0);
    expect(res.errors[0].reason).toMatch(/offline/);
  });
});

describe('planSerialImport', () => {
  // Mirrors the real catalog: the manufacturer part number lives in `barcode` with `sku` empty on
  // the Acer devices, while other products carry a separate numeric barcode plus a SKU.
  const PRODUCTS = [
    { id: 'p1', name: 'Acer Nitro ANV16-71', barcode: 'NH.QTREM.003', sku: '' },
    { id: 'p2', name: 'HP Victus 15', barcode: '8801234', sku: 'D15E5EA#ABV' }
  ];
  const plan = (rows, over = {}) => planSerialImport({
    rows, codeColumn: 'SKU', serialColumn: 'SERIAL NUMBER', products: PRODUCTS, ...over
  });
  const row = (code, serial) => ({ SKU: code, 'SERIAL NUMBER': serial });

  it('matches on barcode when sku is empty (the supplied sample file)', () => {
    const res = plan([row('NH.QTREM.003', '1122334490')]);
    expect(res.problems).toHaveLength(0);
    expect(res.ready[0]).toMatchObject({ serial: '1122334490', rowNumber: 2 });
    expect(res.ready[0].product.id).toBe('p1');
  });

  it('matches on sku too, and is case/space tolerant', () => {
    const res = plan([row('  d15e5ea#abv ', 'abc123')]);
    expect(res.problems).toHaveLength(0);
    expect(res.ready[0].product.id).toBe('p2');
    expect(res.ready[0].serial).toBe('ABC123'); // normalized like the registry doc id
  });

  it('reports an unknown product code instead of guessing', () => {
    const res = plan([row('NH.XXXX.999', '1122334490')]);
    expect(res.ready).toHaveLength(0);
    expect(res.problems[0].reason).toMatch(/No product in the catalog matches/);
  });

  it('refuses an ambiguous code that matches two products', () => {
    const products = [
      { id: 'a', name: 'Lenovo A', barcode: '21SJ002AGP', sku: '' },
      { id: 'b', name: 'Lenovo B', barcode: 'D494A99BA41A', sku: '21SJ002AGP' }
    ];
    const res = plan([row('21SJ002AGP', 'SER1')], { products });
    expect(res.ready).toHaveLength(0);
    expect(res.problems[0].reason).toMatch(/matches 2 products/);
  });

  it('flags blank and too-short serials', () => {
    const res = plan([row('NH.QTREM.003', ''), row('NH.QTREM.003', 'AB')]);
    expect(res.ready).toHaveLength(0);
    expect(res.problems[0].reason).toMatch(/blank/i);
    expect(res.problems[1].reason).toMatch(/too short/i);
  });

  it('rejects a serial Excel mangled into scientific notation', () => {
    for (const mangled of ['1.23457e+21', '1e+21', '1.5e-7']) {
      const res = plan([row('NH.QTREM.003', mangled)]);
      expect(res.ready).toHaveLength(0);
      expect(res.problems[0].reason).toMatch(/format the column as Text/i);
    }
  });

  // Regression: the scientific-notation guard used to be unanchored, so a digit-E-digit run
  // ANYWHERE in a serial tripped it — blocking 24 real Acer serials in a single 200-row import.
  it('accepts real serials that merely contain a digit-E-digit run', () => {
    const serials = [
      'NHQVUEM002538262E97600',   // ...262E976...
      'NHQVUEM0025382629E7600',
      'NHQVUEM0025232CD6E7600',
      'NHQX5EM003536228E07600'
    ];
    const res = plan(serials.map((s) => row('NH.QTREM.003', s)));
    expect(res.problems).toHaveLength(0);
    expect(res.ready).toHaveLength(serials.length);
  });

  it('catches a duplicate within the file and names the row it collided with', () => {
    const res = plan([row('NH.QTREM.003', 'DUP1'), row('NH.QTREM.003', 'dup1')]);
    expect(res.ready).toHaveLength(1);
    expect(res.problems[0].reason).toMatch(/duplicate of row 2/i);
  });

  it('catches a serial already on the bill', () => {
    const res = plan([row('NH.QTREM.003', 'onbill1')], { existingSerials: ['ONBILL1'] });
    expect(res.ready).toHaveLength(0);
    expect(res.problems[0].reason).toMatch(/already on this bill/i);
  });

  it('imports the good rows alongside the bad ones', () => {
    const res = plan([
      row('NH.QTREM.003', 'GOOD1'),
      row('NOPE', 'GOOD2'),
      row('8801234', 'GOOD3')
    ]);
    expect(res.ready.map((r) => r.serial)).toEqual(['GOOD1', 'GOOD3']);
    expect(res.problems).toHaveLength(1);
  });

  it('ignores a fully blank row rather than reporting it', () => {
    const res = plan([row('', ''), row('NH.QTREM.003', 'OK1')]);
    expect(res.ready).toHaveLength(1);
    expect(res.problems).toHaveLength(0);
  });
});

// The import must never dead-end on a guess. Every problem is either something the operator can
// resolve in the modal, a heuristic they can wave through, or a correct skip — and the classifier
// says which. These tests exist because an over-eager heuristic once blocked 24 valid serials.
describe('planSerialImport recovery', () => {
  const PRODUCTS = [
    { id: 'p1', name: 'Acer Nitro ANV16-71', barcode: 'NH.QTREM.003', sku: '' },
    { id: 'p2', name: 'Acer TravelMate P215-55', barcode: 'NX.BSREM.002', sku: '' }
  ];
  const plan = (rows, over = {}) => planSerialImport({
    rows, codeColumn: 'SKU', serialColumn: 'SERIAL NUMBER', products: PRODUCTS, ...over
  });
  const row = (code, serial) => ({ SKU: code, 'SERIAL NUMBER': serial });

  // Serial shapes seen in this business's real catalog and supplier sheets. NONE may ever be
  // flagged — this corpus is the guard against another false-positive lockout.
  const REAL_SERIALS = [
    'NHQVUEM002538262E97600', 'NHQX5EM003536228E07600', 'NHQVUEM0025232CD6E7600',
    '5CD54894PY', '5CD548956G', 'D15E5EA#ABV', 'C02G9012MD6R',
    '358923009182391',           // 15-digit IMEI
    '1122334490', '0012345', 'SN-2024/00123', 'ABC 123 XYZ',
    'TCN0CV01F85349D', '21SJ002AGP', 'NX.DGCEM.001', 'E5E5E5E5E5'
  ];

  it('never flags any real-world serial shape', () => {
    const res = plan(REAL_SERIALS.map((s) => row('NH.QTREM.003', s)));
    expect(res.problems).toEqual([]);
    expect(res.ready).toHaveLength(REAL_SERIALS.length);
  });

  it('classifies an unmatched code as resolvable, not terminal', () => {
    const res = plan([row('NX.BSREM.00C', 'SER1')]);
    expect(res.problems[0].kind).toBe(PROBLEM_KINDS.UNMATCHED_PRODUCT);
    expect(isResolvable(res.problems[0].kind)).toBe(true);
  });

  it('applies a codeOverride so the operator can point a code at a product', () => {
    const rows = [row('NX.BSREM.00C', 'SER1'), row('NX.BSREM.00C', 'SER2')];
    expect(plan(rows).ready).toHaveLength(0);

    const res = plan(rows, { codeOverrides: { 'NX.BSREM.00C': PRODUCTS[1] } });
    expect(res.problems).toHaveLength(0);
    expect(res.ready).toHaveLength(2);
    expect(res.ready.every((r) => r.product.id === 'p2')).toBe(true);
  });

  it('re-runs the duplicate checks on rows an override just made eligible', () => {
    // Both rows carry the same serial. Before the override they fail on the unknown code and the
    // duplicate is never seen; after it, exactly one must survive.
    const rows = [row('NX.BSREM.00C', 'SAME1'), row('NX.BSREM.00C', 'same1')];
    const res = plan(rows, { codeOverrides: { 'NX.BSREM.00C': PRODUCTS[1] } });
    expect(res.ready).toHaveLength(1);
    expect(res.problems[0].kind).toBe(PROBLEM_KINDS.DUPLICATE_IN_FILE);
  });

  it('honours a "skip" override without reporting those rows as problems', () => {
    const res = plan([row('NX.BSREM.00C', 'SER1')], { codeOverrides: { 'NX.BSREM.00C': 'skip' } });
    expect(res.ready).toHaveLength(0);
    expect(res.problems).toHaveLength(0);
    expect(res.skippedByOperator).toHaveLength(1);
  });

  it('lets an override settle an ambiguous code', () => {
    const products = [
      { id: 'a', name: 'Lenovo A', barcode: '21SJ002AGP', sku: '' },
      { id: 'b', name: 'Lenovo B', barcode: 'D494A99BA41A', sku: '21SJ002AGP' }
    ];
    const rows = [row('21SJ002AGP', 'SER1')];
    const before = plan(rows, { products });
    expect(before.problems[0].kind).toBe(PROBLEM_KINDS.AMBIGUOUS_PRODUCT);
    expect(before.problems[0].matches).toHaveLength(2);

    const after = plan(rows, { products, codeOverrides: { '21SJ002AGP': products[1] } });
    expect(after.ready[0].product.id).toBe('b');
  });

  it('classifies heuristic serial complaints as WARNINGS that acceptWarnings clears', () => {
    const rows = [row('NH.QTREM.003', '1.23457e+21'), row('NH.QTREM.003', 'AB')];
    const strict = plan(rows);
    expect(strict.problems.map((p) => p.kind))
      .toEqual([PROBLEM_KINDS.SUSPECT_SERIAL, PROBLEM_KINDS.SHORT_SERIAL]);
    expect(strict.problems.every((p) => isWarning(p.kind))).toBe(true);

    const waved = plan(rows, { acceptWarnings: true });
    expect(waved.problems).toHaveLength(0);
    expect(waved.ready.map((r) => r.raw)).toEqual(['1.23457e+21', 'AB']);
  });

  // Skips stay skips even with acceptWarnings on — these are facts, not guesses.
  it('acceptWarnings never overrides a real duplicate or an on-bill serial', () => {
    const rows = [row('NH.QTREM.003', 'DUP'), row('NH.QTREM.003', 'DUP'), row('NH.QTREM.003', 'ONBILL')];
    const res = plan(rows, { acceptWarnings: true, existingSerials: ['ONBILL'] });
    expect(res.ready).toHaveLength(1);
    expect(res.problems.map((p) => p.kind).sort())
      .toEqual([PROBLEM_KINDS.DUPLICATE_IN_FILE, PROBLEM_KINDS.ON_BILL].sort());
    expect(res.problems.every((p) => !isWarning(p.kind) && !isResolvable(p.kind))).toBe(true);
  });

  it('every problem it emits is classified into a known kind', () => {
    const res = plan([
      row('', ''), row('NH.QTREM.003', ''), row('', 'SER1'), row('NOPE', 'SER2'),
      row('NH.QTREM.003', 'AB'), row('NH.QTREM.003', '1e+21'),
      row('NH.QTREM.003', 'DUP'), row('NH.QTREM.003', 'DUP')
    ]);
    const known = new Set(Object.values(PROBLEM_KINDS));
    expect(res.problems.length).toBeGreaterThan(0);
    for (const p of res.problems) {
      expect(known.has(p.kind)).toBe(true);
      expect(typeof p.reason).toBe('string');
      expect(p.reason.length).toBeGreaterThan(0);
    }
  });
});

// Every way around the normal path has to leave a trace: the operator's override is written onto
// the unit's permanent warranty record, not just shown once on screen.
describe('describeImportedUnit', () => {
  const base = { fileName: 'SERIAL IMPORT.xlsx', code: 'NX.BSREM.00C', productName: 'Acer TravelMate', operator: 'Nadeem Khan' };

  it('records a plain import with no override', () => {
    const s = describeImportedUnit({ ...base, resolution: RESOLUTIONS.MATCHED });
    expect(s).toBe('Imported from "SERIAL IMPORT.xlsx"');
  });

  it('names the operator who mapped an unmatched code', () => {
    const s = describeImportedUnit({ ...base, resolution: RESOLUTIONS.MAPPED });
    expect(s).toMatch(/mapped to this product by Nadeem Khan/);
    expect(s).toMatch(/NX\.BSREM\.00C/);
  });

  it('records a product created mid-import', () => {
    const s = describeImportedUnit({ ...base, resolution: RESOLUTIONS.CREATED });
    expect(s).toMatch(/product created during import by Nadeem Khan/);
  });

  it('records a waived format warning alongside the override', () => {
    const s = describeImportedUnit({ ...base, resolution: RESOLUTIONS.MAPPED, warned: true });
    expect(s).toMatch(/mapped to this product/);
    expect(s).toMatch(/despite a format warning/);
  });

  // The registry record is a Firestore doc — an absurd file name must not bloat it.
  it('stays bounded no matter how long the inputs are', () => {
    const s = describeImportedUnit({
      fileName: 'x'.repeat(500), code: 'y'.repeat(500),
      resolution: RESOLUTIONS.MAPPED, operator: 'z'.repeat(200), warned: true
    });
    expect(s.length).toBeLessThanOrEqual(300);
  });

  it('falls back gracefully when the operator name is missing', () => {
    const s = describeImportedUnit({ ...base, resolution: RESOLUTIONS.MAPPED, operator: '' });
    expect(s).toMatch(/by operator/);
  });
});
