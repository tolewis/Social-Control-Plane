'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProviderIcon, IconChevronLeft, IconChevronRight } from '../_components/icons';
import { StatusPill } from '../_components/ui';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { useJobs } from '../hooks/useJobs';
import type { ConnectionRecord, PublishJobRecord } from '../_lib/api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS_ALL = Array.from({ length: 24 }, (_, i) => i);
const WORK_START = 6;  // 6 AM
const WORK_END = 22;   // 10 PM
const HOURS_WORK = HOURS_ALL.filter((h) => h >= WORK_START && h < WORK_END);

// Golden posting windows (peak engagement across platforms)
const GOLDEN_WINDOWS = [
  { start: 7, end: 9, label: '7–9 AM' },
  { start: 11, end: 13, label: '11 AM–1 PM' },
  { start: 17, end: 19, label: '5–7 PM' },
];

function isGoldenHour(h: number): boolean {
  return GOLDEN_WINDOWS.some((w) => h >= w.start && h < w.end);
}

type CalendarView = 'month' | 'week' | 'day' | 'timeline';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Date[] = [];
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return days;
}

function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(start.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

type CalendarItem = {
  id: string;
  date: Date;
  content: string;
  provider: string;
  displayName: string;
  status: 'published' | 'queued' | 'failed' | 'draft';
};

function dotTone(status: CalendarItem['status']): string {
  switch (status) {
    case 'published': return 'ok';
    case 'queued': return 'info';
    case 'failed': return 'err';
    case 'draft': return 'warn';
  }
}

function pillTone(status: CalendarItem['status']): 'ok' | 'info' | 'err' | 'warn' {
  switch (status) {
    case 'published': return 'ok';
    case 'queued': return 'info';
    case 'failed': return 'err';
    case 'draft': return 'warn';
  }
}

function statusColor(status: CalendarItem['status']): string {
  switch (status) {
    case 'published': return 'var(--ok)';
    case 'queued': return 'var(--info)';
    case 'failed': return 'var(--err)';
    case 'draft': return 'var(--warn)';
  }
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function MonthView({
  calendarDays, viewMonth, today, selectedDate, setSelectedDate, itemsByDate,
}: {
  calendarDays: Date[];
  viewMonth: number;
  today: Date;
  selectedDate: Date | null;
  setSelectedDate: (d: Date) => void;
  itemsByDate: Map<string, CalendarItem[]>;
}) {
  return (
    <div className="calendarGrid">
      {DAY_NAMES.map((d) => (
        <div key={d} className="calendarDayHeader">{d}</div>
      ))}
      {calendarDays.map((day, i) => {
        const isCurrentMonth = day.getMonth() === viewMonth;
        const isToday = sameDay(day, today);
        const isSelected = selectedDate ? sameDay(day, selectedDate) : false;
        const dateKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
        const dayItems = itemsByDate.get(dateKey) || [];

        let cellClass = 'calendarCell';
        if (!isCurrentMonth) cellClass += ' otherMonth';
        if (isToday) cellClass += ' today';
        if (isSelected) cellClass += ' selected';

        return (
          <div
            key={i}
            className={cellClass}
            onClick={() => setSelectedDate(day)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDate(day); }}
          >
            <div className="calendarDayNum">{day.getDate()}</div>
            {dayItems.length > 0 && (
              <div className="calendarDots">
                {dayItems.slice(0, 6).map((item) => (
                  <div key={item.id} className={`calendarDot ${dotTone(item.status)}`} title={`${item.provider}: ${item.content.slice(0, 40)}`} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GoldenHoursLegend() {
  return (
    <div className="goldenLegend">
      <span className="goldenLegendLabel">Peak windows</span>
      {GOLDEN_WINDOWS.map((w) => (
        <span key={w.label} className="goldenLegendChip">{w.label}</span>
      ))}
    </div>
  );
}

function WeekView({
  weekDays, today, itemsByDate,
}: {
  weekDays: Date[];
  today: Date;
  itemsByDate: Map<string, CalendarItem[]>;
}) {
  return (
    <>
      <GoldenHoursLegend />
      <div className="weekViewWrap">
        <div className="weekGrid">
          {/* Day headers */}
          <div className="weekTimeCol weekHeader" />
          {weekDays.map((day, i) => {
            const isToday = sameDay(day, today);
            return (
              <div key={i} className={`weekDayHeader${isToday ? ' today' : ''}`}>
                <span className="weekDayName">{DAY_NAMES[day.getDay()]}</span>
                <span className={`weekDayNum${isToday ? ' today' : ''}`}>{day.getDate()}</span>
              </div>
            );
          })}

          {/* Hour rows — working hours only */}
          {HOURS_WORK.map((h) => {
            const golden = isGoldenHour(h);
            return (
              <>
                <div key={`t-${h}`} className={`weekTimeLabel${golden ? ' golden' : ''}`}>{formatHour(h)}</div>
                {weekDays.map((day, di) => {
                  const dateKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                  const dayItems = (itemsByDate.get(dateKey) || []).filter(
                    (item) => item.date.getHours() === h,
                  );
                  return (
                    <div key={`${h}-${di}`} className={`weekHourCell${golden ? ' golden' : ''}`}>
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          className="weekEvent"
                          style={{ borderLeftColor: statusColor(item.status) }}
                          title={item.content}
                        >
                          <ProviderIcon provider={item.provider} size={14} />
                          <span className="weekEventText">{item.content.slice(0, 30)}{item.content.length > 30 ? '…' : ''}</span>
                          <span className="weekEventTime">{item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DayView({
  viewDate, today, itemsByDate,
}: {
  viewDate: Date;
  today: Date;
  itemsByDate: Map<string, CalendarItem[]>;
}) {
  const dateKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}-${viewDate.getDate()}`;
  const dayItems = itemsByDate.get(dateKey) || [];
  const isToday = sameDay(viewDate, today);
  const nowHour = today.getHours();
  const nowMinute = today.getMinutes();

  return (
    <div className="dayViewWrap">
      <div className="dayViewTitle">
        {viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <GoldenHoursLegend />
      <div className="dayGrid">
        {HOURS_WORK.map((h) => {
          const hourItems = dayItems.filter((item) => item.date.getHours() === h);
          const golden = isGoldenHour(h);
          return (
            <div key={h} className={`dayHourRow${golden ? ' golden' : ''}`}>
              <div className={`dayTimeLabel${golden ? ' golden' : ''}`}>{formatHour(h)}</div>
              <div className="dayHourSlot">
                {isToday && h === nowHour && (
                  <div className="dayNowLine" style={{ top: `${(nowMinute / 60) * 100}%` }}>
                    <div className="dayNowDot" />
                  </div>
                )}
                {hourItems.map((item) => (
                  <div
                    key={item.id}
                    className="dayEvent"
                    style={{ borderLeftColor: statusColor(item.status), top: `${(item.date.getMinutes() / 60) * 100}%` }}
                  >
                    <div className="dayEventHeader">
                      <ProviderIcon provider={item.provider} size={16} />
                      <span className="dayEventName">{item.displayName}</span>
                      <span className="dayEventTime">{item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      <StatusPill tone={pillTone(item.status)}>{item.status}</StatusPill>
                    </div>
                    <div className="dayEventContent">{item.content.slice(0, 100)}{item.content.length > 100 ? '…' : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({
  viewDate, today, itemsByDate,
}: {
  viewDate: Date;
  today: Date;
  itemsByDate: Map<string, CalendarItem[]>;
}) {
  const dateKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}-${viewDate.getDate()}`;
  const dayItems = itemsByDate.get(dateKey) || [];
  const isToday = sameDay(viewDate, today);
  const nowHour = today.getHours();
  const nowMinute = today.getMinutes();
  const nowPct = ((nowHour * 60 + nowMinute) / (24 * 60)) * 100;

  const totalMinutes = (WORK_END - WORK_START) * 60;

  return (
    <div className="timelineWrap">
      <div className="dayViewTitle">
        {viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <GoldenHoursLegend />
      <div className="timelineContainer">
        {/* Hour markers — working hours only */}
        {HOURS_WORK.map((h) => {
          const golden = isGoldenHour(h);
          return (
            <div key={h} className={`timelineHourMark${golden ? ' golden' : ''}`} style={{ top: `${((h - WORK_START) / (WORK_END - WORK_START)) * 100}%` }}>
              <span className={`timelineHourLabel${golden ? ' golden' : ''}`}>{formatHour(h)}</span>
              <div className={`timelineHourLine${golden ? ' golden' : ''}`} />
            </div>
          );
        })}

        {/* Golden hour background bands */}
        {GOLDEN_WINDOWS.map((w) => {
          const topPct = ((w.start - WORK_START) / (WORK_END - WORK_START)) * 100;
          const heightPct = ((w.end - w.start) / (WORK_END - WORK_START)) * 100;
          return (
            <div
              key={w.label}
              className="timelineGoldenBand"
              style={{ top: `${topPct}%`, height: `${heightPct}%` }}
            />
          );
        })}

        {/* Now indicator */}
        {isToday && nowHour >= WORK_START && nowHour < WORK_END && (
          <div className="timelineNow" style={{ top: `${((nowHour * 60 + nowMinute - WORK_START * 60) / totalMinutes) * 100}%` }}>
            <div className="timelineNowDot" />
            <div className="timelineNowLine" />
          </div>
        )}

        {/* Events positioned absolutely by time */}
        {dayItems.filter((item) => item.date.getHours() >= WORK_START && item.date.getHours() < WORK_END).map((item) => {
          const minutes = item.date.getHours() * 60 + item.date.getMinutes() - WORK_START * 60;
          const topPct = (minutes / totalMinutes) * 100;
          return (
            <div
              key={item.id}
              className="timelineEvent"
              style={{ top: `${topPct}%`, borderLeftColor: statusColor(item.status) }}
            >
              <div className="timelineEventHeader">
                <ProviderIcon provider={item.provider} size={16} />
                <span className="timelineEventName">{item.displayName}</span>
                <span className="timelineEventTime">
                  {item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <StatusPill tone={pillTone(item.status)}>{item.status}</StatusPill>
              </div>
              <div className="timelineEventContent">
                {item.content.slice(0, 120)}{item.content.length > 120 ? '…' : ''}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {dayItems.length === 0 && (
          <div className="timelineEmpty">
            <p className="subtle">No posts scheduled for this day.</p>
            <a href="/compose" className="ctaBtn" style={{ marginTop: 8 }}>+ Schedule a post</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { drafts, loading: draftLoading, error: draftError } = useDrafts();
  const { connections, loading: connLoading } = useConnections();
  const { jobs, loading: jobLoading } = useJobs();

  const loading = draftLoading || connLoading || jobLoading;

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  const [view, setView] = useState<CalendarView>('month');

  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const viewDate = selectedDate || today;
  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = [];
    for (const draft of drafts) {
      const dateStr = draft.scheduledFor || draft.createdAt;
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) continue;

      const conn = connections.find((c: ConnectionRecord) => c.id === draft.connectionId);
      const job = jobs.find((j: PublishJobRecord) => j.draftId === draft.id);

      let status: CalendarItem['status'] = draft.status as CalendarItem['status'];
      if (job?.status === 'succeeded') status = 'published';
      else if (job?.status === 'failed') status = 'failed';
      else if (draft.status === 'queued') status = 'queued';
      else if (draft.status === 'draft') status = 'draft';

      items.push({
        id: draft.id,
        date,
        content: draft.content,
        provider: conn?.provider ?? '?',
        displayName: conn?.displayName ?? conn?.provider ?? '?',
        status,
      });
    }
    return items;
  }, [drafts, connections, jobs]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of calendarItems) {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}-${item.date.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [calendarItems]);

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
    return itemsByDate.get(key) || [];
  }, [selectedDate, itemsByDate]);

  // Navigation
  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }, [viewMonth]);

  const prevPeriod = useCallback(() => {
    if (view === 'month') { prevMonth(); return; }
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setSelectedDate(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [view, selectedDate, prevMonth]);

  const nextPeriod = useCallback(() => {
    if (view === 'month') { nextMonth(); return; }
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setSelectedDate(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [view, selectedDate, nextMonth]);

  const goToday = useCallback(() => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today);
  }, [today]);

  // Header label
  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    if (view === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [view, viewMonth, viewYear, weekDays, viewDate]);

  if (loading) {
    return (
      <section>
        <h1 className="pageTitle">Calendar</h1>
        <p className="subtle">Loading...</p>
      </section>
    );
  }

  if (draftError) {
    return (
      <section>
        <h1 className="pageTitle">Calendar</h1>
        <StatusPill tone="err">{draftError}</StatusPill>
      </section>
    );
  }

  return (
    <section>
      <h1 className="pageTitle">Calendar</h1>

      {/* View switcher */}
      <div className="calViewSwitcher">
        {(['month', 'week', 'day', 'timeline'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? 'calViewBtn active' : 'calViewBtn'}
            onClick={() => setView(v)}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="calendarHeader" style={{ marginTop: 12 }}>
        <div className="calendarHeaderActions">
          <button type="button" className="btn ghost" onClick={prevPeriod} aria-label="Previous">
            <IconChevronLeft width={18} height={18} />
          </button>
          <span className="calendarHeaderTitle">{headerLabel}</span>
          <button type="button" className="btn ghost" onClick={nextPeriod} aria-label="Next">
            <IconChevronRight width={18} height={18} />
          </button>
        </div>
        <button type="button" className="btn" onClick={goToday}>Today</button>
      </div>

      {/* Views */}
      {view === 'month' && (
        <>
          <MonthView
            calendarDays={calendarDays}
            viewMonth={viewMonth}
            today={today}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            itemsByDate={itemsByDate}
          />
          {selectedDate && (
            <div className="calendarDetail">
              <div className="calendarDetailTitle">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              {selectedItems.length === 0 ? (
                <>
                  <p className="subtle">No posts scheduled for this day.</p>
                  <a href="/compose" className="ctaBtn" style={{ marginTop: 12 }}>+ Schedule a post</a>
                </>
              ) : (
                selectedItems.map((item) => (
                  <div key={item.id} className="calendarDetailItem">
                    <ProviderIcon provider={item.provider} size={20} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {item.content.slice(0, 80)}{item.content.length > 80 ? '…' : ''}
                      </div>
                      <div className="subtle" style={{ fontSize: '0.85rem' }}>
                        {item.displayName} &middot; {item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <StatusPill tone={pillTone(item.status)}>{item.status}</StatusPill>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {view === 'week' && (
        <WeekView weekDays={weekDays} today={today} itemsByDate={itemsByDate} />
      )}

      {view === 'day' && (
        <DayView viewDate={viewDate} today={today} itemsByDate={itemsByDate} />
      )}

      {view === 'timeline' && (
        <TimelineView viewDate={viewDate} today={today} itemsByDate={itemsByDate} />
      )}
    </section>
  );
}
