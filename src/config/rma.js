// RMA (warranty returns) vocabulary, shared by the tracker page, the Excel exporter and the Excel
// importer. Everything the three have to agree on lives here so they cannot drift apart.

// Ordered roughly as a case progresses. `tone` drives the pill colour.
export const RMA_STATUSES = [
  { key: 'received', label: 'Unit received', tone: 'blue' },
  { key: 'diagnosis', label: 'Self-check / diagnosis', tone: 'blue' },
  { key: 'with_supplier', label: 'With supplier', tone: 'amber' },
  { key: 'with_technician', label: 'With technician', tone: 'amber' },
  { key: 'awaiting_approval', label: 'Quote awaiting approval', tone: 'amber' },
  { key: 'on_hold', label: 'On hold', tone: 'amber' },
  { key: 'ready', label: 'Ready for collection', tone: 'cyan' },
  { key: 'delivered', label: 'Delivered to customer', tone: 'emerald' },
  { key: 'credit_note', label: 'Credit note issued', tone: 'emerald' },
  { key: 'closed', label: 'Case closed', tone: 'emerald' },
  { key: 'rejected', label: 'Not repairable / rejected', tone: 'red' }
];

export const RMA_STATUS_KEYS = RMA_STATUSES.map((s) => s.key);
export const DEFAULT_RMA_STATUS = 'received';

// A case still needs someone to do something about it. Drives the nav badge and the default filter.
export const RMA_CLOSED_STATUSES = ['delivered', 'credit_note', 'closed', 'rejected'];
export const isRmaOpen = (rmaCase) => !RMA_CLOSED_STATUSES.includes(rmaCase?.status);

// Generic "find by key, or fall back to something displayable" — every enum below uses this shape.
const findByKey = (list, key, fallbackLabel) => list.find((o) => o.key === key) || { key, label: fallbackLabel ?? key ?? '—' };
const labelOf = (list, key) => findByKey(list, key).label;
const findByLabel = (list, label) => list.find((o) => o.label.toLowerCase() === String(label || '').trim().toLowerCase());

export const rmaStatus = (key) => findByKey(RMA_STATUSES, key);

// Tailwind classes per tone. Hand-rolled to match the rest of the app.
export const RMA_TONE_CLASSES = {
  blue: 'text-[#2563eb] bg-blue-50 border-blue-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  cyan: 'text-cyan-800 bg-cyan-50 border-cyan-300',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  red: 'text-red-700 bg-red-50 border-red-200',
  slate: 'text-slate-600 bg-slate-100 border-slate-200'
};
export const rmaStatusClasses = (key) => RMA_TONE_CLASSES[rmaStatus(key).tone] || RMA_TONE_CLASSES.slate;

export const RMA_CUSTOMER_TYPES = [
  { key: 'export', label: 'Export customer' },
  { key: 'marketplace', label: 'Market place' },
  { key: 'local', label: 'Local market' }
];
export const rmaCustomerTypeLabel = (key) => labelOf(RMA_CUSTOMER_TYPES, key);

export const RMA_WARRANTY_STATUSES = [
  { key: 'in_warranty', label: 'In warranty' },
  { key: 'out_of_warranty', label: 'Out of warranty' },
  { key: 'extended', label: 'Extended warranty' },
  { key: 'unknown', label: 'Unknown' }
];

export const RMA_QUOTE_DECISIONS = [
  { key: 'none', label: 'No quote yet' },
  { key: 'pending', label: 'Awaiting decision' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }
];

export const RMA_RESOLUTION_TYPES = [
  { key: 'none', label: 'Not decided yet' },
  { key: 'repair', label: 'Repair' },
  { key: 'replacement', label: 'Replacement' },
  { key: 'credit_note', label: 'Credit Note' }
];

// --- DATES -----------------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');

export const rmaDisplayDate = (iso) => {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
};

// A whole-day cell read out of Excel arrives as midnight UTC. Re-anchoring it to the same calendar
// day in LOCAL time is what stops a date sliding to the previous day for anyone west of Greenwich.
const anchorWholeDay = (d) => {
  if (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() || d.getUTCMilliseconds()) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Parses DD-MM-YYYY / DD/MM/YYYY (day-first, matching how this business writes dates) into ISO.
// Returns '' when it is not a date we recognise.
export const parseRmaDate = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : anchorWholeDay(value).toISOString();
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : anchorWholeDay(parsed).toISOString();
};

// --- THE FORM ------------------------------------------------------------------------------
// One declaration per field on the RMA case form. `header` is also the Excel column title, so the
// exporter, the blank template, and the importer all read off this one list and can't drift apart.
// `kind` says how to read/write the value; enum kinds carry their own option list.
export const RMA_FORM_FIELDS = [
  { header: 'RMA NO', key: 'rmaNo', kind: 'text' },
  { header: 'RMA STATUS', key: 'status', kind: 'enum', options: RMA_STATUSES },
  { header: 'CUSTOMER NAME', key: 'customerName', kind: 'text' },
  { header: 'CUSTOMER TYPE', key: 'customerType', kind: 'enum', options: RMA_CUSTOMER_TYPES },
  { header: 'CUSTOMER #', key: 'customerPhone', kind: 'text' },
  { header: 'PART #', key: 'productSku', kind: 'text' },
  { header: 'PART DESCRIPTION', key: 'productName', kind: 'text' },
  { header: 'SERIAL #', key: 'serials', kind: 'serials' },
  { header: 'CUSTOMER COMPLAINT', key: 'complaint', kind: 'text' },
  { header: 'PRODUCT CONDITION', key: 'physicalCondition', kind: 'text' },
  { header: 'CE INVOICE #', key: 'saleInvoiceNo', kind: 'text' },
  { header: 'CE INVOICE DATE', key: 'saleDate', kind: 'date' },
  { header: 'SUPPLIER NAME', key: 'supplierName', kind: 'text' },
  { header: 'SUPPLIER INVOICE #', key: 'supplierInvoiceNo', kind: 'text' },
  { header: 'SUPPLIER INVOICE DATE', key: 'supplierInvoiceDate', kind: 'date' },
  { header: 'SERVICE PROVIDER', key: 'serviceProvider', kind: 'text' },
  { header: 'WARRANTY STATUS', key: 'warrantyStatus', kind: 'enum', options: RMA_WARRANTY_STATUSES },
  { header: 'LOCAL TECHNICIAN', key: 'technicianName', kind: 'text' },
  { header: 'TECHNICIAN QUOTE', key: 'technicianQuote', kind: 'text' },
  { header: 'APPROVAL STATUS', key: 'quoteDecision', kind: 'enum', options: RMA_QUOTE_DECISIONS },
  { header: 'APPROVED BY', key: 'quoteDecisionBy', kind: 'text' },
  { header: 'REPAIR / REPLACEMENT / CREDIT NOTE', key: 'resolutionType', kind: 'enum', options: RMA_RESOLUTION_TYPES },
  { header: 'LAPTOP RETURN DETAILS', key: 'handoverDetails', kind: 'text' },
  { header: 'REMARKS', key: 'remarks', kind: 'text' },
  { header: 'PHYSICAL CONDITION PHOTO', key: 'physicalConditionPhotoUrl', kind: 'photo' },
  { header: 'CREDIT NOTE DETAILS', key: 'creditNoteDetails', kind: 'text' },
  { header: 'CREDIT NOTE PHOTO', key: 'creditNotePhotoUrl', kind: 'photo' }
];

export const RMA_FORM_HEADERS = RMA_FORM_FIELDS.map((f) => f.header);

// Columns Excel would otherwise read as a NUMBER and corrupt (dropped leading zeros, rounding past
// ~15 digits) — declared at column level so a value typed into a blank template later stays text.
const RMA_TEXT_KEYS = new Set(['rmaNo', 'customerPhone', 'productSku', 'serials', 'saleInvoiceNo', 'supplierInvoiceNo']);
export const RMA_TEXT_COLUMNS = RMA_FORM_FIELDS.map((f, i) => (RMA_TEXT_KEYS.has(f.key) ? i : -1)).filter((i) => i >= 0);

// A blank case: every field present as an empty value, plus the timeline the "RMA STATUS" stack
// renders from and the sensible default status.
export const blankRmaCase = () =>
  Object.fromEntries([
    ...RMA_FORM_FIELDS.map((f) => [f.key, f.kind === 'serials' ? [] : '']),
    ['status', DEFAULT_RMA_STATUS],
    ['quoteDecision', 'none'],
    ['warrantyStatus', 'unknown'],
    ['resolutionType', 'none'],
    ['timeline', []],
    ['productId', ''],
    ['customerId', ''],
    ['physicalConditionPhotoPath', ''],
    ['creditNotePhotoPath', '']
  ]);

// Export: field value → the text that goes in the Excel cell.
export const rmaFieldToCell = (field, rmaCase) => {
  const v = rmaCase?.[field.key];
  if (field.kind === 'enum') return v ? labelOf(field.options, v) : '';
  if (field.kind === 'date') return v ? rmaDisplayDate(v) : '';
  if (field.kind === 'serials') return (v || []).join(', ');
  return v || '';
};

// Import: one Excel row → the field's value, ready to store. `raw` is the pickField() result for
// this field's own header (exact match wins, matching how every other importer in this app reads a
// column). An enum cell matching one of our own labels resolves to its key (so the dropdown and
// colour-coding work); anything else — a status wording the sheet already used, that isn't one of
// ours — is kept EXACTLY as typed rather than guessed at or coerced. Nothing in the sheet is ever
// silently rewritten.
export const rmaFieldFromRow = (field, raw) => {
  const text = String(raw || '').trim();
  if (!text) return field.kind === 'serials' ? [] : '';
  if (field.kind === 'enum') return findByLabel(field.options, text)?.key || text;
  if (field.kind === 'date') return parseRmaDate(text);
  if (field.kind === 'serials') {
    return [...new Set(text.split(/[\s/,;|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  }
  return text;
};
