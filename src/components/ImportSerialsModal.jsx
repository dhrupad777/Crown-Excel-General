import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle, Loader2,
  PackagePlus, Wrench, Ban, SkipForward, Plus
} from 'lucide-react';
import { Modal } from './Modal';
import {
  parseWorkbookFile,
  columnValueCounts,
  pickField,
  planSerialImport,
  buildSerialProblemRows,
  normalizeProductCode,
  describeImportedUnit,
  isResolvable,
  isWarning,
  PROBLEM_KINDS,
  RESOLUTIONS,
  VALID_CATEGORIES,
  PRODUCT_CODE_ALIASES,
  SERIAL_ALIASES,
  SERIAL_IMPORT_TEMPLATE_HEADERS
} from '../utils/importUtils';
import { exportToCsv, exportToXlsx, formatLocalDate } from '../utils/exportUtils';
import { storageService } from '../services/storage';
import { guessProductDefaults } from '../utils/productDefaults';

// Bulk-adds units to the bill from a supplier sheet of "product code + serial number" — the
// spreadsheet equivalent of gun-scanning each unit. One file can span several products; each row
// is resolved to a catalog product by barcode OR sku (this business uses both interchangeably).
//
// It only ADDS BILL ROWS. Serials reach the warranty registry the usual way, when the bill is
// finalized, so there's still exactly one registration path.
//
// DESIGN RULE: nothing we merely *suspect* may dead-end the import. A code we can't resolve gets a
// product picker or an inline "create product"; a serial we think Excel mangled is a warning the
// operator can wave through. The ONLY terminal failures are facts — a serial already registered or
// already sold — because letting those through would break the anti-resale guarantee.
//
// `onAdd(entries)` receives [{ product, serial }] — the Billing Desk builds the item rows so the
// store tagging lives in one place.
export const ImportSerialsModal = ({ isOpen, onClose, existingSerials = [], onAdd }) => {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [codeColumn, setCodeColumn] = useState('');
  const [serialColumn, setSerialColumn] = useState('');
  const [parseError, setParseError] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Operator resolutions: NORMALIZED code → product | 'skip'
  const [codeOverrides, setCodeOverrides] = useState({});
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  // Inline "create product" form, keyed by the code being created for.
  const [creatingFor, setCreatingFor] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', category: 'Laptops' });
  const [createBusy, setCreateBusy] = useState(false);
  // Codes whose product the operator CREATED here (vs pointed at an existing one) — tracked so the
  // provenance written onto each unit says which of the two happened.
  const [createdCodes, setCreatedCodes] = useState([]);

  // Final acknowledgement gate, shown only when the import relies on operator overrides.
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Registry / past-sale verdict per normalized serial: string reason = blocked, null = clean.
  const [serialChecks, setSerialChecks] = useState(() => new Map());
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const [products, setProducts] = useState([]);
  const fileInputRef = useRef(null);

  const refreshProducts = useCallback(() => setProducts(storageService.getProducts()), []);

  useEffect(() => {
    if (!isOpen) return;
    refreshProducts();
    window.addEventListener('crown-data-change', refreshProducts);
    return () => window.removeEventListener('crown-data-change', refreshProducts);
  }, [isOpen, refreshProducts]);

  const reset = () => {
    setRows(null);
    setFileName('');
    setColumns([]);
    setCodeColumn('');
    setSerialColumn('');
    setParseError('');
    setReviewing(false);
    setCodeOverrides({});
    setAcceptWarnings(false);
    setCreatingFor('');
    setCreateBusy(false);
    setCreatedCodes([]);
    setConfirming(false);
    setAcknowledged(false);
    setSerialChecks(new Map());
    checkingRef.current = false;
    setChecking(false);
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
    setReviewing(false);
    setCodeOverrides({});
    setAcceptWarnings(false);
    setSerialChecks(new Map());
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

  // The serial column ships pre-formatted as Excel "Text", so serials typed into the blank template
  // keep their leading zeros and aren't rounded — the operator doesn't have to remember to set it.
  // Resolved by header name rather than a hardcoded index so it can't drift if the headers change.
  const handleDownloadTemplate = async () => {
    try {
      const serialCol = SERIAL_IMPORT_TEMPLATE_HEADERS.findIndex((h) => /serial/i.test(h));
      await exportToXlsx({
        filename: 'Crown_Excel_Serial_Import_Template.xlsx',
        subtitle: 'Blank import template — one row per unit: product barcode/SKU + its serial number',
        sheets: [{
          name: 'Template',
          headers: SERIAL_IMPORT_TEMPLATE_HEADERS,
          rows: [],
          textColumns: serialCol >= 0 ? [serialCol] : []
        }]
      });
    } catch (err) {
      alert(`Could not build the template: ${err.message}`);
    }
  };

  // Recomputed from scratch on every resolution rather than patched in place: a row that failed on
  // an unmatched code never reached the duplicate checks, so those have to be re-evaluated once the
  // operator makes it eligible.
  // The parent rebuilds this array on every render, so key the memo on its CONTENT — otherwise the
  // plan (and the check effect below that depends on it) churns on every keystroke in the Billing Desk.
  const existingKey = existingSerials.join('|');
  const billSerials = useMemo(() => (existingKey ? existingKey.split('|') : []), [existingKey]);

  const plan = useMemo(() => {
    if (!rows || !codeColumn || !serialColumn) return { ready: [], problems: [], skippedByOperator: [] };
    return planSerialImport({
      rows, codeColumn, serialColumn, products, existingSerials: billSerials, codeOverrides, acceptWarnings
    });
  }, [rows, codeColumn, serialColumn, products, billSerials, codeOverrides, acceptWarnings]);

  const unchecked = useMemo(
    () => plan.ready.filter((e) => !serialChecks.has(e.serial)),
    [plan.ready, serialChecks]
  );
  const readyNow = useMemo(
    () => plan.ready.filter((e) => serialChecks.get(e.serial) === null),
    [plan.ready, serialChecks]
  );
  const blocked = useMemo(
    () => plan.ready.filter((e) => typeof serialChecks.get(e.serial) === 'string')
      .map((e) => ({ ...e, reason: serialChecks.get(e.serial) })),
    [plan.ready, serialChecks]
  );

  // Registry + past-sale lookup for whatever became newly eligible. checkSerials reads the cloud as
  // well as the local mirror, so a unit registered by ANOTHER region is still caught.
  useEffect(() => {
    if (!reviewing || unchecked.length === 0 || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const batch = unchecked;
    // Deliberately not cancellable: the merge below only ADDS keys and is idempotent, so letting a
    // late result land is harmless — and re-running the same query on every parent re-render is not.
    // Anything the operator resolves mid-flight is picked up on the next pass, because merging
    // changes `serialChecks` and re-triggers this effect with the newly eligible rows.
    (async () => {
      let registered = new Map();
      try {
        const report = await storageService.checkSerials(batch.map((e) => e.serial));
        registered = new Map((report.rows || []).filter((r) => r.registered).map((r) => [r.serial, r.record]));
      } catch (err) {
        console.warn('Serial import registry check failed:', err.message);
      }
      setSerialChecks((prev) => {
        const next = new Map(prev);
        for (const e of batch) {
          const hit = registered.get(e.serial);
          if (hit) {
            const when = hit.date ? ` on ${new Date(hit.date).toLocaleDateString()}` : '';
            const inv = hit.invoiceNo ? `, invoice ${hit.invoiceNo}` : '';
            next.set(e.serial, `Already registered${when}${inv} — cannot be sold again`);
            continue;
          }
          const sold = storageService.findInvoiceBySerial(e.serial);
          next.set(e.serial, sold.length > 0
            ? `Already sold on invoice ${sold[0].invoice.invoiceNo || sold[0].invoice.id}`
            : null);
        }
        return next;
      });
      checkingRef.current = false;
      setChecking(false);
    })();
  }, [reviewing, unchecked]);

  // Resolvable problems, grouped by the code they share — the operator answers once per code, not
  // once per row.
  const resolveGroups = useMemo(() => {
    const byCode = new Map();
    for (const p of plan.problems) {
      if (!isResolvable(p.kind)) continue;
      const key = normalizeProductCode(p.code);
      const g = byCode.get(key);
      if (g) { g.count += 1; continue; }
      byCode.set(key, { key, code: p.code, kind: p.kind, matches: p.matches || [], count: 1 });
    }
    return [...byCode.values()].sort((a, b) => b.count - a.count);
  }, [plan.problems]);

  const warnings = useMemo(() => plan.problems.filter((p) => isWarning(p.kind)), [plan.problems]);
  const skipped = useMemo(
    () => plan.problems.filter((p) => !isResolvable(p.kind) && !isWarning(p.kind)),
    [plan.problems]
  );

  const skippedByChoice = plan.skippedByOperator.length;
  const needsAttention = resolveGroups.reduce((s, g) => s + g.count, 0);

  const setOverride = (key, value) => setCodeOverrides((prev) => ({ ...prev, [key]: value }));
  const clearOverride = (key) => setCodeOverrides((prev) => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

  const openCreate = (group) => {
    setCreatingFor(group.key);
    setCreateForm({ name: '', category: 'Laptops' });
  };

  // Awaited with confirm:true — a product that the cloud rejected must not silently become the
  // answer for 50 rows.
  const handleCreateProduct = async (group) => {
    const name = createForm.name.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      const saved = await storageService.saveProduct({
        name,
        barcode: group.code.trim(),
        sku: '',
        category: createForm.category,
        unit: 'Box'
      }, { confirm: true });
      if (!saved) throw new Error('Could not save locally (device storage may be full).');
      refreshProducts();
      setOverride(group.key, saved);
      setCreatedCodes((prev) => (prev.includes(group.key) ? prev : [...prev, group.key]));
      setCreatingFor('');
    } catch (err) {
      alert(`Could not create that product:\n\n${err.message}\n\nNothing was imported.`);
    }
    setCreateBusy(false);
  };

  const handleDownloadProblems = () => {
    const all = [
      ...plan.problems,
      ...blocked.map((b) => ({ rowNumber: b.rowNumber, code: b.code, raw: b.raw, reason: b.reason }))
    ].sort((a, b) => a.rowNumber - b.rowNumber);
    if (!all.length) return;
    exportToCsv({
      filename: `Serial_Import_Problems_${formatLocalDate(new Date())}.csv`,
      headers: ['Row #', 'Barcode / SKU', 'Serial', 'Problem'],
      rows: buildSerialProblemRows(all)
    });
  };

  // Which rows the heuristics complained about, regardless of whether the operator waved them
  // through — needed so a waived row's provenance says so on the permanent record.
  const warnedRows = useMemo(() => {
    if (!acceptWarnings || !rows || !codeColumn || !serialColumn) return new Set();
    const strict = planSerialImport({
      rows, codeColumn, serialColumn, products, existingSerials: billSerials, codeOverrides, acceptWarnings: false
    });
    return new Set(strict.problems.filter((p) => isWarning(p.kind)).map((p) => p.rowNumber));
  }, [acceptWarnings, rows, codeColumn, serialColumn, products, billSerials, codeOverrides]);

  const resolutionFor = useCallback((code) => {
    const key = normalizeProductCode(code);
    if (!codeOverrides[key] || codeOverrides[key] === 'skip') return RESOLUTIONS.MATCHED;
    return createdCodes.includes(key) ? RESOLUTIONS.CREATED : RESOLUTIONS.MAPPED;
  }, [codeOverrides, createdCodes]);

  // Everything the operator decided, spelled out. Drives both the acknowledgement screen and the
  // audit-log entry, so what they were shown is exactly what gets recorded.
  const overrides = useMemo(() => {
    const list = [];
    for (const [key, value] of Object.entries(codeOverrides)) {
      const rowsForCode = plan.ready.filter((e) => normalizeProductCode(e.code) === key).length;
      const skippedForCode = plan.skippedByOperator.filter((e) => normalizeProductCode(e.code) === key).length;
      if (value === 'skip') {
        if (skippedForCode > 0) list.push({ key, kind: 'skip', rows: skippedForCode });
      } else if (rowsForCode > 0) {
        list.push({
          key,
          kind: createdCodes.includes(key) ? RESOLUTIONS.CREATED : RESOLUTIONS.MAPPED,
          rows: rowsForCode,
          productName: value.name,
          productId: value.id
        });
      }
    }
    return list.sort((a, b) => b.rows - a.rows);
  }, [codeOverrides, createdCodes, plan.ready, plan.skippedByOperator]);

  const waivedCount = useMemo(
    () => readyNow.filter((e) => warnedRows.has(e.rowNumber)).length,
    [readyNow, warnedRows]
  );

  // A clean import goes straight through; one leaning on overrides has to be acknowledged first.
  const needsAcknowledgement = overrides.length > 0 || waivedCount > 0;

  const buildEntries = () => readyNow.map((e) => {
    const resolution = resolutionFor(e.code);
    const warned = warnedRows.has(e.rowNumber);
    return {
      product: e.product,
      serial: e.serial,
      source: 'import',
      remarks: describeImportedUnit({
        fileName,
        code: e.code,
        resolution,
        productName: e.product.name,
        warned,
        operator: storageService.getCurrentUser()?.displayName || ''
      })
    };
  });

  const handleAdd = () => {
    if (readyNow.length === 0) return;
    const entries = buildEntries();
    // Recorded BEFORE handing the units over, so the trail exists even if the operator then
    // abandons the bill. Fire-and-forget, like every other appendAudit call.
    storageService.appendAudit('serials.import', null, {
      file: fileName,
      rowsInFile: rows?.length || 0,
      added: entries.length,
      blocked: blocked.length,
      skipped: plan.problems.length - overrides.filter((o) => o.kind === 'skip').length,
      skippedByChoice: plan.skippedByOperator.length,
      warningsWaived: waivedCount,
      overrides: overrides.map((o) => ({
        code: o.key, action: o.kind, rows: o.rows, product: o.productName || '', productId: o.productId || ''
      })),
      blockedSerials: blocked.slice(0, 50).map((b) => ({ serial: b.serial, reason: b.reason }))
    }, { entity: 'import', entityId: fileName || 'serial-import' });

    onAdd(entries);
    handleClose();
  };

  const handleConfirm = () => {
    if (readyNow.length === 0) return;
    if (needsAcknowledgement && !confirming) { setConfirming(true); return; }
    handleAdd();
  };

  const byProduct = useMemo(() => {
    const groups = [];
    for (const entry of readyNow) {
      const found = groups.find((g) => g.product.id === entry.product.id);
      if (found) found.count += 1;
      else groups.push({ product: entry.product, count: 1 });
    }
    return groups.sort((a, b) => b.count - a.count);
  }, [readyNow]);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [products]
  );

  const problemCount = plan.problems.length + blocked.length;

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
        {rows && !reviewing && (
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
                either works. Nothing is added until you review the check on the next screen.
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

            <button
              type="button"
              onClick={() => setReviewing(true)}
              disabled={!codeColumn || !serialColumn}
              className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" /> Check {rows.length} Rows
            </button>
          </>
        )}

        {/* Step 4: acknowledgement — only when the import leans on operator overrides. A clean
            import never sees this screen. */}
        {rows && reviewing && confirming && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <h4 className="font-heading font-black text-sm text-amber-900">Check this before you add</h4>
              </div>
              <p className="text-[11px] font-semibold text-amber-800">
                This import relies on decisions you made rather than on codes the catalog matched by itself.
                Each one is written onto the unit's permanent warranty record and into the admin audit trail.
              </p>
            </div>

            <div className="border-2 border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
              {overrides.map((o) => (
                <div key={o.key} className="p-3.5 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-sm text-slate-900">{o.key}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-50 border-slate-200 text-slate-600">
                      {o.rows} row{o.rows === 1 ? '' : 's'}
                    </span>
                  </div>
                  {o.kind === 'skip' ? (
                    <p className="text-[11px] font-bold text-slate-500">Skipped — these rows will NOT be added.</p>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-700">
                      Will be billed as <span className="text-[#2563eb]">{o.productName}</span>
                      <span className="font-semibold text-slate-500">
                        {o.kind === RESOLUTIONS.CREATED
                          ? ' — a product you created during this import'
                          : ' — you mapped this code manually; the catalog did not match it'}
                      </span>
                    </p>
                  )}
                </div>
              ))}
              {waivedCount > 0 && (
                <div className="p-3.5">
                  <p className="text-[11px] font-bold text-slate-700">
                    {waivedCount} serial{waivedCount === 1 ? '' : 's'} imported despite a format warning
                    <span className="font-semibold text-slate-500"> — they go in exactly as they appear in the sheet.</span>
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3.5 text-center">
              <div className="font-heading font-black text-2xl font-mono text-emerald-600">{readyNow.length}</div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">units will be added to this bill</div>
            </div>

            <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer bg-white border-2 border-slate-300 rounded-xl p-3.5">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="accent-[#2563eb] mt-0.5"
              />
              <span>I have checked the products above are correct for these serials.</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => { setConfirming(false); setAcknowledged(false); }}
                className="btn btn-outline flex-1 py-2.5 text-xs font-bold"
              >
                Go Back &amp; Change
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!acknowledged}
                className="btn btn-primary flex-[2] py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <PackagePlus className="w-4 h-4" />
                Confirm &amp; Add {readyNow.length} Unit{readyNow.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: review, resolve, confirm */}
        {rows && reviewing && !confirming && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border-2 p-3 text-emerald-600 border-emerald-200 bg-emerald-50">
                <div className="font-heading font-black text-2xl font-mono flex items-center justify-center gap-2">
                  {readyNow.length}
                  {checking && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}
                </div>
                <div className="text-[10px] font-black uppercase tracking-wider">Ready to add</div>
              </div>
              <div className={`rounded-xl border-2 p-3 ${problemCount ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-slate-600 border-slate-200 bg-slate-50'}`}>
                <div className="font-heading font-black text-2xl font-mono">{problemCount}</div>
                <div className="text-[10px] font-black uppercase tracking-wider">
                  {needsAttention > 0 ? 'Need your input' : 'Problems'}
                </div>
              </div>
            </div>

            {/* --- RESOLVABLE: pick a product, create one, or skip --- */}
            {resolveGroups.length > 0 && (
              <div className="border-2 border-amber-300 rounded-xl bg-amber-50/40 overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-100/70 border-b-2 border-amber-200 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-black text-amber-800 uppercase tracking-wider">
                    Needs your input — {resolveGroups.length} code{resolveGroups.length === 1 ? '' : 's'}, {needsAttention} rows
                  </span>
                </div>
                <div className="divide-y divide-amber-200/70">
                  {resolveGroups.map((g) => (
                    <div key={g.key} className="p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="font-mono font-black text-sm text-slate-900">{g.code}</span>
                          <span className="text-[11px] font-bold text-slate-500 ml-2">{g.count} row{g.count === 1 ? '' : 's'}</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                          {g.kind === PROBLEM_KINDS.AMBIGUOUS_PRODUCT ? 'Matches more than one product' : 'Not in the catalog'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={codeOverrides[g.key]?.id || ''}
                          onChange={(e) => {
                            const p = products.find((x) => x.id === e.target.value);
                            if (p) setOverride(g.key, p); else clearOverride(g.key);
                            setCreatingFor('');
                          }}
                          className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2 text-xs flex-1 min-w-0"
                        >
                          <option value="">Use an existing product…</option>
                          {(g.kind === PROBLEM_KINDS.AMBIGUOUS_PRODUCT ? g.matches : sortedProducts).map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        {g.kind !== PROBLEM_KINDS.AMBIGUOUS_PRODUCT && (
                          <button
                            type="button"
                            onClick={() => (creatingFor === g.key ? setCreatingFor('') : openCreate(g))}
                            className="btn btn-outline py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" /> New product
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => (codeOverrides[g.key] === 'skip' ? clearOverride(g.key) : setOverride(g.key, 'skip'))}
                          className={`btn py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                            codeOverrides[g.key] === 'skip' ? 'btn-primary' : 'btn-outline'
                          }`}
                        >
                          <SkipForward className="w-3.5 h-3.5" /> Skip
                        </button>
                      </div>

                      {creatingFor === g.key && (
                        <div className="bg-white border-2 border-slate-200 rounded-xl p-3 space-y-2.5">
                          <p className="text-[10px] font-bold text-slate-500">
                            Creates a product with barcode <b className="font-mono text-[#2563eb]">{g.code}</b>, then
                            uses it for all {g.count} row{g.count === 1 ? '' : 's'}.
                          </p>
                          <input
                            type="text"
                            value={createForm.name}
                            onChange={(e) => {
                              const name = e.target.value;
                              const guess = guessProductDefaults(name);
                              setCreateForm((prev) => ({
                                ...prev,
                                name,
                                category: guess ? guess.category : prev.category
                              }));
                            }}
                            placeholder="Product name — e.g. ACER TRAVELMATE P215-55, Core Ultra 7, 16GB, 512GB"
                            className="input-field font-bold text-slate-900 bg-white border-slate-300 py-2 text-xs w-full"
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              value={createForm.category}
                              onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
                              className="input-field font-bold text-slate-800 bg-white border-slate-300 py-2 text-xs flex-1"
                            >
                              {VALID_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleCreateProduct(g)}
                              disabled={createBusy || !createForm.name.trim()}
                              className="btn btn-primary py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
                            >
                              {createBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackagePlus className="w-3.5 h-3.5" />}
                              Create &amp; use
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- WARNINGS: heuristics the operator can wave through --- */}
            {warnings.length > 0 && (
              <div className="border-2 border-orange-200 rounded-xl bg-orange-50/50 p-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <span className="text-xs font-black text-orange-800">
                    {warnings.length} serial{warnings.length === 1 ? '' : 's'} look unusual
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-orange-800">
                  {warnings[0].reason}
                </p>
                <label className="flex items-center gap-2 text-[11px] font-bold text-orange-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptWarnings}
                    onChange={(e) => setAcceptWarnings(e.target.checked)}
                    className="accent-[#2563eb]"
                  />
                  Import them exactly as they appear in the sheet
                </label>
              </div>
            )}

            {/* --- READY, grouped by product --- */}
            {byProduct.length > 0 && (
              <div className="border-2 border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                {byProduct.map((g) => (
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

            {/* --- TERMINAL: already registered or sold. No override, by design. --- */}
            {blocked.length > 0 && (
              <div className="border-2 border-red-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-red-50 border-b-2 border-red-200 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-black text-red-700 uppercase tracking-wider">
                    {blocked.length} already sold or registered — cannot be added
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto bg-white">
                  <table className="w-full text-[11px]">
                    <tbody className="divide-y divide-slate-100">
                      {blocked.slice(0, 100).map((b) => (
                        <tr key={b.rowNumber}>
                          <td className="p-2 font-mono font-bold text-slate-500 w-12">{b.rowNumber}</td>
                          <td className="p-2 font-mono font-semibold text-slate-800 whitespace-nowrap">{b.serial}</td>
                          <td className="p-2 font-semibold text-red-600">{b.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* --- SKIPPED: blanks, duplicates, already on this bill --- */}
            {(skipped.length > 0 || skippedByChoice > 0) && (
              <details className="border-2 border-slate-200 rounded-xl bg-slate-50/60">
                <summary className="px-4 py-2.5 text-xs font-black text-slate-600 cursor-pointer select-none">
                  {skipped.length + skippedByChoice} row{skipped.length + skippedByChoice === 1 ? '' : 's'} skipped
                  {skippedByChoice > 0 ? ` (${skippedByChoice} by your choice)` : ''} — blanks, duplicates, already on this bill
                </summary>
                <div className="max-h-40 overflow-y-auto bg-white border-t-2 border-slate-200">
                  <table className="w-full text-[11px]">
                    <tbody className="divide-y divide-slate-100">
                      {skipped.slice(0, 100).map((p, i) => (
                        <tr key={`${p.rowNumber}-${i}`}>
                          <td className="p-2 font-mono font-bold text-slate-400 w-12">{p.rowNumber}</td>
                          <td className="p-2 font-mono font-semibold text-slate-700 whitespace-nowrap">{p.raw || '—'}</td>
                          <td className="p-2 font-semibold text-slate-500">{p.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {problemCount === 0 && (
              <p className="text-xs font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Every row checks out.
              </p>
            )}

            {problemCount > 0 && (
              <button
                type="button"
                onClick={handleDownloadProblems}
                className="btn btn-outline w-full py-2.5 text-xs font-bold text-slate-600 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Problem Rows ({problemCount})
              </button>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => setReviewing(false)} className="btn btn-outline flex-1 py-2.5 text-xs font-bold">
                Back to Columns
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={readyNow.length === 0 || checking}
                className="btn btn-primary flex-[2] py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <PackagePlus className="w-4 h-4" />
                {checking
                  ? 'Checking…'
                  : readyNow.length === 0
                    ? 'Nothing to add yet'
                    : needsAcknowledgement
                      ? `Review & Add ${readyNow.length} Unit${readyNow.length === 1 ? '' : 's'}`
                      : `Add ${readyNow.length} Unit${readyNow.length === 1 ? '' : 's'} to Bill`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
