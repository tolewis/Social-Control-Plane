'use client';

import { useCallback, useState } from 'react';
import { Card, StatusPill } from '../_components/ui';
import { useConnections } from '../hooks/useConnections';
import { deleteConnection, getAuthUrl } from '../_lib/api';
import type { ConnectionRecord } from '../_lib/api';

type ConnTone = 'ok' | 'warn' | 'err';

function pillForStatus(status: ConnectionRecord['status']): ReturnType<typeof StatusPill> {
  switch (status) {
    case 'connected':
      return <StatusPill tone="ok">healthy</StatusPill>;
    case 'pending':
      return <StatusPill tone="warn">pending</StatusPill>;
    case 'revoked':
      return <StatusPill tone="err">revoked</StatusPill>;
    case 'error':
      return <StatusPill tone="err">error</StatusPill>;
  }
}

function statusTone(status: ConnectionRecord['status']): ConnTone {
  if (status === 'connected') return 'ok';
  if (status === 'pending') return 'warn';
  return 'err';
}

export default function ConnectionsPage() {
  const { connections, loading, error, refetch } = useConnections();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const healthy = connections.filter((c) => c.status === 'connected').length;
  const attention = connections.filter((c) => c.status === 'pending').length;
  const down = connections.filter((c) => c.status === 'revoked' || c.status === 'error').length;

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

  const handleRefresh = useCallback(async (provider: ConnectionRecord['provider']) => {
    setActionLoading(provider);
    setActionError(null);
    try {
      const res = await getAuthUrl(provider);
      window.location.href = res.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setActionLoading(null);
    }
  }, []);

  return (
    <>
      <section>
        <div className="kicker">Credential health</div>
        <h1 className="pageTitle">Connections should not fail silently.</h1>
        <p className="lead">
          Providers are fickle. Tokens expire. Scopes drift. This page makes connection health visible and actionable.
        </p>
      </section>

      <section className="section grid">
        <Card title="Summary" kicker="Signals">
          <div className="chips">
            {loading ? (
              <StatusPill tone="neutral">loading...</StatusPill>
            ) : (
              <>
                <StatusPill tone="ok">{healthy} healthy</StatusPill>
                <StatusPill tone="warn">{attention} attention</StatusPill>
                <StatusPill tone="err">{down} down</StatusPill>
                <StatusPill tone="neutral">{connections.length} total</StatusPill>
              </>
            )}
          </div>
          <div className="subtle" style={{ marginTop: 12 }}>
            Planned: background health checks, expiry alerts, and &quot;block publish when unsafe&quot; policies.
          </div>
        </Card>

        <Card title="Policy" kicker="Operational" className="wide">
          <div className="subtle">
            The operator console should explain failures in plain language:
            <ul style={{ marginTop: 10, paddingLeft: 18 }}>
              <li>what broke (token/scopes/provider)</li>
              <li>impact (blocked lane / delayed schedule / partial publish)</li>
              <li>next step (reauth / refresh / adapter work)</li>
            </ul>
          </div>
        </Card>

        {(error || actionError) && (
          <Card title="Error" kicker="API" className="full">
            <StatusPill tone="err">{error || actionError}</StatusPill>
          </Card>
        )}

        <Card title="Connections" kicker="Inventory" className="full">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="subtle">Loading connections...</td>
                  </tr>
                ) : connections.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="subtle">No connections configured. Use the buttons below to connect a provider.</td>
                  </tr>
                ) : (
                  connections.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 680 }}>{c.provider}</div>
                        {c.displayName && <div className="subtle">{c.displayName}</div>}
                        <div className="mono subtle">{c.id.slice(0, 12)}</div>
                      </td>
                      <td>{pillForStatus(c.status)}</td>
                      <td className="mono">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="mono">{new Date(c.updatedAt).toLocaleDateString()}</td>
                      <td>
                        {c.status === 'connected' ? (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={actionLoading === c.id}
                            onClick={() => handleDisconnect(c.id)}
                          >
                            Disconnect
                          </button>
                        ) : c.status === 'pending' ? (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={actionLoading === c.provider}
                            onClick={() => handleRefresh(c.provider)}
                          >
                            Refresh token
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={actionLoading === c.provider}
                            onClick={() => handleConnect(c.provider)}
                          >
                            Reconnect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && (
            <div style={{ marginTop: 16 }}>
              <div className="kicker" style={{ marginBottom: 10 }}>Add provider</div>
              <div className="chips">
                {(['linkedin', 'facebook', 'instagram', 'x'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className="btn"
                    disabled={actionLoading === provider}
                    onClick={() => handleConnect(provider)}
                  >
                    Connect {provider}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
