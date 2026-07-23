import React, { useState, useRef, useCallback } from 'react';
import {
  Database,
  RefreshCw,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  Key,
  Cloud
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Modal } from './components/Modal';
import { AuthGate } from './components/AuthGate';
import { BillingDesk } from './pages/BillingDesk';
import { InvoicesArchive } from './pages/InvoicesArchive';
import { ProductsManager } from './pages/ProductsManager';
import { CustomersManager } from './pages/CustomersManager';
import { SerialCapture } from './pages/SerialCapture';
import { SerialRegistry } from './pages/SerialRegistry';
import { RegistrationsDashboard } from './pages/RegistrationsDashboard';
import { AdminPage } from './pages/AdminPage';
import { storageService } from './services/storage';
import { firebaseService } from './services/firebase';
import { useAuth } from './context/AuthContext';

export function App() {
  const { isAdmin, staff } = useAuth();
  // A non-admin whose store has no team/region syncs nothing — surface why instead of a blank app.
  const noTeam = !isAdmin && staff && !storageService.getCurrentTeamId();
  const [activeTab, setActiveTab] = useState('billing');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  // Tracks whether the Billing Desk holds an unfinalized bill, so we can warn before navigating
  // away and discarding it. A ref (not state) — it only needs to be read at navigation time.
  const billDirtyRef = useRef(false);
  const handleBillDirty = useCallback((dirty) => { billDirtyRef.current = dirty; }, []);
  
  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [firebaseConfig, setFirebaseConfig] = useState(firebaseService.config);
  const [configSaved, setConfigSaved] = useState(false);

  // One-time team migration (admin)
  const [migrateTeam, setMigrateTeam] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateReport, setMigrateReport] = useState(null);
  const handleMigrate = async () => {
    if (!migrateTeam) { alert('Pick the team that should own the existing products & partners.'); return; }
    const teamName = storageService.getLocationName(migrateTeam) || migrateTeam;
    if (!window.confirm(`Run the one-time team migration?\n\n• Every existing invoice & serial keeps the team that created it.\n• All existing products & partners will be assigned to "${teamName}".\n\nSafe to re-run.`)) return;
    setMigrating(true);
    setMigrateReport(null);
    try {
      setMigrateReport(await storageService.migrateToTeams(migrateTeam));
    } catch (e) {
      alert(`Migration error: ${e.message}`);
    }
    setMigrating(false);
  };
  
  // Import/Export State
  const [importText, setImportText] = useState('');

  // Handle switching to view a saved invoice
  const handleViewInvoice = (invoiceId) => {
    setSelectedInvoiceId(invoiceId);
    setActiveTab('invoices');
  };

  // Handle Firebase Config Save
  const handleSaveFirebaseConfig = (e) => {
    e.preventDefault();
    firebaseService.saveConfig(firebaseConfig);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  // Handle Reset to Demo Data
  const handleResetDemo = () => {
    if (window.confirm("WARNING: This will replace all current data with the initial Crown Excel General demo database. Continue?")) {
      const success = storageService.resetToDemoData();
      if (success) {
        alert("Database reset to demo state successfully!");
        window.location.reload();
      } else {
        alert("Reset failed: could not write to local storage (device storage may be full).");
      }
    }
  };

  // Handle Export JSON Backup
  const handleExportJSON = () => {
    const dataStr = storageService.exportAllData();
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Crown_Excel_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Import JSON Backup
  const handleImportJSON = () => {
    if (!importText.trim()) return;
    if (window.confirm("Are you sure you want to import this data? Current matching records will be overwritten.")) {
      const success = storageService.importAllData(importText);
      if (success) {
        alert("Data imported successfully!");
        window.location.reload();
      } else {
        alert("Invalid backup JSON format. Please check and try again.");
      }
    }
  };

  // Safety net alongside the role-aware Navbar: a non-admin can never land on the Admin tab
  // (e.g. after being demoted mid-session while the tab is open).
  if (activeTab === 'admin' && !isAdmin) {
    setActiveTab('billing');
  }

  return (
    <AuthGate>
    <div className="min-h-screen flex flex-col bg-[#f7f9fb] text-slate-900 font-body">

      {/* Sidebar & Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          // Guard against silently discarding an in-progress bill: leaving the Billing Desk
          // unmounts it and loses the scanned items, so confirm first when one is unfinalized.
          if (activeTab === 'billing' && tab !== 'billing' && billDirtyRef.current) {
            const leave = window.confirm(
              'This bill has not been finalized yet.\n\nIf you leave the Billing Desk now, the scanned items and attached customer will be discarded. Finalize the bill first to keep it.\n\nLeave anyway?'
            );
            if (!leave) return;
          }
          setActiveTab(tab);
          if (tab !== 'invoices') setSelectedInvoiceId(null);
        }}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main Content Area (Offset by 280px on desktop for Left Sidebar) */}
      <main className="flex-1 md:ml-[280px] pb-20">
        {noTeam && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <div className="bg-amber-50 border-2 border-amber-200 text-amber-800 rounded-2xl p-4 text-sm font-bold flex items-center gap-2">
              ⚠️ Your account isn’t assigned to a team yet, so there’s no data to show. Ask an administrator to set your team.
            </div>
          </div>
        )}
        {activeTab === 'billing' && (
          <BillingDesk onViewInvoice={handleViewInvoice} onDirtyChange={handleBillDirty} />
        )}
        {activeTab === 'invoices' && (
          <InvoicesArchive initialInvoiceId={selectedInvoiceId} />
        )}
        {activeTab === 'products' && (
          <ProductsManager />
        )}
        {activeTab === 'customers' && (
          <CustomersManager />
        )}
        {activeTab === 'serials' && (
          <SerialCapture />
        )}
        {activeTab === 'registry' && (
          <SerialRegistry />
        )}
        {activeTab === 'dashboard' && (
          <RegistrationsDashboard onViewInvoice={handleViewInvoice} />
        )}
        {activeTab === 'admin' && isAdmin && (
          <AdminPage />
        )}
      </main>

      {/* Footer (Offset by 280px on desktop) */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto md:ml-[280px] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            © {new Date().getFullYear()} <span className="font-heading font-bold text-[#2563eb]">Crown Excel Electronics</span> • Enterprise Laptops, Phones & Gadgets Platform
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-[#2563eb] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> 0ms Latency Local Cache
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-700 font-semibold">
              <Cloud className="w-3.5 h-3.5 text-[#2563eb]" /> Firebase Offline-First
            </span>
          </div>
        </div>
      </footer>

      {/* --- SYSTEM SETTINGS & DATA MODAL --- */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="⚙️ System Settings & Data Engine"
        subtitle="Configure Firebase cloud sync, backup database, or reset demo data."
        icon={Database}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          
          {/* Section 1: Firebase Cloud Configuration */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-[#2563eb]" />
                <h4 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">
                  Firebase Console Cloud Synchronization
                </h4>
              </div>
              <span className="bg-blue-50 text-[#2563eb] border border-blue-200 font-bold px-2.5 py-0.5 rounded text-[10px] uppercase">Dual-Mode Engine</span>
            </div>

            <p className="text-xs font-semibold text-slate-600">
              The app currently runs in <b>High-Speed Local IndexedDB Mode</b> with zero latency. When you are ready to link your Firebase Console project for cloud backup across devices, paste your API config below:
            </p>

            <form onSubmit={handleSaveFirebaseConfig} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">API Key</label>
                  <input
                    type="text"
                    value={firebaseConfig?.apiKey || ''}
                    onChange={(e) => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })}
                    className="input-field text-xs font-mono py-2 bg-white border-slate-300 font-bold text-slate-900"
                    placeholder="AIzaSy..."
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase block mb-1">Project ID</label>
                  <input
                    type="text"
                    value={firebaseConfig?.projectId || ''}
                    onChange={(e) => setFirebaseConfig({ ...firebaseConfig, projectId: e.target.value })}
                    className="input-field text-xs font-mono py-2 font-bold text-[#2563eb] bg-white border-slate-300"
                    placeholder="crown-excel-general"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2">
                {configSaved ? (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Firebase configuration updated!
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-500">Offline persistence is enabled automatically.</span>
                )}
                <button type="submit" className="btn btn-secondary py-2 text-xs self-end sm:self-center font-bold">
                  <Key className="w-3.5 h-3.5" /> Save Firebase Keys
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Data Backup & Restore */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h4 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">
                  Local Database Management & Backup
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportJSON}
                className="btn btn-outline py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50"
              >
                <Download className="w-4 h-4 text-emerald-600" /> Export Full Backup (JSON)
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="btn btn-outline text-amber-600 border-amber-300 hover:bg-amber-50 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" /> Reset to Demo Database
                </button>
              )}
            </div>

            {/* Import Box (admin only — restores products/customers/invoices; the serial
                registry is create-only in the cloud and is never restored from backups) */}
            {isAdmin && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-[11px] font-black text-slate-700 uppercase block">
                  Restore from JSON Backup
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste JSON backup string here..."
                    className="input-field text-xs font-mono py-2 flex-1 bg-white border-slate-300 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleImportJSON}
                    disabled={!importText.trim()}
                    className="btn btn-primary py-2 px-4 text-xs font-bold whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" /> Restore Data
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: One-time Team Migration (admin) */}
          {isAdmin && (
            <div className="p-6 rounded-2xl bg-white border border-blue-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ShieldCheck className="w-5 h-5 text-[#2563eb]" />
                <h4 className="font-heading font-black text-sm text-slate-900 uppercase tracking-wider">
                  Team Migration (one-time)
                </h4>
              </div>
              <p className="text-xs font-semibold text-slate-600">
                Tags all existing data with a team. Invoices &amp; serials keep the team that created them;
                choose which team owns the existing shared products &amp; partners.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={migrateTeam}
                  onChange={(e) => setMigrateTeam(e.target.value)}
                  className="input-field py-2 text-xs font-bold bg-white border-slate-300 flex-1"
                >
                  <option value="">Products &amp; partners → pick a team…</option>
                  {[...new Set(storageService.getActiveLocations().map((l) => l.team).filter(Boolean))].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleMigrate}
                  disabled={migrating || !migrateTeam}
                  className="btn btn-primary py-2 px-4 text-xs font-bold whitespace-nowrap disabled:opacity-60"
                >
                  {migrating ? 'Migrating…' : 'Run Migration'}
                </button>
              </div>
              {migrateReport && (
                <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  ✓ Done — products {migrateReport.products}, partners {migrateReport.customers}, invoices {migrateReport.invoices}, serials {migrateReport.serials}
                  {migrateReport.serialsFailed ? `, serials failed ${migrateReport.serialsFailed}` : ''}.
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="btn btn-primary font-bold px-6 py-2.5"
            >
              Close Settings
            </button>
          </div>

        </div>
      </Modal>

    </div>
    </AuthGate>
  );
}
export default App;
