import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/storage', () => ({
  storageService: {
    getBackupBundle: vi.fn(),
    markBackupDone: vi.fn(),
    isAutoBackupEnabled: vi.fn(() => true),
    isWeeklyBackupDue: vi.fn(() => true)
  }
}));
vi.mock('./download', () => ({ downloadBlob: vi.fn() }));

const { storageService } = await import('../services/storage');
const { downloadBlob } = await import('./download');
const { bundleToXml, downloadFullBackup, runWeeklyBackupIfDue } = await import('./backup');

beforeEach(() => vi.clearAllMocks());

describe('bundleToXml', () => {
  it('emits a declaration and a single root element', () => {
    const xml = bundleToXml({ exportedAt: '2026-08-10', products: [] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<crownExcelBackup>');
    expect(xml).toContain('</crownExcelBackup>');
  });

  it('escapes XML-special characters so the file stays well-formed', () => {
    const xml = bundleToXml({ note: 'A & B <tag> "q" \'x\'' });
    expect(xml).toContain('A &amp; B &lt;tag&gt; &quot;q&quot; &apos;x&apos;');
    expect(xml).not.toContain('<tag>'); // the literal from data must be escaped, not a real element
  });

  it('repeats an <item> element per array entry', () => {
    const xml = bundleToXml({ products: [{ id: 'p1' }, { id: 'p2' }] });
    expect((xml.match(/<item>/g) || []).length).toBe(2);
    expect(xml).toContain('<id>p1</id>');
    expect(xml).toContain('<id>p2</id>');
  });

  it('renders null/empty as self-closing tags', () => {
    const xml = bundleToXml({ missing: null, empties: [] });
    expect(xml).toContain('<missing/>');
    expect(xml).toContain('<empties/>');
  });

  it('coerces a non-XML-safe key to <item name="...">', () => {
    const xml = bundleToXml({ '9bad': 'v' });
    expect(xml).toContain('<item name="9bad">v</item>');
  });
});

describe('downloadFullBackup', () => {
  beforeEach(() => storageService.getBackupBundle.mockReturnValue({ products: [{ id: 'p1' }] }));

  it('writes both JSON and XML by default and marks the backup done', () => {
    const files = downloadFullBackup();
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    expect(files.some((f) => f.endsWith('.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('.xml'))).toBe(true);
    expect(storageService.markBackupDone).toHaveBeenCalled();
  });

  it('honours a single requested format', () => {
    downloadFullBackup(['json']);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0][0]).toMatch(/\.json$/);
  });
});

describe('runWeeklyBackupIfDue', () => {
  beforeEach(() => storageService.getBackupBundle.mockReturnValue({ products: [] }));

  it('runs when enabled and due', () => {
    storageService.isAutoBackupEnabled.mockReturnValue(true);
    storageService.isWeeklyBackupDue.mockReturnValue(true);
    expect(runWeeklyBackupIfDue()).toBe(true);
    expect(downloadBlob).toHaveBeenCalled();
  });

  it('does nothing when not due', () => {
    storageService.isWeeklyBackupDue.mockReturnValue(false);
    expect(runWeeklyBackupIfDue()).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('does nothing when auto-backup is disabled', () => {
    storageService.isAutoBackupEnabled.mockReturnValue(false);
    storageService.isWeeklyBackupDue.mockReturnValue(true);
    expect(runWeeklyBackupIfDue()).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
