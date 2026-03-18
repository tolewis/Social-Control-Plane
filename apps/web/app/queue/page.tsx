'use client';

import { useMemo, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { useJobs } from '../hooks/useJobs';
import type { DraftRecord, PublishJobRecord, ConnectionRecord } from '../_lib/api';

type QueueStatus = 'queued' | 'running' | 'failed' | 'needs review';

function pillForStatus(status: QueueStatus) {
  switch (status) {
    case 'queued':       return <StatusPill tone="neutral">queued</StatusPill>;
    case 'running':      return <StatusPill tone="info">running</StatusPill>;
    case 'failed':       return <StatusPill tone="err">failed</StatusPill>;
    case 'needs review': return <StatusPill tone="warn">needs review</StatusPill>;
  }
}

function deriveStatus(draft: DraftRecord, jobs: PublishJobRecord[]): QueueStatus {
  const job = jobs.find((j) => j.draftId === draft.id);
  if (job?.status === 'processing') return 'running';
  if (draft.status === 'failed') return 'failed';
  if (draft.status === 'draft') return 'needs review';
  return 'queued';
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
        const conn = connections.find((c: ConnectionRecord) => c.id === d.connectionId);
        return {
          id: d.id.slice(0, 8),
          fullId: d.id,
          provider: conn?.provider ?? '—',
          content: d.content.slice(0, 60),
          mode: d.publishMode,
          status: deriveStatus(d, jobs),
        };
      });
    if (filter === 'all') return all;
    return all.filter((i) => i.status === filter);
  }, [drafts, connections, jobs, filter]);

  return (
    <section>
      <h1 className="pageTitle">Queue</h1>

      <div className="chips" style={{ marginBottom: 16 }}>
        {(['all', 'queued', 'running', 'needs review', 'failed'] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {draftError && (
        <div style={{ marginBottom: 12 }}>
          <StatusPill tone="err">{draftError}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : items.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontWeight: 600 }}>Queue empty</p>
          <p className="subtle" style={{ marginTop: 8 }}>
            {filter === 'all' ? 'No pending items. Create a draft or schedule a post.' : `No items with status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Provider</th>
                <th>Content</th>
                <th>Mode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.fullId}>
                  <td className="mono">{i.id}</td>
                  <td>{i.provider}</td>
                  <td className="subtle">{i.content}</td>
                  <td className="subtle">{i.mode}</td>
                  <td>{pillForStatus(i.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
