import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a, b) => !!a && !!b && startOfDay(a).getTime() === startOfDay(b).getTime();
const isBetween = (d, start, end) => d.getTime() >= start.getTime() && d.getTime() <= end.getTime();

// Builds a standard 6x7 (42-cell) month grid, including the leading/trailing days from
// adjacent months needed to fill out full weeks (Sunday-start).
const buildMonthGrid = (viewMonth) => {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const QUICK_SELECTS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Records' },
];

// A single-month, booking-site-style date range picker: click a start day, then an end day,
// with in-range/hover-preview highlighting, plus quick-select shortcuts. Four of the five
// shortcuts delegate to the caller's own existing date-filter tabs (rather than recomputing
// that math here) since e.g. "Last 7 Days" is an exact rolling 168-hour window elsewhere in
// this app, and a day-granularity reimplementation here would subtly disagree with it near
// boundary timestamps. Only "This Year" has no existing equivalent, so it computes+applies
// its own range directly.
export const DateRangeCalendar = ({ initialStart, initialEnd, onApplyRange, onSelectExistingTab, onCancel, onClear }) => {
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(() => startOfDay(initialStart || today));
  const [pendingStart, setPendingStart] = useState(initialStart ? startOfDay(initialStart) : null);
  const [pendingEnd, setPendingEnd] = useState(initialEnd ? startOfDay(initialEnd) : null);
  const [hoverDate, setHoverDate] = useState(null);

  const isViewingCurrentMonth = viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  const handleDayClick = (date) => {
    if (date > today) return;
    if (!pendingStart || pendingEnd) {
      setPendingStart(date);
      setPendingEnd(null);
    } else if (date < pendingStart) {
      setPendingStart(date);
      setPendingEnd(null);
    } else {
      setPendingEnd(date);
    }
  };

  const handleQuickSelect = (id) => {
    if (id === 'year') {
      onApplyRange(new Date(today.getFullYear(), 0, 1), today);
    } else {
      onSelectExistingTab(id);
    }
  };

  const formatMonthLabel = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const rangeEnd = pendingEnd || (pendingStart && hoverDate && hoverDate > pendingStart ? hoverDate : null);

  return (
    <div
      className="bg-white border-2 border-slate-300 rounded-2xl shadow-2xl w-[320px] font-body"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {/* Quick-select shortcuts */}
      <div className="p-3 border-b-2 border-slate-200 flex flex-wrap gap-1.5">
        {QUICK_SELECTS.map((qs) => (
          <button
            key={qs.id}
            type="button"
            onClick={() => handleQuickSelect(qs.id)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-heading font-bold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#2563eb] transition-colors"
          >
            {qs.label}
          </button>
        ))}
      </div>

      {/* Month header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading font-black text-sm text-slate-900">{formatMonthLabel(viewMonth)}</span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          disabled={isViewingCurrentMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 px-3">
        {WEEKDAY_LABELS.map((wd) => (
          <div key={wd} className="text-center text-[10px] font-black text-slate-400 uppercase py-1">{wd}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 px-3 pb-3" onMouseLeave={() => setHoverDate(null)}>
        {buildMonthGrid(viewMonth).map(({ date, inMonth }) => {
          const isFuture = date > today;
          const isStart = isSameDay(date, pendingStart);
          const isEnd = isSameDay(date, pendingEnd);
          const inRange = pendingStart && rangeEnd && isBetween(date, pendingStart, rangeEnd);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={isFuture || !inMonth}
              onClick={() => handleDayClick(date)}
              onMouseEnter={() => setHoverDate(date)}
              className={`h-8 rounded-lg text-xs font-bold transition-colors relative
                ${!inMonth ? 'invisible' : ''}
                ${isFuture ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-blue-100 cursor-pointer'}
                ${inRange && !isStart && !isEnd ? 'bg-blue-50 text-[#2563eb] rounded-none' : ''}
                ${(isStart || isEnd) ? 'bg-[#2563eb] text-white hover:bg-[#2563eb] font-black' : ''}
                ${isToday && !isStart && !isEnd ? 'ring-2 ring-inset ring-[#2563eb]/40' : ''}
              `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-3 border-t-2 border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-bold text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1.5"
        >
          <X className="w-3 h-3" /> Clear
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!pendingStart || !pendingEnd}
            onClick={() => onApplyRange(pendingStart, pendingEnd)}
            className="text-xs font-bold text-white bg-[#2563eb] hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
