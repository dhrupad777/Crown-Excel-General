import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/storage', () => ({
  storageService: {
    getBackupBundle: vi.fn(() => ({ products: [] })),
    createBackupSnapshot: vi.fn(async () => ({ id: 'bk-1', createdAt: '2026-08-10', counts: {}, size: 10 })),
    isAutoBackupEnabled: vi.fn(() => true),
    isWeeklyBackupDue: vi.fn(() => true)
  }
}));
vi.mock('./download', () => ({ downloadBlob: vi.fn() }));

const { storageService } = await import('../services/storage');
const { downloadBlob } = await import('./download');
const { bundleToXml, bundleToSheets, downloadBundle, runWeeklySnapshotIfDue } = await import('./backup');

beforeEach(() => vi.clearAllMocks());

describe('bundleToXml', () => {
  it('emits a declaration and a single root element', () => {
    const xml = bundleToXml({ exportedAt: '2026-08-10', products: [] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<crownExcelBackup>');
    expect(xml).toContain('</crownExcelBackup>');
  });

  it('escapes XML-special characters so the file stays well-formed', () => {
    const xml = bundleToXml({ note: 'A & B <tag> "q" \'x\'' });
    expect(xml).toContain('A &amp; B &lt;tag&gt; &quot;q&quot; &apos;x&apos;');
    expect(xml).not.toContain('<tag>'); // the literal from data must be escaped, not a real element
  });

  it('repeats an <item> element per array entry', () => {
    const xml = bundleToXml({ products: [{ id: 'p1' }, { id: 'p2' }] });
    expect((xml.match(/<item>/g) || []).length).toBe(2);
    expect(xml).toContain('<id>p1</id>');
    expect(xml).toContain('<id>p2</id>');
  });

  it('renders null/empty as self-closing tags', () => {
    const xml = bundleToXml({ missing: null, empties: [] });
    expect(xml).toContain('<missing/>');
    expect(xml).toContain('<empties/>');
  });

  it('coerces a non-XML-safe key to <item name="...">', () => {
    const xml = bundleToXml({ '9bad': 'v' });
    expect(xml).toContain('<item name="9bad">v</item>');
  });
});

describe('downloadBundle', () => {
  it('writes both JSON and XML by default', async () => {
    const files = await downloadBundle({ products: [{ id: 'p1' }] });
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    expect(files.some((f) => f.endsWith('.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('.xml'))).toBe(true);
  });

  it('honours a single requested format and a date label in the filename', async () => {
    await downloadBundle({ products: [] }, ['json'], '2026-08-01');
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0][0]).toBe('Crown_Excel_Full_Backup_2026-08-01.json');
  });
});

describe('runWeeklySnapshotIfDue', () => {
  it('captures a snapshot (not a download) when enabled and due', async () => {
    storageService.isAutoBackupEnabled.mockReturnValue(true);
    storageService.isWeeklyBackupDue.mockReturnValue(true);
    const res = await runWeeklySnapshotIfDue();
    expect(res).toBeTruthy();
    expect(storageService.createBackupSnapshot).toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled(); // background snapshot, nothing downloaded
  });

  it('does nothing when not due', async () => {
    storageService.isWeeklyBackupDue.mockReturnValue(false);
    expect(await runWeeklySnapshotIfDue()).toBeNull();
    expect(storageService.createBackupSnapshot).not.toHaveBeenCalled();
  });

  it('does nothing when auto-backup is disabled', async () => {
    storageService.isAutoBackupEnabled.mockReturnValue(false);
    storageService.isWeeklyBackupDue.mockReturnValue(true);
    expect(await runWeeklySnapshotIfDue()).toBeNull();
    expect(storageService.createBackupSnapshot).not.toHaveBeenCalled();
  });
});

// Excel is the READABLE backup: flattened, one sheet per record type, nested invoice items split
// onto their own sheet. It is not a restore format — that stays JSON.
describe('bundleToSheets', () => {
  const BUNDLE = {
    exportedAt: '2026-08-22T10:00:00.000Z',
    products: [{ id: 'p1', barcode: '0080123', name: 'Acer Nitro', sku: 'NH.A', category: 'Laptops', unit: 'Box', teamId: 'Dubai' }],
    customers: [{ id: 'c1', company: 'ACME', name: 'Raj', whatsapp: '00971501234567', teamId: 'Dubai' }],
    invoices: [{
      id: 'Dubai__305', invoiceNo: '305', date: '2026-08-12T15:24:19.835Z', teamId: 'Dubai',
      customer: { company: 'DIGITAL KNOWLEDGE' }, status: 'final',
      items: [
        { name: 'Acer Nitro', barcode: 'NH.A', sku: '', imei: '0012345', qty: 1, locationName: 'Shop', source: 'import', remarks: "Imported from s.xlsx" },
        { name: 'Acer Nitro', barcode: 'NH.A', imei: 'SN2', qty: 1, locationName: 'Shop' }
      ]
    }],
    serials: [{ id: 'SN2', serial: 'SN2', productName: 'Acer Nitro', barcode: 'NH.A', customer: { company: 'DIGITAL KNOWLEDGE' }, invoiceNo: '305', date: '2026-08-12T15:24:19.835Z', teamId: 'Dubai', source: 'billing' }],
    staff: [{ email: 'a@b.com', displayName: 'Nadeem', role: 'admin', active: true, locationId: 'loc-1' }],
    locations: [{ id: 'loc-1', name: 'Crown Excel Shop', code: 'CES', team: 'Dubai', active: true }]
  };

  const sheetsByName = () => Object.fromEntries(bundleToSheets(BUNDLE).map((sh) => [sh.name, sh]));

  it('produces one sheet per record type plus a summary and line items', () => {
    expect(bundleToSheets(BUNDLE).map((sh) => sh.name)).toEqual([
      'Summary', 'Products', 'Partners', 'Invoices', 'Invoice Items', 'Serials', 'Staff', 'Stores'
    ]);
  });

  it('explodes nested invoice items onto their own sheet, one row per unit', () => {
    const items = sheetsByName()['Invoice Items'];
    expect(items.rows).toHaveLength(2);
    expect(items.rows[0][0]).toBe('305');     // invoice #
    expect(items.rows[0][6]).toBe('0012345'); // serial, leading zero intact
  });

  it('pins every code/serial/phone column to Text so Excel cannot mangle it', () => {
    const s2 = sheetsByName();
    expect(s2['Invoice Items'].textColumns).toContain(6); // Serial
    expect(s2['Invoice Items'].textColumns).toContain(0); // Invoice #
    expect(s2.Products.textColumns).toContain(0);         // Barcode
    expect(s2.Partners.textColumns).toContain(2);         // WhatsApp
    expect(s2.Serials.textColumns).toContain(0);          // Serial
  });

  it('carries import provenance through to the workbook', () => {
    const rows = sheetsByName()['Invoice Items'].rows;
    expect(rows[0][10]).toBe('import');
    expect(rows[0][11]).toMatch(/Imported from/);
    expect(rows[1][10]).toBe('scanned'); // a gun-scanned unit
  });

  it('writes real Date objects so Excel sorts them as dates', () => {
    expect(sheetsByName().Invoices.rows[0][1]).toBeInstanceOf(Date);
    expect(sheetsByName().Serials.rows[0][7]).toBeInstanceOf(Date);
  });

  it('says plainly that JSON is the restore format', () => {
    const note = sheetsByName().Summary.rows.find((r) => r[0] === 'Note');
    expect(note[1]).toMatch(/RESTORE/i);
    expect(note[1]).toMatch(/JSON/);
  });

  it('survives a completely empty bundle', () => {
    const sheets = bundleToSheets({});
    expect(sheets).toHaveLength(8);
    expect(sheets.every((sh) => Array.isArray(sh.rows))).toBe(true);
  });

  it('marks archived records rather than dropping them', () => {
    const sheets = bundleToSheets({ products: [{ id: 'p', name: 'X', deleted: true }] });
    const row = sheets.find((sh) => sh.name === 'Products').rows[0];
    expect(row[6]).toBe('Archived');
  });
});
