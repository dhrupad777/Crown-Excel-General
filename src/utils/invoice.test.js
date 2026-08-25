import { describe, it, expect } from 'vitest';
import { groupInvoiceItems } from './invoice';

// Lifted out of InvoicesArchive so the Billing Desk can print without the Archive. These lock the
// behaviour that move had to preserve exactly.
describe('groupInvoiceItems', () => {
  it('collapses repeated units of one product into a single row, keeping every serial in order', () => {
    const groups = groupInvoiceItems([
      { productId: 'p1', name: 'Acer Nitro', qty: 1, imei: 'SN1' },
      { productId: 'p1', name: 'Acer Nitro', qty: 1, imei: 'SN2' },
      { productId: 'p1', name: 'Acer Nitro', qty: 1, imei: 'SN3' }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].qty).toBe(3);
    expect(groups[0].serials).toEqual(['SN1', 'SN2', 'SN3']);
  });

  it('keeps different products apart and preserves first-seen order', () => {
    const groups = groupInvoiceItems([
      { productId: 'p1', name: 'A', qty: 1, imei: 'S1' },
      { productId: 'p2', name: 'B', qty: 1, imei: 'S2' },
      { productId: 'p1', name: 'A', qty: 1, imei: 'S3' }
    ]);
    expect(groups.map((g) => g.name)).toEqual(['A', 'B']);
    expect(groups[0].serials).toEqual(['S1', 'S3']);
  });

  // Legacy rows crammed several serials into one string before "one row per unit" was enforced.
  it('splits legacy multi-serial cells', () => {
    const groups = groupInvoiceItems([{ productId: 'p1', name: 'A', qty: 2, imei: 'S1 / S2' }]);
    expect(groups[0].serials).toEqual(['S1', 'S2']);
  });

  it('falls back to barcode then name|sku when there is no productId', () => {
    const groups = groupInvoiceItems([
      { barcode: 'NH.A', name: 'A', qty: 1, imei: 'S1' },
      { barcode: 'NH.A', name: 'A', qty: 1, imei: 'S2' },
      { name: 'B', sku: 'X', qty: 1, imei: 'S3' }
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].qty).toBe(2);
  });

  it('handles an empty or missing item list', () => {
    expect(groupInvoiceItems([])).toEqual([]);
    expect(groupInvoiceItems(undefined)).toEqual([]);
  });
});
