// Shared report/download builders for every export in the app: styled .xlsx workbooks (ExcelJS,
// lazy-loaded), CSV, and PDF tables (jsPDF + autotable). Replaces the per-page hand-rolled
// data-URL CSVs, whose encodeURI approach silently truncates on large datasets.

import { jsPDF } from 'jspdf';
// jspdf-autotable v5: doc.autoTable() no longer exists — only the function-style API works.
import autoTable from 'jspdf-autotable';
import { downloadBlob } from './download';
import { writeStyledWorkbook } from './excelWriter';

export { downloadBlob };

// Manual local-date formatting — never .toISOString() for filenames, which converts to UTC and
// can shift a hand-picked calendar day by one depending on the browser's timezone offset.
export const formatLocalDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  // Dates go out as ISO-8601 so a CSV is unambiguous no matter who opens it, in which locale.
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportToCsv = ({ filename, headers, rows }) => {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // ﻿ BOM so Excel opens UTF-8 (names, ₹/AED symbols) correctly instead of mojibake.
  downloadBlob(filename, new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
};

// sheets: [{ name, headers, rows, colWidths?: number[] }]
// Async: ExcelJS is lazy-loaded on first download. Every workbook in the app now goes through the
// same styled writer, so a product/customer/serial export looks like the invoice one.
export const exportToXlsx = async ({ filename, sheets, title, subtitle }) =>
  writeStyledWorkbook({
    filename,
    title: title || 'CROWN EXCEL ELECTRONICS',
    subtitle: subtitle || `Generated ${new Date().toLocaleString()}`,
    sheets
  });

export const exportToPdf = ({ filename, title, subtitle, headers, rows, orientation = 'landscape' }) => {
  const doc = new jsPDF({ orientation, unit: 'pt' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitle, 40, 56);
  }
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: subtitle ? 68 : 54,
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 251] },
    margin: { left: 40, right: 40 }
  });
  doc.save(filename);
};

const SERIAL_EXPORT_HEADERS = [
  'Serial Number', 'Model / SKU', 'Product Name', 'Category', 'Barcode',
  'Customer Name', 'Mobile Number', 'Email ID', 'Invoice Number', 'Store Location',
  'Entry Date & Time', 'Registered By', 'Remarks', 'Source', 'Last Edited By'
];

const serialToRow = (s) => [
  s.serial || '',
  s.sku || '',
  s.productName || '',
  s.category || '',
  s.barcode || '',
  s.customer?.name || s.customer?.company || '',
  s.customer?.whatsapp || '',
  s.customer?.email || '',
  s.invoiceNo || '',
  s.locationName || s.locationId || '',
  s.date ? new Date(s.date).toLocaleString() : '',
  s.registeredByName || s.createdBy || '',
  s.remarks || '',
  s.source || '',
  s.updatedBy || ''
];

// The client-required report shape: a flat "Registrations" sheet with every column, plus a
// "By Model" sheet that groups the serial numbers under their product model so multiple
// serials against one model are visible at a glance.
export const buildSerialExportSheets = (records) => {
  const flatRows = records.map(serialToRow);

  const byModel = new Map();
  for (const s of records) {
    const key = `${s.sku || '—'}|${s.productName || 'Unknown product'}`;
    if (!byModel.has(key)) byModel.set(key, { sku: s.sku || '', productName: s.productName || '', serials: [] });
    byModel.get(key).serials.push(s.serial);
  }
  const groupedRows = [...byModel.values()]
    .sort((a, b) => b.serials.length - a.serials.length)
    .map((g) => [g.sku, g.productName, g.serials.length, g.serials.join(', ')]);

  return {
    flat: { name: 'Registrations', headers: SERIAL_EXPORT_HEADERS, rows: flatRows },
    grouped: {
      name: 'By Model',
      headers: ['Model / SKU', 'Product Name', 'Units Registered', 'Serial Numbers'],
      rows: groupedRows,
      colWidths: [18, 45, 16, 80]
    }
  };
};

export const exportSerialsXlsx = async (records, filename) => {
  const { flat, grouped } = buildSerialExportSheets(records);
  await exportToXlsx({
    filename,
    subtitle: `Warranty Registry · ${records.length} registrations · Generated ${new Date().toLocaleString()}`,
    sheets: [flat, grouped]
  });
};

export const exportSerialsCsv = (records, filename) => {
  const { flat } = buildSerialExportSheets(records);
  exportToCsv({ filename, headers: flat.headers, rows: flat.rows });
};

export const exportSerialsPdf = (records, filename, subtitle) => {
  const { flat } = buildSerialExportSheets(records);
  // PDF stays readable by sorting the flat set by model, keeping each model's serials together.
  const sorted = [...records].sort((a, b) =>
    (a.sku || a.productName || '').localeCompare(b.sku || b.productName || '')
  );
  exportToPdf({
    filename,
    title: 'Crown Excel — Serial Number Registrations',
    subtitle,
    headers: flat.headers.slice(0, 13), // drop Source / Last Edited to fit landscape A4
    rows: sorted.map((s) => serialToRow(s).slice(0, 13))
  });
};

// --- Invoice / bill export ---------------------------------------------------

const ISSUING_VENDOR = 'Crown Excel Electronics';

const queryStatusLabel = (inv) =>
  !inv.query ? 'None' : inv.query.resolved ? 'Resolved' : 'Open';

// Timestamps go into the workbook as real Date objects, not locale strings: Excel can then sort,
// filter and pivot on them, and the same bill can't show two different dates just because two
// people downloaded it from two timezones. Date-only/time-only display columns are rendered in a
// fixed timezone (the vendor's) for the same reason.
const REPORT_TZ = 'Asia/Dubai';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

const asDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d;
};
const ts = asDate;
const fmtDate = (iso) => { const d = asDate(iso); return d ? dateFmt.format(d) : ''; };
const fmtTime = (iso) => { const d = asDate(iso); return d ? timeFmt.format(d) : ''; };
const yesNo = (v) => (v ? 'Yes' : 'No');

// A bill records what was sold and to whom; this system holds no payment information at all
// (prices were deliberately removed). So never assert "Paid" — report the stored status, or the
// neutral fact that the bill was finalized.
const invoiceStatus = (inv) => inv.status || 'Finalized';

// Splits a stored serial/imei string into individual serials (legacy rows crammed several into
// one field separated by / , ; — mirror findInvoiceBySerial's tolerance).
const splitSerials = (imei) =>
  String(imei || '').split(/[/,;]+/).map((s) => s.trim()).filter(Boolean);

// The single definition of "how many physical units is this line?" — a serial-tracked line has
// one unit per serial, an untracked line has `qty` units. Screen tallies and the workbook both
// call this, so the Invoices page and the export can never report different unit counts.
export const countItemUnits = (item) => {
  const serials = splitSerials(item?.imei);
  return serials.length > 0 ? serials.length : Math.max(1, item?.qty || 1);
};

export const countInvoiceUnits = (inv) =>
  (inv?.items || []).reduce((sum, item) => sum + countItemUnits(item), 0);

// Sheet 1 — one row per invoice, every invoice-level field including the full audit trail.
const INVOICE_SUMMARY_HEADERS = [
  'Invoice Number', 'Status', 'Record Status',
  'Bill Created Date', 'Bill Created Time', 'Bill Created (Full)',
  'Customer Name', 'Customer ID', 'Mobile Number', 'Email ID', 'Company',
  'Total Units', 'Distinct Products', 'Total Serial Numbers',
  'Billed By (Name)', 'Billed By (Email)', 'Store Location', 'Location ID',
  'Query Status', 'Query Note', 'Query Raised By', 'Query Raised At',
  'Query Resolved By', 'Query Resolved At',
  'Edited', 'Edited By', 'Edited At', 'Edit Reason',
  'Archived By', 'Archived At', 'Archive Reason'
];

// Sheet 2 — one row per serial, cross-referenced against the warranty registry.
const INVOICE_SERIAL_HEADERS = [
  'Invoice Number', 'Unit #', 'Bill Created Date', 'Bill Created Time',
  'Customer Name', 'Customer ID', 'Mobile Number', 'Email ID', 'Company',
  'Product Name', 'Product ID', 'Model / SKU', 'Barcode', 'Category', 'Unit Type', 'Quantity',
  'Serial Number',
  'Warranty Registered', 'Registered By', 'Registered At', 'Registration Location',
  'Registration Source', 'Registration Remarks',
  'Billed By (Name)', 'Billed By (Email)', 'Store Location', 'Location ID',
  'Invoice Status', 'Query Status', 'Record Status'
];

// Sheet 3 — grouped by product, mirroring the on-screen grouped view.
const BY_MODEL_HEADERS = [
  'Invoice Number', 'Product Name', 'Model / SKU', 'Barcode', 'Category', 'Quantity', 'Serial Numbers'
];

/**
 * Builds the four-sheet invoice workbook data. Pure function — the caller supplies:
 *   meta.serialLookup(serial) -> warranty-registry record (or null)   [registry columns]
 *   meta.generatedBy          -> { displayName, email } of the downloader
 *   meta.dateFilter, meta.scope
 */
export const buildInvoiceExportSheets = (invoices, meta = {}) => {
  const lookup = typeof meta.serialLookup === 'function' ? meta.serialLookup : () => null;
  const summaryRows = [];
  const serialRows = [];
  const byModelRows = [];
  let totalUnits = 0;

  let totalSerials = 0;
  let totalByModelQty = 0;

  for (const inv of invoices) {
    const created = asDate(inv.date) || null;
    const createdDate = fmtDate(inv.date);
    const createdTime = fmtTime(inv.date);
    const cust = inv.customer || {};
    const q = inv.query || null;
    const recordStatus = inv.deleted ? 'Archived (Voided)' : 'Active';
    const invStatus = invoiceStatus(inv);
    const billedName = inv.billedByName || '';
    const billedEmail = inv.billedBy || '';
    const locationName = inv.locationName || '';
    const locationId = inv.locationId || '';
    const qStatus = queryStatusLabel(inv);

    // Group items by product while flattening every serial into its own row.
    const groups = new Map();
    let unitNo = 0;
    let invUnits = 0;
    let invSerials = 0;

    for (const item of inv.items || []) {
      const serials = splitSerials(item.imei);
      // One row per physical unit. A serial-tracked item has exactly one unit per serial (a
      // legacy row may hold several in one `imei` field); an untracked item has `qty` units.
      // Deriving BOTH the unit rows and the By Model quantity from this single count is what
      // makes Summary "Total Units", the Serial Details row count, and By Model quantities tie.
      const unitsForItem = countItemUnits(item);
      const rowsForItem = serials.length > 0 ? serials : Array(unitsForItem).fill('');

      const key = item.productId || item.barcode || `${item.name}|${item.sku || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { name: item.name || '', sku: item.sku || '', barcode: item.barcode || '', category: item.category || '', qty: 0, serials: [] });
      }
      const g = groups.get(key);
      g.qty += unitsForItem;

      for (const serial of rowsForItem) {
        unitNo += 1;
        invUnits += 1;
        totalUnits += 1;
        if (serial) {
          invSerials += 1;
          totalSerials += 1;
          g.serials.push(serial);
        }

        // Warranty registry cross-reference — the richest per-serial data we hold.
        const reg = serial ? lookup(serial) : null;

        serialRows.push([
          inv.id, unitNo, createdDate, createdTime,
          cust.name || '', cust.id || '', cust.whatsapp || '', cust.email || '', cust.company || '',
          item.name || '', item.productId || '', item.sku || '', item.barcode || '',
          item.category || '', item.unit || '', 1, // each row IS one unit — sums to Total Units
          serial,
          yesNo(!!reg),
          reg ? (reg.registeredByName || reg.createdBy || '') : '',
          reg ? ts(reg.date) : '',
          reg ? (reg.locationName || reg.locationId || '') : '',
          reg ? (reg.source || '') : '',
          reg ? (reg.remarks || '') : '',
          billedName, billedEmail, locationName, locationId,
          invStatus, qStatus, recordStatus
        ]);
      }
    }

    for (const g of groups.values()) {
      totalByModelQty += g.qty;
      byModelRows.push([inv.id, g.name, g.sku, g.barcode, g.category, g.qty, g.serials.join(', ')]);
    }

    summaryRows.push([
      inv.id, invStatus, recordStatus,
      createdDate, createdTime, created || '',
      cust.name || '', cust.id || '', cust.whatsapp || '', cust.email || '', cust.company || '',
      invUnits, groups.size, invSerials,
      billedName, billedEmail, locationName, locationId,
      qStatus, q?.note || '', q ? (q.raisedByName || q.raisedBy || '') : '', q ? ts(q.raisedAt) : '',
      q?.resolvedBy || '', q ? ts(q.resolvedAt) : '',
      yesNo(!!inv.editedBy), inv.editedByName || inv.editedBy || '', ts(inv.editedAt), inv.editReason || '',
      inv.deletedByName || inv.deletedBy || '', ts(inv.deletedAt), inv.deleteReason || ''
    ]);
  }

  const by = meta.generatedBy || {};
  const generatedBy = by.displayName || by.email
    ? `${by.displayName || ''}${by.email ? ` (${by.email})` : ''}`.trim()
    : 'Unknown';

  const archivedCount = invoices.filter((i) => i.deleted).length;
  const tiesOut = totalUnits === serialRows.length && totalUnits === totalByModelQty;

  const infoRows = [
    ['Issuing Vendor', ISSUING_VENDOR],
    ['Report', 'Invoice Export — Bills, Serial Numbers & Warranty Registration'],
    ['Scope', meta.scope || (invoices.length === 1 ? `Single bill (${invoices[0]?.id})` : 'Filtered set')],
    ['Invoice(s) Included', invoices.map((i) => i.id).join(', ')],
    ['Generated At (Downloaded)', new Date()],
    ['Generated By', generatedBy],
    ['Date Filter', meta.dateFilter || 'All records'],
    ['Timezone', `${REPORT_TZ} (all dates in this workbook)`],
    ['', ''],
    ['— Reconciliation —', ''],
    ['Total Invoices', invoices.length],
    ['  of which archived (voided)', archivedCount],
    ['Total Units', totalUnits],
    ['Serial Details — row count', serialRows.length],
    ['By Model — sum of Quantity', totalByModelQty],
    ['Units with a serial number', totalSerials],
    ['Units without a serial number', totalUnits - totalSerials],
    ['Cross-foot check', tiesOut ? 'OK — all three unit counts agree' : 'MISMATCH — investigate before relying on this report'],
    ['', ''],
    ['Warranty Registry Cross-Reference', typeof meta.serialLookup === 'function' ? 'Yes' : 'No'],
    ['Payment Information', 'Not tracked by this system — this is a warranty/serial record, not a financial document.'],
    ['Note', 'Archived (voided) bills are included and marked in the Record Status column; they are never removed from the record.']
  ];

  return {
    summary: { name: 'Invoice Summary', headers: INVOICE_SUMMARY_HEADERS, rows: summaryRows },
    serials: { name: 'Serial Details', headers: INVOICE_SERIAL_HEADERS, rows: serialRows },
    byModel: { name: 'By Model', headers: BY_MODEL_HEADERS, rows: byModelRows, colWidths: [16, 42, 18, 16, 18, 10, 60] },
    info: { name: 'Report Info', headers: ['Field', 'Value'], rows: infoRows, colWidths: [32, 70], noFilter: true }
  };
};

// Styled four-sheet workbook. Async because ExcelJS is lazy-loaded on first download.
export const exportInvoicesXlsx = async (invoices, filename, meta = {}) => {
  const { summary, serials, byModel, info } = buildInvoiceExportSheets(invoices, meta);
  const scope = invoices.length === 1 ? `Invoice ${invoices[0]?.id}` : `${invoices.length} invoices`;
  await writeStyledWorkbook({
    filename,
    title: 'CROWN EXCEL ELECTRONICS',
    subtitle: `Invoice Report · ${scope} · Generated ${new Date().toLocaleString()}`,
    sheets: [summary, serials, byModel, info]
  });
};

// Flat CSV fallback (one row per serial — same columns as the Serial Details sheet).
export const exportInvoicesCsv = (invoices, filename, meta = {}) => {
  const { serials } = buildInvoiceExportSheets(invoices, meta);
  exportToCsv({ filename, headers: serials.headers, rows: serials.rows });
};
