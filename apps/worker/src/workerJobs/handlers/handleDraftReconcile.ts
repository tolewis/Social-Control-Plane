import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import type { DraftReconcileJobData } from '../types.js';

/** Jobs stuck in PROCESSING longer than this are considered timed out. */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reconciliation handler.
 *
 * Finds PublishJobs stuck in PROCESSING for > 5 minutes and marks them FAILED
 * with "reconciliation_timeout". Future work: call provider APIs to check
 * actual outcome before marking failed.
 */
export async function handleDraftReconcile(
  job: Job<DraftReconcileJobData, unknown, 'draft.reconcile'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true; reconciled: number }> {
  const { log, db } = ctx;

  log.info('draft.reconcile.start', {
    jobId: job.id,
    accountId: job.data.accountId,
    reason: job.data.reason,
    draftIds: job.data.draftIds,
  });

  await job.updateProgress({ step: 'scanning' });

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  // Build the where clause: PROCESSING jobs older than cutoff,
  // optionally scoped to specific drafts.
  const where: Record<string, unknown> = {
    status: 'PROCESSING',
    updatedAt: { lt: cutoff },
  };

  if (job.data.draftIds && job.data.draftIds.length > 0) {
    where.draftId = { in: job.data.draftIds };
  }

  let reconciled = 0;
  try {
    const result = await db.publishJob.updateMany({
      where,
      data: {
        status: 'FAILED',
        errorMessage: 'reconciliation_timeout',
        updatedAt: new Date(),
      },
    });
    reconciled = result.count;
  } catch (err) {
    log.error('draft.reconcile.db_error', {
      jobId: job.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await job.updateProgress({ step: 'done' });

  log.info('draft.reconcile.done', {
    jobId: job.id,
    accountId: job.data.accountId,
    reconciled,
  });

  return { ok: true, reconciled };
}
