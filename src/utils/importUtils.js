// Excel/CSV bulk-import parsing and validation for the Product and Customer masters.
// Header matching is tolerant (case/spacing/synonyms) so files exported from this app, the
// client's old sheets, or a blank template all round-trip without manual renaming.

import * as XLSX from 'xlsx';
import { storageService } from '../services/storage';

export const parseWorkbookFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
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
