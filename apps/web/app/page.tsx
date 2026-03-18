'use client';

import { useMemo } from 'react';
import { StatusPill } from './_components/ui';
import { useConnections } from './hooks/useConnections';
import { useDrafts } from './hooks/useDrafts';
import { useJobs } from './hooks/useJobs';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function OverviewPage() {
  const { connections, loading: connLoading, error: connError } = useConnections();
  const { drafts, loading: draftLoading, error: draftError } = useDrafts();
  const { jobs, loading: jobLoading, error: jobError } = useJobs();

  const loading = connLoading || draftLoading || jobLoading;
  const error = connError || draftError || jobError;

  const stats = useMemo(() => ({
    connections: connections.length,
    healthy: connections.filter((c) => c.status === 'connected').length,
    drafts: drafts.filter((d) => d.status === 'draft').length,
    queued: drafts.filter((d) => d.status === 'queued').length,
    published: jobs.filter((j) => j.status === 'succeeded').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }), [connections, drafts, jobs]);

  const recentJobs = useMemo(() => {
    return [...jobs]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8)
      .map((j) => {
        const draft = drafts.find((d) => d.id === j.draftId);
        const conn = connections.find((c) => c.id === j.connectionId);
        return {
          id: j.id.slice(0, 8),
          provider: conn?.provider ?? '—',
          content: draft?.content.slice(0, 50) ?? '—',
          status: j.status,
          when: relativeTime(j.updatedAt),
        };
      });
  }, [jobs, drafts, connections]);

  if (loading) {
    return (
      <section>
        <h1 className="pageTitle">Dashboard</h1>
        <p className="subtle">Loading...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h1 className="pageTitle">Dashboard</h1>
        <div className="emptyState">
          <StatusPill tone="err">API error</StatusPill>
          <p className="subtle" style={{ marginTop: 8 }}>{error}</p>
          <p className="subtle" style={{ marginTop: 4 }}>Make sure the API is running on port 4001 and Postgres is up.</p>
        </div>
      </section>
    );
  }

  const isEmpty = connections.length === 0 && drafts.length === 0 && jobs.length === 0;

  return (
    <section>
      <h1 className="pageTitle">Dashboard</h1>

      <div className="statsRow">
        <div className="stat">
          <div className="statValue">{stats.connections}</div>
          <div className="statLabel">Connections</div>
        </div>
        <div className="stat">
          <div className="statValue">{stats.drafts}</div>
          <div className="statLabel">Drafts</div>
        </div>
        <div className="stat">
          <div className="statValue">{stats.queued}</div>
          <div className="statLabel">Queued</div>
        </div>
        <div className="stat">
          <div className="statValue">{stats.published}</div>
          <div className="statLabel">Published</div>
        </div>
        {stats.failed > 0 && (
          <div className="stat">
            <div className="statValue statWarn">{stats.failed}</div>
            <div className="statLabel">Failed</div>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="emptyState">
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No activity yet</p>
          <p className="subtle" style={{ marginTop: 8 }}>
            Connect a social account to get started. Head to{' '}
            <a href="/connections" style={{ color: 'var(--cyan)' }}>Connections</a> to link
            LinkedIn, X, Facebook, or Instagram.
          </p>
        </div>
      ) : (
        <>
          {recentJobs.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 className="sectionTitle">Recent activity</h2>
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Provider</th>
                      <th>Content</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((j) => (
                      <tr key={j.id}>
                        <td className="mono">{j.id}</td>
                        <td>{j.provider}</td>
                        <td className="subtle">{j.content}</td>
                        <td>
                          <StatusPill tone={j.status === 'succeeded' ? 'ok' : j.status === 'failed' ? 'err' : 'neutral'}>
                            {j.status}
                          </StatusPill>
                        </td>
                        <td className="mono">{j.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.drafts > 0 && (
            <div style={{ marginTop: 24 }}>
              <p className="subtle">
                {stats.drafts} draft{stats.drafts !== 1 ? 's' : ''} awaiting review.{' '}
                <a href="/review" style={{ color: 'var(--cyan)' }}>Review now</a>
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
