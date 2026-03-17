import type { Job, Queue } from 'bullmq';

import type { Logger } from '../../workerLogger.js';
import type { DraftReconcileJobData } from '../types.js';

/**
 * Reconciliation handler (skeleton).
 *
 * Intended future behavior:
 * - find drafts in "queued" / "publishing" states that are stuck
 * - verify provider post status when possible
 * - re-enqueue publish jobs or mark failed as appropriate
 */
export async function handleDraftReconcile(
  job: Job<DraftReconcileJobData, unknown, 'draft.reconcile'>,
  ctx: { log: Logger; queue: Queue },
): Promise<{ ok: true; reconciled: number }>
{
  const draftCount = job.data.draftIds?.length ?? 0;

  ctx.log.info('draft.reconcile.start', {
    jobId: job.id,
    accountId: job.data.accountId,
    reason: job.data.reason,
    draftCount,
  });

  await job.updateProgress({ step: 'scanning' });

  // No-op for now.
  ctx.log.info('draft.reconcile.done', {
    jobId: job.id,
    accountId: job.data.accountId,
    reconciled: 0,
  });

  return { ok: true, reconciled: 0 };
}
