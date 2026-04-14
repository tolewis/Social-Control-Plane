'use client';

import { useState, useCallback, useEffect } from 'react';
import { StatusPill } from '../_components/ui';
import { useEngageComments, useEngagePosts, useEngageStats } from '../hooks/useEngage';
import {
  approveEngageComment,
  rejectEngageComment,
  markEngageCommentPosted,
  fetchEngageConfigs,
  updateEngageConfig,
  type EngageCommentRecord,
  type EngagePostRecord,
  type EngageConfigRecord,
} from '../_lib/api';

type StatusFilter =
  | 'all'
  | 'pending_review'
  | 'needs_attention'
  | 'approved'
  | 'posted'
  | 'rejected'
  | 'failed';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'needs_attention', label: 'Action Required' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

function statusTone(status: string): 'ok' | 'warn' | 'err' | 'neutral' | 'info' {
  switch (status) {
    case 'pending_review': return 'warn';
    case 'needs_attention': return 'warn';
    case 'approved': return 'info';
    case 'posted': return 'ok';
    case 'rejected': return 'neutral';
    case 'failed': return 'err';
    case 'expired': return 'neutral';
    default: return 'neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_review': return 'pending';
    case 'needs_attention': return 'needs you';
    default: return status;
  }
}

function slopClass(score: number): string {
  if (score <= 10) return 'clean';
  if (score <= 30) return 'minor';
  return 'bad';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function targetIssueLabel(reason?: string | null): string {
  switch (reason) {
    case 'synthetic_fb_post_id':
      return 'needs direct post URL';
    default:
      return 'target needs refresh';
  }
}

/** Manual-post platforms have no working API — operator posts by hand. */
function isManualPlatform(platform?: string | null): boolean {
  return platform === 'reddit';
}

/**
 * Copy comment text to clipboard, then open the submission URL in a new tab.
 * Uses navigator.clipboard (desktop + mobile Safari/Chrome). Falls back to a
 * hidden textarea + execCommand for older or permission-restricted contexts.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type TabView = 'comments' | 'posts';

export default function EngagePage() {
  const [tab, setTab] = useState<TabView>('comments');
  const [filter, setFilter] = useState<StatusFilter>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('status') as StatusFilter) || 'all';
    }
    return 'all';
  });
  const { comments, loading, error, refetch } = useEngageComments(filter === 'all' ? undefined : filter);
  const { posts: discoveredPosts, loading: postsLoading, refetch: refetchPosts } = useEngagePosts();
  const { stats, refetch: refetchStats } = useEngageStats();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [configs, setConfigs] = useState<EngageConfigRecord[]>([]);
  const [configSaving, setConfigSaving] = useState<string | null>(null);

  const refetchConfigs = useCallback(() => {
    fetchEngageConfigs()
      .then(r => setConfigs(r.configs))
      .catch(() => { /* silent — bar will just show defaults */ });
  }, []);

  useEffect(() => {
    refetchConfigs();
  }, [refetchConfigs]);

  const handleConfigSave = useCallback(
    async (platform: string, patch: { enabled?: boolean; perRunCap?: number; runsPerDay?: number }) => {
      setConfigSaving(platform);
      setActionError(null);
      try {
        const r = await updateEngageConfig(platform, { ...patch, updatedBy: 'operator' });
        setConfigs(prev => prev.map(c => (c.platform === platform ? r.config : c)));
        setToast(`${platform} settings saved`);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `Failed to save ${platform} config`);
      } finally {
        setConfigSaving(null);
      }
    },
    [],
  );

  // Auto-clear toast after 2.5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Update URL when filter changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (filter === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', filter);
    window.history.replaceState({}, '', url.toString());
  }, [filter]);

  // Auto-refresh every 30s when viewing pending
  useEffect(() => {
    if (filter !== 'pending_review') return;
    const interval = setInterval(() => { refetch(); refetchStats(); }, 30000);
    return () => clearInterval(interval);
  }, [filter, refetch, refetchStats]);

  const handleApprove = useCallback(async (id: string, editedText?: string) => {
    setActionLoading(id);
    setActionError(null);
    try {
      await approveEngageComment(id, { reviewedBy: 'operator', editedText });
      refetch();
      refetchStats();
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  }, [refetch, refetchStats]);

  const handleReject = useCallback(async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    try {
      await rejectEngageComment(id, { reviewedBy: 'operator', rejectionNote: rejectNote || undefined });
      refetch();
      refetchStats();
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  }, [rejectNote, refetch, refetchStats]);

  /**
   * "Copy & Open" — copies the comment to clipboard, then opens the
   * submission URL in a new tab. The operator pastes and submits manually
   * on the target platform (Reddit primarily). Must run before window.open
   * so the clipboard write happens inside the user-gesture context.
   */
  const handleCopyAndOpen = useCallback(async (c: EngageCommentRecord) => {
    const url = c.engagePost?.postUrl;
    if (!url) {
      setToast('No submission URL on this comment');
      return;
    }
    const ok = await copyToClipboard(c.commentText);
    // Open AFTER clipboard to preserve the user gesture on mobile Safari.
    window.open(url, '_blank', 'noopener,noreferrer');
    setToast(ok ? 'Comment copied — paste into the open tab' : 'Open tab ready — copy failed, copy manually from SCP');
  }, []);

  const handleMarkPosted = useCallback(async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    try {
      await markEngageCommentPosted(id, { reviewedBy: 'operator' });
      refetch();
      refetchStats();
      setToast('Marked posted');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to mark posted');
    } finally {
      setActionLoading(null);
    }
  }, [refetch, refetchStats]);

  const startEdit = (c: EngageCommentRecord) => {
    setEditingId(c.id);
    setEditText(c.commentText);
    setExpandedId(c.id);
  };

  return (
    <div>
      <p className="subtle desktopOnly" style={{ marginBottom: 12, marginTop: -4 }}>
        Community comments on fishing pages and subreddits
      </p>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 'max(env(safe-area-inset-bottom), 24px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg2)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: '0.88rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000,
            maxWidth: '92vw',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}

      {/* ---- Stats ---- */}
      {stats && (
        <div className="engageStats">
          <div className="engageStat">
            <div className="label">Today</div>
            <div className="value">{stats.today}<span className="subtle" style={{ fontSize: '0.75rem', fontWeight: 400 }}> {stats.capMode === 'soft' ? `guide ${stats.dailyCap}` : `/ ${stats.dailyCap}`}</span></div>
          </div>
          <div className="engageStat">
            <div className="label">Pending</div>
            <div className={`value ${stats.pending > 0 ? 'warn' : ''}`}>{stats.pending}</div>
          </div>
          <div className="engageStat">
            <div className="label">Total Posted</div>
            <div className="value ok">{stats.totalPosted}</div>
          </div>
          <div className="engageStat">
            <div className="label">Active Pages</div>
            <div className="value">{stats.activePages}</div>
          </div>
        </div>
      )}

      {/* ---- Engage settings bar — per-platform on/off + per-run cap ---- */}
      {configs.length > 0 && (
        <div className="engageSettingsBar">
          {configs.map(cfg => (
            <EngageConfigRow
              key={cfg.platform}
              config={cfg}
              saving={configSaving === cfg.platform}
              onSave={patch => handleConfigSave(cfg.platform, patch)}
            />
          ))}
        </div>
      )}

      {/* ---- Tab switcher: Comments vs Posts ---- */}
      <div className="chips" style={{ marginBottom: 10 }}>
        <button className={`chip ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>
          Comments{comments.length > 0 ? ` (${comments.length})` : ''}
        </button>
        <button className={`chip ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>
          Discovered Posts{discoveredPosts.length > 0 ? ` (${discoveredPosts.length})` : ''}
        </button>
        <button className="chip" onClick={() => { refetch(); refetchPosts(); refetchStats(); }} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      {/* ---- Filter chips (comments tab only) ---- */}
      {tab === 'comments' && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {actionError && (
        <div style={{ color: 'var(--err)', fontSize: '0.85rem', marginBottom: 12 }}>{actionError}</div>
      )}

      {/* ============ COMMENTS TAB ============ */}
      {tab === 'comments' && (
        <>
          {loading && <p className="subtle">Loading...</p>}
          {error && <p style={{ color: 'var(--err)' }}>{error}</p>}

          {!loading && comments.length === 0 && (
            <div className="emptyState">
              <p className="subtle">No comments {filter !== 'all' ? `with status "${filter}"` : 'yet'}.</p>
              <p className="subtle" style={{ fontSize: '0.82rem' }}>Captain Bill will start generating soon.</p>
            </div>
          )}

          {/* Desktop table */}
          {!loading && comments.length > 0 && (
            <div className="engageDesktop">
              <div className="tableWrap">
                <table className="table engageTable">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th className="postCol">Post</th>
                      <th className="commentCol">Comment</th>
                      <th>Slop</th>
                      <th>Status</th>
                      <th>Age</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map(c => (
                      <CommentRow
                        key={c.id}
                        comment={c}
                        expanded={expandedId === c.id}
                        onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onStartEdit={startEdit}
                        onCopyAndOpen={handleCopyAndOpen}
                        onMarkPosted={handleMarkPosted}
                        actionLoading={actionLoading}
                        rejectingId={rejectingId}
                        setRejectingId={setRejectingId}
                        rejectNote={rejectNote}
                        setRejectNote={setRejectNote}
                        editingId={editingId}
                        editText={editText}
                        setEditText={setEditText}
                        setEditingId={setEditingId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mobile cards */}
          {!loading && comments.length > 0 && (
            <div className="engageMobile">
              {comments.map(c => (
                <CommentCard
                  key={c.id}
                  comment={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onStartEdit={startEdit}
                  onCopyAndOpen={handleCopyAndOpen}
                  onMarkPosted={handleMarkPosted}
                  actionLoading={actionLoading}
                  rejectingId={rejectingId}
                  setRejectingId={setRejectingId}
                  rejectNote={rejectNote}
                  setRejectNote={setRejectNote}
                  editingId={editingId}
                  editText={editText}
                  setEditText={setEditText}
                  setEditingId={setEditingId}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ POSTS TAB ============ */}
      {tab === 'posts' && (
        <>
          {postsLoading && <p className="subtle">Loading posts...</p>}

          {!postsLoading && discoveredPosts.length === 0 && (
            <div className="emptyState">
              <p className="subtle">No discovered posts yet.</p>
              <p className="subtle" style={{ fontSize: '0.82rem' }}>Run the scraper or tell Captain Bill to find posts.</p>
            </div>
          )}

          {!postsLoading && discoveredPosts.length > 0 && (
            <div>
              {discoveredPosts.map(post => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop: table row                                                 */
/* ------------------------------------------------------------------ */

type CommentRowProps = {
  comment: EngageCommentRecord;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (id: string, editedText?: string) => void;
  onReject: (id: string) => void;
  onStartEdit: (c: EngageCommentRecord) => void;
  onCopyAndOpen: (c: EngageCommentRecord) => void;
  onMarkPosted: (id: string) => void;
  actionLoading: string | null;
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectNote: string;
  setRejectNote: (v: string) => void;
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  setEditingId: (id: string | null) => void;
};

function CommentRow({
  comment: c, expanded, onToggle, onApprove, onReject, onStartEdit, onCopyAndOpen, onMarkPosted,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: CommentRowProps) {
  const pageName = c.engagePost?.engagePage?.name ?? '—';
  const platform = c.engagePost?.engagePage?.platform;
  const postText = c.engagePost?.postText ?? '';
  const isPending = c.status === 'pending_review' || c.status === 'needs_attention';
  const isApprovedManual = c.status === 'approved' && isManualPlatform(platform);
  const isPosted = c.status === 'posted';
  const isLoading = actionLoading === c.id;
  const targetReady = c.engagePost?.targetStatus?.isCommentable !== false;
  const hasUrl = !!c.engagePost?.postUrl;
  const manual = isManualPlatform(platform);

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }} role="button">
        <td>
          <span className="engagePageBadge">{pageName}</span>
          {platform && <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: 2 }}>{platform}</span>}
        </td>
        <td className="postCol">
          <div className="engageCommentPreview">{postText.slice(0, 80)}{postText.length > 80 ? '...' : ''}</div>
        </td>
        <td className="commentCol">
          <div className="engageCommentPreview">{c.commentText.slice(0, 100)}{c.commentText.length > 100 ? '...' : ''}</div>
        </td>
        <td><span className={`engageSlopBadge ${slopClass(c.slopScore)}`}>{c.slopScore}</span></td>
        <td><StatusPill tone={statusTone(c.status)}>{statusLabel(c.status)}</StatusPill></td>
        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--muted)' }}>{timeAgo(c.createdAt)}</td>
        <td>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {hasUrl && !isPosted && (
              <button
                className="btn sm"
                disabled={isLoading}
                title="Copy comment to clipboard and open the submission in a new tab"
                onClick={() => onCopyAndOpen(c)}
              >
                Copy & Open
              </button>
            )}
            {isPending && !manual && (
              <button className="btn sm" disabled={isLoading || !targetReady} onClick={() => onApprove(c.id)}>
                {isLoading ? '...' : 'Approve'}
              </button>
            )}
            {(isPending || isApprovedManual) && (
              <button
                className="btn sm"
                disabled={isLoading}
                title={manual
                  ? 'You posted this manually on Reddit — mark it done in SCP'
                  : 'You posted this manually on Facebook (reel, permission gate, etc.) — mark it done in SCP'}
                onClick={() => onMarkPosted(c.id)}
              >
                {isLoading ? '...' : 'Mark Posted'}
              </button>
            )}
            {isPending && (
              <button className="btn sm ghost" disabled={isLoading} onClick={() => { setRejectingId(c.id); if (!expanded) onToggle(); }}>
                Reject
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--bg0)' }}>
            <ExpandedContent
              comment={c}
              onApprove={onApprove}
              onReject={onReject}
              onStartEdit={onStartEdit}
              onCopyAndOpen={onCopyAndOpen}
              onMarkPosted={onMarkPosted}
              actionLoading={actionLoading}
              rejectingId={rejectingId}
              setRejectingId={setRejectingId}
              rejectNote={rejectNote}
              setRejectNote={setRejectNote}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              setEditingId={setEditingId}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile: card                                                       */
/* ------------------------------------------------------------------ */

function CommentCard({
  comment: c, expanded, onToggle, onApprove, onReject, onStartEdit, onCopyAndOpen, onMarkPosted,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: CommentRowProps) {
  const pageName = c.engagePost?.engagePage?.name ?? '—';
  const platform = c.engagePost?.engagePage?.platform;
  const hasUrl = !!c.engagePost?.postUrl;
  const isPosted = c.status === 'posted';
  const isLoading = actionLoading === c.id;

  return (
    <div className={`engageCard ${expanded ? 'expanded' : ''}`} onClick={onToggle} role="button">
      <div className="engageCardHeader">
        <span className="engagePageBadge">{pageName}</span>
        {platform && <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{platform}</span>}
        <StatusPill tone={statusTone(c.status)}>{statusLabel(c.status)}</StatusPill>
        <span className={`engageSlopBadge ${slopClass(c.slopScore)}`}>{c.slopScore}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>{timeAgo(c.createdAt)}</span>
      </div>
      <div className="engageCommentPreview">{c.commentText}</div>

      {/* Mobile quick action — prominent so you can copy-and-open without expanding */}
      {hasUrl && !isPosted && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
          <button
            className="btn sm"
            disabled={isLoading}
            onClick={() => onCopyAndOpen(c)}
            style={{ width: '100%' }}
          >
            Copy & Open {platform === 'reddit' ? 'Reddit' : 'Post'}
          </button>
        </div>
      )}

      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          <ExpandedContent
            comment={c}
            onApprove={onApprove}
            onReject={onReject}
            onStartEdit={onStartEdit}
            onCopyAndOpen={onCopyAndOpen}
            onMarkPosted={onMarkPosted}
            actionLoading={actionLoading}
            rejectingId={rejectingId}
            setRejectingId={setRejectingId}
            rejectNote={rejectNote}
            setRejectNote={setRejectNote}
            editingId={editingId}
            editText={editText}
            setEditText={setEditText}
            setEditingId={setEditingId}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared: expanded detail content                                    */
/* ------------------------------------------------------------------ */

function ExpandedContent({
  comment: c, onApprove, onReject, onStartEdit, onCopyAndOpen, onMarkPosted,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: Omit<CommentRowProps, 'expanded' | 'onToggle'>) {
  const isPending = c.status === 'pending_review' || c.status === 'needs_attention';
  const isNeedsAttention = c.status === 'needs_attention';
  const isPosted = c.status === 'posted';
  const isLoading = actionLoading === c.id;
  const postText = c.engagePost?.postText ?? '';
  const postUrl = c.engagePost?.postUrl;
  const pageName = c.engagePost?.engagePage?.name ?? '';
  const platform = c.engagePost?.engagePage?.platform;
  const manual = isManualPlatform(platform);
  const isApprovedManual = c.status === 'approved' && manual;
  const targetStatus = c.engagePost?.targetStatus;
  const targetReady = targetStatus?.isCommentable !== false;

  return (
    <div>
      {/* Two-column: original post (left) + our comment (right) */}
      <div className="engageExpandedGrid">
        {/* LEFT: Original Facebook post */}
        <div className="engageOriginalPost">
          <div className="engageExpandedLabel">
            Original Post on {pageName}
            {postUrl && (
              <a href={postUrl} target="_blank" rel="noopener noreferrer" className="engagePostLink">
                View on {platform === 'reddit' ? 'Reddit' : 'Facebook'} &#8599;
              </a>
            )}
          </div>
          <div className="engageOriginalPostBody">
            {postText || <span className="subtle">No post text captured</span>}
          </div>
        </div>

        {/* RIGHT: Our comment draft */}
        <div className="engageOurComment">
          <div className="engageExpandedLabel">Our Comment as TackleRoom</div>
          {editingId === c.id ? (
            <div>
              <textarea
                className="engageEditArea"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={4}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn sm" disabled={isLoading} onClick={() => onApprove(c.id, editText)}>
                  {isLoading ? '...' : 'Save & Approve'}
                </button>
                <button className="btn sm ghost" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="engageOurCommentBody">{c.commentText}</div>
          )}

          {/* KB sources */}
          {c.kbSources.length > 0 && (
            <div className="engageKbSources">
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginRight: 4 }}>KB:</span>
              {c.kbSources.map((src, i) => (
                <span key={i} className="engageKbTag">{src}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {targetStatus && !targetReady && (
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--warn)' }}>
          Target issue: {targetIssueLabel(targetStatus.reason)}
        </div>
      )}

      {/* Needs Attention banner — worker Graph API resolver flagged this
          comment as blocked by Facebook. Operator needs to click through,
          Like/Follow the target page, then re-approve. */}
      {isNeedsAttention && (
        <div className="needsAttentionBanner">
          <strong>Action required.</strong>{' '}
          {c.rejectionNote || 'This post needs manual review before Bill can comment.'}
          {postUrl && (
            <div style={{ marginTop: 6 }}>
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="engagePostLink"
              >
                Open post on Facebook &#8599;
              </a>
              {pageName && (
                <span className="subtle" style={{ marginLeft: 8 }}>
                  Like the &ldquo;{pageName}&rdquo; page as Tackle Room, then hit Approve.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rejection note — only show for truly rejected comments, not for
          needs_attention (that banner already renders the note above). */}
      {c.rejectionNote && !isNeedsAttention && (
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--err)' }}>
          Rejected: {c.rejectionNote}
        </div>
      )}

      {/* FB Comment ID (posted) */}
      {c.fbCommentId && (
        <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--muted)' }}>
          FB Comment: {c.fbCommentId}
        </div>
      )}

      {/* Actions */}
      {(isPending || isApprovedManual) && editingId !== c.id && (
        <div className="engageActions">
          {postUrl && !isPosted && (
            <button
              className="btn sm"
              disabled={isLoading}
              title="Copy the comment to your clipboard and open the submission in a new tab. Paste and post manually."
              onClick={() => onCopyAndOpen(c)}
            >
              Copy & Open
            </button>
          )}

          {isPending && !manual && (
            <button className="btn sm" disabled={isLoading || !targetReady} onClick={() => onApprove(c.id)}>
              {isLoading ? '...' : 'Approve'}
            </button>
          )}

          {(isPending || isApprovedManual) && (
            <button
              className="btn sm"
              disabled={isLoading}
              title={manual
                ? 'You posted this manually on Reddit — mark it done in SCP'
                : 'You posted this manually on Facebook (reel, permission gate, etc.) — mark it done in SCP'}
              onClick={() => onMarkPosted(c.id)}
            >
              {isLoading ? '...' : 'Mark Posted'}
            </button>
          )}

          {isPending && !manual && (
            <button className="btn sm ghost" disabled={!targetReady} onClick={() => onStartEdit(c)}>
              Edit & Approve
            </button>
          )}

          {isPending && rejectingId === c.id ? (
            <div className="engageRejectInput">
              <input
                placeholder="Reason (optional)"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onReject(c.id); }}
              />
              <button className="btn sm" style={{ background: 'var(--err)', color: '#fff' }} disabled={isLoading} onClick={() => onReject(c.id)}>
                {isLoading ? '...' : 'Reject'}
              </button>
              <button className="btn sm ghost" onClick={() => setRejectingId(null)}>Cancel</button>
            </div>
          ) : isPending ? (
            <button className="btn sm ghost" disabled={isLoading} onClick={() => setRejectingId(c.id)}>
              Reject
            </button>
          ) : null}
        </div>
      )}

      {manual && isPending && (
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--muted)' }}>
          {platform === 'reddit' ? 'Reddit' : platform} has no API — click "Copy & Open", paste, post manually, then "Mark Posted".
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Engage settings bar row — per-platform on/off + cap + runs/day      */
/* ------------------------------------------------------------------ */

function EngageConfigRow({
  config,
  saving,
  onSave,
}: {
  config: EngageConfigRecord;
  saving: boolean;
  onSave: (patch: { enabled?: boolean; perRunCap?: number; runsPerDay?: number }) => Promise<void>;
}) {
  const [cap, setCap] = useState(String(config.perRunCap));
  const [runs, setRuns] = useState(String(config.runsPerDay));

  // Keep local inputs in sync when the parent fetches a fresh config
  // (e.g. after save or another client update).
  useEffect(() => {
    setCap(String(config.perRunCap));
    setRuns(String(config.runsPerDay));
  }, [config.perRunCap, config.runsPerDay]);

  const dirty =
    Number(cap) !== config.perRunCap || Number(runs) !== config.runsPerDay;

  const platformLabel = config.platform === 'facebook' ? 'Facebook' : config.platform === 'reddit' ? 'Reddit' : config.platform;

  return (
    <div className={`engageConfigRow ${config.enabled ? '' : 'paused'}`}>
      <div className="engageConfigPlatform">
        <strong>{platformLabel}</strong>
      </div>

      <label className="engageConfigToggle" title={config.enabled ? 'Click to pause this engage cycle' : 'Click to resume'}>
        <input
          type="checkbox"
          checked={config.enabled}
          disabled={saving}
          onChange={e => onSave({ enabled: e.target.checked })}
        />
        <span>{config.enabled ? 'Enabled' : 'Paused'}</span>
      </label>

      <label className="engageConfigField">
        <span>Per-run cap</span>
        <input
          type="number"
          min={0}
          max={100}
          value={cap}
          disabled={saving || !config.enabled}
          onChange={e => setCap(e.target.value)}
        />
      </label>

      <label className="engageConfigField" title="Advisory display only — the actual schedule is owned by systemd timers.">
        <span>Runs/day</span>
        <input
          type="number"
          min={0}
          max={96}
          value={runs}
          disabled={saving || !config.enabled}
          onChange={e => setRuns(e.target.value)}
        />
      </label>

      <button
        className="btn sm"
        disabled={saving || !dirty}
        onClick={() => onSave({ perRunCap: Number(cap), runsPerDay: Number(runs) })}
      >
        {saving ? '...' : 'Save'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Discovered post card (Posts tab)                                    */
/* ------------------------------------------------------------------ */

function PostCard({ post }: { post: EngagePostRecord }) {
  const pageName = post.engagePage?.name ?? '—';
  const category = post.engagePage?.category ?? '';
  const targetReady = post.targetStatus?.isCommentable !== false;

  return (
    <div className="engageCard" style={{ cursor: 'default' }}>
      <div className="engageCardHeader">
        <span className="engagePageBadge">{pageName}</span>
        {category && <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{category}</span>}
        {post.commented ? (
          <StatusPill tone="ok">commented</StatusPill>
        ) : targetReady ? (
          <StatusPill tone="neutral">available</StatusPill>
        ) : (
          <StatusPill tone="warn">needs refresh</StatusPill>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--muted)' }}>
          {timeAgo(post.discoveredAt)}
        </span>
      </div>
      <div style={{ fontSize: '0.88rem', lineHeight: 1.5, marginTop: 4 }}>
        {post.postText || <span className="subtle">No text captured</span>}
      </div>
      {!targetReady && (
        <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--warn)' }}>
          {targetIssueLabel(post.targetStatus?.reason)}
        </div>
      )}
      {post.postUrl && (
        <a
          href={post.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '0.72rem', color: 'var(--info)', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}
        >
          View on Facebook &#8599;
        </a>
      )}
    </div>
  );
}
