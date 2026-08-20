import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle, Loader2, PackagePlus } from 'lucide-react';
import { Modal } from './Modal';
import {
  parseWorkbookFile,
  columnValueCounts,
  pickField,
  planSerialImport,
  buildSerialProblemRows,
  PRODUCT_CODE_ALIASES,
  SERIAL_ALIASES,
  SERIAL_IMPORT_TEMPLATE_HEADERS
} from '../utils/importUtils';
import { exportToCsv, exportToXlsx, formatLocalDate } from '../utils/exportUtils';
import { storageService } from '../services/storage';

// Bulk-adds units to the bill from a supplier sheet of "product code + serial number" — the
// spreadsheet equivalent of gun-scanning each unit. One file can span several products; each row
// is resolved to a catalog product by barcode OR sku (this business uses both interchangeably).
//
// It only ADDS BILL ROWS. Serials reach the warranty registry the usual way, when the bill is
// finalized, so there's still exactly one registration path.
//
// `onAdd(entries)` receives [{ product, serial }] — the Billing Desk builds the item rows so the
// store tagging lives in one place.
export const ImportSerialsModal = ({ isOpen, onClose, existingSerials = [], onAdd }) => {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [codeColumn, setCodeColumn] = useState('');
  const [serialColumn, setSerialColumn] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef(null);

  const reset = () => {
    setRows(null);
    setFileName('');
    setColumns([]);
    setCodeColumn('');
    setSerialColumn('');
    setReport(null);
    setParseError('');
    setBusy(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // Pre-selects the two columns by header name (tolerant of case/spacing/synonyms), falling back to
  // column order — a two-column sheet is nearly always code-then-serial. Feeding pickField a
  // header→header object makes it match on the header names themselves.
  const guessColumns = (keys) => {
    const asRow = (ks) => Object.fromEntries(ks.map((k) => [k, k]));
    // Serial is claimed FIRST, then the code column is picked from what's left: on a
    // ['SKU', 'SERIAL NUMBER'] sheet both headers would otherwise be candidates for the code.
    const serial = pickField(asRow(keys), SERIAL_ALIASES) || keys[1] || keys[0] || '';
    const rest = keys.filter((k) => k !== serial);
    const code = pickField(asRow(rest), PRODUCT_CODE_ALIASES) || rest[0] || '';
    return { code, serial };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setReport(null);
    try {
      const parsed = await parseWorkbookFile(file);
      if (!parsed.length) {
        setParseError('No data rows found — make sure the sheet has a header row followed by data.');
        setRows(null);
        return;
      }
      const counts = columnValueCounts(parsed);
      const keys = Object.keys(parsed[0]);
      setColumns(keys.map((k) => ({ key: k, count: counts[k] || 0 })));
      const guess = guessColumns(keys);
      setCodeColumn(guess.code);
      setSerialColumn(guess.serial);
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      setParseError(`Could not read that file (${err.message}). Use .xlsx or .csv — if it's an old .xls, open it in Excel and "Save As" .xlsx.`);
      setRows(null);
    }
    e.target.value = '';
  };

  const handleDownloadTemplate = async () => {
    try {
      await exportToXlsx({
        filename: 'Crown_Excel_Serial_Import_Template.xlsx',
        subtitle: 'Blank import template — one row per unit: product barcode/SKU + its serial number',
        sheets: [{ name: 'Template', headers: SERIAL_IMPORT_TEMPLATE_HEADERS, rows: [] }]
      });
    } catch (err) {
      alert(`Could not build the template: ${err.message}`);
    }
  };

  // Two passes: the sync pre-flight (product match, blanks, in-file and on-bill duplicates), then
  // the two network-backed guards the scanner also applies — the registry (checkSerials reads the
  // cloud too, so a unit registered by ANOTHER region is still caught) and past invoices.
  const handleCheck = async () => {
    if (!rows || !codeColumn || !serialColumn) return;
    setBusy(true);

    const products = storageService.getProducts();
    const plan = planSerialImport({ rows, codeColumn, serialColumn, products, existingSerials });
    const problems = [...plan.problems];
    const ready = [];

    let registryReport = { rows: [] };
    if (plan.ready.length > 0) {
      registryReport = await storageService.checkSerials(plan.ready.map((r) => r.serial));
    }
    const registered = new Map(
      (registryReport.rows || []).filter((r) => r.registered).map((r) => [r.serial, r.record])
    );

    for (const entry of plan.ready) {
      const hit = registered.get(entry.serial);
      if (hit) {
        const when = hit.date ? ` on ${new Date(hit.date).toLocaleDateString()}` : '';
        const inv = hit.invoiceNo ? `, invoice ${hit.invoiceNo}` : '';
        problems.push({ ...entry, reason: `Serial ${entry.serial} is already registered${when}${inv} — it cannot be sold again` });
        continue;
      }
      const sold = storageService.findInvoiceBySerial(entry.serial);
      if (sold.length > 0) {
        problems.push({ ...entry, reason: `Serial ${entry.serial} was already sold on invoice ${sold[0].invoice.invoiceNo || sold[0].invoice.id}` });
        continue;
      }
      ready.push(entry);
    }

    problems.sort((a, b) => a.rowNumber - b.rowNumber);

    // Units per product, for the confirmation summary.
    const byProduct = [];
    for (const entry of ready) {
      const found = byProduct.find((g) => g.product.id === entry.product.id);
      if (found) found.count += 1;
      else byProduct.push({ product: entry.product, count: 1 });
    }

    setReport({ ready, problems, byProduct });
    setBusy(false);
  };

  const handleDownloadProblems = () => {
    if (!report?.problems?.length) return;
    exportToCsv({
      filename: `Serial_Import_Problems_${formatLocalDate(new Date())}.csv`,
      headers: ['Row #', 'Barcode / SKU', 'Serial', 'Problem'],
      rows: buildSerialProblemRows(report.problems)
    });
  };

  const handleConfirm = () => {
    if (!report?.ready?.length) return;
    onAdd(report.ready.map(({ product, serial }) => ({ product, serial })));
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Serials from Excel"
      subtitle="Upload a sheet of product barcode/SKU + serial number. Each row is added to this bill as one unit, exactly as if it were scanned."
      icon={FileSpreadsheet}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 font-body">

        {/* Step 1: file + template */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" /> {fileName ? 'Choose a Different File' : 'Choose Excel / CSV File'}
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn btn-outline py-3 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Blank Template
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handleFile} className="hidden" />
        </div>

        {parseError && (
          <p className="text-xs font-bold text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {parseError}
          </p>
        )}

        {/* Step 2: column mapping + preview */}
        {rows && !report && (
          <>
            <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {fileName}
                </span>
                <span>{rows.length} data rows</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    Product column (Barcode / SKU)
                  </label>
                  <select
                    value={codeColumn}
                    onChange={(e) => setCodeColumn(e.target.value)}
                    className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5 w-full"
                  >
                    <option value="">Select column…</option>
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.key} — {c.count} values</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    Serial number column
                  </label>
                  <select
                    value={serialColumn}
                    onChange={(e) => setSerialColumn(e.target.value)}
                    className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5 w-full"
                  >
                    <option value="">Select column…</option>
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.key} — {c.count} values</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[10px] font-semibold text-slate-500">
                The product column is matched against each device's <b>barcode</b> and its <b>model / SKU</b>, so
                either works. Nothing is added until you review the check below.
              </p>

              {codeColumn && serialColumn && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left font-black text-slate-600 whitespace-nowrap">Barcode / SKU</th>
                        <th className="p-2 text-left font-black text-slate-600 whitespace-nowrap">Serial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">{String(r[codeColumn] ?? '')}</td>
                          <td className="p-2 font-mono font-semibold text-slate-700 whitespace-nowrap">{String(r[serialColumn] ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-800">
                Excel treats an all-digits serial as a <b>number</b>, which drops leading zeros and rounds anything
                past ~15 digits. If your serials have leading zeros or are very long, format that column as
                <b> Text</b> in Excel before saving.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCheck}
              disabled={busy || !codeColumn || !serialColumn}
              className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy ? 'Checking against the catalog & registry…' : `Check ${rows.length} Rows`}
            </button>
          </>
        )}

        {/* Step 3: results + confirm */}
        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border-2 p-3 text-emerald-600 border-emerald-200 bg-emerald-50">
                <div className="font-heading font-black text-2xl font-mono">{report.ready.length}</div>
                <div className="text-[10px] font-black uppercase tracking-wider">Ready to add</div>
              </div>
              <div className={`rounded-xl border-2 p-3 ${report.problems.length ? 'text-red-600 border-red-200 bg-red-50' : 'text-slate-600 border-slate-200 bg-slate-50'}`}>
                <div className="font-heading font-black text-2xl font-mono">{report.problems.length}</div>
                <div className="text-[10px] font-black uppercase tracking-wider">Problems</div>
              </div>
            </div>

            {report.byProduct.length > 0 && (
              <div className="border-2 border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                {report.byProduct.map((g) => (
                  <div key={g.product.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 truncate">{g.product.name}</div>
                      <div className="text-[10px] font-mono font-bold text-[#2563eb]">{g.product.barcode}</div>
                    </div>
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                      {g.count} unit{g.count === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {report.problems.length > 0 && (
              <>
                <div className="overflow-x-auto border-2 border-red-200 rounded-xl bg-white max-h-64 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-red-50 sticky top-0">
                      <tr>
                        {['Row', 'Barcode / SKU', 'Serial', 'Problem'].map((h) => (
                          <th key={h} className="p-2 text-left font-black text-red-700 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.problems.slice(0, 200).map((p, i) => (
                        <tr key={`${p.rowNumber}-${i}`}>
                          <td className="p-2 font-mono font-bold text-slate-500">{p.rowNumber}</td>
                          <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">{p.code || '—'}</td>
                          <td className="p-2 font-mono font-semibold text-slate-700 whitespace-nowrap">{p.serial || '—'}</td>
                          <td className="p-2 font-semibold text-red-600">{p.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.problems.length > 200 && (
                  <p className="text-[11px] font-semibold text-slate-500">
                    Showing the first 200 of {report.problems.length} — download the list for all of them.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDownloadProblems}
                  className="btn btn-outline w-full py-2.5 text-xs font-bold text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Problem Rows ({report.problems.length})
                </button>
              </>
            )}

            {report.problems.length === 0 && (
              <p className="text-xs font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Every row checks out.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={reset} className="btn btn-outline flex-1 py-2.5 text-xs font-bold">
                Choose Another File
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={report.ready.length === 0}
                className="btn btn-primary flex-[2] py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <PackagePlus className="w-4 h-4" />
                {report.ready.length === 0
                  ? 'Nothing to add'
                  : `Add ${report.ready.length} Unit${report.ready.length === 1 ? '' : 's'} to Bill`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
