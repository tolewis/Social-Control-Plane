'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { StatusPill } from './_components/ui';
import { ProviderIcon } from './_components/icons';
import { useConnections } from './hooks/useConnections';
import { useDrafts } from './hooks/useDrafts';
import { useJobs } from './hooks/useJobs';

/* ------------------------------------------------------------------ */
/*  Cadence targets per platform                                        */
/* ------------------------------------------------------------------ */

const CADENCE: Record<string, { minPerWeek: number; maxPerWeek: number; note: string }> = {
  linkedin:  { minPerWeek: 2,  maxPerWeek: 4,  note: 'Every 2-3 days' },
  facebook:  { minPerWeek: 7,  maxPerWeek: 21, note: '1-3x daily' },
  instagram: { minPerWeek: 5,  maxPerWeek: 14, note: '1-2x daily' },
  x:         { minPerWeek: 7,  maxPerWeek: 35, note: '1-5x daily' },
};

function cadenceHealth(count: number, provider: string): { tone: 'ok' | 'warn' | 'err'; label: string } {
  const t = CADENCE[provider];
  if (!t) return { tone: 'ok', label: 'OK' };
  if (count >= t.minPerWeek && count <= t.maxPerWeek) return { tone: 'ok', label: 'On pace' };
  if (count < t.minPerWeek) return { tone: 'warn', label: 'Under' };
  return { tone: 'warn', label: 'Heavy' };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function fmtRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = d.getTime();
  if (ts >= today && ts < today + 86400000) return `Today ${fmtTime(iso)}`;
  if (ts >= today + 86400000 && ts < today + 172800000) return `Tomorrow ${fmtTime(iso)}`;
  const days = Math.ceil((ts - today) / 86400000);
  if (days > 0 && days <= 6) return `${d.toLocaleDateString([], { weekday: 'short' })} ${fmtTime(iso)}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                           */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { connections, loading: cL, error: cE } = useConnections();
  const { drafts, loading: dL, error: dE } = useDrafts();
  const { jobs, loading: jL, error: jE } = useJobs();

  const loading = cL || dL || jL;
  const error = cE || dE || jE;

  const pendingReview = useMemo(() => drafts.filter(d => d.status === 'draft').length, [drafts]);
  const failedJobs = useMemo(() => jobs.filter(j => j.status === 'failed').length, [jobs]);
  const unhealthyConns = useMemo(() => connections.filter(c => c.status !== 'connected').length, [connections]);
  const totalQueued = useMemo(() => drafts.filter(d => d.status === 'queued').length, [drafts]);
  const totalPublished = useMemo(() => jobs.filter(j => j.status === 'succeeded').length, [jobs]);

  /* -- Per-channel stats ------------------------------------------ */
  const channels = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    return connections.filter(c => c.status === 'connected').map(conn => {
      const pub = jobs.filter(j => j.connectionId === conn.id && j.status === 'succeeded' && new Date(j.updatedAt).getTime() >= weekAgo).length;
      // Queued = only status 'queued' (actually in publish pipeline), not 'draft' (awaiting review)
      const queued = drafts.filter(d => d.connectionId === conn.id && d.status === 'queued').length;
      const pendingDrafts = drafts.filter(d => d.connectionId === conn.id && d.status === 'draft').length;
      const failed = jobs.filter(j => j.connectionId === conn.id && j.status === 'failed' && new Date(j.updatedAt).getTime() >= weekAgo).length;
      // Next = only future scheduled posts
      const next = drafts
        .filter(d => d.connectionId === conn.id && d.scheduledFor && d.status === 'queued' && new Date(d.scheduledFor).getTime() > now)
        .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())[0]?.scheduledFor ?? null;
      const health = cadenceHealth(pub, conn.provider);
      const cadence = CADENCE[conn.provider] ?? null;
      return { id: conn.id, provider: conn.provider, name: conn.displayName ?? conn.provider, pub, queued, pendingDrafts, failed, next, health, cadence };
    });
  }, [connections, drafts, jobs]);

  /* -- Today timeline --------------------------------------------- */
  const todayItems = useMemo(() => {
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const t1 = t0 + 86400000;
    const items: Array<{ id: string; time: string; provider: string; content: string; status: string; tone: 'ok'|'err'|'info'|'neutral' }> = [];

    for (const d of drafts) {
      if (d.status !== 'queued') continue;
      const ts = d.scheduledFor ? new Date(d.scheduledFor).getTime() : 0;
      if (ts < t0 || ts >= t1) continue;
      const conn = connections.find(c => c.id === d.connectionId);
      items.push({ id: d.id, time: fmtTime(d.scheduledFor!), provider: conn?.provider ?? '?', content: d.content.slice(0, 50), status: 'scheduled', tone: 'info' });
    }
    for (const j of jobs) {
      const ts = new Date(j.updatedAt).getTime();
      if (ts < t0 || ts >= t1) continue;
      if (j.status !== 'succeeded' && j.status !== 'failed') continue;
      const draft = drafts.find(d => d.id === j.draftId);
      const conn = connections.find(c => c.id === j.connectionId);
      items.push({ id: j.id, time: fmtTime(j.updatedAt), provider: conn?.provider ?? '?', content: draft?.content.slice(0, 50) ?? '', status: j.status === 'succeeded' ? 'published' : 'failed', tone: j.status === 'succeeded' ? 'ok' : 'err' });
    }
    const seen = new Set<string>();
    return items.sort((a, b) => a.time.localeCompare(b.time)).filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 8);
  }, [drafts, jobs, connections]);

  /* -- Render ----------------------------------------------------- */
  if (loading) return <section><p className="subtle">Loading...</p></section>;
  if (error) return <section><StatusPill tone="err">API error</StatusPill><p className="subtle" style={{ marginTop: 8 }}>{error}</p></section>;

  if (connections.length === 0 && drafts.length === 0) {
    return (
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Welcome to Social Plane</p>
          <p className="subtle" style={{ marginTop: 6, maxWidth: 320 }}>Connect a social account to get started.</p>
          <Link href="/connections" className="btn primary" style={{ marginTop: 16, display: 'inline-block' }}>Connect Account</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* ---- Top row: counters ---- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link href="/review" className="dashCounter" style={{ '--counter-color': pendingReview > 0 ? 'var(--warn)' : 'var(--ok)' } as React.CSSProperties}>
          <span className="dashCounterNum">{pendingReview}</span>
          <span className="dashCounterLabel">to review</span>
        </Link>
        <div className="dashCounter">
          <span className="dashCounterNum">{totalQueued}</span>
          <span className="dashCounterLabel">queued</span>
        </div>
        <div className="dashCounter">
          <span className="dashCounterNum">{totalPublished}</span>
          <span className="dashCounterLabel">published</span>
        </div>
        {failedJobs > 0 && (
          <Link href="/queue?filter=failed" className="dashCounter" style={{ '--counter-color': 'var(--err)' } as React.CSSProperties}>
            <span className="dashCounterNum">{failedJobs}</span>
            <span className="dashCounterLabel">failed</span>
          </Link>
        )}
        {unhealthyConns > 0 && (
          <Link href="/connections" className="dashCounter" style={{ '--counter-color': 'var(--warn)' } as React.CSSProperties}>
            <span className="dashCounterNum">{unhealthyConns}</span>
            <span className="dashCounterLabel">conn issues</span>
          </Link>
        )}
      </div>

      {/* ---- Two-column layout: channels left, today right ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* Left: Channel table */}
        <div>
          <h2 className="sectionTitle" style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channels</h2>
          <div className="tableWrap" style={{ fontSize: 13 }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Account</th>
                  <th style={{ textAlign: 'right' }}>This week</th>
                  <th style={{ textAlign: 'right' }}>Target</th>
                  <th style={{ textAlign: 'center' }}>Pace</th>
                  <th style={{ textAlign: 'right' }}>Queued</th>
                  <th style={{ textAlign: 'right' }}>Drafts</th>
                  <th style={{ textAlign: 'left' }}>Next</th>
                </tr>
              </thead>
              <tbody>
                {channels.map(ch => (
                  <tr key={ch.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ProviderIcon provider={ch.provider} size={18} />
                        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{ch.name}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{ch.pub}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {ch.cadence ? `${ch.cadence.minPerWeek}-${ch.cadence.maxPerWeek}` : '--'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusPill tone={ch.health.tone}>{ch.health.label}</StatusPill>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {ch.queued}
                      {ch.failed > 0 && <span style={{ color: 'var(--err)', marginLeft: 4 }}>({ch.failed} err)</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: ch.pendingDrafts > 0 ? 'var(--warn)' : 'var(--muted)' }}>
                      {ch.pendingDrafts}
                    </td>
                    <td style={{ color: ch.next ? 'var(--text)' : 'var(--muted)', fontSize: 12 }}>
                      {ch.next ? fmtRelative(ch.next) : 'None'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {channels.length === 0 && (
            <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
              No connected accounts. <Link href="/connections" style={{ color: 'var(--text)', textDecoration: 'underline' }}>Connect one</Link>
            </p>
          )}

          {/* Cadence guide */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(CADENCE).map(([provider, c]) => (
              <div key={provider} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ProviderIcon provider={provider} size={14} />
                <span>{c.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Today + upcoming */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 className="sectionTitle" style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</h2>
            <Link href="/calendar" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>Calendar &rarr;</Link>
          </div>

          {todayItems.length === 0 ? (
            <p className="subtle" style={{ fontSize: 12 }}>Nothing today.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {todayItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 5, fontSize: 12,
                  background: 'var(--panel)',
                }}>
                  <span className="mono" style={{ color: 'var(--muted)', minWidth: 44, fontSize: 11 }}>{item.time}</span>
                  <ProviderIcon provider={item.provider} size={14} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content || '(empty)'}</span>
                  <StatusPill tone={item.tone}>{item.status}</StatusPill>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming across all channels */}
          {(() => {
            const now = Date.now();
            const upcoming = drafts
              .filter(d => d.scheduledFor && d.status === 'queued' && new Date(d.scheduledFor).getTime() > now)
              .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())
              .slice(0, 6);
            if (upcoming.length === 0) return null;
            return (
              <div style={{ marginTop: 16 }}>
                <h2 className="sectionTitle" style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upcoming</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {upcoming.map(d => {
                    const conn = connections.find(c => c.id === d.connectionId);
                    return (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 8px', borderRadius: 5, fontSize: 12,
                        background: 'var(--panel)',
                      }}>
                        <span className="mono" style={{ color: 'var(--muted)', minWidth: 70, fontSize: 11 }}>{fmtRelative(d.scheduledFor!)}</span>
                        <ProviderIcon provider={conn?.provider ?? '?'} size={14} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.content.slice(0, 40)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
