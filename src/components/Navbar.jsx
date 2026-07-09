import React, { useState, useEffect } from 'react';
import {
  Crown,
  Receipt,
  Archive,
  Package,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Plus,
  Settings,
  BarChart3,
  ShieldCheck,
  ScanLine,
  UserCog,
  LogOut,
  AlertTriangle
} from 'lucide-react';
import { audioService } from '../services/audio';
import { storageService } from '../services/storage';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ activeTab, setActiveTab, onOpenSettings }) => {
  const { user, isAdmin, signOut } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [soundEnabled, setSoundEnabled] = useState(audioService.enabled);
  const [stats, setStats] = useState(storageService.getDashboardStats());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [syncIssue, setSyncIssue] = useState(null);

  useEffect(() => {
    const handleNetwork = (e) => setIsOnline(e.detail?.online ?? navigator.onLine);
    window.addEventListener('network-status-change', handleNetwork);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    const handleDataChange = () => setStats(storageService.getDashboardStats());
    window.addEventListener('crown-data-change', handleDataChange);

    // A cloud/local save failed permanently (not just offline) — surface it so it isn't lost.
    const handleSyncError = (e) => setSyncIssue({ message: e.detail?.message || 'A save did not reach the cloud.', at: Date.now() });
    window.addEventListener('crown-sync-error', handleSyncError);
    window.addEventListener('crown-storage-error', handleSyncError);

    // Refresh stats & clock; self-clear a stale sync warning after 30s of quiet.
    const interval = setInterval(() => {
      setStats(storageService.getDashboardStats());
      setCurrentTime(new Date());
      setSyncIssue((cur) => (cur && Date.now() - cur.at > 30000 ? null : cur));
    }, 1000);

    return () => {
      window.removeEventListener('network-status-change', handleNetwork);
      window.removeEventListener('crown-data-change', handleDataChange);
      window.removeEventListener('crown-sync-error', handleSyncError);
      window.removeEventListener('crown-storage-error', handleSyncError);
      clearInterval(interval);
    };
  }, []);

  const handleToggleSound = () => {
    const newState = audioService.toggleSound();
    setSoundEnabled(newState);
    if (newState) audioService.playBeep();
  };

  const navSections = [
    {
      label: 'CORE PLATFORM',
      items: [
        { id: 'billing', label: 'Billing Desk', icon: Receipt, badge: 'ACTIVE' },
        { id: 'invoices', label: 'Invoices Archive', icon: Archive, count: stats.invoicesCount },
        { id: 'products', label: 'Products & IMEIs', icon: Package, count: stats.productsCount },
        { id: 'customers', label: 'Customers CRM', icon: Users, count: stats.customersCount },
      ]
    },
    {
      label: 'WARRANTY REGISTRY',
      items: [
        { id: 'serials', label: 'Serial Capture', icon: ScanLine },
        { id: 'registry', label: 'Serial Registry', icon: ShieldCheck, count: stats.serialsCount },
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3, alert: stats.openQueries },
      ]
    },
    ...(isAdmin ? [{
      label: 'ADMINISTRATION',
      items: [
        { id: 'admin', label: 'Staff & Locations', icon: UserCog },
      ]
    }] : [])
  ];

  // Flat list for the mobile bottom bar (labels shortened to fit)
  const mobileNavItems = navSections.flatMap((s) => s.items);

  const getPageTitle = () => {
    switch (activeTab) {
      case 'billing': return 'Billing Desk & Checkout';
      case 'invoices': return 'Invoices & Warranty Archive';
      case 'products': return 'Products & IMEIs Catalog Manager';
      case 'customers': return 'Customers CRM Database';
      case 'serials': return 'Serial Number Capture';
      case 'registry': return 'Serial Registry & Warranty Search';
      case 'dashboard': return 'Registrations Dashboard';
      case 'admin': return 'Staff, Locations & Audit Trail';
      default: return 'Enterprise Dashboard';
    }
  };

  return (
    <>
      {/* --- DESKTOP 280px LEFT SIDEBAR (Stitch Elegant Minimalist Spec) --- */}
      <nav className="hidden md:flex bg-white h-screen w-[280px] fixed left-0 top-0 border-r-2 border-slate-300 flex-col z-40 shadow-md">

        {/* Brand Header */}
        <div className="p-6 border-b-2 border-slate-200 flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('billing')}>
          <div className="w-10 h-10 rounded-xl bg-[#2563eb] flex items-center justify-center shadow-md shadow-blue-500/30 text-white">
            <Crown className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-heading font-black text-lg text-slate-900 tracking-tight leading-none">
              Crown Excel
            </h1>
            <span className="text-[10px] font-extrabold text-[#2563eb] tracking-widest uppercase mt-1 block">
              GENERAL ELECTRONICS
            </span>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="p-5">
          <button
            onClick={() => setActiveTab('billing')}
            className="w-full bg-[#2563eb] text-white font-heading font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all duration-150 shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35"
          >
            <Receipt className="w-4 h-4" />
            <span>Quick Checkout Desk</span>
          </button>
        </div>

        {/* Navigation Links (grouped, role-aware) */}
        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1.5">
          {navSections.map((section) => (
            <React.Fragment key={section.label}>
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-3 mb-1 mt-2 first:mt-0">
                {section.label}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl font-heading text-sm font-semibold transition-all duration-150 text-left ${
                      isActive
                        ? 'bg-[#2563eb]/10 text-[#2563eb] font-extrabold border-2 border-[#2563eb]/30 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#2563eb]' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.count !== undefined && (
                      <span className={`px-2 py-0.5 text-[11px] rounded-full font-bold ${
                        isActive ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.count}
                      </span>
                    )}
                    {item.badge && !item.count && !item.alert && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-[#2563eb] rounded font-bold uppercase tracking-wider">
                        {item.badge}
                      </span>
                    )}
                    {item.alert > 0 && (
                      <span
                        title={`${item.alert} open ${item.alert === 1 ? 'query' : 'queries'}`}
                        className="min-w-[20px] px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-black text-center animate-pulse"
                      >
                        {item.alert}
                      </span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Sidebar Bottom Controls */}
        <div className="p-4 border-t-2 border-slate-200 bg-slate-50 flex flex-col gap-2">

          {/* A save that didn't reach the cloud — surfaced so it can never be silently lost.
              Only shows on a real (non-transient) failure and clears itself once things recover. */}
          {syncIssue && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border-2 border-red-300 text-[11px] font-black text-red-600" title={syncIssue.message} role="alert">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">A save didn't sync — check connection</span>
            </div>
          )}

          {/* Offline / Sync Status */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border-2 border-slate-200 text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Cloud Sync Active</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                  <span>0ms Offline Mode</span>
                </>
              )}
            </span>
          </div>

          {/* Sound & Settings Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSound}
              title="Toggle Audio Feedback"
              className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                soundEnabled
                  ? 'bg-blue-50 text-[#2563eb] border-blue-300 font-extrabold'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{soundEnabled ? 'Audio On' : 'Muted'}</span>
            </button>

            <button
              onClick={onOpenSettings}
              title="System Settings & Database"
              aria-label="Open system settings"
              className="py-2 px-3 rounded-lg bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center"
            >
              <Settings className="w-4 h-4 text-slate-600" />
            </button>
          </div>

        </div>
      </nav>

      {/* --- DESKTOP TOP HEADER BAR (Stitch Elegant Minimalist Spec) --- */}
      <header className="hidden md:flex bg-white/90 backdrop-blur-md sticky top-0 z-30 border-b-2 border-slate-300 justify-between items-center px-8 h-20 w-full md:ml-[280px] md:w-[calc(100%-280px)] shadow-sm">

        {/* Current Screen Title */}
        <div className="flex items-center gap-3">
          <h2 className="font-heading font-black text-2xl text-slate-900 tracking-tight">
            {getPageTitle()}
          </h2>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-5">

          {/* Live Clock & 0ms Badge */}
          <div className="text-right font-mono">
            <div className="text-xs font-extrabold text-slate-800">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[10px] text-[#2563eb] font-sans font-bold flex items-center justify-end gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>IndexedDB Live Engine</span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('billing')}
            className="bg-white border-2 border-slate-300 text-slate-800 px-4 py-2 rounded-lg font-heading font-extrabold text-xs hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-[#2563eb]" />
            <span>New Invoice</span>
          </button>

          {/* Signed-in staff chip + sign out */}
          <div className="flex items-center gap-2.5 pl-3 border-l-2 border-slate-200">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || user.email}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border-2 border-blue-300 shadow-sm object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-blue-50 border-2 border-blue-300 flex items-center justify-center font-heading font-extrabold text-sm text-[#2563eb] shadow-sm">
                {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="text-left leading-tight max-w-[140px]">
              <div className="text-xs font-heading font-extrabold text-slate-900 truncate" title={user?.email}>
                {user?.displayName || user?.email}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mt-0.5 ${
                isAdmin ? 'bg-blue-100 text-[#2563eb]' : 'bg-slate-100 text-slate-600'
              }`}>
                {isAdmin ? 'Administrator' : 'Standard User'}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg bg-white text-slate-500 border-2 border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* --- MOBILE TOP & BOTTOM NAV --- */}
      <div className="md:hidden">
        {/* Mobile Top Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b-2 border-slate-300 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2" onClick={() => setActiveTab('billing')}>
            <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center text-white">
              <Crown className="w-5 h-5" />
            </div>
            <span className="font-heading font-black text-base text-slate-900">CROWN EXCEL</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleSound} aria-label={soundEnabled ? 'Mute audio feedback' : 'Enable audio feedback'} className="p-2 rounded-lg border-2 border-slate-200 bg-white">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-[#2563eb]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>
            <button onClick={onOpenSettings} aria-label="Open system settings" className="p-2 rounded-lg border-2 border-slate-200 bg-white">
              <Settings className="w-4 h-4 text-slate-700" />
            </button>
            <button onClick={() => signOut()} aria-label="Sign out" className="p-2 rounded-lg border-2 border-slate-200 bg-white">
              <LogOut className="w-4 h-4 text-slate-700" />
            </button>
          </div>
        </header>

        {/* Mobile Bottom Navigation Bar (scrollable — 8 destinations no longer fit statically) */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-slate-300 px-2 py-1.5 flex gap-1 overflow-x-auto shadow-lg">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-semibold flex-shrink-0 ${
                  isActive ? 'text-[#2563eb] font-extrabold' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#2563eb]' : 'text-slate-400'}`} />
                <span className="whitespace-nowrap">{item.label.replace('Invoices Archive', 'Invoices').replace('Products & IMEIs', 'Products').replace('Customers CRM', 'Customers').replace('Staff & Locations', 'Admin')}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
};
