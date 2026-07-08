import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, subtitle, icon: Icon, children, maxWidth = 'max-w-md' }) => {
  const closeButtonRef = useRef(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`);

  // Runs only on the actual open/close transition (not on every parent re-render,
  // which would otherwise happen whenever `onClose` gets a new inline function identity
  // — e.g. on every keystroke in a field inside the modal — and steal focus back mid-typing).
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-scale-in">

      {/* Modal Box */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        className={`modal-box w-full ${maxWidth} bg-white border-2 border-slate-300 shadow-2xl rounded-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Modal Header */}
        <div className="modal-header no-print flex items-center justify-between px-6 py-4 border-b-2 border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2.5 rounded-xl bg-[#2563eb]/10 text-[#2563eb] border-2 border-[#2563eb]/25 font-bold">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 id={titleId.current} className="font-heading font-black text-lg text-slate-900 tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs font-bold text-slate-600 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 border-2 border-transparent hover:border-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body p-6 max-h-[80vh] overflow-y-auto text-slate-900 font-medium">
          {children}
        </div>

      </div>
    </div>
  );
};
