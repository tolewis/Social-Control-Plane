export const QUEUE_NAME = 'scp-jobs' as const;

export type Provider = 'linkedin' | 'facebook' | 'instagram' | 'x';
export type PublishMode = 'draft-human' | 'draft-agent' | 'direct-human' | 'direct-agent';

export type DraftPublishJobData = {
  accountId: string;
  draftId: string;
  connectionId: string;
  provider: Provider;
  publishMode: PublishMode;
  /** ISO timestamp */
  scheduledFor?: string;
  /** Optional idempotency key for upstream de-dupe */
  idempotencyKey?: string;
};

export type DraftReconcileJobData = {
  accountId: string;
  /** Optional list of draft IDs to reconcile; if omitted, reconcile "recent" */
  draftIds?: string[];
  reason?: 'stuck' | 'manual' | 'scheduled';
};

export type DraftCancelJobData = {
  accountId: string;
  draftId: string;
  reason?: string;
};

export type DraftGenerateVisualJobData = {
  accountId: string;
  draftId: string;
  templateName: string;
  templateData: Record<string, unknown>;
};

export type JobNameToData = {
  'draft.publish': DraftPublishJobData;
  'draft.reconcile': DraftReconcileJobData;
  'draft.cancel': DraftCancelJobData;
  'draft.generate-visual': DraftGenerateVisualJobData;
};

export type ScpJobName = keyof JobNameToData;

/**
 * When typing BullMQ generics we often need a single "data" type.
 * This is the union of all job payloads.
 */
export type ScpJobData = JobNameToData[ScpJobName];

const JOB_NAMES: ReadonlySet<string> = new Set<string>([
  'draft.publish',
  'draft.reconcile',
  'draft.cancel',
  'draft.generate-visual',
]);

export function isScpJobName(name: string): name is ScpJobName {
  return JOB_NAMES.has(name);
}

/**
 * Job ID conventions (recommended).
 *
 * These let cancel/reconcile jobs target specific work without scanning the queue.
 * Producers SHOULD use these as jobId when enqueueing.
 */
export const JobIds = {
  draftPublish: (draftId: string) => `draft:publish:${draftId}`,
  draftCancel: (draftId: string) => `draft:cancel:${draftId}`,
  draftReconcile: (accountId: string) => `draft:reconcile:${accountId}`,
} as const;
