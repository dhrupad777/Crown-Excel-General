# Crown Excel General — Security & Data-Protection

This app is a static React site that talks **directly to Firebase** (no backend of our own). So
security and "never lose data" are layered across the client, Firestore rules, and a few Firebase
console settings. Everything below is designed to add **zero friction to daily use**.

## Already enforced (in this repo — nothing to do)

- **Authentication** — Google sign-in, staff allowlist (`staff/{email}`), role-based access.
- **Firestore security rules** ([`firestore.rules`](../firestore.rules)) — who can read/write each
  collection; serials are create-only (duplicate-proof); audit log & duplicate-attempts are
  append-only; invoice edits are admin-only; **field/size validation** rejects malformed or
  oversized writes (`textOk`).
- **Silent-failure protection** — if a cloud write is ever rejected (permission/quota/bad data),
  the app now raises a visible "**A save didn't sync**" warning in the sidebar instead of losing
  it quietly. Transient/offline blips are ignored (Firestore auto-retries those).
- **Soft delete / recycle bin** — deleting a product, customer, or invoice **archives** it (it's
  hidden everywhere but kept). Admins restore or permanently delete from **Admin → Archived
  Records**. Archived items auto-purge after `DELETION_RETENTION_DAYS` (90) — a purge runs
  opportunistically during any admin session. Nothing is ever lost by an accidental click.
- **App Check code** is wired and **inert** until you add a site key (below).

## Console steps to turn on (one-time, ~10 min total)

### 1. App Check — anti-abuse / "rate limiting" (invisible reCAPTCHA v3)
Blocks bots/scripts from hitting your database or login directly. reCAPTCHA **v3 is invisible** —
no checkboxes, no user friction.

1. Firebase Console → **App Check** → register the **Web app** → provider **reCAPTCHA v3**. Create
   the key (or reuse one from Google reCAPTCHA admin). Copy the **site key**.
2. Paste it into [`src/config/appConfig.js`](../src/config/appConfig.js) → `APP_CHECK_SITE_KEY`.
3. `npm run ship` (deploy). Open the live site, then in Console → App Check watch **verified
   requests** appear over a few minutes.
4. **Only after** requests are verifying, set **Enforcement = Enforced** for **Firestore** and
   **Authentication**. ⚠️ Enforcing before the deployed app carries the key will lock everyone
   out — order matters. (Leave it un-enforced to monitor first; the app works either way.)
5. Local dev: the console prints a **debug token** — add it under App Check → Debug tokens so
   `localhost` keeps working.

### 2. Restrict the API key (limits a stolen key)
Google Cloud Console → **APIs & Services → Credentials** → the **Browser key** used by the web app:
- **Application restrictions → HTTP referrers**: add `https://crown-excel-general.web.app/*`,
  `https://crown-excel-general.firebaseapp.com/*`, and your custom domain if any.
- **API restrictions → Restrict key**: allow only *Identity Toolkit API*, *Token Service API*,
  *Cloud Firestore API*, *Firebase App Check API*, *Firebase Installations API*.

### 3. Backups — the real "never lose data" backstop
Firebase Console → **Firestore Database**:
- **Point-in-Time Recovery (PITR)** → enable. Lets you restore the whole database to any minute in
  the last 7 days (covers mass mistakes, not just single-record deletes).
- **Backups** → add a schedule (daily) with a retention you like.
- (Both are Blaze-plan features; PITR is inexpensive. The in-app JSON backup in Settings is a
  manual fallback and now includes archived records too.)

### 4. Auth hardening (optional, quick)
Firebase Console → **Authentication → Settings**: keep **email enumeration protection** on; review
**authorized domains** (only your real domains).

## Ongoing
- Keep `firestore.rules` in this repo the source of truth; `npm run ship` deploys it with the app.
- Bootstrap admin emails live in **both** `src/config/appConfig.js` and `firestore.rules` — keep
  them in sync (see [`docs/DATA_MODEL.md`](DATA_MODEL.md)).
