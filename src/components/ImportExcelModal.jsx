import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { parseWorkbookFile, buildErrorReportRows } from '../utils/importUtils';
import { exportToCsv, exportToXlsx, formatLocalDate } from '../utils/exportUtils';
import { storageService } from '../services/storage';
import { useAuth } from '../context/AuthContext';

// Three-step bulk import wizard: pick file → preview + duplicate policy → results with a
// downloadable error report. `onImport(rows, { onDuplicate })` does the actual writes and
// returns { created, updated, skipped, errors } (see importUtils).
export const ImportExcelModal = ({ isOpen, onClose, entityLabel, templateHeaders, onImport }) => {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [onDuplicate, setOnDuplicate] = useState('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');
  // Region every row lands in when its own Region cell is blank. Admins aren't tied to one region
  // so they must choose; standard staff always import into their own.
  const [defaultTeamId, setDefaultTeamId] = useState(() => storageService.getCurrentTeamId() || '');
  const fileInputRef = useRef(null);

  const teams = storageService.getTeams();

  const reset = () => {
    setRows(null);
    setFileName('');
    setResult(null);
    setParseError('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setResult(null);
    try {
      const parsed = await parseWorkbookFile(file);
      if (!parsed.length) {
        setParseError('No data rows found — make sure the first sheet has a header row followed by data.');
        setRows(null);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      setParseError(`Could not read that file (${err.message}). Use .xlsx or .csv — if it's an old .xls, open it in Excel and "Save As" .xlsx.`);
      setRows(null);
    }
    e.target.value = '';
  };

  const handleRun = async () => {
    if (!rows) return;
    setBusy(true);
    const res = await onImport(rows, { onDuplicate, defaultTeamId });
    setResult(res);
    setBusy(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      await exportToXlsx({
        filename: `Crown_Excel_${entityLabel.replace(/\s+/g, '_')}_Template.xlsx`,
        subtitle: `Blank import template — ${entityLabel}`,
        sheets: [{ name: 'Template', headers: templateHeaders, rows: [] }]
      });
    } catch (err) {
      alert(`Could not build the template: ${err.message}`);
    }
  };

  const handleDownloadErrors = () => {
    if (!result?.errors?.length) return;
    exportToCsv({
      filename: `Import_Errors_${entityLabel.replace(/\s+/g, '_')}_${formatLocalDate(new Date())}.csv`,
      headers: ['Row #', 'Problem', 'Row Data'],
      rows: buildErrorReportRows(result.errors)
    });
  };

  const previewHeaders = rows ? Object.keys(rows[0]).slice(0, 6) : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Bulk Import — ${entityLabel}`}
      subtitle="Upload an Excel (.xlsx) or CSV file. The first sheet's header row is matched automatically."
      icon={FileSpreadsheet}
      maxWidth="max-w-2xl"
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFile}
            className="hidden"
          />
        </div>

        {parseError && (
          <p className="text-xs font-bold text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {parseError}
          </p>
        )}

        {/* Step 2: preview + policy */}
        {rows && !result && (
          <>
            <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {fileName}
                </span>
                <span>{rows.length} data rows</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100">
                    <tr>
                      {previewHeaders.map((h) => (
                        <th key={h} className="p-2 text-left font-black text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        {previewHeaders.map((h) => (
                          <td key={h} className="p-2 font-semibold text-slate-700 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis">
                            {String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && (
                <p className="text-[11px] font-semibold text-slate-500">…and {rows.length - 8} more rows</p>
              )}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                  Region for these rows <span className="text-red-500">*</span>
                </span>
                <select
                  value={defaultTeamId}
                  onChange={(e) => setDefaultTeamId(e.target.value)}
                  className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2.5 w-full"
                  required
                >
                  <option value="">Select region…</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-[10px] font-semibold text-slate-500">
                  Used for every row whose <b>Region</b> column is blank. A row with its own Region value keeps that
                  region; an unrecognised region name is reported as an error instead of being filed into the wrong team.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">If a record already exists</span>
              <div className="flex gap-3">
                {[
                  { id: 'skip', label: 'Skip it (keep existing data)' },
                  { id: 'update', label: 'Update it with the file values' }
                ].map((opt) => (
                  <label key={opt.id} className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer text-xs font-bold transition-colors ${
                    onDuplicate === opt.id ? 'border-[#2563eb] bg-blue-50 text-[#2563eb]' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="dup-policy"
                      checked={onDuplicate === opt.id}
                      onChange={() => setOnDuplicate(opt.id)}
                      className="accent-[#2563eb]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={busy || !defaultTeamId}
              className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy ? 'Importing…' : !defaultTeamId ? 'Select a region first' : `Import ${rows.length} Rows`}
            </button>
          </>
        )}

        {/* Step 3: results */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Created', value: result.created, cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
                { label: 'Updated', value: result.updated, cls: 'text-[#2563eb] border-blue-200 bg-blue-50' },
                { label: 'Skipped', value: result.skipped, cls: 'text-slate-600 border-slate-200 bg-slate-50' },
                { label: 'Errors', value: result.errors.length, cls: 'text-red-600 border-red-200 bg-red-50' }
              ].map((c) => (
                <div key={c.label} className={`rounded-xl border-2 p-3 ${c.cls}`}>
                  <div className="font-heading font-black text-2xl font-mono">{c.value}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider">{c.label}</div>
                </div>
              ))}
            </div>

            {result.errors.length > 0 ? (
              <button
                type="button"
                onClick={handleDownloadErrors}
                className="btn btn-outline w-full py-2.5 text-xs font-bold text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Error Report ({result.errors.length} rows)
              </button>
            ) : (
              <p className="text-xs font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> All rows processed cleanly.
              </p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={reset} className="btn btn-outline flex-1 py-2.5 text-xs font-bold">
                Import Another File
              </button>
              <button type="button" onClick={handleClose} className="btn btn-primary flex-1 py-2.5 text-xs font-bold">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
