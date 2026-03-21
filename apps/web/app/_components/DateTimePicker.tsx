'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function pad2(n: number) { return n.toString().padStart(2, '0'); }

/** Parse "YYYY-MM-DDTHH:mm" → Date (local), or null */
function parseDatetimeLocal(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Format Date → "YYYY-MM-DDTHH:mm" */
function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Build 6-week grid for a given month */
function calendarGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  // Leading blanks
  for (let i = 0; i < startDow; i++) cells.push(null);
  // Days
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // Trailing blanks to fill rows
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Time options — every 15 min from 6 AM to 10 PM                    */
/* ------------------------------------------------------------------ */

type TimeSlot = { hour: number; minute: number; label: string };

const TIME_SLOTS: TimeSlot[] = (() => {
  const slots: TimeSlot[] = [];
  for (let h = 6; h < 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hr12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      slots.push({ hour: h, minute: m, label: `${hr12}:${pad2(m)} ${ampm}` });
    }
  }
  return slots;
})();

const GOLDEN_HOURS = new Set([7, 8, 11, 12, 17, 18]);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Props = {
  value: string;             // "YYYY-MM-DDTHH:mm" or ""
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  style?: React.CSSProperties;
};

export function DateTimePicker({ value, onChange, id, placeholder, style }: Props) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'date' | 'time'>('date');
  const ref = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseDatetimeLocal(value), [value]);
  const today = useMemo(() => new Date(), []);

  // Calendar state — which month we're viewing
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  // Sync view when value changes externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [parsed]);

  const grid = useMemo(() => calendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; });
  }, []);

  const selectDay = useCallback((d: Date) => {
    const hour = parsed?.getHours() ?? 9;
    const minute = parsed?.getMinutes() ?? 0;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
    onChange(toDatetimeLocal(next));
    setPanel('time');
  }, [parsed, onChange]);

  const selectTime = useCallback((slot: TimeSlot) => {
    const base = parsed ?? today;
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), slot.hour, slot.minute);
    onChange(toDatetimeLocal(next));
    setOpen(false);
  }, [parsed, today, onChange]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  }, [onChange]);

  // Display text
  const displayText = parsed
    ? parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' at '
      + parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className={`dtPicker${open ? ' open' : ''}`} ref={ref} style={style}>
      <button
        type="button"
        id={id}
        className="dtTrigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open); setPanel('date'); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dtIcon">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {displayText ? (
          <span className="dtValue">{displayText}</span>
        ) : (
          <span className="dtPlaceholder">{placeholder ?? 'Pick date & time'}</span>
        )}
        {parsed && (
          <span className="dtClear" role="button" tabIndex={0} onClick={clear} onKeyDown={(e) => { if (e.key === 'Enter') clear(e as unknown as React.MouseEvent); }} title="Clear">
            ×
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dtChevron">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="dtDropdown">
          {/* Tab bar */}
          <div className="dtTabs">
            <button type="button" className={`dtTab${panel === 'date' ? ' active' : ''}`} onClick={() => setPanel('date')}>Date</button>
            <button type="button" className={`dtTab${panel === 'time' ? ' active' : ''}`} onClick={() => setPanel('time')}>Time</button>
          </div>

          {panel === 'date' ? (
            <div className="dtCalendar">
              {/* Month nav */}
              <div className="dtMonthNav">
                <button type="button" className="dtNavBtn" onClick={prevMonth} aria-label="Previous month">‹</button>
                <span className="dtMonthLabel">{MONTHS[viewMonth]} {viewYear}</span>
                <button type="button" className="dtNavBtn" onClick={nextMonth} aria-label="Next month">›</button>
              </div>
              {/* Day headers */}
              <div className="dtDayHeaders">
                {DAYS.map((d) => <span key={d} className="dtDayHeader">{d}</span>)}
              </div>
              {/* Grid */}
              <div className="dtGrid">
                {grid.map((row, ri) => (
                  <div key={ri} className="dtRow">
                    {row.map((cell, ci) => {
                      if (!cell) return <span key={ci} className="dtCell empty" />;
                      const isToday = isSameDay(cell, today);
                      const isSelected = parsed ? isSameDay(cell, parsed) : false;
                      const isPast = cell < today && !isToday;
                      return (
                        <button
                          key={ci}
                          type="button"
                          className={`dtCell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}${isPast ? ' past' : ''}`}
                          onClick={() => selectDay(cell)}
                        >
                          {cell.getDate()}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="dtTimePanel">
              <div className="dtTimeList">
                {TIME_SLOTS.map((slot) => {
                  const isSelected = parsed ? parsed.getHours() === slot.hour && parsed.getMinutes() === slot.minute : false;
                  const isGolden = GOLDEN_HOURS.has(slot.hour);
                  return (
                    <button
                      key={`${slot.hour}-${slot.minute}`}
                      type="button"
                      className={`dtTimeOption${isSelected ? ' selected' : ''}${isGolden ? ' golden' : ''}`}
                      onClick={() => selectTime(slot)}
                    >
                      {slot.label}
                      {isGolden && slot.minute === 0 && <span className="dtGoldenDot" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
