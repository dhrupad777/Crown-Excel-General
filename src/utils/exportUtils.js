// Shared report/download builders for every export in the app: real .xlsx workbooks (SheetJS),
// CSV, and PDF tables (jsPDF + autotable). Replaces the per-page hand-rolled data-URL CSVs,
// whose encodeURI approach silently truncates on large datasets.

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
// jspdf-autotable v5: doc.autoTable() no longer exists — only the function-style API works.
import autoTable from 'jspdf-autotable';

export const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Manual local-date formatting — never .toISOString() for filenames, which converts to UTC and
// can shift a hand-picked calendar day by one depending on the browser's timezone offset.
export const formatLocalDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const csvCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportToCsv = ({ filename, headers, rows }) => {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // ﻿ BOM so Excel opens UTF-8 (names, ₹/AED symbols) correctly instead of mojibake.
  downloadBlob(filename, new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
};

// sheets: [{ name, headers, rows, colWidths?: number[] }]
export const exportToXlsx = ({ filename, sheets }) => {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    if (sheet.colWidths) {
      ws['!cols'] = sheet.colWidths.map((wch) => ({ wch }));
    } else {
      // Autofit-ish: size each column to its longest cell (capped so remarks don't explode).
      // Loop rather than Math.max(...spread) — spreading tens of thousands of rows would
      // overflow the argument limit.
      ws['!cols'] = sheet.headers.map((h, idx) => {
        let longest = String(h).length;
        for (const r of sheet.rows) {
          const len = String(r[idx] ?? '').length;
          if (len > longest) longest = len;
        }
        return { wch: Math.min(Math.max(longest + 2, 10), 45) };
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
};

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
  s.customer?.name || '',
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

export const exportSerialsXlsx = (records, filename) => {
  const { flat, grouped } = buildSerialExportSheets(records);
  exportToXlsx({ filename, sheets: [flat, grouped] });
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
