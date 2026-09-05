// A tab that was open BEFORE a deploy still holds the previous entry point in memory, naming chunk
// filenames the deploy has replaced. Its next lazy import therefore fails — Vite fires
// `vite:preloadError` for exactly this. Cache headers stop it happening on a fresh load; this
// handles the till that has been sitting open all afternoon.
//
// Deliberately a PROMPT, never an automatic reload: an operator can be mid-bill with scanned items
// that only live in component state (which is why BillingDesk installs a beforeunload guard). We
// never yank the page out from under them — we say a new version is ready and let them choose.
//
// Plain DOM rather than React: the point is to work when part of the app can no longer load.
const BANNER_ID = 'ce-new-version-banner';

const show = () => {
  if (document.getElementById(BANNER_ID)) return; // already up — don't stack

  const bar = document.createElement('div');
  bar.id = BANNER_ID;
  bar.setAttribute('role', 'status');
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:20px', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'gap:12px',
    'max-width:calc(100vw - 32px)',
    'padding:12px 16px', 'border-radius:14px',
    'background:#ffffff', 'border:2px solid #2563eb',
    'box-shadow:0 10px 30px rgba(15,23,42,.18)',
    "font-family:Inter,system-ui,sans-serif", 'font-size:13px', 'font-weight:700', 'color:#0f172a'
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A new version of Crown Excel is ready. Reload to continue.';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = [
    'flex:none', 'cursor:pointer', 'padding:8px 16px', 'border-radius:10px',
    'background:#2563eb', 'color:#fff', 'border:none',
    'font-family:inherit', 'font-size:12px', 'font-weight:800'
  ].join(';');
  reload.addEventListener('click', () => window.location.reload());

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Not now';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.style.cssText = [
    'flex:none', 'cursor:pointer', 'padding:8px 10px', 'border-radius:10px',
    'background:transparent', 'color:#64748b', 'border:none',
    'font-family:inherit', 'font-size:12px', 'font-weight:700'
  ].join(';');
  dismiss.addEventListener('click', () => bar.remove());

  bar.append(text, reload, dismiss);
  document.body.appendChild(bar);
};

export const watchForNewVersion = () => {
  // Vite's own signal that a code-split chunk could not be fetched.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault?.();   // stop the unhandled rejection; we're reporting it properly
    show();
  });
};
