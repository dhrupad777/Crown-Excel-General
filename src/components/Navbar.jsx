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
  Database,
  Cpu,
  Smartphone,
  Laptop,
  Zap
} from 'lucide-react';
import { audioService } from '../services/audio';
import { storageService } from '../services/storage';

export const Navbar = ({ activeTab, setActiveTab, onOpenSettings }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [soundEnabled, setSoundEnabled] = useState(audioService.enabled);
  const [stats, setStats] = useState(storageService.getDashboardStats());
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const handleNetwork = (e) => setIsOnline(e.detail?.online ?? navigator.onLine);
    window.addEventListener('network-status-change', handleNetwork);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    // Refresh stats & clock
    const interval = setInterval(() => {
      setStats(storageService.getDashboardStats());
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.removeEventListener('network-status-change', handleNetwork);
      clearInterval(interval);
    };
  }, []);

  const handleToggleSound = () => {
    const newState = audioService.toggleSound();
    setSoundEnabled(newState);
    if (newState) audioService.playBeep();
  };

  const navItems = [
    { id: 'billing', label: 'Billing Desk', icon: Receipt, badge: 'F2', color: 'text-emerald' },
    { id: 'invoices', label: 'Invoices Archive', icon: Archive, count: stats.invoicesCount, color: 'text-cyan' },
    { id: 'products', label: 'Products & IMEIs', icon: Package, count: stats.productsCount, color: 'text-purple-400' },
    { id: 'customers', label: 'Customers CRM', icon: Users, count: stats.customersCount, color: 'text-amber-400' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 bg-[#04070d]/90 backdrop-blur-2xl shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveTab('billing')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 glow-border group-hover:scale-105 transition-transform">
              <Crown className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-lg tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  CROWN EXCEL
                </span>
                <span className="badge badge-success text-[10px] px-2 py-0.5 shadow-sm">ELECTRONICS</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-cyan-400" />
                <span>Laptops, Phones & Gadgets Billing</span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-2xl border border-white/10 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-heading text-sm font-semibold transition-all duration-250 ${
                    isActive 
                      ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-white border border-emerald-500/50 shadow-md shadow-emerald-500/15 scale-[1.02]' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400 animate-bounce' : ''}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded font-mono border border-white/10">
                      {item.badge}
                    </span>
                  )}
                  {item.count !== undefined && (
                    <span className="ml-0.5 px-2 py-0.5 text-[11px] bg-emerald-500/15 text-emerald-400 rounded-full font-bold border border-emerald-500/30">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            
            {/* Live Clock Ticker */}
            <div className="hidden lg:flex flex-col items-end justify-center px-3 py-1 rounded-xl bg-slate-900/60 border border-white/5 text-right font-mono">
              <span className="text-xs font-bold text-slate-200">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>0ms Local Cache</span>
              </span>
            </div>

            {/* Network / Offline Status Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10">
              {isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-300">Cloud Sync Active</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">Offline • 0ms Engine</span>
                </>
              )}
            </div>

            {/* Audio Feedback Toggle */}
            <button
              onClick={handleToggleSound}
              title={soundEnabled ? "Scanner Sound On (Click to mute)" : "Scanner Sound Muted"}
              className={`p-2.5 rounded-xl border transition-all shadow-sm ${
                soundEnabled 
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 glow-border' 
                  : 'bg-slate-900 text-slate-500 border-white/10 hover:text-slate-300'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Settings & Demo Data Button */}
            <button
              onClick={onOpenSettings}
              title="System Settings & Data Backup"
              className="p-2.5 rounded-xl bg-slate-900 text-slate-300 border border-white/10 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Database className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-heading font-semibold hidden xl:inline">Settings</span>
            </button>
          </div>

        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-white/10 overflow-x-auto gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
