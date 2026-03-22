'use client';

import { useCallback, useState } from 'react';
import { ProviderIcon, IconCopy, IconRefresh, IconChevronDown } from '../_components/icons';
import { StatusPill } from '../_components/ui';
import type { ProviderId, ProviderStatusEntry, ConnectionRecord } from '../_lib/api';
import { saveProviderConfig, deleteProviderConfig, getAuthUrl, deleteConnection } from '../_lib/api';
import { PROVIDER_META } from '../_lib/providerMeta';

type CardState = 'unconfigured' | 'configured' | 'connected';

function resolveState(entry: ProviderStatusEntry | undefined): CardState {
  if (!entry?.configured) return 'unconfigured';
  if (entry.connections.length > 0) return 'connected';
  return 'configured';
}

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

function connLabel(conn: ConnectionRecord): string {
  if (conn.expiresAt) {
    const daysLeft = Math.floor((new Date(conn.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return 'Expires tomorrow';
    if (daysLeft <= 7) return `Expires in ${daysLeft}d`;
  }
  return `Connected ${new Date(conn.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

interface ProviderSetupCardProps {
  provider: ProviderId;
  entry?: ProviderStatusEntry;
  onRefetch: () => void;
  highlighted?: boolean;
}

export function ProviderSetupCard({ provider, entry, onRefetch, highlighted }: ProviderSetupCardProps) {
  const meta = PROVIDER_META[provider];
  const state = resolveState(entry);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [editing, setEditing] = useState(false);

  const redirectUri = entry?.redirectUri ?? '';

  const handleCopyRedirect = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [redirectUri]);

  const handleSave = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveProviderConfig(provider, { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      setClientId('');
      setClientSecret('');
      setEditing(false);
      onRefetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [provider, clientId, clientSecret, onRefetch]);

  const handleDeleteConfig = useCallback(async () => {
    setActionLoading('delete-config');
    try {
      await deleteProviderConfig(provider);
      onRefetch();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  }, [provider, onRefetch]);

  const handleConnect = useCallback(async () => {
    setActionLoading('connect');
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
      setSaveError(err instanceof Error ? err.message : 'Failed to start OAuth');
    } finally {
      setActionLoading(null);
    }
  }, [provider]);

  const handleRefresh = useCallback(async (conn: ConnectionRecord) => {
    setActionLoading(`refresh-${conn.id}`);
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
      setSaveError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (id: string) => {
    setActionLoading(`disconnect-${id}`);
    try {
      await deleteConnection(id);
      onRefetch();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  }, [onRefetch]);

  return (
    <div className={`providerCard ${state}${highlighted ? ' highlighted' : ''}`} id={`provider-${provider}`}>
      {/* Header */}
      <div className="providerCardHeader">
        <ProviderIcon provider={provider} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="providerCardName">{meta.displayName}</div>
        </div>
        {state === 'unconfigured' && (
          <StatusPill tone="neutral">Not set up</StatusPill>
        )}
        {state === 'configured' && (
          <StatusPill tone="info">Ready</StatusPill>
        )}
        {state === 'connected' && entry!.connections.map((c) => (
          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`healthDot ${healthColor(c)}`} />
            <StatusPill tone="ok">Connected</StatusPill>
          </span>
        ))}
      </div>

      {/* ── UNCONFIGURED ── */}
      {state === 'unconfigured' && (
        <div className="providerCardBody">
          <ol className="setupSteps">
            {meta.setupSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <div className="setupLinks">
            <a href={meta.devConsoleUrl} target="_blank" rel="noopener noreferrer" className="setupLink">
              {meta.devConsoleLabel} <span aria-hidden>&#8599;</span>
            </a>
            <a href={meta.oauthDocsUrl} target="_blank" rel="noopener noreferrer" className="setupLink">
              OAuth Setup Guide <span aria-hidden>&#8599;</span>
            </a>
          </div>

          {redirectUri && (
            <div className="redirectUriBlock">
              <span className="formLabel" style={{ marginBottom: 4 }}>Redirect URI</span>
              <div className="redirectUriRow">
                <code className="redirectUriCode">{redirectUri}</code>
                <button type="button" className="btn ghost sm" onClick={handleCopyRedirect} title="Copy">
                  {copied ? 'Copied' : <IconCopy width={14} height={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="credentialForm">
            <div className="formGroup">
              <label className="formLabel">{meta.credentialLabels.clientId}</label>
              <input
                type="text"
                className="formInput"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={`Paste your ${meta.credentialLabels.clientId}`}
                autoComplete="off"
              />
            </div>
            <div className="formGroup">
              <label className="formLabel">{meta.credentialLabels.clientSecret}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSecret ? 'text' : 'password'}
                  className="formInput"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={`Paste your ${meta.credentialLabels.clientSecret}`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="secretToggle"
                  onClick={() => setShowSecret(!showSecret)}
                  tabIndex={-1}
                >
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {saveError && <StatusPill tone="err">{saveError}</StatusPill>}

            <button
              type="button"
              className="btn primary"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              onClick={handleSave}
              style={{ marginTop: 4 }}
            >
              {saving ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>

          <div className="providerMeta">
            <span className="mono subtle">Scopes: {meta.scopes.join(', ')}</span>
            <span className="subtle">{meta.notes}</span>
          </div>
        </div>
      )}

      {/* ── CONFIGURED (credentials saved, not yet connected) ── */}
      {state === 'configured' && (
        <div className="providerCardBody">
          {entry?.clientIdPrefix && (
            <div className="credentialSummary">
              <span className="subtle">{meta.credentialLabels.clientId}:</span>
              <code className="mono">{entry.clientIdPrefix}...</code>
              {entry.source === 'env' && <StatusPill tone="neutral">via .env</StatusPill>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn primary"
              disabled={actionLoading === 'connect'}
              onClick={handleConnect}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <ProviderIcon provider={provider} size={16} />
              {actionLoading === 'connect' ? 'Connecting...' : `Connect ${meta.displayName}`}
            </button>

            <button
              type="button"
              className="btn ghost"
              onClick={() => setEditing(!editing)}
            >
              {entry?.source === 'env' ? 'Override Credentials' : 'Edit Credentials'}
            </button>

            {entry?.source === 'database' && (
              <button
                type="button"
                className="btn destructive"
                disabled={actionLoading === 'delete-config'}
                onClick={handleDeleteConfig}
              >
                Remove
              </button>
            )}
          </div>

          {editing && (
            <div className="credentialForm" style={{ marginTop: 12 }}>
              {entry?.source === 'env' && (
                <div className="subtle" style={{ fontSize: '0.85rem', marginBottom: 8 }}>
                  Current credentials come from .env. Saving here will override them (database takes precedence).
                </div>
              )}
              <div className="formGroup">
                <label className="formLabel">{meta.credentialLabels.clientId}</label>
                <input
                  type="text"
                  className="formInput"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={`Paste your ${meta.credentialLabels.clientId}`}
                  autoComplete="off"
                />
              </div>
              <div className="formGroup">
                <label className="formLabel">{meta.credentialLabels.clientSecret}</label>
                <input
                  type="password"
                  className="formInput"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={`Paste your ${meta.credentialLabels.clientSecret}`}
                  autoComplete="off"
                />
              </div>
              {saveError && <StatusPill tone="err">{saveError}</StatusPill>}
              <button
                type="button"
                className="btn primary"
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
                onClick={handleSave}
              >
                {saving ? 'Saving...' : entry?.source === 'env' ? 'Save Override' : 'Update Credentials'}
              </button>
            </div>
          )}

          {saveError && !editing && <StatusPill tone="err">{saveError}</StatusPill>}
        </div>
      )}

      {/* ── CONNECTED ── */}
      {state === 'connected' && (
        <div className="providerCardBody">
          {entry!.connections.map((c) => (
            <div key={c.id} className="connRow">
              <div style={{ flex: 1, minWidth: 0 }}>
                {c.displayName && <div style={{ fontWeight: 650 }}>{c.displayName}</div>}
                <div className="subtle" style={{ fontSize: '0.85rem' }}>{connLabel(c)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={actionLoading === `refresh-${c.id}`}
                  onClick={() => handleRefresh(c)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <IconRefresh width={14} height={14} />
                  Refresh
                </button>
                <button
                  type="button"
                  className="btn destructive sm"
                  disabled={actionLoading === `disconnect-${c.id}`}
                  onClick={() => handleDisconnect(c.id)}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}

          {/* Collapsible credentials section */}
          <button
            type="button"
            className="credentialsToggle"
            onClick={() => setShowCredentials(!showCredentials)}
          >
            <IconChevronDown
              width={14}
              height={14}
              style={{ transform: showCredentials ? 'rotate(180deg)' : undefined, transition: 'transform 180ms ease' }}
            />
            Credentials
          </button>

          {showCredentials && (
            <div className="credentialSummary">
              {entry?.clientIdPrefix && (
                <>
                  <span className="subtle">{meta.credentialLabels.clientId}:</span>
                  <code className="mono">{entry.clientIdPrefix}...</code>
                </>
              )}
              {entry?.source === 'env' && <StatusPill tone="neutral">via .env</StatusPill>}
              {entry?.source === 'database' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn ghost sm" onClick={() => setEditing(!editing)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn destructive sm"
                    disabled={actionLoading === 'delete-config'}
                    onClick={handleDeleteConfig}
                  >
                    Remove
                  </button>
                </div>
              )}

              {editing && (
                <div className="credentialForm" style={{ marginTop: 12 }}>
                  <div className="formGroup">
                    <label className="formLabel">{meta.credentialLabels.clientId}</label>
                    <input
                      type="text"
                      className="formInput"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="New value"
                      autoComplete="off"
                    />
                  </div>
                  <div className="formGroup">
                    <label className="formLabel">{meta.credentialLabels.clientSecret}</label>
                    <input
                      type="password"
                      className="formInput"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="New value"
                      autoComplete="off"
                    />
                  </div>
                  {saveError && <StatusPill tone="err">{saveError}</StatusPill>}
                  <button
                    type="button"
                    className="btn primary"
                    disabled={saving || !clientId.trim() || !clientSecret.trim()}
                    onClick={handleSave}
                  >
                    {saving ? 'Saving...' : 'Update Credentials'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
