// RMA (warranty returns) vocabulary, shared by the tracker page, the Excel exporter and the Excel
// importer. Everything the three have to agree on lives here so they cannot drift apart.
//
// Modelled directly on the client's existing sheet (27 columns, one row per case). Two things the
// sheet could not express are made explicit here:
//
//  1. STATUS. The sheet's "STATUS" column is a dated free-text log; the actual state was encoded in
//     the cell's FILL COLOUR — green = case closed, cyan = ready for collection, orange = anything
//     in progress. That is invisible to search, sort and export, so it becomes a real enum.
//  2. THE LOG. The sheet keeps two parallel dated logs (STATUS and REMARK / ACTION) that were ~80%
//     duplicates and had already drifted. Here there is ONE timeline, and an entry is marked
//     `internal` instead of being retyped into a second column.

// Ordered roughly as a case progresses. `tone` drives the pill colour; the three tones the sheet
// actually used (emerald/cyan/amber) are preserved so the page reads the same at a glance.
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

// A case still needs someone to do something about it. Drives the nav badge and the default filter —
// the sheet is, in practice, a to-do list.
export const RMA_CLOSED_STATUSES = ['delivered', 'credit_note', 'closed', 'rejected'];

export const isRmaOpen = (rmaCase) => !RMA_CLOSED_STATUSES.includes(rmaCase?.status);

export const rmaStatus = (key) =>
  RMA_STATUSES.find((s) => s.key === key) || { key, label: key || '—', tone: 'slate' };

// Tailwind classes per tone. Hand-rolled pill styling to match the rest of the app (the .badge CSS
// class exists but is effectively unused everywhere else).
export const RMA_TONE_CLASSES = {
  blue: 'text-[#2563eb] bg-blue-50 border-blue-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  cyan: 'text-cyan-800 bg-cyan-50 border-cyan-300',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  red: 'text-red-700 bg-red-50 border-red-200',
  slate: 'text-slate-600 bg-slate-100 border-slate-200'
};

export const rmaStatusClasses = (key) => RMA_TONE_CLASSES[rmaStatus(key).tone] || RMA_TONE_CLASSES.slate;

// Column G of the sheet: "EXPORT CUSTOMER" / "MARKET PLACE" / "LOCAL MARKET".
export const RMA_CUSTOMER_TYPES = [
  { key: 'export', label: 'Export customer' },
  { key: 'marketplace', label: 'Market place' },
  { key: 'local', label: 'Local market' }
];

export const RMA_CUSTOMER_TYPE_KEYS = RMA_CUSTOMER_TYPES.map((t) => t.key);

export const rmaCustomerTypeLabel = (key) =>
  RMA_CUSTOMER_TYPES.find((t) => t.key === key)?.label || '';

// Column S, owned by Management on the client's sheet.
export const RMA_QUOTE_DECISIONS = [
  { key: 'none', label: 'No quote yet' },
  { key: 'pending', label: 'Awaiting decision' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }
];

export const RMA_QUOTE_DECISION_KEYS = RMA_QUOTE_DECISIONS.map((d) => d.key);

// Row 1 of the sheet assigns every column an owner. Kept as field-group labels so the people who
// fill this in still recognise their own section.
export const RMA_OWNERS = {
  coordinator: 'RMA Coordinator',
  accounts: 'Accounts',
  management: 'Management'
};

// --- DATES -----------------------------------------------------------------------------------
// The sheet writes dates as DD-MM-YYYY and log lines as DD/MM/YYYY. Both are rendered and parsed
// here rather than with toLocaleDateString, which changes shape with the browser's locale.
const pad2 = (n) => String(n).padStart(2, '0');

export const rmaDisplayDate = (iso) => {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
};

// A whole-day cell read out of Excel arrives as midnight UTC. Re-anchoring it to the same calendar
// day in LOCAL time is what stops a case sliding to the previous day for anyone west of Greenwich —
// the rest of the app formats dates with local getters, so a bare UTC midnight would render as the
// day before. A value carrying a real time of day is left exactly as it is.
const anchorWholeDay = (d) => {
  if (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() || d.getUTCMilliseconds()) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Parses the sheet's own date shapes into an ISO string. Day-first is assumed on purpose: every
// date in the source file is DD-MM-YYYY or DD/MM/YYYY, and guessing month-first would silently
// move a case by up to eleven months. Returns '' when it is not a date we recognise.
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

// --- THE 27-COLUMN SHEET ----------------------------------------------------------------------
// Header text is reproduced EXACTLY as the client's file has it, typo included ("CUSOTMER NAME"),
// so an export drops straight into their existing workflow and a re-import of our own export finds
// the same columns. `aliases` are normalized (lowercase, alphanumerics only) for the importer.
//
// `cell` builds the export value. Several columns are not 1:1 with one field — the sheet packs a
// type and an order id into one cell, an amount and a currency into another — so the packing and
// unpacking live side by side here rather than in the exporter.
const joinLines = (...parts) => parts.map((p) => String(p ?? '').trim()).filter(Boolean).join('\n');

export const RMA_SHEET_COLUMNS = [
  {
    header: 'RMA-NO', width: 20, text: true, aliases: ['rmano', 'rmanumber', 'rma'],
    cell: (c) => c.rmaNo || ''
  },
  {
    header: 'DATE', width: 14, aliases: ['date', 'receiveddate', 'datereceived'],
    cell: (c) => rmaDisplayDate(c.receivedDate)
  },
  {
    header: 'CUSOTMER NAME', width: 26, aliases: ['cusotmername', 'accountname'],
    cell: (c) => c.accountName || ''
  },
  {
    header: 'STATUS', width: 46, aliases: ['status'],
    cell: (c) => joinLines(rmaStatus(c.status).label.toUpperCase(), timelineToCell(c, false))
  },
  {
    header: 'SUPPLIER', width: 26, aliases: ['supplier'],
    cell: (c) => c.purchaseSupplier || ''
  },
  {
    header: 'REMARK / ACTION', width: 46, aliases: ['remarkaction', 'remark', 'action'],
    cell: (c) => timelineToCell(c, true)
  },
  {
    header: 'Customer Type / Order ID', width: 22, aliases: ['customertypeorderid', 'customertype'],
    cell: (c) => joinLines(rmaCustomerTypeLabel(c.customerType).toUpperCase(), c.orderId)
  },
  {
    header: 'Product', width: 44, aliases: ['product', 'productname'],
    cell: (c) => joinLines(c.productSku, c.productName)
  },
  {
    header: 'Physical Condition Of The Product', width: 34,
    aliases: ['physicalconditionoftheproduct', 'physicalcondition'],
    cell: (c) => c.physicalCondition || ''
  },
  {
    header: 'Customer Complaint', width: 34, aliases: ['customercomplaint', 'complaint'],
    cell: (c) => c.complaint || ''
  },
  {
    header: 'Partner / Customer / Market Place Name', width: 28,
    aliases: ['partnercustomermarketplacename', 'partnername', 'partner'],
    cell: (c) => joinLines(c.partnerName, c.orderId ? `ORDER ID - ${c.orderId}` : '')
  },
  {
    header: 'Customer Name', width: 22, aliases: ['customername', 'endcustomername'],
    cell: (c) => c.endCustomerName || ''
  },
  {
    header: 'Customer Number', width: 18, text: true,
    aliases: ['customernumber', 'customerphone', 'phone'],
    cell: (c) => c.customerPhone || ''
  },
  {
    header: 'Serial Number', width: 26, text: true, aliases: ['serialnumber', 'serial', 'serials'],
    cell: (c) => (c.serials || []).join('\n')
  },
  {
    header: 'CEGTLLC Invoice - Num & Date', width: 26,
    aliases: ['cegtllcinvoicenumdate', 'saleinvoiceno', 'invoicenumdate'],
    cell: (c) => joinLines(
      c.saleInvoiceNo ? `INVOICE NO - ${c.saleInvoiceNo}` : '',
      c.saleDate ? `DATED - ${rmaDisplayDate(c.saleDate)}` : ''
    )
  },
  {
    header: 'Warranty From', width: 22, aliases: ['warrantyfrom'],
    cell: (c) => c.warrantyFrom || ''
  },
  {
    header: 'Local Technician', width: 20, aliases: ['localtechnician', 'technician'],
    cell: (c) => c.technicianName || ''
  },
  {
    header: 'Quote From Local Technician', width: 20,
    aliases: ['quotefromlocaltechnician', 'quote', 'quoteamount'],
    cell: (c) => (c.quoteAmount ? `${c.quoteAmount}/${c.quoteCurrency || 'AED'}` : '')
  },
  {
    header: 'Quote - Approved / Rejected', width: 24,
    aliases: ['quoteapprovedrejected', 'quotedecision'],
    cell: (c) => joinLines(
      c.quoteDecision && c.quoteDecision !== 'none'
        ? RMA_QUOTE_DECISIONS.find((d) => d.key === c.quoteDecision)?.label || ''
        : '',
      c.quoteDecisionBy
    )
  },
  {
    header: 'Supplier Name', width: 26, aliases: ['suppliername', 'claimsupplier'],
    cell: (c) => c.claimSupplier || ''
  },
  {
    header: 'Supplier - Inv Num & Date', width: 26,
    aliases: ['supplierinvnumdate', 'supplierinvoiceno'],
    cell: (c) => joinLines(
      c.supplierInvoiceNo ? `INV NO - ${c.supplierInvoiceNo}` : '',
      c.supplierInvoiceDate ? `DATED - ${rmaDisplayDate(c.supplierInvoiceDate)}` : ''
    )
  },
  {
    header: 'Replacement Serial Num', width: 24, text: true,
    aliases: ['replacementserialnum', 'replacementserial'],
    cell: (c) => c.replacementSerial || ''
  },
  {
    header: 'Laptop Given To Customer Details', width: 30,
    aliases: ['laptopgiventocustomerdetails', 'handoverdetails'],
    cell: (c) => c.handoverDetails || ''
  },
  {
    header: 'Customer Feedback', width: 26, aliases: ['customerfeedback'],
    cell: (c) => c.customerFeedback || ''
  },
  {
    header: 'Credit Note Details', width: 26, aliases: ['creditnotedetails', 'creditnote'],
    cell: (c) => c.creditNote || ''
  },
  {
    header: 'Laptop Not Possible To Fix', width: 22,
    aliases: ['laptopnotpossibletofix', 'unrepairable'],
    cell: (c) => (c.unrepairable ? 'YES' : '')
  },
  {
    header: 'Document Filing', width: 18, aliases: ['documentfiling', 'documentsfiled'],
    cell: (c) => (c.documentsFiled ? 'FILED' : '')
  }
];

export const RMA_SHEET_HEADERS = RMA_SHEET_COLUMNS.map((c) => c.header);

// 0-based indexes of columns Excel would otherwise read as numbers and corrupt — serials and phone
// numbers lose leading zeros and round past ~15 digits. See excelWriter's textColumns.
export const RMA_TEXT_COLUMNS = RMA_SHEET_COLUMNS
  .map((c, i) => (c.text ? i : -1))
  .filter((i) => i >= 0);

export const RMA_SHEET_WIDTHS = RMA_SHEET_COLUMNS.map((c) => c.width);

// Renders the timeline back into the sheet's "DD/MM/YYYY - text" log format, oldest first, so an
// export is readable by someone who only ever knew the spreadsheet.
export function timelineToCell(rmaCase, internal) {
  return [...(rmaCase?.timeline || [])]
    .filter((e) => Boolean(e.internal) === internal)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    .map((e) => `${rmaDisplayDate(e.date).replace(/-/g, '/')} - ${e.text}`)
    .join('\n');
}

export const rmaToSheetRow = (rmaCase) => RMA_SHEET_COLUMNS.map((c) => c.cell(rmaCase));

// Splits a sheet log cell into individual dated entries. The client's lines all start
// "DD/MM/YYYY - "; anything before the first date (or a cell with no dates at all) is kept as one
// undated entry rather than thrown away.
export const parseRmaLogCell = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const marker = /(^|\n)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s*[-–—:]\s*/g;
  const entries = [];
  let match;
  let lastEnd = 0;
  let lastDate = '';

  while ((match = marker.exec(raw)) !== null) {
    const text_ = raw.slice(lastEnd, match.index).trim();
    if (text_) entries.push({ date: lastDate, text: text_ });
    lastDate = parseRmaDate(match[2]);
    lastEnd = marker.lastIndex;
  }
  const tail = raw.slice(lastEnd).trim();
  if (tail) entries.push({ date: lastDate, text: tail });

  return entries;
};
