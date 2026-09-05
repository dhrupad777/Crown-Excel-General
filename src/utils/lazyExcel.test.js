import { describe, it, expect } from 'vitest';
import { isChunkLoadFailure, loadExcelJS, APP_UPDATED_MESSAGE } from './lazyExcel';

// ExcelJS is the one lazily-loaded library. Its chunk can only fail in one situation: the tab
// predates a deploy that replaced the chunk filenames, so the request hits the SPA rewrite and
// comes back as HTML. That must read as "reload" — but a GENUINE ExcelJS fault must surface as
// itself, or someone reloads forever over something a reload cannot fix.
describe('isChunkLoadFailure', () => {
  it('recognises the wording each browser uses', () => {
    const chunkErrors = [
      // the exact error reported from production
      'Failed to fetch dynamically imported module: https://crown-excel-general.web.app/assets/exceljs.min-BtNGI-o9.js',
      'error loading dynamically imported module',      // Firefox
      'Importing a module script failed.'               // Safari
    ];
    for (const msg of chunkErrors) {
      expect(isChunkLoadFailure(new Error(msg))).toBe(true);
    }
  });

  it('does NOT claim a real library fault is a stale chunk', () => {
    const realFaults = [
      'Cannot read properties of undefined (reading worksheets)',
      'Worksheet name must be a string',
      'Maximum call stack size exceeded',
      'quota exceeded'
    ];
    for (const msg of realFaults) {
      expect(isChunkLoadFailure(new Error(msg))).toBe(false);
    }
  });

  it('survives a thrown non-Error and an empty throw', () => {
    expect(isChunkLoadFailure('Failed to fetch dynamically imported module: /x.js')).toBe(true);
    expect(isChunkLoadFailure(undefined)).toBe(false);
    expect(isChunkLoadFailure(null)).toBe(false);
    expect(isChunkLoadFailure({})).toBe(false);
  });
});

describe('loadExcelJS', () => {
  it('loads the real library and hands back a usable Workbook', async () => {
    const ExcelJS = await loadExcelJS();
    expect(ExcelJS.Workbook).toBeTypeOf('function');
    expect(new ExcelJS.Workbook().addWorksheet('S')).toBeTruthy();
  });

  it('the reload message tells the operator nothing was lost', () => {
    expect(APP_UPDATED_MESSAGE).toMatch(/reload/i);
    expect(APP_UPDATED_MESSAGE).toMatch(/nothing has been lost/i);
  });
});
