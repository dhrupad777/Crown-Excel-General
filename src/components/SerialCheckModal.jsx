import React, { useState, useRef } from 'react';
import { ShieldCheck, Upload, Download, CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { parseWorkbookFile, columnValueCounts } from '../utils/importUtils';
import { exportToCsv, exportToXlsx, formatLocalDate } from '../utils/exportUtils';
import { storageService } from '../services/storage';

// Reconciles a spreadsheet of invoiced/shipped serials against the warranty registry — the
// in-app replacement for checking a sheet by hand with VLOOKUP. Read-only: it never registers
// anything, it only reports what is and isn't already on record.
export const SerialCheckModal = ({ isOpen, onClose }) => {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [serialColumn, setSerialColumn] = useState('');
  const [columns, setColumns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [parseError, setParseError] = useState('');
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setRows(null);
    setFileName('');
    setSerialColumn('');
    setColumns([]);
    setReport(null);
    setParseError('');
    setBusy(false);
    setShowOnlyMissing(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setReport(null);
    try {
      const parsed = await parseWorkbookFile(file);
      if (!parsed.length) {
        setParseError('No data rows found — make sure the sheet has a header row followed by serial numbers.');
        setRows(null);
        return;
      }
      // Pre-select the fullest column: a reconciliation sheet often pairs the complete list
      // against a partly-filled lookup column, and the full one is what you want to check.
      const counts = columnValueCounts(parsed);
      const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      setColumns(ranked.map((k) => ({ key: k, count: counts[k] })));
      setSerialColumn(ranked[0] || '');
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      setParseError(`Could not read that file (${err.message}). Use .xlsx or .csv.`);
      setRows(null);
    }
    e.target.value = '';
  };

  const handleRun = async () => {
    if (!rows || !serialColumn) return;
    setBusy(true);
    const values = rows.map((r) => r[serialColumn]).filter((v) => String(v ?? '').trim());
    setReport(await storageService.checkSerials(values));
    setBusy(false);
  };

  const REPORT_HEADERS = ['Serial', 'Status', 'Product', 'Partner', 'Invoice #', 'Registered On', 'Registered By', 'Store', 'Region'];
  const reportRows = () =>
    (report?.rows || []).map((r) => {
      const s = r.record;
      return [
        r.serial,
        r.registered ? 'Registered' : 'NOT REGISTERED',
        s?.productName || '',
        s?.customer?.company || s?.customer?.name || '',
        s?.invoiceNo || '',
        s?.date ? new Date(s.date).toLocaleString() : '',
        s?.registeredByName || s?.createdBy || '',
        s?.locationName || '',
        s?.teamId || ''
      ];
    });

  const handleDownload = async (kind) => {
    if (!report) return;
    const base = `Crown_Excel_Serial_Check_${formatLocalDate(new Date())}`;
    if (kind === 'csv') {
      exportToCsv({ filename: `${base}.csv`, headers: REPORT_HEADERS, rows: reportRows() });
      return;
    }
    try {
      await exportToXlsx({
        filename: `${base}.xlsx`,
        subtitle: `Serial check · ${report.total} checked · ${report.registered} registered · ${report.missing} not registered`,
        sheets: [{ name: 'Serial Check', headers: REPORT_HEADERS, rows: reportRows() }]
      });
    } catch (err) {
      alert(`Could not build the Excel file: ${err.message}`);
    }
  };

  const visibleRows = (report?.rows || []).filter((r) => !showOnlyMissing || !r.registered);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Serial Check"
      subtitle="Upload a list of invoiced serials to see which are already registered and which are missing. Nothing is registered or changed."
      icon={ShieldCheck}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 font-body">

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" /> {fileName ? 'Choose a Different File' : 'Choose Excel / CSV File'}
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handleFile} className="hidden" />

        {parseError && (
          <p className="text-xs font-bold text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {parseError}
          </p>
        )}

        {rows && !report && (
          <>
            <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{fileName}</span>
                <span>{rows.length} rows</span>
              </div>
              <div>
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                  Which column holds the serial numbers?
                </label>
                <select
                  value={serialColumn}
                  onChange={(e) => setSerialColumn(e.target.value)}
                  className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5 w-full"
                >
                  {columns.map((c) => (
                    <option key={c.key} value={c.key}>{c.key} — {c.count} values</option>
                  ))}
                </select>
                <p className="text-[10px] font-semibold text-slate-500 mt-1">
                  Defaults to the fullest column. Blank and errored cells (e.g. <span className="font-mono">#N/A</span>) are ignored.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={busy || !serialColumn}
              className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {busy ? 'Checking against the registry…' : 'Run Serial Check'}
            </button>
          </>
        )}

        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Checked', value: report.total, cls: 'text-slate-700 border-slate-200 bg-slate-50' },
                { label: 'Registered', value: report.registered, cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
                { label: 'Not Registered', value: report.missing, cls: 'text-red-600 border-red-200 bg-red-50' },
                { label: 'Dupes in File', value: report.duplicatesInFile, cls: 'text-amber-600 border-amber-200 bg-amber-50' }
              ].map((c) => (
                <div key={c.label} className={`rounded-xl border-2 p-3 ${c.cls}`}>
                  <div className="font-heading font-black text-2xl font-mono">{c.value}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider">{c.label}</div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyMissing}
                onChange={(e) => setShowOnlyMissing(e.target.checked)}
                className="accent-[#2563eb]"
              />
              Show only the ones that are NOT registered
            </label>

            <div className="overflow-x-auto border-2 border-slate-200 rounded-xl bg-white max-h-80 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    {['Serial', 'Status', 'Product', 'Partner', 'Invoice #'].map((h) => (
                      <th key={h} className="p-2 text-left font-black text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.slice(0, 200).map((r) => (
                    <tr key={r.serial} className={r.registered ? '' : 'bg-red-50/50'}>
                      <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">{r.serial}</td>
                      <td className="p-2 whitespace-nowrap">
                        {r.registered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-black">
                            <CheckCircle2 className="w-3 h-3" /> Registered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-black">
                            <XCircle className="w-3 h-3" /> Not registered
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-semibold text-slate-700 max-w-[180px] truncate">{r.record?.productName || '—'}</td>
                      <td className="p-2 font-semibold text-slate-700 max-w-[160px] truncate">
                        {r.record?.customer?.company || r.record?.customer?.name || '—'}
                      </td>
                      <td className="p-2 font-mono font-semibold text-slate-700 whitespace-nowrap">{r.record?.invoiceNo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleRows.length > 200 && (
              <p className="text-[11px] font-semibold text-slate-500">
                Showing the first 200 of {visibleRows.length} — download the report for the full list.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => handleDownload('xlsx')} className="btn btn-outline flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download Report (.xlsx)
              </button>
              <button onClick={() => handleDownload('csv')} className="btn btn-outline flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="btn btn-outline flex-1 py-2.5 text-xs font-bold">Check Another File</button>
              <button onClick={handleClose} className="btn btn-primary flex-1 py-2.5 text-xs font-bold">Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
