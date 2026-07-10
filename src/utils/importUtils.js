// Excel/CSV bulk-import parsing and validation for the Product and Customer masters.
// Header matching is tolerant (case/spacing/synonyms) so files exported from this app, the
// client's old sheets, or a blank template all round-trip without manual renaming.

import { storageService } from '../services/storage';

// Coerces one ExcelJS cell value to plain text. Cells aren't always primitives: formulas arrive
// as { result }, styled text as { richText }, links as { hyperlink, text }.
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v.hyperlink) return String(v.hyperlink);
    return '';
  }
  return String(v);
};

// Minimal RFC-4180 CSV reader: handles quoted fields, escaped quotes ("") and embedded
// newlines/commas. ExcelJS only reads CSV through Node streams, so the browser needs this.
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

// Turns a header row + body rows into the { header: value } objects the importers expect
// (missing cells default to '', matching the previous sheet_to_json({ defval: '' }) behaviour).
const toObjects = (headers, bodyRows) => {
  const keys = headers.map((h) => cellText(h).trim());
  return bodyRows
    .filter((cells) => cells.some((c) => cellText(c).trim() !== ''))
    .map((cells) => {
      const obj = {};
      keys.forEach((key, idx) => {
        if (key) obj[key] = cellText(cells[idx]).trim();
      });
      return obj;
    });
};

// Counts DISTINCT non-empty values, not just non-empty cells: a merged cell reads back as its
// value repeated across every column it spans, so the branded title row would otherwise look
// exactly as wide as the header row. A title has one distinct value; a header row has many.
const distinctCount = (cells) => {
  const seen = new Set();
  for (const c of cells) {
    const t = cellText(c).trim();
    if (t) seen.add(t);
  }
  return seen.size;
};

// The header row isn't always row 1. This app's own exports (and its blank template) put a merged
// branded title on rows 1-3 and the real headers on row 4, so a file exported from here has to be
// re-importable. Ties go to the earliest row, which is the header rather than a data row below it.
const findHeaderIndex = (rows) => {
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const count = distinctCount(rows[i]);
    if (count > bestCount) { best = i; bestCount = count; }
  }
  return bestCount >= 2 ? best : 0;
};

const rowsToObjects = (rows) => {
  if (rows.length === 0) return [];
  const h = findHeaderIndex(rows);
  return toObjects(rows[h], rows.slice(h + 1));
};

// Reads the first sheet of an .xlsx (or a .csv) into row objects keyed by header.
// NOTE: legacy .xls (pre-2007 binary) is not supported — resave those as .xlsx or .csv.
export const parseWorkbookFile = async (file) => {
  if (/\.csv$/i.test(file.name)) {
    return rowsToObjects(parseCsv(await file.text()));
  }

  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.worksheets[0];
  if (!ws) return [];

  // ExcelJS row/cell values are 1-indexed with a hole at 0 — slice it off.
  const asCells = (r) => (Array.isArray(r?.values) ? r.values.slice(1) : []);

  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row) => rows.push(asCells(row)));
  return rowsToObjects(rows);
};

const normalizeHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

// Finds the first value in `row` whose (normalized) header matches any alias.
const pickField = (row, aliases) => {
  for (const key of Object.keys(row)) {
    const norm = normalizeHeader(key);
    if (aliases.some((a) => norm === a || norm.includes(a))) {
      return String(row[key]).trim();
    }
  }
  return '';
};

export const PRODUCT_TEMPLATE_HEADERS = ['Barcode', 'Device Name', 'Model / SKU', 'Category', 'Unit Type'];
export const CUSTOMER_TEMPLATE_HEADERS = ['Customer Name', 'Company', 'WhatsApp / Phone', 'Email'];

const VALID_CATEGORIES = ['Laptops', 'Mobile Phones', 'Tablets', 'Audio & Wearables', 'Accessories', 'Gaming', 'Peripherals', 'General'];

// onDuplicate: 'update' overwrites the matched record's fields, 'skip' leaves it untouched.
// Duplicate key for products = barcode (against the catalog AND within the file itself).
// Returns { created, updated, skipped, errors: [{ rowNumber, reason, raw }] }.
export const importProducts = async (rows, { onDuplicate = 'skip' } = {}) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const existing = storageService.getProducts();
  const byBarcode = new Map(existing.map((p) => [String(p.barcode).trim(), p]));
  const seenInFile = new Set();

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing — matches what Excel shows
    const name = pickField(row, ['devicename', 'productname', 'name', 'model']);
    const barcode = pickField(row, ['barcode']);
    const sku = pickField(row, ['sku', 'modelsku', 'modelnumber', 'partnumber']);
    const rawCategory = pickField(row, ['category']);

    if (!name) {
      result.errors.push({ rowNumber, reason: 'Missing product name', raw: row });
      return;
    }
    if (barcode && seenInFile.has(barcode)) {
      result.errors.push({ rowNumber, reason: `Barcode ${barcode} appears more than once in this file`, raw: row });
      return;
    }
    if (barcode) seenInFile.add(barcode);

    const category = VALID_CATEGORIES.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) || 'General';
    const match = barcode ? byBarcode.get(barcode) : null;

    if (match) {
      if (onDuplicate === 'skip') {
        result.skipped += 1;
        return;
      }
      storageService.saveProduct({ ...match, name, sku: sku || match.sku || '', category });
      result.updated += 1;
    } else {
      const saved = storageService.saveProduct({
        name,
        sku,
        barcode: barcode || undefined,
        category,
        unit: pickField(row, ['unittype', 'unit']) || 'Box'
      });
      if (saved) {
        byBarcode.set(String(saved.barcode).trim(), saved);
        result.created += 1;
      } else {
        result.errors.push({ rowNumber, reason: 'Failed to save (local storage full?)', raw: row });
      }
    }
  });

  return result;
};

const normalizePhone = (p) => String(p).replace(/[^0-9]/g, '');

// Duplicate key for customers = normalized mobile digits, falling back to email.
export const importCustomers = async (rows, { onDuplicate = 'skip' } = {}) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const existing = storageService.getCustomers();
  const byPhone = new Map(existing.filter((c) => c.whatsapp).map((c) => [normalizePhone(c.whatsapp), c]));
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
  const seenInFile = new Set();

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const name = pickField(row, ['customername', 'contactname', 'name']);
    const whatsapp = pickField(row, ['whatsapp', 'phone', 'mobile', 'contactnumber']);
    const email = pickField(row, ['email']);
    const company = pickField(row, ['company', 'business']);

    if (!name) {
      result.errors.push({ rowNumber, reason: 'Missing customer name', raw: row });
      return;
    }
    if (!whatsapp) {
      result.errors.push({ rowNumber, reason: 'Missing mobile/WhatsApp number', raw: row });
      return;
    }
    const phoneKey = normalizePhone(whatsapp);
    if (seenInFile.has(phoneKey)) {
      result.errors.push({ rowNumber, reason: `Mobile ${whatsapp} appears more than once in this file`, raw: row });
      return;
    }
    seenInFile.add(phoneKey);

    const match = byPhone.get(phoneKey) || (email ? byEmail.get(email.toLowerCase()) : null);
    if (match) {
      if (onDuplicate === 'skip') {
        result.skipped += 1;
        return;
      }
      storageService.saveCustomer({ ...match, name, company: company || match.company, whatsapp, email: email || match.email });
      result.updated += 1;
    } else {
      const saved = storageService.saveCustomer({ name, company, whatsapp, email });
      if (saved) {
        byPhone.set(phoneKey, saved);
        result.created += 1;
      } else {
        result.errors.push({ rowNumber, reason: 'Failed to save (local storage full?)', raw: row });
      }
    }
  });

  return result;
};

export const buildErrorReportRows = (errors) =>
  errors.map((e) => [e.rowNumber, e.reason, JSON.stringify(e.raw)]);
