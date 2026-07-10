// Styled .xlsx writer (ExcelJS). SheetJS's free build cannot style cells at all — no bold or
// coloured headers, no frozen panes — which is why the old workbooks looked plain.
//
// ExcelJS is imported LAZILY inside the writer: it only downloads when someone actually clicks
// an export, so it lands in its own chunk and never slows the app's initial load.

import { downloadBlob } from './download';

const BRAND_FILL = 'FF2563EB';   // brand blue (ARGB)
const HEADER_FONT = 'FFFFFFFF';  // white
const BORDER = 'FFD8DEE6';
const ZEBRA_FILL = 'FFF7F9FB';

// Rows 1-3 hold the branded title block, so the header row always lands on row 4.
const HEADER_ROW = 4;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Sizes each column to its longest cell, clamped so a long remark can't blow the sheet open.
const autoWidth = (header, rows, colIndex) => {
  let longest = String(header).length;
  for (const r of rows) {
    const v = r[colIndex];
    const len = v instanceof Date ? 16 : String(v ?? '').length;
    if (len > longest) longest = len;
  }
  return Math.min(Math.max(longest + 2, 10), 50);
};

/**
 * @param {object}   opts
 * @param {string}   opts.filename
 * @param {string}   opts.title      big brand line (row 1)
 * @param {string}   opts.subtitle   context line (row 2)
 * @param {Array}    opts.sheets     [{ name, headers, rows, colWidths?, noFilter? }]
 */
export const writeStyledWorkbook = async ({ filename, title, subtitle, sheets }) => {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Crown Excel Electronics';
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    const colCount = sheet.headers.length;
    const widths = sheet.colWidths || sheet.headers.map((h, i) => autoWidth(h, sheet.rows, i));
    ws.columns = widths.map((w) => ({ width: w }));

    // --- Title block (rows 1-3) ---
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14, color: { argb: BRAND_FILL } };

    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = subtitle;
    subCell.font = { size: 10, color: { argb: 'FF64748B' } };
    ws.getRow(3).height = 6; // spacer

    // --- Header row (row 4): bold white on brand blue, frozen ---
    const headerRow = ws.getRow(HEADER_ROW);
    headerRow.values = sheet.headers;
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: BRAND_FILL } },
        bottom: { style: 'thin', color: { argb: BRAND_FILL } },
        left: { style: 'thin', color: { argb: BRAND_FILL } },
        right: { style: 'thin', color: { argb: BRAND_FILL } }
      };
    });

    // --- Data rows ---
    sheet.rows.forEach((row, idx) => {
      const r = ws.getRow(HEADER_ROW + 1 + idx);
      r.values = row;
      r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Wrap only genuinely wide columns (notes, serial lists) so rows stay compact.
        const wide = (widths[colNumber - 1] || 0) >= 40;
        cell.alignment = { vertical: 'top', wrapText: wide };
        cell.font = { size: 10 };
        // Real dates carry a number format so Excel sorts/filters them as dates, not as text.
        if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm';
        cell.border = {
          top: { style: 'thin', color: { argb: BORDER } },
          bottom: { style: 'thin', color: { argb: BORDER } },
          left: { style: 'thin', color: { argb: BORDER } },
          right: { style: 'thin', color: { argb: BORDER } }
        };
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
        }
      });
    });

    // Freeze everything above and including the header row, so it stays put while scrolling.
    ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];

    if (!sheet.noFilter && colCount > 0) {
      ws.autoFilter = {
        from: { row: HEADER_ROW, column: 1 },
        to: { row: HEADER_ROW + sheet.rows.length, column: colCount }
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(filename, new Blob([buffer], { type: XLSX_MIME }));
};
