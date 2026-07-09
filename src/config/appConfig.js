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
