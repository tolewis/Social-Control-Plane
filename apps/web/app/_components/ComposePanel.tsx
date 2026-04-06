'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProviderIcon } from './icons';
import { StatusPill } from './ui';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { DateTimePicker } from './DateTimePicker';
import { MediaToolbar } from './MediaPicker';
import { useConnections } from '../hooks/useConnections';
import { createDraft } from '../_lib/api';
import type { PublishMode } from '../_lib/api';

const CHAR_LIMITS: Record<string, number> = {
  x: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
};

function getCharLimit(provider: string | undefined): number {
  if (!provider) return 3000;
  return CHAR_LIMITS[provider] ?? 3000;
}

export function ComposePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { connections, loading } = useConnections();

  const [connectionId, setConnectionId] = useState('');
  const [publishMode, setPublishMode] = useState<PublishMode>('draft-human');
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedAccounts = useMemo(
    () => connections.filter((c) => c.status === 'connected'),
    [connections],
  );

  const selectedConnection = useMemo(
    () => connectedAccounts.find((c) => c.id === connectionId),
    [connectedAccounts, connectionId],
  );

  const connectionOptions: SelectOption[] = useMemo(
    () => connectedAccounts.map((c) => ({
      value: c.id,
      label: c.displayName || c.provider,
      icon: <ProviderIcon provider={c.provider} size={20} />,
      meta: c.provider,
    })),
    [connectedAccounts],
  );

  const charLimit = getCharLimit(selectedConnection?.provider);
  const charCount = content.length;
  const isOver = charCount > charLimit;
  const canSubmit = connectionId && content.trim().length > 0 && !isOver && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createDraft({ connectionId, publishMode, content, mediaIds: mediaIds.length > 0 ? mediaIds : undefined, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined });
      onClose();
      if (publishMode.startsWith('draft')) {
        router.push('/review');
      } else {
        router.push('/queue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, connectionId, publishMode, content, mediaIds, scheduledFor, router, onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400, maxWidth: '100vw', height: '100%',
          background: 'var(--bg)', borderLeft: '1px solid var(--border)',
          padding: 24, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Draft</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        </div>

        {loading && <p className="subtle">Loading connections...</p>}

        {!loading && connectedAccounts.length === 0 && (
          <div className="emptyState">
            <p className="subtle">No connected accounts. <a href="/connections" style={{ color: 'var(--accent)' }}>Connect one</a></p>
          </div>
        )}

        {!loading && connectedAccounts.length > 0 && (
          <>
            {error && <StatusPill tone="err">{error}</StatusPill>}

            <div className="formGroup">
              <label className="formLabel">Account</label>
              <CustomSelect options={connectionOptions} value={connectionId} onChange={setConnectionId} placeholder="Select account..." />
            </div>

            <div className="formGroup">
              <span className="formLabel">Mode</span>
              <div className="toggleGroup">
                <button type="button" className={publishMode === 'draft-human' ? 'toggleBtn active' : 'toggleBtn'} onClick={() => setPublishMode('draft-human')}>
                  Draft for review
                </button>
                <button type="button" className={publishMode === 'direct-human' ? 'toggleBtn active' : 'toggleBtn'} onClick={() => setPublishMode('direct-human')}>
                  Publish directly
                </button>
              </div>
            </div>

            <div className="formGroup">
              <label className="formLabel">Content</label>
              <textarea
                className="formTextarea"
                placeholder="What do you want to say?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{ minHeight: 120 }}
              />
              <MediaToolbar mediaIds={mediaIds} onChange={setMediaIds} />
              <div className={isOver ? 'charCount over' : 'charCount'} style={{ marginTop: 4 }}>
                {charCount} / {charLimit}
              </div>
            </div>

            <div className="formGroup">
              <label className="formLabel">Schedule (optional)</label>
              <DateTimePicker value={scheduledFor} onChange={setScheduledFor} placeholder="Pick date & time" />
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={!canSubmit}
              onClick={handleSubmit}
              style={{ opacity: canSubmit ? 1 : 0.5, width: '100%' }}
            >
              {submitting ? 'Creating...' : publishMode.startsWith('draft') ? 'Create Draft' : 'Queue for Publishing'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
