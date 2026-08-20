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
const { importCustomers, importProducts, columnValueCounts, planSerialImport } = await import('./importUtils');

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
    const res = plan([row('NH.QTREM.003', '1.23457e+21')]);
    expect(res.ready).toHaveLength(0);
    expect(res.problems[0].reason).toMatch(/format the column as Text/i);
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
