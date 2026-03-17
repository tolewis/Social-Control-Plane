import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import type { DraftCancelJobData } from '../types.js';
import { JobIds } from '../types.js';

/**
 * Cancel handler.
 *
 * 1. Update the job status to CANCELED in DB
 * 2. Remove the BullMQ job from the queue if it's still waiting/delayed
 */
export async function handleDraftCancel(
  job: Job<DraftCancelJobData, unknown, 'draft.cancel'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true; removed: boolean; dbUpdated: number }> {
  const { log, queue, db } = ctx;
  const { draftId, accountId, reason } = job.data;

  log.info('draft.cancel.start', {
    jobId: job.id,
    accountId,
    draftId,
    reason,
  });

  // 1. Update job status to CANCELED in DB
  let dbUpdated = 0;
  try {
    const result = await db.publishJob.updateMany({
      where: {
        draftId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'CANCELED',
        errorMessage: reason ?? 'canceled',
        updatedAt: new Date(),
      },
    });
    dbUpdated = result.count;
  } catch (err) {
    log.error('draft.cancel.db_error', {
      jobId: job.id,
      draftId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Remove the BullMQ publish job from the queue if still waiting
  const publishJobId = JobIds.draftPublish(draftId);
  let removed = false;
  try {
    const result = await queue.remove(publishJobId);
    removed = result === 1;
  } catch (err) {
    // If it doesn't exist or is locked/active, treat as best-effort.
    log.warn('draft.cancel.remove_failed', {
      jobId: job.id,
      publishJobId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  log.info('draft.cancel.done', {
    jobId: job.id,
    accountId,
    draftId,
    removed,
    dbUpdated,
  });

  return { ok: true, removed, dbUpdated };
}
