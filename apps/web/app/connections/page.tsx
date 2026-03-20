'use client';

import { useCallback, useMemo, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { ProviderIcon, IconRefresh } from '../_components/icons';
import { useConnections } from '../hooks/useConnections';
import { deleteConnection, getAuthUrl } from '../_lib/api';
import type { ConnectionRecord } from '../_lib/api';

function healthColor(conn: ConnectionRecord): 'green' | 'yellow' | 'red' {
  if (conn.status === 'revoked' || conn.status === 'error') return 'red';
  if (conn.expiresAt) {
    const daysLeft = (new Date(conn.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 0) return 'red';
    if (daysLeft <= 7) return 'yellow';
  }
  if (conn.status === 'pending') return 'yellow';
  return 'green';
}

function expiryLabel(conn: ConnectionRecord): string {
  if (conn.expiresAt) {
    const daysLeft = Math.floor((new Date(conn.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return 'Expires tomorrow';
    if (daysLeft <= 7) return `Expires in ${daysLeft}d`;
    return new Date(conn.expiresAt).toLocaleDateString();
  }
  // Fallback: use updatedAt as proxy
  const updated = new Date(conn.updatedAt);
  return `Connected ${updated.toLocaleDateString()}`;
}

function pillForStatus(status: ConnectionRecord['status']) {
  switch (status) {
    case 'connected': return <StatusPill tone="ok">connected</StatusPill>;
    case 'pending':   return <StatusPill tone="warn">pending</StatusPill>;
    case 'revoked':   return <StatusPill tone="err">revoked</StatusPill>;
    case 'error':     return <StatusPill tone="err">error</StatusPill>;
  }
}

export default function ConnectionsPage() {
  const { connections, loading, error, refetch } = useConnections();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConnect = useCallback(async (provider: ConnectionRecord['provider']) => {
    setActionLoading(provider);
    setActionError(null);
    try {
      const res = await getAuthUrl(provider);
      window.location.href = res.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to get auth URL');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    try {
      await deleteConnection(id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setActionLoading(null);
    }
  }, [refetch]);

  const handleRefresh = useCallback(async (conn: ConnectionRecord) => {
    setActionLoading(`refresh-${conn.id}`);
    setActionError(null);
    try {
      const res = await getAuthUrl(conn.provider);
      window.location.href = res.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => {
      const order = { connected: 0, pending: 1, error: 2, revoked: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [connections]);

  return (
    <section>
      <h1 className="pageTitle">Connections</h1>
      <p className="lead">Manage your connected social accounts.</p>

      {(error || actionError) && (
        <div style={{ marginBottom: 16, marginTop: 8 }}>
          <StatusPill tone="err">{error || actionError}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : connections.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No connections yet</p>
          <p className="subtle" style={{ marginTop: 8 }}>Connect a social account to start publishing.</p>
          <div className="chips" style={{ marginTop: 16, justifyContent: 'center' }}>
            {(['linkedin', 'facebook', 'instagram', 'x'] as const).map((provider) => (
              <button key={provider} type="button" className="btn primary" disabled={actionLoading === provider} onClick={() => handleConnect(provider)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ProviderIcon provider={provider} size={18} />
                Connect {provider}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="tableWrap desktopOnly" style={{ marginTop: 16 }}>
            <table className="table connTable">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Connected</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedConnections.map((c) => {
                  const health = healthColor(c);
                  const expiry = expiryLabel(c);
                  const isExpiring = health === 'yellow';

                  return (
                    <tr key={c.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <ProviderIcon provider={c.provider} size={18} />
                          <span style={{ fontWeight: 600 }}>{c.provider}</span>
                          {c.displayName && <span className="subtle">&middot; {c.displayName}</span>}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className={`healthDot ${health}`} />
                          <span className="subtle" style={{ fontSize: '0.85rem' }}>
                            {health === 'green' ? 'OK' : health === 'yellow' ? 'Expiring' : 'Error'}
                          </span>
                        </span>
                      </td>
                      <td>{pillForStatus(c.status)}</td>
                      <td>
                        <span className="subtle" style={{ fontSize: '0.85rem' }}>
                          {expiry}
                        </span>
                        {isExpiring && (
                          <StatusPill tone="warn">renew</StatusPill>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={actionLoading === `refresh-${c.id}`}
                            onClick={() => handleRefresh(c)}
                            title="Refresh token"
                          >
                            <IconRefresh width={14} height={14} />
                          </button>
                          <button
                            type="button"
                            className="btn destructive"
                            disabled={actionLoading === c.id}
                            onClick={() => handleDisconnect(c.id)}
                          >
                            Disconnect
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="mobileOnly" style={{ gap: 12, marginTop: 16 }}>
            {sortedConnections.map((c) => {
              const health = healthColor(c);
              const expiry = expiryLabel(c);
              const isExpiring = health === 'yellow';

              return (
                <div key={c.id} className="listItem">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <ProviderIcon provider={c.provider} size={22} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 680 }}>{c.provider}</div>
                      {c.displayName && <div className="subtle" style={{ fontSize: '0.88rem' }}>{c.displayName}</div>}
                    </div>
                    <span className={`healthDot ${health}`} />
                  </div>

                  <div className="chips" style={{ marginBottom: 8 }}>
                    {pillForStatus(c.status)}
                    <span className="mono subtle" style={{ fontSize: '0.82rem' }}>{expiry}</span>
                    {isExpiring && <StatusPill tone="warn">renew soon</StatusPill>}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={actionLoading === `refresh-${c.id}`}
                      onClick={() => handleRefresh(c)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                    >
                      <IconRefresh width={16} height={16} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="btn destructive"
                      disabled={actionLoading === c.id}
                      onClick={() => handleDisconnect(c.id)}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="chips">
              {(['linkedin', 'facebook', 'instagram', 'x'] as const).map((provider) => (
                <button key={provider} type="button" className="btn" disabled={actionLoading === provider} onClick={() => handleConnect(provider)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ProviderIcon provider={provider} size={16} />
                  + {provider}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
