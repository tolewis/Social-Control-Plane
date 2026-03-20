'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProviderIcon, IconChevronLeft, IconChevronRight } from '../_components/icons';
import { StatusPill } from '../_components/ui';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { useJobs } from '../hooks/useJobs';
import type { DraftRecord, ConnectionRecord, PublishJobRecord } from '../_lib/api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Date[] = [];
  // Fill from previous month
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  // Fill to complete last week
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return days;
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

export default function CalendarPage() {
  const { drafts, loading: draftLoading, error: draftError } = useDrafts();
  const { connections, loading: connLoading } = useConnections();
  const { jobs, loading: jobLoading } = useJobs();

  const loading = draftLoading || connLoading || jobLoading;

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Map drafts to calendar items
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

  // Group items by date key
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

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const goToday = useCallback(() => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today);
  }, [today]);

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
      <p className="lead">View your scheduled and published posts at a glance.</p>

      <div className="calendarHeader" style={{ marginTop: 16 }}>
        <div className="calendarHeaderActions">
          <button type="button" className="btn ghost" onClick={prevMonth} aria-label="Previous month">
            <IconChevronLeft width={18} height={18} />
          </button>
          <span className="calendarHeaderTitle">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button type="button" className="btn ghost" onClick={nextMonth} aria-label="Next month">
            <IconChevronRight width={18} height={18} />
          </button>
        </div>
        <button type="button" className="btn" onClick={goToday}>Today</button>
      </div>

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

      {selectedDate && (
        <div className="calendarDetail">
          <div className="calendarDetailTitle">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          {selectedItems.length === 0 ? (
            <p className="subtle">No posts scheduled for this day.</p>
          ) : (
            selectedItems.map((item) => (
              <div key={item.id} className="calendarDetailItem">
                <ProviderIcon provider={item.provider} size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {item.content.slice(0, 80)}{item.content.length > 80 ? '...' : ''}
                  </div>
                  <div className="subtle" style={{ fontSize: '0.85rem' }}>
                    {item.displayName} &middot; {item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <StatusPill tone={pillTone(item.status)}>{item.status}</StatusPill>
              </div>
            ))
          )}
          {selectedItems.length === 0 && (
            <a href="/compose" className="ctaBtn" style={{ marginTop: 12 }}>
              + Schedule a post
            </a>
          )}
        </div>
      )}
    </section>
  );
}
