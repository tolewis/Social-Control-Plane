'use client';

import { useMemo } from 'react';
import { Card, KeyValue, StatusPill } from './_components/ui';
import { useConnections } from './hooks/useConnections';
import { useDrafts } from './hooks/useDrafts';
import { useJobs } from './hooks/useJobs';
import type { DraftRecord, PublishJobRecord, ConnectionRecord } from './_lib/api';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type RunStatus = 'running' | 'queued' | 'needs review';

function pillForRunStatus(status: RunStatus) {
  if (status === 'running') return <StatusPill tone="info">running</StatusPill>;
  if (status === 'queued') return <StatusPill tone="neutral">queued</StatusPill>;
  return <StatusPill tone="warn">needs review</StatusPill>;
}

function deriveRunStatus(draft: DraftRecord, jobs: PublishJobRecord[]): RunStatus {
  const job = jobs.find((j) => j.draftId === draft.id);
  if (job?.status === 'processing') return 'running';
  if (draft.status === 'draft') return 'needs review';
  return 'queued';
}

function connectionLabel(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  if (!conn) return draft.connectionId.slice(0, 8);
  return conn.displayName
    ? `${conn.displayName} / ${conn.provider}`
    : conn.provider;
}

export default function OverviewPage() {
  const { connections, loading: connLoading, error: connError } = useConnections();
  const { drafts, loading: draftLoading, error: draftError } = useDrafts();
  const { jobs, loading: jobLoading, error: jobError } = useJobs();

  const loading = connLoading || draftLoading || jobLoading;
  const error = connError || draftError || jobError;

  const stats = useMemo(() => {
    const queued = drafts.filter((d) => d.status === 'queued').length;
    const needsReview = drafts.filter((d) => d.status === 'draft').length;
    const running = jobs.filter((j) => j.status === 'processing').length;
    const failed = drafts.filter((d) => d.status === 'failed').length;
    const healthy = connections.filter((c) => c.status === 'connected').length;
    const attention = connections.filter((c) => c.status === 'pending' || c.status === 'error' || c.status === 'revoked').length;
    return { queued, needsReview, running, failed, healthy, attention };
  }, [drafts, jobs, connections]);

  const nextRuns = useMemo(() => {
    return drafts
      .filter((d) => d.status === 'queued' || d.status === 'draft')
      .slice(0, 10)
      .map((d) => ({
        key: d.id,
        connection: connectionLabel(d, connections),
        item: d.publishMode === 'direct' ? 'Direct publish' : d.status === 'draft' ? 'Draft awaiting review' : 'Scheduled post',
        runAt: d.scheduledFor ? new Date(d.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now',
        status: deriveRunStatus(d, jobs),
      }));
  }, [drafts, connections, jobs]);

  const recentJobs = useMemo(() => {
    return [...jobs]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
      .map((j) => {
        const draft = drafts.find((d) => d.id === j.draftId);
        const conn = connections.find((c) => c.id === j.connectionId);
        return {
          id: j.id.slice(0, 12),
          connection: conn?.displayName
            ? `${conn.displayName} / ${conn.provider}`
            : conn?.provider ?? j.connectionId.slice(0, 8),
          mode: draft?.publishMode ?? '—',
          outcome: j.status === 'succeeded' ? ('ok' as const) : j.status === 'failed' ? ('warn' as const) : ('neutral' as const),
          outcomeLabel: j.status,
          at: relativeTime(j.updatedAt),
          details: j.errorMessage ?? (j.receiptJson ? 'Published' : '—'),
        };
      });
  }, [jobs, drafts, connections]);

  const oldestReviewAge = useMemo(() => {
    const reviewDrafts = drafts.filter((d) => d.status === 'draft');
    if (reviewDrafts.length === 0) return '—';
    const oldest = reviewDrafts.reduce((a, b) =>
      new Date(a.createdAt).getTime() < new Date(b.createdAt).getTime() ? a : b,
    );
    return relativeTime(oldest.createdAt);
  }, [drafts]);

  return (
    <>
      <section>
        <div className="kicker">Operational snapshot</div>
        <h1 className="pageTitle">Publishing, without surprises.</h1>
        <p className="lead">
          A calm control plane for agent-generated posts: draft review, direct publish, queue inspection, connection
          health, and receipts.
        </p>
      </section>

      {error && (
        <section className="section">
          <Card title="Error" kicker="API">
            <StatusPill tone="err">{error}</StatusPill>
          </Card>
        </section>
      )}

      <section className="section grid">
        <Card
          title="Queue health"
          kicker="Execution"
          className="wide"
          footer={
            <div className="subtle">
              Principle: serialized writes per account. Queue is the truth; receipts are the evidence.
            </div>
          }
        >
          <div className="chips" style={{ marginBottom: 12 }}>
            {loading ? (
              <StatusPill tone="neutral">loading...</StatusPill>
            ) : (
              <>
                <StatusPill tone="neutral">{stats.queued} queued</StatusPill>
                <StatusPill tone="info">{stats.running} running</StatusPill>
                <StatusPill tone="ok">{stats.failed} failed</StatusPill>
                <StatusPill tone="warn">{stats.needsReview} need review</StatusPill>
              </>
            )}
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Item</th>
                  <th>Run at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="subtle">Loading queue...</td>
                  </tr>
                ) : nextRuns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="subtle">Queue empty</td>
                  </tr>
                ) : (
                  nextRuns.map((r) => (
                    <tr key={r.key}>
                      <td>{r.connection}</td>
                      <td className="subtle">{r.item}</td>
                      <td className="mono">{r.runAt}</td>
                      <td>{pillForRunStatus(r.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Review backlog" kicker="Approvals">
          {loading ? (
            <div className="subtle">Loading...</div>
          ) : (
            <KeyValue
              rows={[
                { k: 'Waiting', v: <StatusPill tone="warn">{stats.needsReview} drafts</StatusPill> },
                { k: 'Oldest', v: <span className="mono">{oldestReviewAge}</span> },
                { k: 'SLA', v: <span className="subtle">Operator-defined</span> },
              ]}
            />
          )}
          <div style={{ marginTop: 12 }} className="subtle">
            Review is a safety gate: copy, media, links, and destination compliance.
          </div>
        </Card>

        <Card title="Connection health" kicker="Credentials">
          {loading ? (
            <div className="subtle">Loading...</div>
          ) : (
            <KeyValue
              rows={[
                {
                  k: 'Healthy',
                  v: (
                    <span>
                      <StatusPill tone="ok">{stats.healthy}</StatusPill> <span className="subtle">providers</span>
                    </span>
                  ),
                },
                { k: 'Attention', v: <StatusPill tone="warn">{stats.attention}</StatusPill> },
                { k: 'Total', v: <span className="mono">{connections.length}</span> },
              ]}
            />
          )}
          <div style={{ marginTop: 12 }} className="subtle">
            Credentials degrade silently. The console should not.
          </div>
        </Card>

        <Card title="Recent receipts" kicker="Evidence" className="full">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Connection</th>
                  <th>Mode</th>
                  <th>Outcome</th>
                  <th>When</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="subtle">Loading receipts...</td>
                  </tr>
                ) : recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="subtle">No publish jobs yet</td>
                  </tr>
                ) : (
                  recentJobs.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td>{r.connection}</td>
                      <td className="subtle">{r.mode}</td>
                      <td>
                        {r.outcome === 'ok' ? (
                          <StatusPill tone="ok">ok</StatusPill>
                        ) : r.outcome === 'warn' ? (
                          <StatusPill tone="warn">{r.outcomeLabel}</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">{r.outcomeLabel}</StatusPill>
                        )}
                      </td>
                      <td className="mono">{r.at}</td>
                      <td className="subtle">{r.details}</td>
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
