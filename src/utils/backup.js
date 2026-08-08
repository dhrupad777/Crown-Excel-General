// Full local backup in JSON and XML. Both formats serialize the SAME bundle
// (storageService.getBackupBundle) so they can never disagree. Used by the manual buttons in
// Settings and the once-a-week auto-download (see App.jsx). Everything runs client-side and lands
// in the browser's Downloads folder — "local" by design; there's no server involved.

import { downloadBlob } from './download';
import { storageService } from '../services/storage';

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// A tag name must be a valid XML name. Numeric array indices (and any odd keys) are coerced to a
// safe element, with the original key preserved as a `name` attribute so nothing is lost.
const safeTag = (key) => {
  const k = String(key);
  if (/^[A-Za-z_][\w.-]*$/.test(k)) return { tag: k, attr: '' };
  return { tag: 'item', attr: ` name="${escapeXml(k)}"` };
};

// Recursively serialize any JSON-ish value to indented XML. Arrays repeat a child element per
// entry; objects nest their keys; primitives become escaped text.
const valueToXml = (key, value, indent) => {
  const { tag, attr } = safeTag(key);
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) return `${pad}<${tag}${attr}/>`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<${tag}${attr}/>`;
    const kids = value.map((v) => valueToXml('item', v, indent + 1)).join('\n');
    return `${pad}<${tag}${attr}>\n${kids}\n${pad}</${tag}>`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}<${tag}${attr}/>`;
    const kids = keys.map((k) => valueToXml(k, value[k], indent + 1)).join('\n');
    return `${pad}<${tag}${attr}>\n${kids}\n${pad}</${tag}>`;
  }

  return `${pad}<${tag}${attr}>${escapeXml(value)}</${tag}>`;
};

export const bundleToXml = (bundle) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml('crownExcelBackup', bundle, 0)}\n`;

const stamp = () => new Date().toISOString().slice(0, 10);

// Downloads the requested formats (JSON and/or XML). Returns the filenames written. Marks the
// weekly-backup clock as done so the auto-trigger won't nag again until next week.
export const downloadFullBackup = (formats = ['json', 'xml']) => {
  const bundle = storageService.getBackupBundle();
  const base = `Crown_Excel_Full_Backup_${stamp()}`;
  const written = [];

  if (formats.includes('json')) {
    downloadBlob(`${base}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    written.push(`${base}.json`);
  }
  if (formats.includes('xml')) {
    downloadBlob(`${base}.xml`, new Blob([bundleToXml(bundle)], { type: 'application/xml' }));
    written.push(`${base}.xml`);
  }

  storageService.markBackupDone();
  return written;
};

// Fires the weekly backup if it's enabled and a week has elapsed. Best-effort: some browsers gate
// programmatic multi-file downloads behind a one-time "allow" prompt, so we also surface the due
// state to the UI (App shows a banner) rather than relying on this alone. Returns true if it ran.
export const runWeeklyBackupIfDue = () => {
  if (!storageService.isAutoBackupEnabled() || !storageService.isWeeklyBackupDue()) return false;
  downloadFullBackup(['json', 'xml']);
  return true;
};
