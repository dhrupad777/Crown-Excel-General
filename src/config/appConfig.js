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
// What a staff member may take OUT of the system. Granted per person by an admin (Admin → Data
// Access); absent means false, so a new account starts able to bill and nothing else.
//
// These gate downloads and analytics ONLY. Every record stays readable in the UI — an operator
// still has to look up a past bill or a serial mid-sale, and adding friction there was explicitly
// ruled out. Creating invoices, continuing drafts, scanning serials and PRINTING an invoice are
// never gated. Admins hold every permission implicitly.
//
// Scope note: this is a UI control plus an audit trail, not a hard boundary. A staff device already
// syncs its whole team's data because billing needs it, so hiding a button does not erase the local
// copy. What IS server-enforced is that only an admin can change these (firestore.rules restricts
// staff writes to admins), so nobody can grant themselves access — and every export is written to
// the audit log, so misuse is detectable.
//
// Backups are deliberately absent: they stay admin-only, because one bundle holds every region.
export const DATA_PERMISSIONS = [
  {
    key: 'invoicesExport',
    label: 'Invoices',
    hint: 'Download the Invoices Archive as Excel or CSV'
  },
  {
    key: 'serialsExport',
    label: 'Serials',
    hint: 'Download the Serial Registry, and use the Serial Check tool'
  },
  {
    key: 'partnersExport',
    label: 'Partners',
    hint: 'Download the Customers CRM list'
  },
  {
    key: 'analytics',
    label: 'Analytics',
    hint: 'See the Registrations Dashboard'
  }
];

export const DATA_PERMISSION_KEYS = DATA_PERMISSIONS.map((p) => p.key);

// Normalizes whatever is on a staff doc into a full boolean map — a doc written before this feature
// existed has no `permissions` field at all, and must read as "nothing granted".
export const normalizePermissions = (permissions) =>
  Object.fromEntries(DATA_PERMISSION_KEYS.map((k) => [k, permissions?.[k] === true]));
