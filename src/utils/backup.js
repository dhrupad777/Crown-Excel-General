// Serializes a backup bundle to JSON/XML/Excel and triggers on-demand downloads. The bundle itself
// is produced and stored by storageService (see getBackupBundle / createBackupSnapshot). Every
// format comes from the SAME bundle so they can never drift. Everything is client-side.

import { downloadBlob } from './download';
import { writeStyledWorkbook } from './excelWriter';
import { storageService } from '../services/storage';

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// A tag name must be a valid XML name. Numeric array indices (and any odd keys) are coerced to a
// safe element, with the original key preserved as a `name` attribute so nothing is lost.
const safeTag = (key) => {
  const k = String(key);
  if (/^[A-Za-z_][\w.-]*$/.test(k)) return { tag: k, attr: '' };
  return { tag: 'item', attr: ` name="${escapeXml(k)}"` };
};

// Recursively serialize any JSON-ish value to indented XML. Arrays repeat a child element per
// entry; objects nest their keys; primitives become escaped text.
const valueToXml = (key, value, indent) => {
  const { tag, attr } = safeTag(key);
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) return `${pad}<${tag}${attr}/>`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<${tag}${attr}/>`;
    const kids = value.map((v) => valueToXml('item', v, indent + 1)).join('\n');
    return `${pad}<${tag}${attr}>\n${kids}\n${pad}</${tag}>`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}<${tag}${attr}/>`;
    const kids = keys.map((k) => valueToXml(k, value[k], indent + 1)).join('\n');
    return `${pad}<${tag}${attr}>\n${kids}\n${pad}</${tag}>`;
  }

  return `${pad}<${tag}${attr}>${escapeXml(value)}</${tag}>`;
};

export const bundleToXml = (bundle) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml('crownExcelBackup', bundle, 0)}\n`;

// --- EXCEL ---------------------------------------------------------------------------------
// JSON and XML mirror the bundle's exact structure, which makes them restorable but unreadable.
// The workbook is the opposite: a flattened, human-readable view for reading and reporting, with
// invoice line items split onto their own sheet (a nested array can't live in a spreadsheet cell).
// It is deliberately NOT a restore format — importAllData reads JSON. The UI says so.

const asDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d;
};
const partnerOf = (c) => c?.company || c?.name || '';
const liveOrArchived = (r) => (r?.deleted ? 'Archived' : 'Active');
const yesNo = (v) => (v === false ? 'No' : 'Yes');

// Codes, serials, phone numbers and invoice numbers are all "numbers" to Excel — which drops
// leading zeros and rounds long values. Every such column is pinned to Text (see excelWriter).
export const bundleToSheets = (bundle) => {
  const b = bundle || {};
  const products = b.products || [];
  const customers = b.customers || [];
  const invoices = b.invoices || [];
  const serials = b.serials || [];
  const staff = b.staff || [];
  const locations = b.locations || [];

  // One row per physical unit. A nested items array can't live in a cell, so the line items get
  // their own sheet — which is also the sheet anyone actually wants to filter and pivot.
  const lineItems = [];
  for (const inv of invoices) {
    for (const it of inv.items || []) {
      lineItems.push([
        inv.invoiceNo || inv.id || '',
        asDate(inv.date),
        partnerOf(inv.customer),
        it.name || '',
        it.barcode || '',
        it.sku || '',
        it.imei || '',
        it.qty ?? 1,
        it.locationName || '',
        inv.teamId || '',
        it.source || 'scanned',
        it.remarks || ''
      ]);
    }
  }

  return [
    {
      name: 'Summary',
      headers: ['Item', 'Value'],
      rows: [
        ['Backup taken', asDate(b.exportedAt)],
        ['Products', products.length],
        ['Partners', customers.length],
        ['Invoices', invoices.length],
        ['Invoice line items', lineItems.length],
        ['Registered serials', serials.length],
        ['Staff', staff.length],
        ['Stores', locations.length],
        ['', ''],
        ['Note', 'This workbook is for reading and reporting. To RESTORE a backup, use the JSON file.']
      ],
      colWidths: [26, 90],
      noFilter: true
    },
    {
      name: 'Products',
      headers: ['Barcode', 'Product Name', 'Model / SKU', 'Category', 'Unit', 'Region', 'Status', 'Record ID'],
      rows: products.map((p) => [
        p.barcode || '', p.name || '', p.sku || '', p.category || '', p.unit || '',
        p.teamId || '', liveOrArchived(p), p.id || ''
      ]),
      textColumns: [0, 2]
    },
    {
      name: 'Partners',
      headers: ['Company', 'Contact Name', 'WhatsApp', 'Email', 'Past Bills', 'Region', 'Status', 'Record ID'],
      rows: customers.map((c) => [
        c.company || '', c.name || '', c.whatsapp || '', c.email || '', c.ordersCount ?? 0,
        c.teamId || '', liveOrArchived(c), c.id || ''
      ]),
      textColumns: [2]
    },
    {
      name: 'Invoices',
      headers: ['Invoice #', 'Date', 'Status', 'Partner', 'Contact', 'Units', 'Line Items', 'Region', 'Finalized By', 'Record ID'],
      rows: invoices.map((inv) => {
        const items = inv.items || [];
        return [
          inv.invoiceNo || inv.id || '',
          asDate(inv.date),
          inv.deleted ? 'Voided' : (inv.status || 'final'),
          partnerOf(inv.customer),
          inv.customer?.name || '',
          items.reduce((s, i) => s + (i.qty || 0), 0),
          items.length,
          inv.teamId || '',
          inv.finalizedByName || inv.finalizedBy || '',
          inv.id || ''
        ];
      }),
      textColumns: [0]
    },
    {
      name: 'Invoice Items',
      headers: ['Invoice #', 'Date', 'Partner', 'Product', 'Barcode', 'Model / SKU', 'Serial', 'Qty', 'Store', 'Region', 'Added By', 'Notes'],
      rows: lineItems,
      textColumns: [0, 4, 5, 6]
    },
    {
      name: 'Serials',
      headers: ['Serial', 'Product', 'Model / SKU', 'Barcode', 'Category', 'Partner', 'Invoice #', 'Registered On', 'Registered By', 'Store', 'Region', 'Source', 'Notes'],
      rows: serials.map((s) => [
        s.serial || s.id || '', s.productName || '', s.sku || '', s.barcode || '', s.category || '',
        partnerOf(s.customer), s.invoiceNo || '', asDate(s.date),
        s.registeredByName || s.createdBy || '', s.locationName || '', s.teamId || '',
        s.source || '', s.remarks || ''
      ]),
      textColumns: [0, 2, 3, 6]
    },
    {
      name: 'Staff',
      headers: ['Email', 'Name', 'Role', 'Active', 'Store'],
      rows: staff.map((s) => [
        s.email || s.id || '', s.displayName || '', s.role || '', yesNo(s.active), s.locationId || ''
      ])
    },
    {
      name: 'Stores',
      headers: ['Store ID', 'Store Name', 'Code', 'Region', 'Active'],
      rows: locations.map((l) => [
        l.id || '', l.name || '', l.code || '', l.team || '', yesNo(l.active)
      ])
    }
  ];
};

// Downloads a specific bundle in the requested formats. `label` (a date) names the file. Returns
// the filenames written. Async because the Excel writer lazy-loads ExcelJS.
export const downloadBundle = async (bundle, formats = ['json', 'xml'], label) => {
  const base = `Crown_Excel_Full_Backup_${label || new Date().toISOString().slice(0, 10)}`;
  const written = [];
  if (formats.includes('json')) {
    downloadBlob(`${base}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    written.push(`${base}.json`);
  }
  if (formats.includes('xml')) {
    downloadBlob(`${base}.xml`, new Blob([bundleToXml(bundle)], { type: 'application/xml' }));
    written.push(`${base}.xml`);
  }
  if (formats.includes('xlsx')) {
    await writeStyledWorkbook({
      filename: `${base}.xlsx`,
      title: 'CROWN EXCEL ELECTRONICS',
      subtitle: `Full backup — taken ${bundle?.exportedAt ? new Date(bundle.exportedAt).toLocaleString() : 'now'}`,
      sheets: bundleToSheets(bundle)
    });
    written.push(`${base}.xlsx`);
  }
  return written;
};

// Weekly auto-SNAPSHOT (not a download): captures a snapshot into the on-device history if the
// feature is enabled and a week has elapsed. The user grabs it from Admin → Backups when they
// like. Returns the new snapshot's index entry, or null if nothing was due.
export const runWeeklySnapshotIfDue = async () => {
  if (!storageService.isAutoBackupEnabled() || !storageService.isWeeklyBackupDue()) return null;
  return storageService.createBackupSnapshot();
};
