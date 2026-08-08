// Serializes a backup bundle to JSON/XML and triggers on-demand downloads. The bundle itself is
// produced and stored by storageService (see getBackupBundle / createBackupSnapshot). Both formats
// come from the SAME bundle so they can never drift. Everything is client-side.

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

// Downloads a specific bundle in the requested formats. `label` (a date) names the file. Returns
// the filenames written.
export const downloadBundle = (bundle, formats = ['json', 'xml'], label) => {
  const base = `Crown_Excel_Full_Backup_${label || new Date().toISOString().slice(0, 10)}`;
  const written = [];
  if (formats.includes('json')) {
    downloadBlob(`${base}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    written.push(`${base}.json`);
  }
  if (formats.includes('xml')) {
    downloadBlob(`${base}.xml`, new Blob([bundleToXml(bundle)], { type: 'application/xml' }));
    written.push(`${base}.xml`);
  }
  return written;
};

// Weekly auto-SNAPSHOT (not a download): captures a snapshot into the on-device history if the
// feature is enabled and a week has elapsed. The user grabs it from Admin → Backups when they
// like. Returns the new snapshot's index entry, or null if nothing was due.
export const runWeeklySnapshotIfDue = async () => {
  if (!storageService.isAutoBackupEnabled() || !storageService.isWeeklyBackupDue()) return null;
  return storageService.createBackupSnapshot();
};
