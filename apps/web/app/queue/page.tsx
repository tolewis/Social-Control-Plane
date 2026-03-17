'use client';

import { useMemo, useState } from 'react';
import { Card, StatusPill } from '../_components/ui';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { useJobs } from '../hooks/useJobs';
import type { DraftRecord, PublishJobRecord, ConnectionRecord } from '../_lib/api';

type QueueStatus = 'queued' | 'running' | 'blocked' | 'failed' | 'needs review';

const FILTER_OPTIONS: Array<{ label: string; value: QueueStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'running' },
  { label: 'Needs review', value: 'needs review' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Failed', value: 'failed' },
];

function pillForStatus(status: QueueStatus) {
  switch (status) {
    case 'queued':
      return <StatusPill tone="neutral">queued</StatusPill>;
    case 'running':
      return <StatusPill tone="info">running</StatusPill>;
    case 'blocked':
      return <StatusPill tone="warn">blocked</StatusPill>;
    case 'failed':
      return <StatusPill tone="err">failed</StatusPill>;
    case 'needs review':
      return <StatusPill tone="warn">needs review</StatusPill>;
  }
}

function deriveQueueStatus(draft: DraftRecord, jobs: PublishJobRecord[]): QueueStatus {
  const job = jobs.find((j) => j.draftId === draft.id);
  if (job?.status === 'processing') return 'running';
  if (draft.status === 'failed') return 'failed';
  if (draft.status === 'draft') return 'needs review';
  if (draft.status === 'queued') return 'queued';
  return 'queued';
}

function connectionLabel(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  if (!conn) return draft.connectionId.slice(0, 8);
  return conn.displayName ? `${conn.displayName} / ${conn.provider}` : conn.provider;
}

function providerFor(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  return conn?.provider ?? '—';
}

export default function QueuePage() {
  const { drafts, loading: draftLoading, error: draftError } = useDrafts();
  const { connections, loading: connLoading } = useConnections();
  const { jobs, loading: jobLoading } = useJobs();
  const [filter, setFilter] = useState<QueueStatus | 'all'>('all');

  const loading = draftLoading || connLoading || jobLoading;

  const items = useMemo(() => {
    const all = drafts
      .filter((d) => d.status !== 'published')
      .map((d) => {
        const status = deriveQueueStatus(d, jobs);
        const job = jobs.find((j) => j.draftId === d.id);
        return {
          id: d.id.slice(0, 12),
          fullId: d.id,
          connection: connectionLabel(d, connections),
          provider: providerFor(d, connections),
          mode: d.publishMode,
          status,
          runAt: d.scheduledFor ?? '—',
          attempts: job ? 1 : 0,
          payload: `${d.content.length} chars`,
          lastError: job?.errorMessage ?? undefined,
        };
      });

    if (filter === 'all') return all;
    return all.filter((i) => i.status === filter);
  }, [drafts, connections, jobs, filter]);

  return (
    <>
      <section>
        <div className="kicker">Queue inspector</div>
        <h1 className="pageTitle">See what will publish, before it does.</h1>
        <p className="lead">
          This view exists so operators can answer: &quot;What&apos;s scheduled?&quot;, &quot;What&apos;s stuck?&quot;, and &quot;What did we retry?&quot;
          without tailing logs.
        </p>
      </section>

      <section className="section grid">
        <Card title="Filters" kicker="Slice" className="full">
          <div className="chips">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={filter === opt.value ? 'chip active' : 'chip'}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }} className="subtle">
            Planned: per-account lanes, backoff visibility, and &quot;why blocked&quot; explanations.
          </div>
        </Card>

        <Card title="Active lane" kicker="Queue" className="full">
          {draftError && (
            <div style={{ marginBottom: 12 }}>
              <StatusPill tone="err">{draftError}</StatusPill>
            </div>
          )}
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Queue ID</th>
                  <th>Connection</th>
                  <th>Provider</th>
                  <th>Mode</th>
                  <th>Run at</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Payload</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="subtle">Loading queue...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="subtle">
                      {filter === 'all' ? 'Queue empty' : `No items with status "${filter}"`}
                    </td>
                  </tr>
                ) : (
                  items.map((i) => (
                    <tr key={i.fullId}>
                      <td className="mono">{i.id}</td>
                      <td>{i.connection}</td>
                      <td className="subtle">{i.provider}</td>
                      <td className="subtle">{i.mode}</td>
                      <td className="mono">{i.runAt}</td>
                      <td>{pillForStatus(i.status)}</td>
                      <td className="mono">{i.attempts}</td>
                      <td className="subtle">{i.payload}</td>
                      <td className="subtle">{i.lastError ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </>
  );
}
