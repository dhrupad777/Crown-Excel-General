import React, { useState } from 'react';
import { 
  Database, 
  RefreshCw, 
  Download, 
  Upload, 
  ShieldCheck, 
  Wifi, 
  CheckCircle2, 
  AlertTriangle,
  HelpCircle,
  FileText,
  Key,
  Cloud
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Modal } from './components/Modal';
import { BillingDesk } from './pages/BillingDesk';
import { InvoicesArchive } from './pages/InvoicesArchive';
import { ProductsManager } from './pages/ProductsManager';
import { CustomersManager } from './pages/CustomersManager';
import { storageService } from './services/storage';
import { firebaseService } from './services/firebase';

export function App() {
  const [activeTab, setActiveTab] = useState('billing');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  
  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [firebaseConfig, setFirebaseConfig] = useState(firebaseService.config);
  const [configSaved, setConfigSaved] = useState(false);
  
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
      storageService.resetToDemoData();
      alert("Database reset to demo state successfully!");
      window.location.reload();
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

  return (
    <div className="min-h-screen flex flex-col bg-[#070b12] text-slate-100">
      
      {/* Top Navigation Bar */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'invoices') setSelectedInvoiceId(null);
        }} 
        onOpenSettings={() => setShowSettings(true)} 
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'billing' && (
          <BillingDesk onViewInvoice={handleViewInvoice} />
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
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950/80 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            © {new Date().getFullYear()} <span className="font-heading font-bold text-emerald-400">Crown Excel Electronics</span> • Enterprise Laptops, Mobile Phones & Gadgets Billing Platform
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> 0ms Latency Local Cache
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-cyan-400">
              <Cloud className="w-3.5 h-3.5" /> Firebase Offline-First
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
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-cyan-400" />
                <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
                  Firebase Console Cloud Synchronization
                </h4>
              </div>
              <span className="badge badge-info text-[10px]">Dual-Mode Engine</span>
            </div>

            <p className="text-xs text-slate-300">
              The app currently runs in <b>High-Speed Local IndexedDB Mode</b> with zero latency. When you are ready to link your Firebase Console project for cloud backup across devices, paste your API config below:
            </p>

            <form onSubmit={handleSaveFirebaseConfig} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">API Key</label>
                  <input
                    type="text"
                    value={firebaseConfig?.apiKey || ''}
                    onChange={(e) => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })}
                    className="input-field text-xs font-mono py-2"
                    placeholder="AIzaSy..."
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Project ID</label>
                  <input
                    type="text"
                    value={firebaseConfig?.projectId || ''}
                    onChange={(e) => setFirebaseConfig({ ...firebaseConfig, projectId: e.target.value })}
                    className="input-field text-xs font-mono py-2 text-cyan-400"
                    placeholder="crown-excel-general"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {configSaved ? (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Firebase configuration updated!
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">Offline persistence is enabled automatically.</span>
                )}
                <button type="submit" className="btn btn-secondary py-1.5 text-xs">
                  <Key className="w-3.5 h-3.5" /> Save Firebase Keys
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Data Backup & Restore */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
                  Local Database Management & Backup
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportJSON}
                className="btn btn-outline py-2.5 text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-400" /> Export Full Backup (JSON)
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="btn btn-outline text-amber-400 border-amber-500/30 hover:bg-amber-500/10 py-2.5 text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Reset to Demo Database
              </button>
            </div>

            {/* Import Box */}
            <div className="pt-3 border-t border-white/5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase block">
                Restore from JSON Backup
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste JSON backup string here..."
                  className="input-field text-xs font-mono py-1.5 flex-1 bg-slate-950"
                />
                <button
                  type="button"
                  onClick={handleImportJSON}
                  disabled={!importText.trim()}
                  className="btn btn-primary py-1.5 px-3 text-xs"
                >
                  <Upload className="w-3.5 h-3.5" /> Restore
                </button>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="btn btn-primary"
            >
              Close Settings
            </button>
          </div>

        </div>
      </Modal>

    </div>
  );
}
export default App;
