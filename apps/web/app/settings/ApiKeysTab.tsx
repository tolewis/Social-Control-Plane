'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { IconTrash, IconCopy } from '../_components/icons';
import { CustomSelect, type SelectOption } from '../_components/CustomSelect';
import {
  fetchApiKeys,
  fetchOperators,
  createApiKey,
  deleteApiKey,
  type ApiKeyRecord,
  type OperatorRecord,
} from '../_lib/api';

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [operatorId, setOperatorId] = useState('');
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);

  // Copy-once: show the raw key only right after creation
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [keysRes, opsRes] = await Promise.all([fetchApiKeys(), fetchOperators()]);
      setKeys(keysRes.apiKeys);
      setOperators(opsRes.operators);
      if (!operatorId && opsRes.operators.length > 0) {
        setOperatorId(opsRes.operators[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorId || !keyName.trim()) return;
    setCreating(true);
    setError(null);
    setNewRawKey(null);
    setCopied(false);
    try {
      const res = await createApiKey({ operatorId, name: keyName.trim() });
      setNewRawKey(res.rawKey);
      setKeyName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }, [operatorId, keyName, load]);

  const handleRevoke = useCallback(async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await deleteApiKey(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  }, [load]);

  const handleCopy = useCallback(() => {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [newRawKey]);

  return (
    <div>
      <h2 className="sectionTitle">API Keys</h2>
      <p className="subtle" style={{ marginBottom: 16, fontSize: '0.9rem' }}>
        API keys allow agents and scripts to authenticate with Social Plane programmatically.
        Keys use the <code className="mono">scp_</code> prefix and are hashed at rest.
      </p>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <StatusPill tone="err">{error}</StatusPill>
        </div>
      )}

      {newRawKey && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 14,
            border: '1px solid rgba(54, 211, 153, 0.3)',
            background: 'rgba(54, 211, 153, 0.08)',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>New API Key Created</p>
          <p className="subtle" style={{ fontSize: '0.85rem', marginBottom: 10 }}>
            Copy this key now — it won't be shown again.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code
              className="mono"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                fontSize: '0.88rem',
                wordBreak: 'break-all',
              }}
            >
              {newRawKey}
            </code>
            <button type="button" className="btn primary" onClick={handleCopy} style={{ whiteSpace: 'nowrap' }}>
              <IconCopy width={14} height={14} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : keys.length === 0 ? (
        <div className="emptyState" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600 }}>No API keys yet</p>
          <p className="subtle" style={{ marginTop: 8 }}>Create a key for agent access below.</p>
        </div>
      ) : (
        <div className="tableWrap" style={{ marginBottom: 20 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Operator</th>
                <th>Prefix</th>
                <th>Last Used</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {k.operatorName}
                      <StatusPill tone={k.operatorRole === 'agent' ? 'info' : 'neutral'}>
                        {k.operatorRole}
                      </StatusPill>
                    </span>
                  </td>
                  <td className="mono subtle" style={{ fontSize: '0.85rem' }}>{k.prefix}...</td>
                  <td className="subtle" style={{ fontSize: '0.85rem' }}>
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="subtle" style={{ fontSize: '0.85rem' }}>
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn destructive"
                      onClick={() => handleRevoke(k.id)}
                      title="Revoke key"
                      style={{ height: 32, padding: '0 10px' }}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sectionTitle">Create API Key</h2>
      {operators.length === 0 ? (
        <p className="subtle">Create an operator first in the Users tab.</p>
      ) : (
        <form onSubmit={handleCreate} className="composeForm" style={{ maxWidth: 480 }}>
          <div className="formGroup">
            <label className="formLabel" htmlFor="key-operator">Operator</label>
            <CustomSelect
              id="key-operator"
              options={operators.map((op) => ({
                value: op.id,
                label: op.name,
                meta: op.role,
              }))}
              value={operatorId}
              onChange={setOperatorId}
              placeholder="Select operator..."
            />
          </div>

          <div className="formGroup">
            <label className="formLabel" htmlFor="key-name">Key Name</label>
            <input
              id="key-name"
              className="formInput"
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. katya-publish, ci-pipeline"
              required
            />
          </div>

          <button type="submit" className="btn primary" disabled={creating || !keyName.trim()}>
            {creating ? 'Creating...' : 'Create API Key'}
          </button>
        </form>
      )}
    </div>
  );
}
