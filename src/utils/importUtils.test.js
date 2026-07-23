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
const { importCustomers, importProducts, columnValueCounts } = await import('./importUtils');

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
