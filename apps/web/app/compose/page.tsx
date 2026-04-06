'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProviderIcon } from '../_components/icons';
import { StatusPill } from '../_components/ui';
import { CustomSelect, type SelectOption } from '../_components/CustomSelect';
import { DateTimePicker } from '../_components/DateTimePicker';
import { MediaToolbar } from '../_components/MediaPicker';
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

export default function ComposePage() {
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
  }, [canSubmit, connectionId, publishMode, content, mediaIds, scheduledFor, router]);

  if (loading) {
    return <section><p className="subtle">Loading connections...</p></section>;
  }

  if (connectedAccounts.length === 0) {
    return (
      <section>
        <div className="emptyState">
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No connected accounts</p>
          <p className="subtle" style={{ marginTop: 8 }}>
            <a href="/connections" style={{ color: 'var(--accent)' }}>Connect an account</a> to compose a post.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      {error && <div style={{ marginTop: 12 }}><StatusPill tone="err">{error}</StatusPill></div>}

      <div className="composeForm" style={{ maxWidth: 560 }}>
        <div className="formGroup">
          <label className="formLabel">Account</label>
          <CustomSelect options={connectionOptions} value={connectionId} onChange={setConnectionId} placeholder="Select an account..." />
        </div>

        <div className="formGroup">
          <span className="formLabel">Mode</span>
          <div className="toggleGroup">
            <button type="button" className={publishMode === 'draft-human' ? 'toggleBtn active' : 'toggleBtn'} onClick={() => setPublishMode('draft-human')}>Draft for review</button>
            <button type="button" className={publishMode === 'direct-human' ? 'toggleBtn active' : 'toggleBtn'} onClick={() => setPublishMode('direct-human')}>Publish directly</button>
          </div>
        </div>

        <div className="formGroup">
          <label className="formLabel">Content</label>
          <div className="composeContentWrap">
            <textarea
              className="formTextarea composeContentArea"
              placeholder="What do you want to say?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ minHeight: Math.max(140, Math.min(400, content.split('\n').length * 24 + 48)) }}
            />
            <MediaToolbar mediaIds={mediaIds} onChange={setMediaIds} />
          </div>
          <div className={isOver ? 'charCount over' : 'charCount'}>{charCount} / {charLimit}</div>
        </div>

        <div className="formGroup">
          <label className="formLabel">Schedule (optional)</label>
          <DateTimePicker value={scheduledFor} onChange={setScheduledFor} placeholder="Pick date & time" />
        </div>

        <button type="button" className="btn primary" disabled={!canSubmit} onClick={handleSubmit} style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {submitting ? 'Creating...' : publishMode.startsWith('draft') ? 'Create Draft' : 'Queue for Publishing'}
        </button>
      </div>
    </section>
  );
}
