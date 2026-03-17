import type { Job, Queue } from 'bullmq';

import type { Logger } from '../../workerLogger.js';
import type { DraftCancelJobData } from '../types.js';
import { JobIds } from '../types.js';

/**
 * Cancel handler (best-effort).
 *
 * Contract:
 * - Producers should enqueue publish jobs with jobId = JobIds.draftPublish(draftId)
 * - Cancel jobs attempt to remove that publish job if still waiting/delayed
 */
export async function handleDraftCancel(
  job: Job<DraftCancelJobData, unknown, 'draft.cancel'>,
  ctx: { log: Logger; queue: Queue },
): Promise<{ ok: true; removed: boolean }>
{
  ctx.log.info('draft.cancel.start', {
    jobId: job.id,
    accountId: job.data.accountId,
    draftId: job.data.draftId,
    reason: job.data.reason,
  });

  const publishJobId = JobIds.draftPublish(job.data.draftId);

  let removed = false;
  try {
    const result = await ctx.queue.remove(publishJobId);
    removed = result === 1;
  } catch (err) {
    // If it doesn't exist or is locked/active, treat as best-effort.
    ctx.log.warn('draft.cancel.remove_failed', {
      jobId: job.id,
      publishJobId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  ctx.log.info('draft.cancel.done', {
    jobId: job.id,
    accountId: job.data.accountId,
    draftId: job.data.draftId,
    removed,
  });

  return { ok: true, removed };
}
