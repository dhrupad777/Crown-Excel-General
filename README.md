# Crown Excel General — Billing & Serial Number Warranty Registration

React 19 + Vite SPA with Firebase (Google sign-in staff auth + Firestore real-time sync).
Modules: Billing Desk, Invoices Archive, Product/Customer masters (Excel import/export),
**Serial Number Capture & Registry** (barcode-scanned warranty registrations with hard duplicate
prevention), Registrations Dashboard, and an Admin panel (staff allowlist, locations, audit
trail, duplicate-attempt log).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run lint     # oxlint
```

## One-time Firebase setup (project `crown-excel-general`)

Do these in [console.firebase.google.com](https://console.firebase.google.com) **in this order**:

1. **Enable Google sign-in**: Authentication → Sign-in method → Google → Enable (set the
   support email). Without this, the login button fails with "operation not allowed".
2. **Authorized domains**: Authentication → Settings → Authorized domains — `localhost` is
   pre-authorized for dev; add your production hosting domain when you deploy.
3. **First login**: run the app and sign in with a **bootstrap admin** account (see below). This
   auto-creates your `staff/` record (role: admin) and the default "Main Store" location.
4. **Publish security rules — only after step 3 works**: Firestore Database → Rules → paste the
   full contents of [`firestore.rules`](firestore.rules) → Publish.
   ⚠️ Ordering matters: publishing rules before the authenticated app is deployed instantly cuts
   off every unauthenticated client; conversely, until you publish, the database is open — don't
   linger between steps.
5. Add the rest of your staff in-app: **Admin → Staff Access Allowlist** (any Google account,
   Gmail included). Assign roles (`Standard User` = add records only; `Administrator` = edit
   within 24h, manage staff/locations/imports, view audit trail).

## Bootstrap administrators

`dhrupadrajpurohit@gmail.com` and `vishal@crownexcel.ae` can always sign in and self-restore
their own admin record (day-1 setup and lockout recovery). Day-to-day admin rights are managed
in the Admin tab and need no code changes. To change the bootstrap list itself, edit **both**:

- `src/config/appConfig.js` → `BOOTSTRAP_ADMIN_EMAILS`
- `firestore.rules` → `isBootstrapAdmin()` — then republish the rules.

## How duplicate serial prevention works

A registration's Firestore document ID **is** the normalized (uppercase, trimmed) serial number.
Registration runs a server transaction that fails if the doc exists, and the security rules make
the collection create-only (admin edits allowed only within 24 hours; deletes never). So a serial
can never be registered twice — from any terminal, at any location, under any circumstances.
Blocked scans are logged to `duplicateAttempts` and surface on the Dashboard and Admin tabs.
Serial registration therefore requires an internet connection; billing remains offline-first.

## Backups

- Settings → **Export Full Backup (JSON)** — everything, including a read-only copy of the
  serial registry. Restore covers products/customers/invoices (the registry's source of truth is
  Firestore itself and is intentionally not restorable from a file).
- For point-in-time disaster recovery, enable Firestore PITR / scheduled GCS exports in the
  Firebase console (Blaze plan).

## More

- Data model, rules contract, and ERP/POS integration notes: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- Architecture background: [`design.md`](design.md) (predates this module; colors/React version are stale)
