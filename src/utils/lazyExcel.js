// ExcelJS is the app's only lazily-loaded library — it lands in its own chunk so it never slows the
// initial load. That chunk is fetched on demand, which means it can go missing in exactly one
// situation: the tab was opened BEFORE a deploy, so it holds an entry point naming chunk filenames
// that the deploy has since replaced.
//
// The request for the missing chunk hits the SPA rewrite (`** -> /index.html`) and comes back as
// 200 + text/html rather than a 404, so the browser reports the opaque
// "Failed to fetch dynamically imported module: .../exceljs.min-XXXX.js".
//
// Nothing is broken and nothing was lost — the page just needs reloading. Say that, instead of
// surfacing a module URL to someone trying to export a spreadsheet. Callers already alert
// `err.message`, so this needs no UI change on their side.
export const APP_UPDATED_MESSAGE =
  'The app was updated in the background, so this feature could not load. Reload the page (Ctrl+Shift+R) and try again — nothing has been lost.';

// Did the CHUNK fail to arrive, or did ExcelJS itself throw? Only the first means the deploy moved
// underneath us; misreading a real library fault as "reload" would send someone reloading forever
// over something a reload cannot fix. Wording differs per browser, hence the alternatives.
export const isChunkLoadFailure = (err) => {
  const msg = String(err?.message || err || '');
  return /failed to fetch dynamically imported module/i.test(msg)   // Chrome / Edge
    || /error loading dynamically imported module/i.test(msg)       // Firefox
    || /importing a module script failed/i.test(msg);               // Safari
};

export const loadExcelJS = async () => {
  try {
    const mod = await import('exceljs');
    return mod.default || mod;
  } catch (err) {
    if (isChunkLoadFailure(err)) throw new Error(APP_UPDATED_MESSAGE);
    throw err;
  }
};
