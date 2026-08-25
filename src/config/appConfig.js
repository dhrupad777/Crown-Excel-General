// Central configuration for the Serial Number Capture & Warranty Registration module.

// Day-1 / lockout-recovery administrators. These accounts can always self-provision their own
// admin staff record on first login, even when the staff collection is empty or their record was
// accidentally deactivated. Day-to-day admin rights are managed in-app (Admin tab → Staff);
// this list is only the bootstrap/recovery path.
// KEEP IN SYNC with isBootstrapAdmin() in firestore.rules — the rules are the server-side twin.
export const BOOTSTRAP_ADMIN_EMAILS = [
  'dhrupadrajpurohit@gmail.com',
  'vishal@crownexcel.ae',
  'vishalcrownexcel@gmail.com',
  'qaistime@gmail.com',
];

// Serial numbers are stored with the normalized form as the Firestore document ID, which is what
// makes duplicates physically impossible server-side. Every read AND write must normalize the
// same way or the uniqueness guarantee silently breaks.
export const normalizeSerial = (s) => String(s || '').trim().toUpperCase();

export const SERIAL_MIN_LENGTH = 3;

// Admins may correct a registration only this long after entry; enforced authoritatively by
// firestore.rules (duration.value(24, 'h')) — this constant only drives the UI affordance.
export const EDIT_WINDOW_HOURS = 24;

export const DEFAULT_LOCATION = {
  id: 'loc-main',
  name: 'Main Store',
  code: 'MAIN',
  active: true,
};

// App Check (invisible reCAPTCHA v3) site key. Leave empty to keep App Check OFF (the app runs
// exactly as before). To turn on anti-abuse protection: create a reCAPTCHA v3 key + register the
// app for App Check in the Firebase console, paste the SITE key here, deploy, verify tokens are
// flowing (App Check metrics), and only THEN switch enforcement on. See docs/SECURITY.md.
export const APP_CHECK_SITE_KEY = '';

// Soft-deleted (archived) records are kept this many days so nothing is ever lost by accident;
// after that an admin session purges them permanently. Restorable any time before then.
export const DELETION_RETENTION_DAYS = 90;

// --- PER-STAFF DATA PERMISSIONS ------------------------------------------------------------
// What a staff member can SEE and what they can take OUT. Granted per person by an admin
// (Admin → Data Access); absent means false, so a new account can bill, continue drafts, scan
// serials and manage products — and sees nothing else.
//
// Each category has a VIEW key (shows the tab at all) and a DOWNLOAD key (the export buttons on
// it). Analytics is a view with nothing to download, so its download key is null.
//
// NEVER gated, whatever is set here: Billing Desk, Drafts, Products & IMEIs, Serial Capture, and
// PRINTING an invoice — a sale must always be able to produce its paper, which is why the Billing
// Desk prints for itself rather than sending the operator to the Archive. Admins hold everything.
//
// Scope note: this is a UI control plus an audit trail, not a hard boundary. A staff device already
// syncs its whole team's data because billing needs it, so hiding a tab does not erase the local
// copy. What IS server-enforced is that only an admin can change these (firestore.rules restricts
// staff writes to admins), so nobody can grant themselves access — and every export is written to
// the audit log, so misuse is detectable.
//
// Backups are deliberately absent: they stay admin-only, because one bundle holds every region.
export const DATA_CATEGORIES = [
  {
    key: 'invoices',
    label: 'Invoices',
    tab: 'invoices',
    view: 'invoicesView',
    download: 'invoicesExport',
    viewHint: 'See the Invoices Archive',
    downloadHint: 'Download the archive as Excel or CSV'
  },
  {
    key: 'serials',
    label: 'Serials',
    tab: 'registry',
    view: 'serialsView',
    download: 'serialsExport',
    viewHint: 'See the Serial Registry',
    downloadHint: 'Download the registry, and use the Serial Check tool'
  },
  {
    key: 'partners',
    label: 'Partners',
    tab: 'customers',
    view: 'partnersView',
    download: 'partnersExport',
    viewHint: 'See the Customers CRM',
    downloadHint: 'Download the partner list'
  },
  {
    key: 'analytics',
    label: 'Analytics',
    tab: 'dashboard',
    view: 'analytics',
    download: null,
    viewHint: 'See the Registrations Dashboard'
  }
];

export const DATA_PERMISSION_KEYS = DATA_CATEGORIES.flatMap((c) =>
  [c.view, c.download].filter(Boolean)
);

// Which permission key, if any, controls a given tab id. Used by the navbar and the route guards
// so the gating can never drift from the declarations above.
export const tabPermission = (tabId) =>
  DATA_CATEGORIES.find((c) => c.tab === tabId)?.view || null;

// Normalizes whatever is on a staff doc into a full boolean map. Two jobs:
//
//  1. A doc written before this feature (or before View existed) is missing keys — those must read
//     as "not granted", never as undefined.
//  2. INVARIANT — download implies view. A download grant with its view switched off is a state
//     that cannot mean anything: the buttons live on a tab the person cannot open. Collapsing it
//     here, on every read AND every write, is what keeps the stored data coherent and lets
//     storageService.can() stay a dumb lookup.
export const normalizePermissions = (permissions) => {
  const out = Object.fromEntries(DATA_PERMISSION_KEYS.map((k) => [k, permissions?.[k] === true]));
  for (const c of DATA_CATEGORIES) {
    if (c.download && !out[c.view]) out[c.download] = false;
  }
  return out;
};
