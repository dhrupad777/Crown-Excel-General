import { describe, it, expect } from 'vitest';
import {
  DATA_CATEGORIES,
  DATA_PERMISSION_KEYS,
  tabPermission,
  normalizePermissions
} from './appConfig';

describe('data permission declarations', () => {
  it('every category names a real tab and a view key', () => {
    for (const c of DATA_CATEGORIES) {
      expect(typeof c.tab).toBe('string');
      expect(typeof c.view).toBe('string');
      expect(DATA_PERMISSION_KEYS).toContain(c.view);
    }
  });

  it('maps a tab id to its view permission, and leaves ungated tabs alone', () => {
    expect(tabPermission('invoices')).toBe('invoicesView');
    expect(tabPermission('customers')).toBe('partnersView');
    expect(tabPermission('registry')).toBe('serialsView');
    expect(tabPermission('dashboard')).toBe('analytics');
    // The tabs that are day-to-day work must never be gateable.
    for (const t of ['billing', 'drafts', 'products', 'serials']) {
      expect(tabPermission(t)).toBeNull();
    }
  });

  it('Analytics is a view with nothing to download', () => {
    expect(DATA_CATEGORIES.find((c) => c.key === 'analytics').download).toBeNull();
  });
});

describe('normalizePermissions', () => {
  it('fills every key as false when nothing is stored', () => {
    const p = normalizePermissions(undefined);
    expect(Object.keys(p).sort()).toEqual([...DATA_PERMISSION_KEYS].sort());
    expect(Object.values(p).every((v) => v === false)).toBe(true);
  });

  it('only a literal true grants', () => {
    const p = normalizePermissions({ invoicesView: 'yes', serialsView: 1, partnersView: true });
    expect(p.invoicesView).toBe(false);
    expect(p.serialsView).toBe(false);
    expect(p.partnersView).toBe(true);
  });

  // The invariant: a download button lives on a tab. No view, no download - collapsed here so the
  // stored state can never express the impossible combination.
  it('forces download off when its view is off', () => {
    const p = normalizePermissions({ invoicesView: false, invoicesExport: true });
    expect(p.invoicesExport).toBe(false);
  });

  it('leaves a download alone when its view is on', () => {
    const p = normalizePermissions({ serialsView: true, serialsExport: true });
    expect(p.serialsExport).toBe(true);
  });

  it('applies the invariant per category, independently', () => {
    const p = normalizePermissions({
      invoicesView: true,  invoicesExport: true,
      serialsView: false,  serialsExport: true,
      partnersView: true,  partnersExport: false
    });
    expect(p.invoicesExport).toBe(true);
    expect(p.serialsExport).toBe(false);
    expect(p.partnersExport).toBe(false);
  });

  it('is idempotent', () => {
    const once = normalizePermissions({ invoicesView: false, invoicesExport: true });
    expect(normalizePermissions(once)).toEqual(once);
  });

  it('drops keys it does not know about', () => {
    expect(normalizePermissions({ backups: true }).backups).toBeUndefined();
  });
});
