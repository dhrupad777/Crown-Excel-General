// Shared invoice-shaping helpers.
//
// `groupInvoiceItems` lived inside InvoicesArchive until printing had to work from the Billing Desk
// too: a staff member whose Invoices View is switched off can no longer reach the Archive, and a
// finished sale must still be able to produce its paper. Printing is not a permission.

// Collapses one invoice's line items into per-product groups, each carrying the running unit
// count and every serial in the order it was scanned — so 100 identical phones show as one
// row (Qty 100) with an expandable serial list instead of 100 rows.
export const groupInvoiceItems = (items) => {
  const groups = [];
  const byKey = new Map();
  (items || []).forEach((item) => {
    const key = item.productId || item.barcode || `${item.name}|${item.sku || ''}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: item.name, sku: item.sku || '', barcode: item.barcode || '', category: item.category || 'Electronics', qty: 0, serials: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.qty += item.qty || 1;
    String(item.imei || '').split(/[/,;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => g.serials.push(s));
  });
  return groups;
};
