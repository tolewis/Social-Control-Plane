'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { IconTrash } from '../_components/icons';
import { CustomSelect } from '../_components/CustomSelect';
import {
  fetchOperators,
  createOperator,
  deleteOperator,
  type OperatorRecord,
} from '../_lib/api';

export function UsersTab() {
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [role, setRole] = useState<'human' | 'agent'>('human');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchOperators();
      setOperators(res.operators);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createOperator({
        name: name.trim(),
        role,
        email: email.trim() || undefined,
        password: password || undefined,
      });
      setName('');
      setEmail('');
      setPassword('');
      setRole('human');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create operator');
    } finally {
      setCreating(false);
    }
  }, [name, role, email, password, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this operator? All their API keys will also be deleted.')) return;
    try {
      await deleteOperator(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete operator');
    }
  }, [load]);

  return (
    <div>
      <h2 className="sectionTitle">Operators</h2>
      <p className="subtle" style={{ marginBottom: 16, fontSize: '0.9rem' }}>
        Operators are humans or agents that can interact with Social Plane. Agents use API keys; humans use password login.
      </p>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <StatusPill tone="err">{error}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : operators.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontWeight: 600 }}>No operators yet</p>
          <p className="subtle" style={{ marginTop: 8 }}>Create your first operator below.</p>
        </div>
      ) : (
        <div className="tableWrap" style={{ marginBottom: 20 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>API Keys</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id}>
                  <td style={{ fontWeight: 600 }}>{op.name}</td>
                  <td>
                    <StatusPill tone={op.role === 'agent' ? 'info' : 'neutral'}>
                      {op.role}
                    </StatusPill>
                  </td>
                  <td className="subtle" style={{ fontSize: '0.9rem' }}>{op.email || '—'}</td>
                  <td>{op.apiKeyCount}</td>
                  <td className="subtle" style={{ fontSize: '0.85rem' }}>
                    {new Date(op.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn destructive"
                      onClick={() => handleDelete(op.id)}
                      title="Delete operator"
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

      <h2 className="sectionTitle">Add Operator</h2>
      <form onSubmit={handleCreate} className="composeForm" style={{ maxWidth: 480 }}>
        <div className="formGroup">
          <label className="formLabel" htmlFor="op-name">Name</label>
          <input
            id="op-name"
            className="formInput"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Katya, Tim Lewis"
            required
          />
        </div>

        <div className="formGroup">
          <label className="formLabel" htmlFor="op-role">Role</label>
          <CustomSelect
            id="op-role"
            options={[
              { value: 'human', label: 'Human', meta: 'Password login' },
              { value: 'agent', label: 'Agent', meta: 'API key access' },
            ]}
            value={role}
            onChange={(v) => setRole(v as 'human' | 'agent')}
          />
        </div>

        <div className="formGroup">
          <label className="formLabel" htmlFor="op-email">Email (optional)</label>
          <input
            id="op-email"
            className="formInput"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        {role === 'human' && (
          <div className="formGroup">
            <label className="formLabel" htmlFor="op-password">Password (optional, min 8 chars)</label>
            <input
              id="op-password"
              className="formInput"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a login password"
              minLength={8}
            />
          </div>
        )}

        <button type="submit" className="btn primary" disabled={creating || !name.trim()}>
          {creating ? 'Creating...' : 'Create Operator'}
        </button>
      </form>
    </div>
  );
}
