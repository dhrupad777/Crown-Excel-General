// Excel/CSV bulk-import parsing and validation for the Product and Customer masters.
// Header matching is tolerant (case/spacing/synonyms) so files exported from this app, the
// client's old sheets, or a blank template all round-trip without manual renaming.

import { storageService } from '../services/storage';
import { normalizeSerial, SERIAL_MIN_LENGTH } from '../config/appConfig';
import { loadExcelJS } from './lazyExcel';

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

  const ExcelJS = await loadExcelJS();
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
export const pickField = (row, aliases) => {
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

export const VALID_CATEGORIES = ['Laptops', 'Mobile Phones', 'Tablets', 'Audio & Wearables', 'Accessories', 'Gaming', 'Peripherals', 'General'];

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

// --- SERIAL IMPORT (Billing Desk: a supplier sheet of product code + serial → bill units) ---

export const SERIAL_IMPORT_TEMPLATE_HEADERS = ['Barcode / SKU', 'Serial Number'];

// Suppliers label the product-code column inconsistently, and this business uses `barcode` and
// `sku` interchangeably (most products carry the manufacturer part number in BOTH, and some — like
// the Acer NH.* codes — carry it in `barcode` with `sku` left empty). So one alias list covers both
// and the matcher below checks both fields.
export const PRODUCT_CODE_ALIASES = ['barcode', 'sku', 'modelsku', 'modelnumber', 'partnumber', 'itemcode', 'productcode'];
export const SERIAL_ALIASES = ['serialnumber', 'serial', 'serialno', 'imei'];

// Exported because `codeOverrides` is keyed by it — the caller MUST normalize the same way or an
// operator's resolution silently fails to apply.
export const normalizeProductCode = (s) => String(s ?? '').trim().toUpperCase();
const normalizeCode = normalizeProductCode;

// Product lookup keyed by BOTH barcode and sku. A code that resolves to more than one distinct
// product is left ambiguous on purpose — one product's barcode really can be another's sku, and
// silently picking the first would attribute units to the wrong device.
const buildCodeIndex = (products) => {
  const index = new Map();
  const add = (code, product) => {
    const key = normalizeCode(code);
    if (!key) return;
    const bucket = index.get(key);
    if (!bucket) { index.set(key, [product]); return; }
    if (!bucket.some((p) => p.id === product.id)) bucket.push(product);
  };
  for (const p of products) {
    add(p.barcode, p);
    add(p.sku, p);
  }
  return index;
};

// Excel stores a bare digit string as a NUMBER, so a serial over ~15 significant digits reads back
// in scientific notation ("1.23457e+21") — importing that would register a corrupted serial.
//
// ANCHORED, and the exponent sign is REQUIRED — do not loosen either. This string only ever comes
// from cellText's String(v) on a JS number, which always emits the sign ("1e+21"), so nothing
// legitimate looks like this. An unanchored /\d[eE][+-]?\d/ matched a digit-E-digit run ANYWHERE
// and blocked 24 real Acer serials in one import ("NHQVUEM00253826(2E9)7600").
//
// Known gap: JS only switches to scientific notation at 1e21, so a 16-21 digit all-numeric serial
// stored as a number is rounded but still renders as plain digits and slips past. Telling that
// apart from a legitimate 16-digit text serial needs the cell's original type, which
// parseWorkbookFile discards; the import template's Text column formatting mitigates it instead.
const isScientificNotation = (s) => /^[+-]?\d+(?:\.\d+)?[eE][+-]\d+$/.test(s);

// Every way a row can fail, split by what the OPERATOR can do about it. This split is the whole
// point: a heuristic must never dead-end an import. Anything we merely *suspect* is a WARNING the
// operator can wave through, anything we can repair is RESOLVABLE in the modal, and only facts we
// are certain of are terminal. (An over-eager suspicion once blocked 24 valid serials with no way
// past it — that must stay impossible by construction, not by the check being right.)
export const PROBLEM_KINDS = {
  // Resolvable — the modal offers a product picker / "create product" per code.
  UNMATCHED_PRODUCT: 'unmatched-product',
  AMBIGUOUS_PRODUCT: 'ambiguous-product',
  // Warnings — heuristics. `acceptWarnings` waves these through as-is.
  SUSPECT_SERIAL: 'suspect-serial',
  SHORT_SERIAL: 'short-serial',
  // Certain, and correctly skipped — re-importing these would be wrong.
  BLANK_SERIAL: 'blank-serial',
  BLANK_CODE: 'blank-code',
  DUPLICATE_IN_FILE: 'duplicate-in-file',
  ON_BILL: 'on-bill'
};

const RESOLVABLE = new Set([PROBLEM_KINDS.UNMATCHED_PRODUCT, PROBLEM_KINDS.AMBIGUOUS_PRODUCT]);
const WARNINGS = new Set([PROBLEM_KINDS.SUSPECT_SERIAL, PROBLEM_KINDS.SHORT_SERIAL]);

export const isResolvable = (kind) => RESOLVABLE.has(kind);
export const isWarning = (kind) => WARNINGS.has(kind);

// Sync, pure pre-flight for a serial import: resolves each row to a catalog product and runs the
// same guards the scanner applies in BillingDesk.commitSerialUnit, minus the two that need the
// network (registry + past invoices) — the modal layers those on top of `ready`.
//
// Re-run it (rather than patching its output) whenever the operator resolves something: a row that
// failed on an unmatched code never reached the duplicate checks, so those must be re-evaluated
// once it becomes eligible. Cheap, and it keeps one source of truth for the rules.
//
// codeOverrides: { [NORMALIZED CODE]: product | 'skip' } — the operator's answer for a code the
//   catalog couldn't resolve on its own.
// acceptWarnings: wave through the heuristic warnings (suspect/short serials) exactly as typed.
//
// Returns { ready: [{ rowNumber, code, serial, raw, product }],
//           problems: [{ rowNumber, code, serial, raw, kind, reason, matches? }] }.
export const planSerialImport = ({
  rows,
  codeColumn,
  serialColumn,
  products,
  existingSerials = [],
  codeOverrides = {},
  acceptWarnings = false
}) => {
  const ready = [];
  const problems = [];
  const skippedByOperator = [];
  const index = buildCodeIndex(products);
  const onBill = new Set(existingSerials.map(normalizeSerial).filter(Boolean));
  const seenInFile = new Map(); // normalized serial → the row number that claimed it first

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 header, +1 for 1-indexing — matches what Excel shows
    const code = String(row[codeColumn] ?? '').trim();
    const raw = String(row[serialColumn] ?? '').trim();
    const serial = normalizeSerial(raw);
    const fail = (kind, reason, extra) =>
      problems.push({ rowNumber, code, serial, raw, kind, reason, ...extra });

    if (!code && !raw) return; // fully blank row — not worth reporting

    if (!raw) { fail(PROBLEM_KINDS.BLANK_SERIAL, 'Serial number is blank'); return; }
    if (!acceptWarnings && isScientificNotation(raw)) {
      fail(PROBLEM_KINDS.SUSPECT_SERIAL,
        `Serial "${raw}" looks like Excel turned it into a number — format the column as Text and re-save, or import it as-is`);
      return;
    }
    if (!acceptWarnings && serial.length < SERIAL_MIN_LENGTH) {
      fail(PROBLEM_KINDS.SHORT_SERIAL,
        `Serial "${raw}" is too short (minimum ${SERIAL_MIN_LENGTH} characters)`);
      return;
    }
    if (!code) { fail(PROBLEM_KINDS.BLANK_CODE, 'Barcode / SKU is blank'); return; }

    const override = codeOverrides[normalizeCode(code)];
    if (override === 'skip') { skippedByOperator.push({ rowNumber, code, serial }); return; }

    const matches = index.get(normalizeCode(code)) || [];
    const product = override || (matches.length === 1 ? matches[0] : null);

    if (!product) {
      if (matches.length === 0) {
        fail(PROBLEM_KINDS.UNMATCHED_PRODUCT, `No product in the catalog matches "${code}"`, { matches: [] });
      } else {
        fail(PROBLEM_KINDS.AMBIGUOUS_PRODUCT,
          `"${code}" matches ${matches.length} products (${matches.map((p) => p.name).join(' | ')}) — pick the right one`,
          { matches });
      }
      return;
    }

    if (onBill.has(serial)) {
      fail(PROBLEM_KINDS.ON_BILL, `Serial ${serial} is already on this bill`);
      return;
    }
    const claimedBy = seenInFile.get(serial);
    if (claimedBy) {
      fail(PROBLEM_KINDS.DUPLICATE_IN_FILE, `Serial ${serial} is a duplicate of row ${claimedBy} in this file`);
      return;
    }

    seenInFile.set(serial, rowNumber);
    ready.push({ rowNumber, code, serial, raw, product });
  });

  return { ready, problems, skippedByOperator };
};

export const buildSerialProblemRows = (problems) =>
  problems.map((p) => [p.rowNumber, p.code, p.raw ?? p.serial, p.reason]);

// How a row got to be importable. Anything other than MATCHED is an operator override, and every
// one of them is written onto the unit's permanent registry record (via the item's `remarks`) and
// into the audit log — so months later it's clear why a serial is filed under a given product.
export const RESOLUTIONS = {
  MATCHED: 'matched',   // the catalog resolved the code on its own
  MAPPED: 'mapped',     // operator pointed the code at an existing product
  CREATED: 'created'    // operator created the product during the import
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Human-readable provenance for one imported unit, stored on the serial's `remarks` field (which
// searchSerials already indexes, so "imported" or a file name finds them later).
export const describeImportedUnit = ({ fileName, code, resolution, productName, warned, operator }) => {
  const parts = [`Imported from "${clip(String(fileName || 'spreadsheet'), 80)}"`];
  if (resolution === RESOLUTIONS.MAPPED) {
    parts.push(`sheet code "${clip(String(code), 40)}" mapped to this product by ${operator || 'operator'}`);
  } else if (resolution === RESOLUTIONS.CREATED) {
    parts.push(`product created during import by ${operator || 'operator'} for sheet code "${clip(String(code), 40)}"`);
  }
  if (warned) parts.push('serial imported despite a format warning');
  void productName;
  return clip(parts.join(' — '), 300);
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
