'use client';

import { useCallback, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { ProviderIcon } from '../_components/icons';
import { useConnections } from '../hooks/useConnections';
import { deleteConnection, getAuthUrl } from '../_lib/api';
import type { ConnectionRecord } from '../_lib/api';

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

  return (
    <section>
      <h1 className="pageTitle">Connections</h1>

      {(error || actionError) && (
        <div style={{ marginBottom: 16 }}>
          <StatusPill tone="err">{error || actionError}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : connections.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No connections yet</p>
          <p className="subtle" style={{ marginTop: 8 }}>Connect a social account to start publishing.</p>
          <div className="chips" style={{ marginTop: 16 }}>
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
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Connected</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <ProviderIcon provider={c.provider} size={20} />
                        <span style={{ fontWeight: 600 }}>{c.provider}</span>
                      </span>
                      {c.displayName && <span className="subtle"> &middot; {c.displayName}</span>}
                    </td>
                    <td>{pillForStatus(c.status)}</td>
                    <td className="mono subtle">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button type="button" className="btn ghost" disabled={actionLoading === c.id} onClick={() => handleDisconnect(c.id)}>
                        Disconnect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
