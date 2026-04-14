'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StatusPill } from '../_components/ui';
import { ProviderIcon, IconRefresh } from '../_components/icons';
import { useProviderStatus } from '../hooks/useProviderStatus';
import { deleteConnection, getAuthUrl, connectWithToken, discoverMetaAssets, type MetaDiscoveryAsset } from '../_lib/api';
import type { ConnectionRecord, ProviderId } from '../_lib/api';
import { PROVIDER_META, PROVIDER_ORDER } from '../_lib/providerMeta';

// Providers that use a static Page/Bot token instead of OAuth popup
const TOKEN_AUTH_PROVIDERS = new Set<ProviderId>(['facebook', 'instagram']);

// Providers with short-lived tokens that auto-refresh (don't alarm the user)
const AUTO_REFRESH_PROVIDERS = new Set(['x']);

function healthColor(conn: ConnectionRecord): 'green' | 'yellow' | 'red' {
  if (conn.status === 'revoked' || conn.status === 'error' || conn.status === 'reconnect_required') return 'red';
  if (conn.expiresAt) {
    const msLeft = new Date(conn.expiresAt).getTime() - Date.now();
    // Short-lived auto-refresh tokens: only red if actually expired (refresh failed)
    if (AUTO_REFRESH_PROVIDERS.has(conn.provider)) {
      return msLeft <= 0 ? 'red' : 'green';
    }
    const daysLeft = msLeft / (1000 * 60 * 60 * 24);
    if (daysLeft <= 0) return 'red';
    if (daysLeft <= 7) return 'yellow';
  }
  if (conn.status === 'pending') return 'yellow';
  return 'green';
}

function reconnectHint(conn: ConnectionRecord): string | null {
  if (conn.status !== 'reconnect_required') return null;
  if (TOKEN_AUTH_PROVIDERS.has(conn.provider)) {
    return 'Meta rejected the stored token. Reconnect this account before the next publish.';
  }
  return 'Reconnect this account before the next publish.';
}

function expiryLabel(conn: ConnectionRecord): string {
  if (conn.status === 'reconnect_required') {
    return 'Reconnect required';
  }
  if (conn.expiresAt) {
    const msLeft = new Date(conn.expiresAt).getTime() - Date.now();
    // Short-lived auto-refresh tokens: show "Auto-renewing" instead of scary countdowns
    if (AUTO_REFRESH_PROVIDERS.has(conn.provider)) {
      if (msLeft <= 0) return 'Token expired — reconnect needed';
      return 'Auto-renewing';
    }
    const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return 'Expires tomorrow';
    if (daysLeft <= 7) return `Expires in ${daysLeft}d`;
    return new Date(conn.expiresAt).toLocaleDateString();
  }
  const updated = new Date(conn.updatedAt);
  return `Connected ${updated.toLocaleDateString()}`;
}

function pillForStatus(status: ConnectionRecord['status']) {
  switch (status) {
    case 'connected': return <StatusPill tone="ok">connected</StatusPill>;
    case 'pending':   return <StatusPill tone="warn">pending</StatusPill>;
    case 'revoked':   return <StatusPill tone="err">revoked</StatusPill>;
    case 'error':     return <StatusPill tone="err">error</StatusPill>;
    case 'reconnect_required': return <StatusPill tone="err">reconnect needed</StatusPill>;
  }
}

type TokenModalState = {
  provider: ProviderId;
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
  displayName: string;
} | null;

function ConnectionsPageInner() {
  const searchParams = useSearchParams();
  const { providers, loading, error, refetch } = useProviderStatus();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tokenModal, setTokenModal] = useState<TokenModalState>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [discoveringAssets, setDiscoveringAssets] = useState(false);
  const [discoveredAssets, setDiscoveredAssets] = useState<MetaDiscoveryAsset[]>([]);

  const requestedConnectProvider = searchParams.get('connect');
  const requestedAccountRef = searchParams.get('accountRef') ?? '';
  const requestedDisplayName = searchParams.get('displayName') ?? '';

  // Listen for OAuth completions from the callback tab
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('scp-oauth');
      bc.onmessage = () => { refetch(); };
      return () => bc.close();
    } catch {
      const onFocus = () => refetch();
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
    }
  }, [refetch]);

  useEffect(() => {
    if (!providers) return;
    if (tokenModal) return;
    if (requestedConnectProvider !== 'facebook' && requestedConnectProvider !== 'instagram') return;
    if (!providers[requestedConnectProvider]?.configured) return;

    setTokenModal({
      provider: requestedConnectProvider,
      accessToken: '',
      pageId: requestedConnectProvider === 'facebook' ? requestedAccountRef : '',
      instagramAccountId: requestedConnectProvider === 'instagram' ? requestedAccountRef : '',
      displayName: requestedDisplayName,
    });
    setTokenError(null);
  }, [providers, requestedAccountRef, requestedConnectProvider, requestedDisplayName, tokenModal]);

  // Gather all connections from all providers
  const allConnections = useMemo(() => {
    if (!providers) return [];
    return Object.values(providers).flatMap((e) => e.connections);
  }, [providers]);

  const sortedConnections = useMemo(() => {
    return [...allConnections].sort((a, b) => {
      const order: Record<string, number> = { connected: 0, pending: 1, error: 2, revoked: 3, reconnect_required: 4 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [allConnections]);

  // Providers that are configured but have no connections
  const configuredProviders = useMemo(() => {
    if (!providers) return [];
    return PROVIDER_ORDER.filter((p) => providers[p]?.configured);
  }, [providers]);

  // Providers that are not configured
  const unconfiguredProviders = useMemo(() => {
    if (!providers) return [];
    return PROVIDER_ORDER.filter((p) => !providers[p]?.configured);
  }, [providers]);

  const handleConnect = useCallback(async (provider: ProviderId) => {
    // Token-auth providers use a modal instead of OAuth popup
    if (TOKEN_AUTH_PROVIDERS.has(provider)) {
      setTokenModal({ provider, accessToken: '', pageId: '', instagramAccountId: '', displayName: '' });
      setTokenError(null);
      setDiscoveredAssets([]);
      return;
    }
    setActionLoading(provider);
    setActionError(null);
    const popup = window.open('about:blank', '_blank');
    try {
      const res = await getAuthUrl(provider);
      if (popup && !popup.closed) {
        popup.location.href = res.url;
      } else {
        window.location.href = res.url;
      }
    } catch (err) {
      popup?.close();
      setActionError(err instanceof Error ? err.message : 'Failed to get auth URL');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleTokenConnect = useCallback(async () => {
    if (!tokenModal) return;
    setActionLoading('token-connect');
    setTokenError(null);
    try {
      await connectWithToken(tokenModal.provider, {
        accessToken: tokenModal.accessToken,
        pageId: tokenModal.pageId || undefined,
        instagramAccountId: tokenModal.instagramAccountId || undefined,
        displayName: tokenModal.displayName || undefined,
      });
      setTokenModal(null);
      setDiscoveredAssets([]);
      await refetch();
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setActionLoading(null);
    }
  }, [tokenModal, refetch]);

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
    if (TOKEN_AUTH_PROVIDERS.has(conn.provider)) {
      setTokenModal({
        provider: conn.provider,
        accessToken: '',
        pageId: conn.provider === 'facebook' ? (conn.accountRef ?? '') : '',
        instagramAccountId: conn.provider === 'instagram' ? (conn.accountRef ?? '') : '',
        displayName: conn.displayName ?? '',
      });
      setTokenError(null);
      setDiscoveredAssets([]);
      return;
    }
    setActionLoading(`refresh-${conn.id}`);
    setActionError(null);
    const popup = window.open('about:blank', '_blank');
    try {
      const res = await getAuthUrl(conn.provider);
      if (popup && !popup.closed) {
        popup.location.href = res.url;
      } else {
        window.location.href = res.url;
      }
    } catch (err) {
      popup?.close();
      setActionError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleDiscoverAssets = useCallback(async () => {
    if (!tokenModal) return;
    if (tokenModal.provider !== 'facebook' && tokenModal.provider !== 'instagram') return;
    if (!tokenModal.accessToken.trim()) {
      setTokenError('Paste a Meta access token first.');
      return;
    }

    setDiscoveringAssets(true);
    setTokenError(null);
    try {
      const res = await discoverMetaAssets(tokenModal.provider, tokenModal.accessToken.trim());
      setDiscoveredAssets(res.assets);
      if (res.assets.length === 0) {
        setTokenError(tokenModal.provider === 'instagram'
          ? 'No linked Instagram business accounts were discoverable from this token.'
          : 'No Facebook Pages were discoverable from this token.');
      }
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Discovery failed');
      setDiscoveredAssets([]);
    } finally {
      setDiscoveringAssets(false);
    }
  }, [tokenModal]);

  return (
    <section>
      <h1 className="pageTitle">Connections</h1>
      <p className="lead">Manage your connected social accounts.</p>
      <div className="card" style={{ marginTop: 16, marginBottom: 16, padding: 18 }}>
        <p style={{ marginBottom: 8, fontWeight: 650 }}>Authentication paths</p>
        <p className="subtle" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
          X and LinkedIn connect through the normal OAuth popup. Facebook and Instagram currently connect through a Meta access token because the supported Meta app setups vary by use case.
        </p>
        <p className="subtle" style={{ fontSize: '0.9rem', marginBottom: 0 }}>
          For Meta: personal profiles are not publish targets. Facebook must connect to a Page. Instagram must be a Business or Creator account linked to a Facebook Page.
        </p>
      </div>

      {(error || actionError) && (
        <div style={{ marginBottom: 16, marginTop: 8 }}>
          <StatusPill tone="err">{error || actionError}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : sortedConnections.length === 0 && configuredProviders.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No connections yet</p>
          {unconfiguredProviders.length > 0 ? (
            <>
              <p className="subtle" style={{ marginTop: 8 }}>
                Set up your provider credentials first, then connect.
              </p>
              <div className="chips" style={{ marginTop: 16, justifyContent: 'center' }}>
                {unconfiguredProviders.map((provider) => (
                  <Link
                    key={provider}
                    href={`/settings?tab=integrations&provider=${provider}`}
                    className="btn primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                  >
                    <ProviderIcon provider={provider} size={18} />
                    Set up {PROVIDER_META[provider].displayName}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="subtle" style={{ marginTop: 8 }}>
              All providers are configured. Add one or more connections to start publishing.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Connected accounts */}
          {sortedConnections.length > 0 && (
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
                      const reconnectMessage = reconnectHint(c);

                      return (
                        <tr key={c.id}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <ProviderIcon provider={c.provider} size={18} />
                              <span style={{ fontWeight: 600 }}>{PROVIDER_META[c.provider]?.displayName ?? c.provider}</span>
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
                            <div className="subtle" style={{ fontSize: '0.85rem' }}>{expiry}</div>
                            {reconnectMessage && (
                              <div className="subtle" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{reconnectMessage}</div>
                            )}
                            {isExpiring && <StatusPill tone="warn">renew</StatusPill>}
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
                  const reconnectMessage = reconnectHint(c);

                  return (
                    <div key={c.id} className="listItem">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <ProviderIcon provider={c.provider} size={22} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 680 }}>{PROVIDER_META[c.provider]?.displayName ?? c.provider}</div>
                          {c.displayName && <div className="subtle" style={{ fontSize: '0.88rem' }}>{c.displayName}</div>}
                        </div>
                        <span className={`healthDot ${health}`} />
                      </div>

                      <div className="chips" style={{ marginBottom: 8 }}>
                        {pillForStatus(c.status)}
                        <span className="mono subtle" style={{ fontSize: '0.82rem' }}>{expiry}</span>
                        {isExpiring && <StatusPill tone="warn">renew soon</StatusPill>}
                      </div>
                      {reconnectMessage && (
                        <div className="subtle" style={{ fontSize: '0.82rem', color: 'var(--danger)', marginBottom: 8 }}>
                          {reconnectMessage}
                        </div>
                      )}

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
            </>
          )}

          {/* Ready to connect — configured but no connection yet */}
          {configuredProviders.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h2 className="sectionTitle">Add Connection</h2>
              <div className="chips" style={{ marginTop: 8 }}>
                {configuredProviders.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className="btn primary"
                    disabled={actionLoading === provider}
                    onClick={() => handleConnect(provider)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    <ProviderIcon provider={provider} size={16} />
                    Connect {PROVIDER_META[provider].displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unconfigured — need setup first */}
          {unconfiguredProviders.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h2 className="sectionTitle">Needs Setup</h2>
              <div className="chips" style={{ marginTop: 8 }}>
                {unconfiguredProviders.map((provider) => (
                  <Link
                    key={provider}
                    href={`/settings?tab=integrations&provider=${provider}`}
                    className="btn ghost"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                  >
                    <ProviderIcon provider={provider} size={16} />
                    Set up {PROVIDER_META[provider].displayName}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Token connect modal — for Facebook / Instagram */}
      {tokenModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div className="card wide" style={{ maxWidth: 480, width: '100%', padding: 28 }}>
            <h2 style={{ marginBottom: 4 }}>
              Connect {PROVIDER_META[tokenModal.provider]?.displayName}
            </h2>
            <p className="subtle" style={{ marginBottom: 20, fontSize: '0.9rem' }}>
              Paste your {tokenModal.provider === 'instagram' ? 'Meta User' : 'Meta User or Page'} Access Token from the{' '}
              <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Meta Graph API Explorer</a>.
            </p>
            <div className="card" style={{ padding: 14, marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}>
              {tokenModal.provider === 'facebook' ? (
                <>
                  <p style={{ marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>Facebook workflow</p>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: '0.88rem' }}>
                    <li>Use a Meta app that can access the Facebook Page you want to publish to.</li>
                    <li>Generate a User token with page scopes, or paste a Page token directly.</li>
                    <li>If you manage multiple Pages, enter the exact Facebook Page ID below so Social Plane stores the right Page token.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>Instagram workflow</p>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: '0.88rem' }}>
                    <li>Use an Instagram Business or Creator account linked to a Facebook Page.</li>
                    <li>Generate a Meta token with Instagram Graph access.</li>
                    <li>If auto-detection finds the wrong account, enter the exact Instagram Business Account ID below.</li>
                  </ol>
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Access Token *</span>
                <textarea
                  rows={3}
                  placeholder="EAAx..."
                  value={tokenModal.accessToken}
                  onChange={(e) => {
                    setTokenModal({ ...tokenModal, accessToken: e.target.value });
                    setDiscoveredAssets([]);
                  }}
                  style={{ fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!tokenModal.accessToken.trim() || discoveringAssets}
                  onClick={handleDiscoverAssets}
                >
                  {discoveringAssets ? 'Discovering…' : `Discover ${tokenModal.provider === 'facebook' ? 'Pages' : 'Instagram Accounts'}`}
                </button>
                <span className="subtle" style={{ fontSize: '0.78rem', alignSelf: 'center' }}>
                  Pull available Meta assets from the current token and choose the exact account.
                </span>
              </div>

              {discoveredAssets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {tokenModal.provider === 'facebook' ? 'Discovered Facebook Pages' : 'Discovered Instagram Accounts'}
                  </span>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {discoveredAssets.map((asset) => (
                      <button
                        key={`${asset.pageId}:${asset.instagramAccountId ?? 'fb'}`}
                        type="button"
                        className="btn ghost"
                        onClick={() => setTokenModal({
                          ...tokenModal,
                          pageId: asset.pageId,
                          instagramAccountId: asset.instagramAccountId ?? '',
                          displayName: asset.displayName,
                        })}
                        style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                      >
                        {tokenModal.provider === 'facebook'
                          ? `${asset.pageName} (${asset.pageId})`
                          : `${asset.displayName} via ${asset.pageName}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tokenModal.provider === 'facebook' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Facebook Page ID (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012345"
                    value={tokenModal.pageId}
                    onChange={(e) => setTokenModal({ ...tokenModal, pageId: e.target.value })}
                  />
                  <span className="subtle" style={{ fontSize: '0.78rem' }}>Recommended when the token can access more than one Page. If blank, Social Plane uses the first Page Meta returns.</span>
                </label>
              )}

              {tokenModal.provider === 'instagram' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Linked Facebook Page ID (recommended)</span>
                  <input
                    type="text"
                    placeholder="e.g. 1669244329963758"
                    value={tokenModal.pageId}
                    onChange={(e) => setTokenModal({ ...tokenModal, pageId: e.target.value })}
                  />
                  <span className="subtle" style={{ fontSize: '0.78rem' }}>Best path when the Instagram business account is attached to a known Facebook Page.</span>
                </label>
              )}

              {tokenModal.provider === 'instagram' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Instagram Business Account ID (optional override)</span>
                  <input
                    type="text"
                    placeholder="e.g. 17841400000000000"
                    value={tokenModal.instagramAccountId}
                    onChange={(e) => setTokenModal({ ...tokenModal, instagramAccountId: e.target.value })}
                  />
                  <span className="subtle" style={{ fontSize: '0.78rem' }}>Recommended if the token can see multiple linked Instagram business accounts.</span>
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Display name (optional)</span>
                <input
                  type="text"
                  placeholder={tokenModal.provider === 'instagram' ? 'e.g. @yourhandle' : 'e.g. Your Brand Name'}
                  value={tokenModal.displayName}
                  onChange={(e) => setTokenModal({ ...tokenModal, displayName: e.target.value })}
                />
              </label>

              {tokenError && (
                <StatusPill tone="err">{tokenError}</StatusPill>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                type="button"
                className="btn primary"
                disabled={!tokenModal.accessToken.trim() || actionLoading === 'token-connect'}
                onClick={handleTokenConnect}
                style={{ flex: 1 }}
              >
                {actionLoading === 'token-connect' ? 'Connecting…' : 'Connect'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => { setTokenModal(null); setTokenError(null); setDiscoveredAssets([]); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<section><p className="subtle">Loading connections…</p></section>}>
      <ConnectionsPageInner />
    </Suspense>
  );
}
