# Crown Excel General — Data Model & Integration Reference

Firestore project: **`crown-excel-general`**. All dates in app documents are ISO-8601 strings
(`date` fields); `createdAt`/`updatedAt`/`addedAt` are Firestore server Timestamps used only by
the security rules (24-hour edit window, append-only enforcement).

## Collections

### `serials/{SERIAL}` — warranty registrations (the core registry)

**Document ID = the serial number, normalized: `serial.trim().toUpperCase()`.** This is the
duplicate-prevention mechanism — Firestore cannot hold two docs with one ID, and the security
rules make the collection create-only (see Rules contract). Every reader and writer MUST apply
the same normalization (`normalizeSerial` in `src/config/appConfig.js`).

```jsonc
{
  "serial": "C02G9012MD6R",          // equals the doc ID (rules-enforced)
  "serialRaw": "c02g9012md6r",        // as scanned, before normalization
  "productId": "prod-101",
  "productName": "MacBook Pro 16-inch M3 Max…",
  "sku": "MK1A3HN/A",                 // model / part number (optional)
  "category": "Laptops",
  "barcode": "8801001",
  "customer": { "id": "cust-1", "name": "…", "whatsapp": "…", "email": "…" }, // snapshot
  "invoiceNo": "INV-10021",           // free text; may reference an external system
  "locationId": "loc-main",
  "locationName": "Main Store",
  "registeredByName": "Nitesh B",
  "remarks": "",
  "source": "capture",                // "capture" (Serial Capture page) | "billing" (auto)
  "batchId": "batch-1719…",           // groups one capture session / one invoice
  "date": "2026-07-07T09:30:00.000Z", // ISO string — all UI filtering/sorting uses this
  "createdAt": "<serverTimestamp>",   // rules: 24h admin edit window anchor
  "createdBy": "staff@gmail.com",     // lowercase; rules-verified == caller
  "updatedAt": "<serverTimestamp>",   // present only after an admin edit
  "updatedBy": "admin@gmail.com"
}
```

### `staff/{email}` — sign-in allowlist. **Doc ID = lowercase email.**
`{ email, displayName, role: "admin"|"standard", locationId, active: bool, addedBy, addedAt }`

### `locations/{locId}` — stores/warehouses (`loc-main` seeded on first admin login).
`{ name, code, address?, active: bool }` — deactivate, never delete.

### `auditLog/{ts-rand}` — append-only action log (admin-readable).
`{ action, entity, entityId, before, after, userName, date, createdAt, createdBy }`
Actions: `serial.create|serial.update|staff.create|staff.update|location.create|location.update|import.products|import.customers`.

### `duplicateAttempts/{ts-rand}` — append-only blocked-scan log (staff-readable).
`{ serial, source, attemptedByName, locationId, invoiceNoAttempted, productIdAttempted, existing: {registeredBy, date, invoiceNo, productName, locationName}, date, createdAt, createdBy }`

### `products`, `customers`, `invoices` — pre-existing business collections.
- Product: `{ id, barcode, name, sku?, category, price, unit }`
- Customer: `{ id, name, company?, whatsapp, email?, totalSpent, ordersCount }` (mobile = `whatsapp`)
- Invoice: `{ id: "INV-<n>", date, customer(snapshot), items[], total, status }`;
  item: `{ id, productId, barcode, name, sku?, category, price, qty:1, unit, total, imei }` —
  `imei` holds the scanned serial, one row per physical unit.

## Rules contract (firestore.rules — publish via console)

| Collection | create | update | delete | read |
|---|---|---|---|---|
| serials | staff, ID=UPPER, createdBy=caller, serverTimestamp | admin only, `< createdAt+24h`, identity fields immutable | never | staff |
| staff | admin (any) / bootstrap admin (own doc) | same | never | staff (+own doc when signed in) |
| locations | admin | admin | never | staff |
| auditLog | staff (append) | never | never | admin |
| duplicateAttempts | staff (append) | never | never | staff |
| products/customers/invoices | staff | staff | admin | staff |

Bootstrap admin emails live in **two files that must stay in sync**:
`src/config/appConfig.js` (`BOOTSTRAP_ADMIN_EMAILS`) and `firestore.rules` (`isBootstrapAdmin()`).
Changing them = edit both + republish rules. Day-to-day admin role changes need neither — use
the Admin tab.

## Client sync architecture

- `products`/`customers`/`invoices`/`staff`/`locations`: real-time `onSnapshot` → localStorage
  mirror (`crown_excel_*_v2` keys) → `crown-data-change` CustomEvent → pages re-read.
- `serials`: real-time `onSnapshot` → **in-memory** cache only (localStorage's ~5MB quota would
  cap the registry; Firestore's IndexedDB persistence is the durable local copy). At very large
  volume (>50k records) consider a date-bounded subscription (e.g. last 12 months) plus
  server-side queries for older data.
- `auditLog`/`duplicateAttempts`: write-through only; read on demand with
  `orderBy(createdAt desc) + limit`, counts via `getCountFromServer`.
- Serial **registration** is cloud-authoritative: a per-serial `runTransaction`
  (`createIfAbsent`) that refuses to run offline — an offline queue could not guarantee
  uniqueness across terminals. Everything else stays offline-first.

## API readiness (future ERP / POS / CRM integration)

- **Server-side (recommended)**: Firebase Admin SDK with a service account. NOTE: the Admin SDK
  **bypasses security rules** — any integration must re-enforce the invariants itself:
  normalize serials to uppercase, create-only writes to `serials` (use a transaction/precondition),
  append-only audit entries, lowercase staff emails.
- **Client-grade REST**: Firestore REST API with a staff user's ID token respects the same rules
  as the web app.
- Recommended integration surface: read `serials` for warranty lookups; create registrations via
  the same create-only pattern; never update/delete registry docs from external systems.

## Backup & recovery

- In-app: Settings → "Export Full Backup (JSON)" (includes serials/staff/locations read-only;
  restore covers products/customers/invoices only — the registry is create-only by design and
  Firestore itself is its source of truth).
- Point-in-time DR: Firebase console → Firestore → Disaster recovery (PITR) or scheduled
  exports to a GCS bucket (both require the Blaze plan). Optional but recommended once live.
