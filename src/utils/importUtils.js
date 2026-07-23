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
    // A failed formula reads back as { error: '#N/A' } (directly, or nested under `result` for a
    // VLOOKUP). Stringifying that yielded the literal "[object Object]", which then imported as
    // real data — treat an errored cell as empty instead.
    if (v.error !== undefined) return '';
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return String(v.text);
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

// Finds the value in `row` whose (normalized) header matches an alias. EXACT matches win over
// substring ones: matching loosely in column order used to grab the wrong column — a sheet with
// "Model" before "Device Name" mapped the SKU into the product name.
const pickField = (row, aliases) => {
  const keys = Object.keys(row);
  for (const key of keys) {
    if (aliases.includes(normalizeHeader(key))) return String(row[key]).trim();
  }
  for (const key of keys) {
    const norm = normalizeHeader(key);
    if (aliases.some((a) => norm.includes(a))) return String(row[key]).trim();
  }
  return '';
};

const REGION_ALIASES = ['region', 'team'];

// Resolves a row's owning region: the row's own Region cell wins, else the importer's default.
// An unrecognised name is rejected rather than silently mis-filed into the wrong team.
const resolveRegion = (row, defaultTeamId, validTeams) => {
  const raw = pickField(row, REGION_ALIASES);
  if (!raw) return { teamId: defaultTeamId || '' };
  const match = validTeams.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (!match) {
    return { error: `Unknown region "${raw}" — expected one of: ${validTeams.join(', ')}` };
  }
  return { teamId: match };
};

export const PRODUCT_TEMPLATE_HEADERS = ['Barcode', 'Device Name', 'Model / SKU', 'Category', 'Unit Type', 'Region'];
export const CUSTOMER_TEMPLATE_HEADERS = ['Company', 'Customer Name', 'WhatsApp / Phone', 'Email', 'Region'];

const VALID_CATEGORIES = ['Laptops', 'Mobile Phones', 'Tablets', 'Audio & Wearables', 'Accessories', 'Gaming', 'Peripherals', 'General'];

// onDuplicate: 'update' overwrites the matched record's fields, 'skip' leaves it untouched.
// Duplicate key for products = barcode (against the catalog AND within the file itself).
// Returns { created, updated, skipped, errors: [{ rowNumber, reason, raw }] }.
export const importProducts = async (rows, { onDuplicate = 'skip', defaultTeamId = '' } = {}) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const existing = storageService.getProducts();
  const byBarcode = new Map(existing.map((p) => [String(p.barcode).trim(), p]));
  const seenInFile = new Set();
  const validTeams = storageService.getTeams();

  // Sequential + awaited on purpose: a row counts as imported only once the CLOUD has accepted it.
  // Counting optimistically is how a 65-row import once reported success while 40 rows were lost.
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing — matches what Excel shows
    const name = pickField(row, ['devicename', 'productname', 'name', 'model']);
    const barcode = pickField(row, ['barcode']);
    const sku = pickField(row, ['sku', 'modelsku', 'modelnumber', 'partnumber']);
    const rawCategory = pickField(row, ['category']);
    const unit = pickField(row, ['unittype', 'unit']) || 'Box';

    if (!name) {
      result.errors.push({ rowNumber, reason: 'Missing product name', raw: row });
      continue;
    }
    if (barcode && seenInFile.has(barcode)) {
      result.errors.push({ rowNumber, reason: `Barcode ${barcode} appears more than once in this file`, raw: row });
      continue;
    }
    const region = resolveRegion(row, defaultTeamId, validTeams);
    if (region.error) {
      result.errors.push({ rowNumber, reason: region.error, raw: row });
      continue;
    }
    if (barcode) seenInFile.add(barcode);

    const category = VALID_CATEGORIES.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) || 'General';
    const match = barcode ? byBarcode.get(barcode) : null;

    try {
      if (match) {
        if (onDuplicate === 'skip') {
          result.skipped += 1;
          continue;
        }
        // teamId is intentionally NOT overwritten on update — a product keeps its owning region.
        await storageService.saveProduct({ ...match, name, sku: sku || match.sku || '', category, unit }, { confirm: true });
        result.updated += 1;
      } else {
        const saved = await storageService.saveProduct({
          name,
          sku,
          barcode: barcode || undefined,
          category,
          unit,
          teamId: region.teamId || undefined
        }, { confirm: true });
        if (saved) {
          byBarcode.set(String(saved.barcode).trim(), saved);
          result.created += 1;
        } else {
          result.errors.push({ rowNumber, reason: 'Failed to save (local storage full?)', raw: row });
        }
      }
    } catch (err) {
      result.errors.push({ rowNumber, reason: `Not saved: ${err.message}`, raw: row });
    }
  }

  return result;
};

const normalizePhone = (p) => String(p).replace(/[^0-9]/g, '');

// Duplicate key for customers = normalized mobile digits, falling back to email, then company.
// COMPANY is the only mandatory field — this mirrors the app's own partner form, which requires
// company alone. (Requiring name+phone here silently rejected perfectly valid company-only rows.)
export const importCustomers = async (rows, { onDuplicate = 'skip', defaultTeamId = '' } = {}) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const existing = storageService.getCustomers();
  const byPhone = new Map(existing.filter((c) => c.whatsapp).map((c) => [normalizePhone(c.whatsapp), c]));
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
  const byCompany = new Map(existing.filter((c) => c.company).map((c) => [c.company.trim().toLowerCase(), c]));
  const seenInFile = new Set();
  const validTeams = storageService.getTeams();

  // Sequential + awaited on purpose — see importProducts. A row is only "created" once the cloud
  // has confirmed it; anything else is reported as an error row rather than counted as a success.
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;
    const name = pickField(row, ['customername', 'contactname', 'name']);
    const whatsapp = pickField(row, ['whatsapp', 'phone', 'mobile', 'contactnumber']);
    const email = pickField(row, ['email']);
    const company = pickField(row, ['company', 'business']);

    if (!company) {
      result.errors.push({ rowNumber, reason: 'Missing company (the only required field)', raw: row });
      continue;
    }
    const region = resolveRegion(row, defaultTeamId, validTeams);
    if (region.error) {
      result.errors.push({ rowNumber, reason: region.error, raw: row });
      continue;
    }

    // Identity key: phone → email → company, so rows without a phone are still de-duplicated
    // instead of being thrown away.
    const phoneKey = whatsapp ? normalizePhone(whatsapp) : '';
    const dupKey = phoneKey || (email ? `e:${email.toLowerCase()}` : `c:${company.trim().toLowerCase()}`);
    if (seenInFile.has(dupKey)) {
      result.errors.push({ rowNumber, reason: `Duplicate of an earlier row in this file (${whatsapp || email || company})`, raw: row });
      continue;
    }
    seenInFile.add(dupKey);

    const match = (phoneKey && byPhone.get(phoneKey))
      || (email && byEmail.get(email.toLowerCase()))
      || byCompany.get(company.trim().toLowerCase())
      || null;

    try {
      if (match) {
        if (onDuplicate === 'skip') {
          result.skipped += 1;
          continue;
        }
        // teamId is intentionally NOT overwritten on update — a partner keeps its owning region.
        await storageService.saveCustomer({
          ...match,
          name: name || match.name,
          company,
          whatsapp: whatsapp || match.whatsapp,
          email: email || match.email
        }, { confirm: true });
        result.updated += 1;
      } else {
        const saved = await storageService.saveCustomer(
          { name, company, whatsapp, email, teamId: region.teamId || undefined },
          { confirm: true }
        );
        if (saved) {
          if (phoneKey) byPhone.set(phoneKey, saved);
          if (email) byEmail.set(email.toLowerCase(), saved);
          byCompany.set(company.trim().toLowerCase(), saved);
          result.created += 1;
        } else {
          result.errors.push({ rowNumber, reason: 'Failed to save (local storage full?)', raw: row });
        }
      }
    } catch (err) {
      result.errors.push({ rowNumber, reason: `Not saved: ${err.message}`, raw: row });
    }
  }

  return result;
};

// How many usable values each column holds. The serial check uses this to pre-select the right
// column: a reconciliation sheet often pairs a full list against a VLOOKUP column that is only
// partly filled, and the fullest column is the one actually worth checking.
export const columnValueCounts = (rows) => {
  const counts = {};
  rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (String(r[k] ?? '').trim()) counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
};

export const buildErrorReportRows = (errors) =>
  errors.map((e) => [e.rowNumber, e.reason, JSON.stringify(e.raw)]);
