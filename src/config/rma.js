// RMA (warranty returns) vocabulary, shared by the tracker page, the Excel exporter and the Excel
// importer. Everything the three have to agree on lives here so they cannot drift apart.

// The client's own status vocabulary, ordered roughly as a case progresses. `tone` drives the pill
// colour. Keys that existed before this list was adopted are kept verbatim (received, with_technician,
// ready, delivered, credit_note, on_hold, closed) so cases already logged under them keep working.
export const RMA_STATUSES = [
  { key: 'received', label: 'RMA Received & Under Review', tone: 'blue' },
  { key: 'awaiting_customer_info', label: 'Awaiting Customer Information', tone: 'amber' },
  { key: 'awaiting_customer_approval', label: 'Awaiting Customer Approval', tone: 'amber' },
  { key: 'awaiting_supplier_approval', label: 'Awaiting Supplier Approval', tone: 'amber' },
  { key: 'awaiting_management_approval', label: 'Awaiting Management Approval', tone: 'amber' },
  { key: 'warranty_rejected', label: 'Warranty Rejected', tone: 'red' },
  { key: 'with_service_centre', label: 'With Service Centre', tone: 'amber' },
  { key: 'with_technician', label: 'With Local Technician', tone: 'amber' },
  { key: 'awaiting_quotation', label: 'Awaiting Quotation From Technician', tone: 'amber' },
  { key: 'quotation_approval_pending', label: 'Quotation Received – Approval Pending', tone: 'amber' },
  { key: 'repair_in_progress', label: 'Repair Approved / In Progress', tone: 'blue' },
  { key: 'awaiting_spares', label: 'Awaiting Spare Parts', tone: 'amber' },
  { key: 'ready', label: 'Ready for Collection', tone: 'cyan' },
  { key: 'ready_to_send', label: 'Ready to Send to Customer', tone: 'cyan' },
  { key: 'delivered', label: 'Sent to Customer', tone: 'emerald' },
  { key: 'replacement_given', label: 'Replacement Given', tone: 'emerald' },
  { key: 'credit_note_pending', label: 'Credit Note Pending', tone: 'amber' },
  { key: 'credit_note_approved', label: 'Credit Note Approved', tone: 'amber' },
  { key: 'credit_note', label: 'Credit Note Issued', tone: 'emerald' },
  { key: 'not_repairable', label: 'Not Possible to Repair', tone: 'red' },
  { key: 'out_of_warranty', label: 'Out of Warranty', tone: 'red' },
  { key: 'no_supplier_warranty', label: 'No Supplier Warranty', tone: 'red' },
  { key: 'not_our_stock', label: 'Not Our Stock', tone: 'red' },
  { key: 'on_hold', label: 'On Hold', tone: 'slate' },
  { key: 'reopened', label: 'Case Reopened', tone: 'blue' },
  { key: 'closed', label: 'Case Closed', tone: 'emerald' }
];

export const RMA_STATUS_KEYS = RMA_STATUSES.map((s) => s.key);
export const DEFAULT_RMA_STATUS = 'received';

// A case still needs someone to do something about it. Drives the nav badge and the default filter.
// Only the four true end-states count as finished: a rejection or an out-of-warranty call still
// leaves a unit on the shelf to hand back, so those stay OPEN until the case is actually closed.
export const RMA_CLOSED_STATUSES = ['delivered', 'replacement_given', 'credit_note', 'closed'];
export const isRmaOpen = (rmaCase) => !RMA_CLOSED_STATUSES.includes(rmaCase?.status);

// Concluded is NOT the same thing as not-open, and the two must not be merged. Handing the unit
// back closes the Open tab; only someone deliberately setting "Case Closed" concludes the case, and
// a concluded case is frozen for good — no further status move, no further log entry, by anyone.
export const isRmaConcluded = (rmaCase) => rmaCase?.status === 'closed';

// Generic "find by key, or fall back to something displayable" — every enum below uses this shape.
const findByKey = (list, key, fallbackLabel) => list.find((o) => o.key === key) || { key, label: fallbackLabel ?? key ?? '—' };
const labelOf = (list, key) => findByKey(list, key).label;
const findByLabel = (list, label) => list.find((o) => o.label.toLowerCase() === String(label || '').trim().toLowerCase());

export const rmaStatus = (key) => findByKey(RMA_STATUSES, key);

// The sentence a status move writes into the case log. It lands in a permanent business record and
// in the exported register sheet, so it is pinned here (and unit-tested) rather than composed at the
// call site. rmaStatus falls back to the raw value, so a status an imported sheet worded its own way
// still reads correctly.
export const rmaStatusChangeText = (fromKey, toKey) =>
  `Status moved from “${rmaStatus(fromKey).label}” to “${rmaStatus(toKey).label}”`;

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
  { key: 'own_stock', label: 'Own Stock' },
  { key: 'amazon', label: 'Market Place (Amazon)' },
  { key: 'noon', label: 'Market Place (Noon)' },
  { key: 'microless', label: 'Market Place (Microless)' },
  { key: 'carrefour', label: 'Market Place (Carrefour)' },
  { key: 'pc_souq', label: 'PC Souq' },
  { key: 'retail_local', label: 'Retail Customer (Local)' },
  { key: 'export', label: 'Export Customer' },
  { key: 'corporate', label: 'Corporate Customer' },
  { key: 'graba2z', label: 'GrabA2Z Customer' }
];
export const rmaCustomerTypeLabel = (key) => labelOf(RMA_CUSTOMER_TYPES, key);

export const RMA_WARRANTY_STATUSES = [
  { key: 'in_warranty', label: 'In Warranty' },
  { key: 'out_of_warranty', label: 'Out Of Warranty' },
  { key: 'cegtllc', label: 'CEGTLLC Warranty' },
  { key: 'us_warranty', label: 'US Warranty' },
  { key: 'no_warranty', label: 'No Warranty' }
];

// Who the warranty is claimed through — a channel, not a company, so each one asks for the actual
// supplier's name alongside (warrantyFromSupplier).
export const RMA_WARRANTY_SOURCES = [
  { key: 'local_supplier', label: 'Local Supplier' },
  { key: 'local_distributor', label: 'Local Distributor' },
  { key: 'us_supplier', label: 'US Supplier' },
  { key: 'other', label: 'Other' }
];

// The named-distributor list this field used to be. Retired from the form, but kept so a case saved
// under one still exports as "Redington Gulf" rather than a raw key, and so a sheet exported before
// the change still imports back to the same value. No key or label here collides with the four
// above, which is what keeps findByLabel unambiguous on import.
export const RMA_WARRANTY_SOURCES_LEGACY = [
  { key: 'local_market', label: 'Local Market' },
  { key: 'cegtllc', label: 'CEGTLLC' },
  { key: 'devin_tech', label: 'Devin Tech' },
  { key: 'global_horizon', label: 'Global Horizon' },
  { key: 'gmt_technology', label: 'GMT Technology' },
  { key: 'levant_distribution', label: 'Levant Distribution' },
  { key: 'redington_gulf', label: 'Redington Gulf' },
  { key: 'fdc', label: 'FDC' },
  { key: 'hyperdist', label: 'Hyperdist' },
  { key: 'empa', label: 'Empa' },
  { key: 'metra', label: 'Metra' },
  { key: 'techbey', label: 'Techbey' }
];
export const RMA_WARRANTY_SOURCES_ALL = [...RMA_WARRANTY_SOURCES, ...RMA_WARRANTY_SOURCES_LEGACY];

// The options the form's picker shows: the four current ones, plus — only when the case already
// holds something else — a one-off entry for whatever it holds, so a retired value (or a status
// wording an imported sheet used) still reads correctly instead of showing blank. Display-only:
// every field of an existing case is read-only, so a legacy value can never be chosen into a case.
export const rmaWarrantySourceOptions = (currentValue) =>
  !currentValue || RMA_WARRANTY_SOURCES.some((o) => o.key === currentValue)
    ? RMA_WARRANTY_SOURCES
    : [...RMA_WARRANTY_SOURCES, findByKey(RMA_WARRANTY_SOURCES_ALL, currentValue)];

// Ticked on receipt — any number can apply. Anything these don't cover goes in the free-text
// physicalCondition field alongside.
export const RMA_CONDITION_CHECKS = [
  { key: 'open_screws', label: 'Open Screws' },
  { key: 'minor_scratches', label: 'Minor Scratches' },
  { key: 'major_scratches', label: 'Major Scratches' },
  { key: 'body_damage', label: 'Body Damage / Dent' },
  { key: 'display_damage', label: 'Display Issue / Damage' },
  { key: 'missing_accessories', label: 'Missing Accessories' },
  { key: 'missing_parts', label: 'Missing Parts' },
  { key: 'only_laptop_received', label: 'Only Laptop Received' },
  { key: 'full_box_received', label: 'Full Box Received' },
  { key: 'only_laptop', label: 'Only Laptop' }
];

export const RMA_QUOTE_DECISIONS = [
  { key: 'none', label: 'No quote yet' },
  { key: 'pending', label: 'Awaiting decision' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }
];

export const RMA_REPAIR_METHODS = [
  { key: 'self_check', label: 'Self-check' },
  { key: 'service_center', label: 'Service Center' },
  { key: 'local_technician', label: 'Local Technician' }
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

// Same, plus the time of day. The client's own reference sheet only ever recorded a date for each
// status update; our timeline carries the precise moment an entry was logged, so the export can be
// more exact than the sheet it replaces.
export const rmaDisplayDateTime = (iso) => {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${rmaDisplayDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
  { header: 'CONDITION CHECKLIST', key: 'conditionTags', kind: 'tags', options: RMA_CONDITION_CHECKS },
  { header: 'PRODUCT CONDITION', key: 'physicalCondition', kind: 'text' },
  { header: 'CE INVOICE #', key: 'saleInvoiceNo', kind: 'text' },
  { header: 'CE INVOICE DATE', key: 'saleDate', kind: 'date' },
  { header: 'SUPPLIER NAME', key: 'supplierName', kind: 'text' },
  { header: 'SUPPLIER INVOICE #', key: 'supplierInvoiceNo', kind: 'text' },
  { header: 'SUPPLIER INVOICE DATE', key: 'supplierInvoiceDate', kind: 'date' },
  { header: 'SERVICE PROVIDER', key: 'serviceProvider', kind: 'text' },
  { header: 'WARRANTY STATUS', key: 'warrantyStatus', kind: 'enum', options: RMA_WARRANTY_STATUSES },
  // _ALL, not the four current ones: a case saved under a retired option still has to export as its
  // own label and import back to the same key.
  { header: 'WARRANTY FROM', key: 'warrantyFrom', kind: 'enum', options: RMA_WARRANTY_SOURCES_ALL },
  { header: 'WARRANTY FROM SUPPLIER', key: 'warrantyFromSupplier', kind: 'text' },
  { header: 'REPAIR METHOD', key: 'repairMethod', kind: 'enum', options: RMA_REPAIR_METHODS },
  { header: 'SELF-CHECK BY', key: 'selfCheckBy', kind: 'text' },
  { header: 'SERVICE CENTER TICKET #', key: 'serviceCenterTicketNo', kind: 'text' },
  { header: 'LOCAL TECHNICIAN', key: 'technicianName', kind: 'text' },
  { header: 'TECHNICIAN QUOTE', key: 'technicianQuote', kind: 'text' },
  { header: 'APPROVAL STATUS', key: 'quoteDecision', kind: 'enum', options: RMA_QUOTE_DECISIONS },
  { header: 'APPROVED BY', key: 'quoteDecisionBy', kind: 'text' },
  { header: 'REPAIR / REPLACEMENT / CREDIT NOTE', key: 'resolutionType', kind: 'enum', options: RMA_RESOLUTION_TYPES },
  { header: 'LAPTOP RETURN DETAILS', key: 'handoverDetails', kind: 'text' },
  { header: 'REMARKS', key: 'remarks', kind: 'text' },
  { header: 'REPLACEMENT SERIAL #', key: 'replacementSerial', kind: 'text' },
  { header: 'REPLACEMENT MODEL', key: 'replacementModel', kind: 'text' },
  { header: 'REPLACEMENT DATE', key: 'replacementDate', kind: 'date' },
  { header: 'CREDIT AMOUNT', key: 'creditAmount', kind: 'text' },
  { header: 'PHYSICAL CONDITION PHOTO', key: 'physicalConditionPhotoUrl', kind: 'photo' },
  { header: 'CREDIT NOTE DETAILS', key: 'creditNoteDetails', kind: 'text' },
  { header: 'CREDIT NOTE PHOTO', key: 'creditNotePhotoUrl', kind: 'photo' }
];

export const RMA_FORM_HEADERS = RMA_FORM_FIELDS.map((f) => f.header);

// Columns Excel would otherwise read as a NUMBER and corrupt (dropped leading zeros, rounding past
// ~15 digits) — declared at column level so a value typed into a blank template later stays text.
const RMA_TEXT_KEYS = new Set([
  'rmaNo', 'customerPhone', 'productSku', 'serials', 'saleInvoiceNo', 'supplierInvoiceNo',
  'serviceCenterTicketNo', 'replacementSerial'
]);
export const RMA_TEXT_COLUMNS = RMA_FORM_FIELDS.map((f, i) => (RMA_TEXT_KEYS.has(f.key) ? i : -1)).filter((i) => i >= 0);

// A blank case: every field present as an empty value, plus the timeline the "RMA STATUS" stack
// renders from and the sensible default status.
export const blankRmaCase = () =>
  Object.fromEntries([
    ...RMA_FORM_FIELDS.map((f) => [f.key, f.kind === 'serials' || f.kind === 'tags' ? [] : '']),
    ['status', DEFAULT_RMA_STATUS],
    ['quoteDecision', 'none'],
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
  if (field.kind === 'tags') return (v || []).map((k) => labelOf(field.options, k)).join(', ');
  return v || '';
};

// The client's reference sheet packed a case's whole history into ONE cell: the current status,
// then every dated update stacked underneath it. This rebuilds that exact shape for the STATUS
// column specifically (every other column keeps its plain value via rmaFieldToCell) — each line
// now carries a time as well as a date, since the timeline records the precise moment, not just
// the day. Deliberately export-only: it is not meant to be parsed back in (see rmaFieldFromRow),
// the same way the original sheet was a business record, not a re-importable data file.
export const rmaStatusStack = (rmaCase) => {
  const current = rmaStatus(rmaCase?.status).label;
  const entries = [...(rmaCase?.timeline || [])]
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    .map((e) => `${rmaDisplayDateTime(e.date)} - ${e.text}`);
  return [current, '', ...entries].join('\n');
};

// Import: one Excel row → the field's value, ready to store. `raw` is the pickField() result for
// this field's own header (exact match wins, matching how every other importer in this app reads a
// column). An enum cell matching one of our own labels resolves to its key (so the dropdown and
// colour-coding work); anything else — a status wording the sheet already used, that isn't one of
// ours — is kept EXACTLY as typed rather than guessed at or coerced. Nothing in the sheet is ever
// silently rewritten.
export const rmaFieldFromRow = (field, raw) => {
  const text = String(raw || '').trim();
  if (!text) return field.kind === 'serials' || field.kind === 'tags' ? [] : '';
  if (field.kind === 'enum') return findByLabel(field.options, text)?.key || text;
  if (field.kind === 'tags') {
    // Same rule as an enum, per item: a known label becomes its key, anything else is kept as typed.
    const items = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    return [...new Set(items.map((s) => findByLabel(field.options, s)?.key || s))];
  }
  if (field.kind === 'date') return parseRmaDate(text);
  if (field.kind === 'serials') {
    return [...new Set(text.split(/[\s/,;|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  }
  return text;
};
