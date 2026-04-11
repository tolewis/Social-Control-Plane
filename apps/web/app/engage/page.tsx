'use client';

import { useState, useCallback, useEffect } from 'react';
import { StatusPill } from '../_components/ui';
import { useEngageComments, useEngagePosts, useEngageStats } from '../hooks/useEngage';
import { approveEngageComment, rejectEngageComment, type EngageCommentRecord, type EngagePostRecord } from '../_lib/api';

type StatusFilter = 'all' | 'pending_review' | 'approved' | 'posted' | 'rejected' | 'failed';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

function statusTone(status: string): 'ok' | 'warn' | 'err' | 'neutral' | 'info' {
  switch (status) {
    case 'pending_review': return 'warn';
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

  const startEdit = (c: EngageCommentRecord) => {
    setEditingId(c.id);
    setEditText(c.commentText);
    setExpandedId(c.id);
  };

  return (
    <div>
      <p className="subtle desktopOnly" style={{ marginBottom: 12, marginTop: -4 }}>
        Community comments on fishing Facebook pages
      </p>

      {/* ---- Stats ---- */}
      {stats && (
        <div className="engageStats">
          <div className="engageStat">
            <div className="label">Today</div>
            <div className="value">{stats.today}<span className="subtle" style={{ fontSize: '0.75rem', fontWeight: 400 }}> / {stats.dailyCap}</span></div>
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
  comment: c, expanded, onToggle, onApprove, onReject, onStartEdit,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: CommentRowProps) {
  const pageName = c.engagePost?.engagePage?.name ?? '—';
  const postText = c.engagePost?.postText ?? '';
  const isPending = c.status === 'pending_review';
  const isLoading = actionLoading === c.id;

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }} role="button">
        <td><span className="engagePageBadge">{pageName}</span></td>
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
          {isPending && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn sm" disabled={isLoading} onClick={e => { e.stopPropagation(); onApprove(c.id); }}>
                {isLoading ? '...' : 'Approve'}
              </button>
              <button className="btn sm ghost" disabled={isLoading} onClick={e => { e.stopPropagation(); setRejectingId(c.id); onToggle(); }}>
                Reject
              </button>
            </div>
          )}
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
  comment: c, expanded, onToggle, onApprove, onReject, onStartEdit,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: CommentRowProps) {
  const pageName = c.engagePost?.engagePage?.name ?? '—';

  return (
    <div className={`engageCard ${expanded ? 'expanded' : ''}`} onClick={onToggle} role="button">
      <div className="engageCardHeader">
        <span className="engagePageBadge">{pageName}</span>
        <StatusPill tone={statusTone(c.status)}>{statusLabel(c.status)}</StatusPill>
        <span className={`engageSlopBadge ${slopClass(c.slopScore)}`}>{c.slopScore}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>{timeAgo(c.createdAt)}</span>
      </div>
      <div className="engageCommentPreview">{c.commentText}</div>

      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          <ExpandedContent
            comment={c}
            onApprove={onApprove}
            onReject={onReject}
            onStartEdit={onStartEdit}
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
  comment: c, onApprove, onReject, onStartEdit,
  actionLoading, rejectingId, setRejectingId, rejectNote, setRejectNote,
  editingId, editText, setEditText, setEditingId,
}: Omit<CommentRowProps, 'expanded' | 'onToggle'>) {
  const isPending = c.status === 'pending_review';
  const isLoading = actionLoading === c.id;
  const postText = c.engagePost?.postText ?? '';
  const postUrl = c.engagePost?.postUrl;
  const pageName = c.engagePost?.engagePage?.name ?? '';

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
                View on Facebook &#8599;
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

      {/* Rejection note */}
      {c.rejectionNote && (
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
      {isPending && editingId !== c.id && (
        <div className="engageActions">
          <button className="btn sm" disabled={isLoading} onClick={() => onApprove(c.id)}>
            {isLoading ? '...' : 'Approve'}
          </button>
          <button className="btn sm ghost" onClick={() => onStartEdit(c)}>
            Edit & Approve
          </button>
          {rejectingId === c.id ? (
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
          ) : (
            <button className="btn sm ghost" disabled={isLoading} onClick={() => setRejectingId(c.id)}>
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Discovered post card (Posts tab)                                    */
/* ------------------------------------------------------------------ */

function PostCard({ post }: { post: EngagePostRecord }) {
  const pageName = post.engagePage?.name ?? '—';
  const category = post.engagePage?.category ?? '';

  return (
    <div className="engageCard" style={{ cursor: 'default' }}>
      <div className="engageCardHeader">
        <span className="engagePageBadge">{pageName}</span>
        {category && <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{category}</span>}
        {post.commented ? (
          <StatusPill tone="ok">commented</StatusPill>
        ) : (
          <StatusPill tone="neutral">available</StatusPill>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--muted)' }}>
          {timeAgo(post.discoveredAt)}
        </span>
      </div>
      <div style={{ fontSize: '0.88rem', lineHeight: 1.5, marginTop: 4 }}>
        {post.postText || <span className="subtle">No text captured</span>}
      </div>
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
