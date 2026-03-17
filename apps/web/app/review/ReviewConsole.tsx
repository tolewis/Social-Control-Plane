'use client';

import { useCallback, useMemo, useState } from 'react';
import { StatusPill, type Tone } from '../_components/ui';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { publishDraft, deleteDraft, updateDraft } from '../_lib/api';
import type { DraftRecord, ConnectionRecord } from '../_lib/api';

function connectionLabel(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  if (!conn) return draft.connectionId.slice(0, 8);
  return conn.displayName ? `${conn.displayName} / ${conn.provider}` : conn.provider;
}

function providerFor(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  return conn?.provider ?? '—';
}

function riskTone(draft: DraftRecord): Tone {
  if (draft.content.length < 100) return 'ok';
  if (draft.content.length < 500) return 'warn';
  return 'err';
}

function riskLabel(draft: DraftRecord): string {
  if (draft.content.length < 100) return 'low';
  if (draft.content.length < 500) return 'medium';
  return 'high';
}

export function ReviewConsole() {
  const { drafts, loading, error, refetch } = useDrafts();
  const { connections } = useConnections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Only show drafts that need review (status === 'draft')
  const reviewDrafts = useMemo(
    () => drafts.filter((d) => d.status === 'draft'),
    [drafts],
  );

  const selected = useMemo(() => {
    if (selectedId) {
      const found = reviewDrafts.find((d) => d.id === selectedId);
      if (found) return found;
    }
    return reviewDrafts[0] ?? null;
  }, [selectedId, reviewDrafts]);

  const handleApprove = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await publishDraft(selected.id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, refetch]);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteDraft(selected.id);
      setSelectedId(null);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, refetch]);

  const handlePublishNow = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await publishDraft(selected.id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, refetch]);

  const handleStartEdit = useCallback(() => {
    if (!selected) return;
    setEditContent(selected.content);
    setEditing(true);
  }, [selected]);

  const handleSaveEdit = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateDraft(selected.id, { content: editContent });
      setEditing(false);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, editContent, refetch]);

  if (loading) {
    return <div className="subtle">Loading drafts...</div>;
  }

  if (error) {
    return <StatusPill tone="err">{error}</StatusPill>;
  }

  if (reviewDrafts.length === 0) {
    return <div className="subtle">No drafts awaiting review.</div>;
  }

  if (!selected) return null;

  return (
    <div className="split">
      <div className="list" aria-label="Drafts">
        {reviewDrafts.map((d) => {
          const active = d.id === selected.id;
          return (
            <div
              key={d.id}
              className={active ? 'listItem active' : 'listItem'}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedId(d.id);
              }}
            >
              <div className="listItemTitle">{d.content.slice(0, 60)}{d.content.length > 60 ? '...' : ''}</div>
              <div className="listItemMeta">
                <span className="mono">{d.id.slice(0, 12)}</span>
                <span>&bull;</span>
                <span className="subtle">{connectionLabel(d, connections)}</span>
              </div>
              <div style={{ marginTop: 10 }} className="chips">
                <StatusPill tone={riskTone(d)}>{riskLabel(d)} risk</StatusPill>
                <StatusPill tone="neutral">{providerFor(d, connections)}</StatusPill>
                {d.scheduledFor && <StatusPill tone="neutral">{d.scheduledFor}</StatusPill>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="preview" aria-label="Draft preview">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="kicker">Preview</div>
            <div style={{ fontWeight: 740, fontSize: '1.06rem', marginTop: 8 }}>
              {selected.content.slice(0, 60)}{selected.content.length > 60 ? '...' : ''}
            </div>
            <div className="subtle" style={{ marginTop: 6 }}>
              {connectionLabel(selected, connections)} &middot; <span className="mono">{selected.id.slice(0, 12)}</span>
            </div>
          </div>
          <div className="chips">
            <StatusPill tone={riskTone(selected)}>{riskLabel(selected)} risk</StatusPill>
            <StatusPill tone="neutral">{selected.publishMode}</StatusPill>
          </div>
        </div>

        {editing ? (
          <div style={{ marginTop: 14 }}>
            <textarea
              className="copyBox"
              style={{ width: '100%', minHeight: 120, fontFamily: 'inherit', fontSize: 'inherit', padding: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'inherit', resize: 'vertical' }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" onClick={handleSaveEdit} disabled={actionLoading}>
                Save
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={actionLoading}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }} className="copyBox">
            {selected.content}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <div className="kicker">Info</div>
            <div className="tableWrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Connection</td>
                    <td className="subtle">{connectionLabel(selected, connections)}</td>
                  </tr>
                  <tr>
                    <td>Provider</td>
                    <td className="subtle">{providerFor(selected, connections)}</td>
                  </tr>
                  <tr>
                    <td>Mode</td>
                    <td className="subtle">{selected.publishMode}</td>
                  </tr>
                  <tr>
                    <td>Length</td>
                    <td className="subtle">{selected.content.length} chars</td>
                  </tr>
                  {selected.scheduledFor && (
                    <tr>
                      <td>Scheduled for</td>
                      <td className="subtle">{selected.scheduledFor}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Created</td>
                    <td className="mono subtle">{selected.createdAt}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="kicker">Actions</div>
            {actionError && (
              <div style={{ marginTop: 8 }}>
                <StatusPill tone="err">{actionError}</StatusPill>
              </div>
            )}
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" onClick={handleApprove} disabled={actionLoading}>
                Approve
              </button>
              <button type="button" className="btn" onClick={handleStartEdit} disabled={actionLoading || editing}>
                Request changes
              </button>
              <button type="button" className="btn ghost" onClick={handleDelete} disabled={actionLoading}>
                Reject
              </button>
              <button type="button" className="btn ghost" onClick={handlePublishNow} disabled={actionLoading}>
                Publish now
              </button>
            </div>
            <div className="subtle" style={{ marginTop: 10 }}>
              Actions will write receipts: who approved, what changed, what shipped.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
