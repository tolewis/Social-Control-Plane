'use client';

import { useCallback, useMemo, useState } from 'react';
import { StatusPill } from '../_components/ui';
import { ProviderIcon, IconRetry, IconTrash, IconSend, IconEdit, IconClock, IconRefresh } from '../_components/icons';
import { MediaThumbs, MediaToolbar } from '../_components/MediaPicker';
import { DateTimePicker } from '../_components/DateTimePicker';
import { useDrafts } from '../hooks/useDrafts';
import { useConnections } from '../hooks/useConnections';
import { useJobs } from '../hooks/useJobs';
import { publishDraft, deleteDraft, updateDraft, rescheduleDraft, revertToDraft } from '../_lib/api';
import { ChannelFilter, useChannelFilter } from '../_components/ChannelFilter';
import type { DraftRecord, PublishJobRecord, ConnectionRecord } from '../_lib/api';

type QueueStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'needs review';

function pillForStatus(status: QueueStatus) {
  switch (status) {
    case 'queued':       return <StatusPill tone="neutral">queued</StatusPill>;
    case 'running':      return <StatusPill tone="info">running</StatusPill>;
    case 'succeeded':    return <StatusPill tone="ok">published</StatusPill>;
    case 'failed':       return <StatusPill tone="err">failed</StatusPill>;
    case 'needs review': return <StatusPill tone="warn">needs review</StatusPill>;
  }
}

function deriveStatus(draft: DraftRecord, jobs: PublishJobRecord[]): QueueStatus {
  const job = jobs.find((j) => j.draftId === draft.id);
  const jobStatus = job?.status?.toUpperCase();
  if (jobStatus === 'SUCCEEDED') return 'succeeded';
  if (jobStatus === 'PROCESSING') return 'running';
  if (jobStatus === 'FAILED' || draft.status === 'failed') return 'failed';
  if (draft.status === 'draft') return 'needs review';
  return 'queued';
}

type QueueItem = {
  id: string;
  fullId: string;
  draftId: string;
  connectionId: string;
  provider: string;
  displayName: string;
  content: string;
  fullContent: string;
  mode: string;
  status: QueueStatus;
  mediaIds: string[];
  errorMessage?: string;
  receiptJson?: unknown;
  scheduledFor?: string;
  createdAt: string;
};

export default function QueuePage() {
  const { drafts, loading: draftLoading, error: draftError, refetch: refetchDrafts } = useDrafts();
  const { connections, loading: connLoading } = useConnections();
  const { jobs, loading: jobLoading, refetch: refetchJobs } = useJobs();
  const [channelFilter, setChannelFilter] = useChannelFilter();
  const [filter, setFilter] = useState<QueueStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editMediaIds, setEditMediaIds] = useState<string[]>([]);
  const [editSchedule, setEditSchedule] = useState('');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');

  const loading = draftLoading || connLoading || jobLoading;

  const items: QueueItem[] = useMemo(() => {
    const all = drafts
      .filter((d) => d.status !== 'published' || jobs.some((j) => j.draftId === d.id))
      .map((d) => {
        const conn = connections.find((c: ConnectionRecord) => c.id === d.connectionId);
        const job = jobs.find((j) => j.draftId === d.id);
        return {
          id: d.id.slice(0, 8),
          fullId: d.id,
          draftId: d.id,
          connectionId: d.connectionId,
          provider: conn?.provider ?? '?',
          displayName: conn?.displayName ?? conn?.provider ?? '?',
          content: d.content.slice(0, 60),
          fullContent: d.content,
          mode: d.publishMode,
          status: deriveStatus(d, jobs),
          mediaIds: d.mediaIds ?? [],
          errorMessage: job?.errorMessage,
          receiptJson: job?.receiptJson,
          scheduledFor: d.scheduledFor,
          createdAt: d.createdAt,
        };
      });
    let filtered = all;
    if (channelFilter) filtered = filtered.filter(i => i.connectionId === channelFilter);
    if (filter !== 'all') filtered = filtered.filter(i => i.status === filter);
    return filtered;
  }, [drafts, connections, jobs, filter, channelFilter]);

  const handleRetry = useCallback(async (draftId: string) => {
    setActionLoading(draftId);
    setActionError(null);
    try {
      await publishDraft(draftId);
      await Promise.all([refetchDrafts(), refetchJobs()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionLoading(null);
    }
  }, [refetchDrafts, refetchJobs]);

  const handleCancel = useCallback(async (draftId: string) => {
    setActionLoading(draftId);
    setActionError(null);
    try {
      await deleteDraft(draftId);
      await Promise.all([refetchDrafts(), refetchJobs()]);
      setExpandedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setActionLoading(null);
    }
  }, [refetchDrafts, refetchJobs]);

  const handlePublishNow = useCallback(async (draftId: string) => {
    setActionLoading(draftId);
    setActionError(null);
    try {
      await publishDraft(draftId);
      await Promise.all([refetchDrafts(), refetchJobs()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setActionLoading(null);
    }
  }, [refetchDrafts, refetchJobs]);

  const handleStartEdit = useCallback((item: QueueItem) => {
    setEditingId(item.fullId);
    setEditContent(item.fullContent);
    setEditMediaIds(item.mediaIds);
    // Convert ISO to datetime-local format for the input
    if (item.scheduledFor) {
      const d = new Date(item.scheduledFor);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditSchedule(local);
    } else {
      setEditSchedule('');
    }
  }, []);

  const handleSaveEdit = useCallback(async (draftId: string) => {
    setActionLoading(draftId);
    setActionError(null);
    try {
      await updateDraft(draftId, {
        content: editContent,
        mediaIds: editMediaIds,
      });
      setEditingId(null);
      await refetchDrafts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActionLoading(null);
    }
  }, [editContent, editMediaIds, editSchedule, refetchDrafts]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleStartReschedule = useCallback((item: QueueItem) => {
    setReschedulingId(item.fullId);
    if (item.scheduledFor) {
      const d = new Date(item.scheduledFor);
      setRescheduleValue(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    } else {
      setRescheduleValue('');
    }
  }, []);

  const handleSaveReschedule = useCallback(async (draftId: string) => {
    if (!rescheduleValue) return;
    setActionLoading(draftId);
    setActionError(null);
    try {
      await rescheduleDraft(draftId, new Date(rescheduleValue).toISOString());
      setReschedulingId(null);
      await Promise.all([refetchDrafts(), refetchJobs()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reschedule failed');
    } finally {
      setActionLoading(null);
    }
  }, [rescheduleValue, refetchDrafts, refetchJobs]);

  const handleBackToDraft = useCallback(async (draftId: string) => {
    setActionLoading(draftId);
    setActionError(null);
    try {
      await revertToDraft(draftId);
      await Promise.all([refetchDrafts(), refetchJobs()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setActionLoading(null);
    }
  }, [refetchDrafts, refetchJobs]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section>
      <h1 className="pageTitle">Queue</h1>
      <p className="lead">Track the status of queued and published posts.</p>

      <ChannelFilter connections={connections} value={channelFilter} onChange={setChannelFilter} />

      <div className="chips" style={{ marginBottom: 16, marginTop: 12 }}>
        {(['all', 'queued', 'running', 'succeeded', 'needs review', 'failed'] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {(draftError || actionError) && (
        <div style={{ marginBottom: 12 }}>
          <StatusPill tone="err">{draftError || actionError}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : items.length === 0 ? (
        <div className="emptyState">
          <p style={{ fontWeight: 600 }}>Queue empty</p>
          <p className="subtle" style={{ marginTop: 8 }}>
            {filter === 'all'
              ? 'No pending items. Create a draft or schedule a post.'
              : `No items with status "${filter}".`}
          </p>
          <a href="/compose" className="ctaBtn" style={{ marginTop: 16 }}>
            + Create Post
          </a>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="tableWrap desktopOnly">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Account</th>
                  <th>Content</th>
                  <th>Mode</th>
                  <th>Status</th>
                </tr>
              </thead>
                {items.map((item) => {
                  const isExpanded = expandedId === item.fullId;
                  return (
                    <tbody key={item.fullId}>
                      <tr
                        className="queueRow"
                        onClick={() => toggleExpand(item.fullId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(item.fullId); }}
                      >
                        <td className="mono">{item.id}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ProviderIcon provider={item.provider} size={18} />
                            {item.displayName}
                          </span>
                        </td>
                        <td className="subtle">{item.content}{item.fullContent.length > 60 ? '...' : ''}</td>
                        <td className="subtle">{item.mode}</td>
                        <td>{pillForStatus(item.status)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="queueDetailRow">
                          <td colSpan={5}>
                            <div className="queueDetail">
                              {editingId === item.fullId ? (
                                /* ---- Edit mode ---- */
                                <>
                                  <div>
                                    <div className="formLabel" style={{ marginBottom: 6 }}>Content</div>
                                    <textarea
                                      className="formTextarea"
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ minHeight: 100 }}
                                    />
                                    <MediaToolbar mediaIds={editMediaIds} onChange={setEditMediaIds} />
                                  </div>
                                  <div className="queueDetailActions">
                                    <button type="button" className="btn primary" disabled={actionLoading === item.draftId || !editContent.trim()} onClick={(e) => { e.stopPropagation(); handleSaveEdit(item.draftId); }}>Save</button>
                                    <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}>Cancel</button>
                                  </div>
                                </>
                              ) : reschedulingId === item.fullId ? (
                                /* ---- Reschedule mode ---- */
                                <>
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <div className="formLabel" style={{ marginBottom: 6 }}>New date & time</div>
                                    <DateTimePicker value={rescheduleValue} onChange={setRescheduleValue} />
                                  </div>
                                  <div className="queueDetailActions">
                                    <button type="button" className="btn primary" disabled={actionLoading === item.draftId || !rescheduleValue} onClick={(e) => { e.stopPropagation(); handleSaveReschedule(item.draftId); }}>Save Schedule</button>
                                    <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setReschedulingId(null); }}>Cancel</button>
                                  </div>
                                </>
                              ) : (
                                /* ---- Read mode ---- */
                                <>
                                  <div>
                                    <div className="formLabel" style={{ marginBottom: 6 }}>Full content</div>
                                    <div className="copyBox">{item.fullContent}</div>
                                    {item.mediaIds.length > 0 && <MediaThumbs mediaIds={item.mediaIds} />}
                                  </div>

                                  {item.scheduledFor && (
                                    <div>
                                      <span className="formLabel">Scheduled for: </span>
                                      <span className="mono subtle">{new Date(item.scheduledFor).toLocaleString()}</span>
                                    </div>
                                  )}

                                  <div>
                                    <span className="formLabel">Created: </span>
                                    <span className="mono subtle">{new Date(item.createdAt).toLocaleString()}</span>
                                  </div>

                                  {item.errorMessage && (
                                    <div>
                                      <div className="formLabel" style={{ marginBottom: 4 }}>Error</div>
                                      <div className="receiptBox" style={{ color: 'var(--err)' }}>{item.errorMessage}</div>
                                    </div>
                                  )}

                                  {item.receiptJson != null && (
                                    <div>
                                      <div className="formLabel" style={{ marginBottom: 4 }}>Receipt</div>
                                      <div className="receiptBox">{JSON.stringify(item.receiptJson, null, 2)}</div>
                                    </div>
                                  )}

                                  {(item.status === 'queued' || item.status === 'needs review' || item.status === 'failed') && (
                                    <div className="queueDetailActions">
                                      <button type="button" className="btn primary" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handlePublishNow(item.draftId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <IconSend width={16} height={16} /> Publish Now
                                      </button>
                                      <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleStartEdit(item); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <IconEdit width={16} height={16} /> Edit
                                      </button>
                                      <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleStartReschedule(item); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <IconClock width={16} height={16} /> Reschedule
                                      </button>
                                      {(item.status === 'queued' || item.status === 'failed') && (
                                        <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleBackToDraft(item.draftId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                          <IconRefresh width={16} height={16} /> Back to Draft
                                        </button>
                                      )}
                                      <button type="button" className="queueDeleteLink" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleCancel(item.draftId); }}>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                  {item.status === 'succeeded' && (
                                    <span className="subtle" style={{ fontSize: '0.88rem' }}>Published successfully</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
            </table>
          </div>

          {/* Mobile card list */}
          <div className="mobileOnly" style={{ gap: 12 }}>
            {items.map((item) => {
              const isExpanded = expandedId === item.fullId;
              return (
                <div
                  key={item.fullId}
                  className="listItem"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(item.fullId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(item.fullId); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <ProviderIcon provider={item.provider} size={18} />
                    <span style={{ fontWeight: 680, flex: 1, minWidth: 0 }}>{item.displayName}</span>
                    {pillForStatus(item.status)}
                  </div>
                  <p className="subtle" style={{ margin: '6px 0', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {isExpanded ? item.fullContent : item.content}{!isExpanded && item.fullContent.length > 60 ? '...' : ''}
                  </p>
                  <div className="chips" style={{ marginTop: 4 }}>
                    <StatusPill tone="neutral">{item.mode}</StatusPill>
                    <span className="mono subtle" style={{ fontSize: '0.82rem' }}>{item.id}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      {editingId === item.fullId ? (
                        <>
                          <textarea
                            className="formTextarea"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ minHeight: 100 }}
                          />
                          <MediaToolbar mediaIds={editMediaIds} onChange={setEditMediaIds} />
                          <div className="queueDetailActions">
                            <button type="button" className="btn primary" disabled={actionLoading === item.draftId || !editContent.trim()} onClick={(e) => { e.stopPropagation(); handleSaveEdit(item.draftId); }}>Save</button>
                            <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}>Cancel</button>
                          </div>
                        </>
                      ) : reschedulingId === item.fullId ? (
                        <>
                          <div>
                            <div className="formLabel" style={{ marginBottom: 4 }}>New date & time</div>
                            <div onClick={(e) => e.stopPropagation()}><DateTimePicker value={rescheduleValue} onChange={setRescheduleValue} /></div>
                          </div>
                          <div className="queueDetailActions">
                            <button type="button" className="btn primary" disabled={actionLoading === item.draftId || !rescheduleValue} onClick={(e) => { e.stopPropagation(); handleSaveReschedule(item.draftId); }}>Save Schedule</button>
                            <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setReschedulingId(null); }}>Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {item.mediaIds.length > 0 && <MediaThumbs mediaIds={item.mediaIds} />}
                          {item.scheduledFor && (
                            <div>
                              <span className="formLabel">Scheduled: </span>
                              <span className="mono subtle" style={{ fontSize: '0.85rem' }}>{new Date(item.scheduledFor).toLocaleString()}</span>
                            </div>
                          )}
                          <div>
                            <span className="formLabel">Created: </span>
                            <span className="mono subtle" style={{ fontSize: '0.85rem' }}>{new Date(item.createdAt).toLocaleString()}</span>
                          </div>
                          {item.errorMessage && (
                            <div className="receiptBox" style={{ color: 'var(--err)' }}>{item.errorMessage}</div>
                          )}
                          {item.receiptJson != null && (
                            <div className="receiptBox">{JSON.stringify(item.receiptJson, null, 2)}</div>
                          )}
                          {(item.status === 'queued' || item.status === 'needs review' || item.status === 'failed') && (
                            <div className="queueDetailActions">
                              <button type="button" className="btn primary" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handlePublishNow(item.draftId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <IconSend width={16} height={16} /> Publish Now
                              </button>
                              <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleStartEdit(item); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <IconEdit width={16} height={16} /> Edit
                              </button>
                              <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleStartReschedule(item); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <IconClock width={16} height={16} /> Reschedule
                              </button>
                              {(item.status === 'queued' || item.status === 'failed') && (
                                <button type="button" className="btn" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleBackToDraft(item.draftId); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <IconRefresh width={16} height={16} /> Back to Draft
                                </button>
                              )}
                              <button type="button" className="queueDeleteLink" disabled={actionLoading === item.draftId} onClick={(e) => { e.stopPropagation(); handleCancel(item.draftId); }}>
                                Delete
                              </button>
                            </div>
                          )}
                          {item.status === 'succeeded' && (
                            <span className="subtle" style={{ fontSize: '0.88rem' }}>Published successfully</span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
