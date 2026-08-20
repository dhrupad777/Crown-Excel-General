import { describe, it, expect, vi } from 'vitest';

// The writer's last act is a browser download; capture the workbook bytes instead.
const { _blobs } = vi.hoisted(() => ({ _blobs: [] }));
vi.mock('./download', () => ({
  downloadBlob: vi.fn((filename, blob) => { _blobs.push({ filename, blob }); })
}));

const { writeStyledWorkbook } = await import('./excelWriter');

const written = async () => {
  const { blob } = _blobs[_blobs.length - 1];
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb.worksheets[0];
};

describe('writeStyledWorkbook textColumns', () => {
  // Excel reads an all-digits value as a NUMBER, dropping leading zeros and rounding past ~15
  // significant digits — which silently corrupts serial numbers. The serial-import template
  // declares its serial column as Text so operators don't have to remember to set it.
  it('marks only the listed columns as Text, at column level', async () => {
    await writeStyledWorkbook({
      filename: 'T.xlsx',
      title: 'CROWN EXCEL ELECTRONICS',
      subtitle: 'Blank import template',
      sheets: [{ name: 'Template', headers: ['Barcode / SKU', 'Serial Number'], rows: [], textColumns: [1] }]
    });
    const ws = await written();

    expect(ws.getColumn(2).numFmt).toBe('@');   // Serial Number
    expect(ws.getColumn(1).numFmt).toBeUndefined();
    // The point of declaring it on the COLUMN: cells that don't exist yet inherit it, so serials
    // typed into the blank template later stay text.
    expect(ws.getCell('B50').numFmt).toBe('@');
    expect(ws.getCell('A50').numFmt).toBeUndefined();
  });

  it('survives the per-cell styling applied to data rows', async () => {
    await writeStyledWorkbook({
      filename: 'T.xlsx',
      title: 'X',
      subtitle: 'Y',
      sheets: [{
        name: 'S',
        headers: ['Barcode / SKU', 'Serial Number'],
        rows: [['NX.BSQEM.001', '0012345']],
        textColumns: [1]
      }]
    });
    const ws = await written();

    const cell = ws.getCell('B5'); // header is row 4, so the first data row is 5
    expect(cell.numFmt).toBe('@');
    expect(cell.value).toBe('0012345');
  });

  it('leaves a sheet that declares no textColumns completely unchanged', async () => {
    await writeStyledWorkbook({
      filename: 'T.xlsx',
      title: 'X',
      subtitle: 'Y',
      sheets: [{ name: 'S', headers: ['A', 'B'], rows: [['1', '2']] }]
    });
    const ws = await written();

    expect(ws.getColumn(1).numFmt).toBeUndefined();
    expect(ws.getColumn(2).numFmt).toBeUndefined();
  });
});
