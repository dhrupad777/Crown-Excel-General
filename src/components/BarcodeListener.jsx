import React, { useEffect, useRef } from 'react';
import { ScanLine, Zap } from 'lucide-react';

export const BarcodeListener = ({ onScan, isEnabled = true }) => {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      // Ignore modifier keys and function keys
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1 && e.key !== 'Enter') {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;

      // If delay between keystrokes exceeds 150ms, reset buffer (it's likely manual typing)
      if (timeDiff > 150) {
        bufferRef.current = '';
        startTimeRef.current = now;
      }

      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        const totalDuration = now - startTimeRef.current;

        // Hardware scanners type 4+ characters very rapidly (under 600ms total duration)
        if (barcode.length >= 3 && totalDuration < 800) {
          e.preventDefault();
          onScan(barcode);
          bufferRef.current = '';
        }
      } else {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onScan, isEnabled]);

  return (
    <div className="scanner-banner mb-6 shadow-md">
      <div className="scanner-laser" />
      <div className="flex items-center gap-3 z-10">
        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
          <ScanLine className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white tracking-wide">
              ⚡ HARDWARE BARCODE SCANNER ACTIVE
            </h4>
            <span className="badge badge-success text-[10px]">0ms Latency</span>
          </div>
          <p className="text-xs text-slate-300">
            Point & shoot barcode scanner anytime. New items will automatically prompt for product registration!
          </p>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2 z-10 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10 text-xs text-slate-300 font-mono">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span>Auto-Detect Ready</span>
      </div>
    </div>
  );
};
