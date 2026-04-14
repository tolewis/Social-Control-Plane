'use client';

import { useCallback, useMemo, useState } from 'react';
import { StatusPill, type Tone } from '../_components/ui';
import { ProviderIcon, IconClock } from '../_components/icons';
import { MediaThumbs, MediaToolbar } from '../_components/MediaPicker';
import { DateTimePicker } from '../_components/DateTimePicker';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { publishDraft, deleteDraft, updateDraft, publishBulk } from '../_lib/api';
import { ChannelFilter, useChannelFilter } from '../_components/ChannelFilter';
import { detectSlop, groupSlopMatches } from '../_lib/slop';
import type { DraftRecord, ConnectionRecord } from '../_lib/api';
import type { SlopResult } from '../_lib/slop';

function connectionLabel(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  if (!conn) return draft.connectionId.slice(0, 8);
  return conn.displayName ? `${conn.displayName} / ${conn.provider}` : conn.provider;
}

function providerFor(draft: DraftRecord, connections: ConnectionRecord[]): string {
  const conn = connections.find((c) => c.id === draft.connectionId);
  return conn?.provider ?? '?';
}

function slopTone(result: SlopResult): Tone {
  if (result.score === 0) return 'ok';
  if (result.score <= 20) return 'warn';
  return 'err';
}

function SlopPill({ result }: { result: SlopResult }) {
  const tone = slopTone(result);
  return (
    <StatusPill tone={tone}>
      slop {result.rating}/10
    </StatusPill>
  );
}

function SlopDetail({ result }: { result: SlopResult }) {
  if (result.matches.length === 0) return null;
  const groups = groupSlopMatches(result.matches);
  return (
    <div className="slopWarning">
      <div className="slopWarningHeader">AI Slop: {result.rating}/10 — {result.matches.length} {result.matches.length === 1 ? 'flag' : 'flags'}</div>
      <div className="slopWarningBody">
        {Array.from(groups.entries()).map(([category, items]) => (
          <div key={category} className="slopWarningGroup">
            <span className="slopWarningCategory">{category}</span>
            <span className="slopWarningItems">
              {items.map((item, i) => (
                <code key={i} className="slopWarningMatch">{item}</code>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="slopWarningFooter">
        Rule-based detection via <a href="https://github.com/hardikpandya/stop-slop" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>stop-slop</a> — no AI used
      </div>
    </div>
  );
}

export function ReviewConsole() {
  const { drafts, loading, error, refetch } = useDrafts();
  const { connections } = useConnections();
  const [channelFilter, setChannelFilter] = useChannelFilter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editMediaIds, setEditMediaIds] = useState<string[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Only show drafts that need review (status === 'draft'), filtered by channel
  const reviewDrafts = useMemo(
    () => drafts.filter((d) => d.status === 'draft' && (!channelFilter || d.connectionId === channelFilter)),
    [drafts, channelFilter],
  );

  // Memoize slop detection — compute once per draft content, not per render
  const slopCache = useMemo(() => {
    const cache = new Map<string, SlopResult>();
    for (const d of reviewDrafts) {
      if (!cache.has(d.content)) {
        cache.set(d.content, detectSlop(d.content));
      }
    }
    return cache;
  }, [reviewDrafts]);

  const getSlop = useCallback((content: string): SlopResult => {
    return slopCache.get(content) ?? detectSlop(content);
  }, [slopCache]);

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
      // If schedule is set, save it first
      if (scheduleValue) {
        await updateDraft(selected.id, { scheduledFor: new Date(scheduleValue).toISOString() });
      }
      await publishDraft(selected.id);
      setShowSchedule(false);
      setScheduleValue('');
      await refetch();
      // Auto-advance to next draft
      const remaining = reviewDrafts.filter(d => d.id !== selected.id);
      setSelectedId(remaining[0]?.id ?? null);
      setBulkResult(`Approved. ${remaining.length} remaining.`);
      setTimeout(() => setBulkResult(null), 3000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, scheduleValue, refetch]);

  const handleBulkApprove = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const result = await publishBulk([...bulkSelected]);
      setBulkResult(`${result.queued} approved, ${result.skipped} skipped, ${result.errored} errors`);
      setBulkSelected(new Set());
      await refetch();
    } catch (err) {
      setBulkResult(err instanceof Error ? err.message : 'Bulk approve failed');
    } finally {
      setBulkLoading(false);
    }
  }, [bulkSelected, refetch]);

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (bulkSelected.size === reviewDrafts.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(reviewDrafts.map(d => d.id)));
    }
  }, [bulkSelected.size, reviewDrafts]);

  const handleClearSchedule = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateDraft(selected.id, { scheduledFor: null });
      setScheduleValue('');
      setShowSchedule(false);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Clear schedule failed');
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
      await publishDraft(selected.id, { immediate: true });
      setSelectedId(null);
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
    setEditMediaIds(selected.mediaIds ?? []);
    setEditing(true);
  }, [selected]);

  const handleSaveEdit = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateDraft(selected.id, { content: editContent, mediaIds: editMediaIds });
      setEditing(false);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  }, [selected, editContent, editMediaIds, refetch]);

  if (loading) {
    return <div className="subtle">Loading drafts...</div>;
  }

  if (error) {
    return <StatusPill tone="err">{error}</StatusPill>;
  }

  if (reviewDrafts.length === 0) {
    return (
      <>
        <ChannelFilter connections={connections} value={channelFilter} onChange={setChannelFilter} />
        <div className="emptyState">
          <p style={{ fontWeight: 600 }}>
            {channelFilter ? 'No drafts for this channel' : 'No drafts awaiting review'}
          </p>
          <p className="subtle" style={{ marginTop: 8 }}>
            {channelFilter ? 'Try selecting a different channel or "All".' : 'All caught up.'}
          </p>
        </div>
      </>
    );
  }

  if (!selected) return null;

  const provider = providerFor(selected, connections);

  /* ---- Shared inline preview/edit block used by both layouts ---- */
  function renderPreviewBody(draft: DraftRecord) {
    const dp = providerFor(draft, connections);
    return (
      <>
        {editing && draft.id === selected.id ? (
          <div style={{ marginTop: 10 }}>
            <div className="composeContentWrap">
              <textarea
                className="reviewEditArea composeContentArea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={Math.max(4, editContent.split('\n').length + 1)}
              />
              <MediaToolbar mediaIds={editMediaIds} onChange={setEditMediaIds} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span className="subtle" style={{ fontSize: '0.85rem' }}>{editContent.length} characters</span>
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" onClick={handleSaveEdit} disabled={actionLoading}>Save</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={actionLoading}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{ marginTop: 10, cursor: 'pointer' }}
              className="copyBox"
              onClick={(e) => { e.stopPropagation(); setSelectedId(draft.id); handleStartEdit(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedId(draft.id); handleStartEdit(); } }}
              title="Click to edit"
            >
              {draft.content}
              <div className="subtle" style={{ marginTop: 6, fontSize: '0.82rem' }}>Tap to edit</div>
            </div>
            {/* Media thumbnails (read-only when not editing) */}
            {draft.mediaIds && draft.mediaIds.length > 0 && (
              <MediaThumbs mediaIds={draft.mediaIds} />
            )}
          </>
        )}

        {/* Schedule */}
        {showSchedule && draft.id === selected.id ? (
          <div style={{ marginTop: 10 }}>
            <div className="formGroup">
              <label className="formLabel" htmlFor={`sched-${draft.id}`}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconClock width={14} height={14} /> Schedule for
                </span>
              </label>
              <DateTimePicker id={`sched-${draft.id}`} value={scheduleValue} onChange={setScheduleValue} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" className="expandTrigger" onClick={(e) => { e.stopPropagation(); setShowSchedule(true); }}>
              <IconClock width={14} height={14} />
              {draft.scheduledFor ? `Scheduled: ${new Date(draft.scheduledFor).toLocaleString()}` : 'Add schedule'}
            </button>
            {draft.scheduledFor && draft.id === selected.id && (
              <button type="button" className="btn ghost" onClick={(e) => { e.stopPropagation(); handleClearSchedule(); }} disabled={actionLoading}>
                Clear schedule
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        {actionError && draft.id === selected.id && (
          <div style={{ marginTop: 8 }}><StatusPill tone="err">{actionError}</StatusPill></div>
        )}
        <div className="actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn primary" onClick={(e) => { e.stopPropagation(); handleApprove(); }} disabled={actionLoading}>
            {scheduleValue ? 'Approve & Schedule' : 'Approve'}
          </button>
          <button type="button" className="btn ghost" onClick={(e) => { e.stopPropagation(); handlePublishNow(); }} disabled={actionLoading}>
            Publish now
          </button>
          <button type="button" className="btn destructive" onClick={(e) => { e.stopPropagation(); handleDelete(); }} disabled={actionLoading}>
            Reject
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ======== Desktop: split layout (list + preview panel) ======== */}
      <ChannelFilter connections={connections} value={channelFilter} onChange={setChannelFilter} />

      {/* Bulk action bar */}
      {reviewDrafts.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
            <input type="checkbox" checked={bulkSelected.size === reviewDrafts.length && reviewDrafts.length > 0} onChange={toggleSelectAll} />
            {bulkSelected.size > 0 ? `${bulkSelected.size} selected` : 'Select all'}
          </label>
          {bulkSelected.size > 0 && (
            <button type="button" className="btn primary" onClick={handleBulkApprove} disabled={bulkLoading}
              style={{ fontSize: 13, padding: '4px 14px', opacity: bulkLoading ? 0.5 : 1 }}>
              {bulkLoading ? 'Approving...' : `Approve ${bulkSelected.size}`}
            </button>
          )}
          {bulkResult && <span style={{ fontSize: 12, color: bulkResult.includes('error') ? 'var(--err)' : 'var(--ok)' }}>{bulkResult}</span>}
        </div>
      )}

      <div className="split desktopOnly">
        <div className="list" aria-label="Drafts">
          {reviewDrafts.map((d) => {
            const active = d.id === selected.id;
            const draftProvider = providerFor(d, connections);
            return (
              <div
                key={d.id}
                className={active ? 'listItem active' : 'listItem'}
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedId(d.id); setEditing(false); setShowSchedule(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { setSelectedId(d.id); setEditing(false); }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={bulkSelected.has(d.id)}
                    onChange={(e) => { e.stopPropagation(); toggleBulkSelect(d.id); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <ProviderIcon provider={draftProvider} size={18} />
                  <span className="listItemTitle" style={{ marginBottom: 0 }}>
                    {d.content.slice(0, 50)}{d.content.length > 50 ? '...' : ''}
                  </span>
                </div>
                <div className="listItemMeta">
                  <span className="subtle">{connectionLabel(d, connections)}</span>
                  {d.scheduledFor && (
                    <>
                      <span>&bull;</span>
                      <span className="subtle">{new Date(d.scheduledFor).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 8 }} className="chips">
                  <SlopPill result={getSlop(d.content)} />
                  <StatusPill tone="neutral">{d.content.length} chars</StatusPill>
                </div>
              </div>
            );
          })}
        </div>

        <div className="preview" aria-label="Draft preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProviderIcon provider={provider} size={16} />
                Preview
              </div>
              <div style={{ fontWeight: 740, fontSize: '1.06rem', marginTop: 8 }}>
                {selected.content.slice(0, 60)}{selected.content.length > 60 ? '...' : ''}
              </div>
              <div className="subtle" style={{ marginTop: 6 }}>
                {connectionLabel(selected, connections)} &middot;{' '}
                <span className="mono">{selected.id.slice(0, 12)}</span>
              </div>
            </div>
            <div className="chips">
              <SlopPill result={getSlop(selected.content)} />
              <StatusPill tone="neutral">{selected.publishMode}</StatusPill>
            </div>
          </div>

          {/* Slop warnings detail */}
          <SlopDetail result={getSlop(selected.content)} />

          {editing ? (
            <div style={{ marginTop: 14 }}>
              <div className="composeContentWrap">
                <textarea
                  className="reviewEditArea composeContentArea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={Math.max(5, editContent.split('\n').length + 2)}
                />
                <MediaToolbar mediaIds={editMediaIds} onChange={setEditMediaIds} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="subtle" style={{ fontSize: '0.85rem' }}>{editContent.length} characters</span>
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn primary" onClick={handleSaveEdit} disabled={actionLoading}>Save</button>
                <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={actionLoading}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{ marginTop: 14, cursor: 'pointer', position: 'relative' }}
                className="copyBox"
                onClick={handleStartEdit}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStartEdit(); }}
                title="Click to edit"
              >
                {selected.content}
                <div className="subtle" style={{ marginTop: 8, fontSize: '0.82rem' }}>Click to edit</div>
              </div>
              {/* Media thumbnails (desktop preview, read-only when not editing) */}
              {selected.mediaIds && selected.mediaIds.length > 0 && (
                <MediaThumbs mediaIds={selected.mediaIds} />
              )}
            </>
          )}

          {showSchedule ? (
            <div style={{ marginTop: 14 }}>
              <div className="formGroup">
                <label className="formLabel" htmlFor="reviewSchedule">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <IconClock width={14} height={14} /> Schedule for
                  </span>
                </label>
                <DateTimePicker id="reviewSchedule" value={scheduleValue} onChange={setScheduleValue} style={{ maxWidth: 300 }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="expandTrigger" onClick={() => setShowSchedule(true)}>
                <IconClock width={14} height={14} />
                {selected.scheduledFor ? `Scheduled: ${new Date(selected.scheduledFor).toLocaleString()}` : 'Add schedule'}
              </button>
              {selected.scheduledFor && (
                <button type="button" className="btn ghost" onClick={handleClearSchedule} disabled={actionLoading}>
                  Clear schedule
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
            <div>
              <div className="kicker">Info</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="formLabel" style={{ minWidth: 100 }}>Connection</span>
                  <span className="subtle">{connectionLabel(selected, connections)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="formLabel" style={{ minWidth: 100 }}>Provider</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ProviderIcon provider={provider} size={16} />
                    <span className="subtle">{provider}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="formLabel" style={{ minWidth: 100 }}>Mode</span>
                  <span className="subtle">{selected.publishMode}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="formLabel" style={{ minWidth: 100 }}>Length</span>
                  <span className="subtle">{selected.content.length} chars</span>
                </div>
                {selected.scheduledFor && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="formLabel" style={{ minWidth: 100 }}>Scheduled</span>
                    <span className="subtle">{new Date(selected.scheduledFor).toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="formLabel" style={{ minWidth: 100 }}>Created</span>
                  <span className="mono subtle" style={{ fontSize: '0.88rem' }}>{new Date(selected.createdAt).toLocaleString()}</span>
                </div>
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
                  {scheduleValue ? 'Approve & Schedule' : 'Approve'}
                </button>
                <button type="button" className="btn" onClick={handleStartEdit} disabled={actionLoading || editing}>
                  Edit
                </button>
                <button type="button" className="btn ghost" onClick={handlePublishNow} disabled={actionLoading}>
                  Publish now
                </button>
                <button type="button" className="btn destructive" onClick={handleDelete} disabled={actionLoading}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======== Mobile: accordion cards ======== */}
      <div className="mobileOnly" style={{ gap: 12 }}>
        {reviewDrafts.map((d) => {
          const active = d.id === selected.id;
          const draftProvider = providerFor(d, connections);
          return (
            <div
              key={d.id}
              className={active ? 'listItem active' : 'listItem'}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (active) { setSelectedId(null); setEditing(false); setShowSchedule(false); }
                else { setSelectedId(d.id); setEditing(false); setShowSchedule(false); }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (active) setSelectedId(null); else { setSelectedId(d.id); setEditing(false); }
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <ProviderIcon provider={draftProvider} size={18} />
                <span style={{ fontWeight: 680, flex: 1, minWidth: 0 }}>
                  {d.content.slice(0, 50)}{d.content.length > 50 ? '...' : ''}
                </span>
              </div>
              <div className="listItemMeta">
                <span className="subtle">{connectionLabel(d, connections)}</span>
              </div>
              <div style={{ marginTop: 6 }} className="chips">
                <SlopPill result={getSlop(d.content)} />
                <StatusPill tone="neutral">{d.content.length} chars</StatusPill>
              </div>

              {/* Inline expanded preview when this card is active */}
              {active && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }} onClick={(e) => e.stopPropagation()}>
                  {renderPreviewBody(d)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
