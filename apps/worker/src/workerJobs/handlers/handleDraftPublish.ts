import type { Job, Queue } from 'bullmq';

import type { Logger } from '../../workerLogger.js';
import type { DraftPublishJobData } from '../types.js';

/**
 * Draft publish handler (skeleton).
 *
 * This is intentionally narrow: the worker owns the execution spine, but not the
 * DB schema or API routes. This function should evolve to:
 * - load draft record from DB
 * - refresh provider tokens as needed
 * - call provider publish adapter
 * - persist result + external post id
 */
export async function handleDraftPublish(
  job: Job<DraftPublishJobData, unknown, 'draft.publish'>,
  ctx: { log: Logger; queue: Queue },
): Promise<{ ok: true }>
{
  ctx.log.info('draft.publish.start', {
    jobId: job.id,
    accountId: job.data.accountId,
    draftId: job.data.draftId,
    connectionId: job.data.connectionId,
    provider: job.data.provider,
    publishMode: job.data.publishMode,
    scheduledFor: job.data.scheduledFor,
  });

  // Placeholder for real publishing.
  // For now: simulate minimal work and prove the job contract + serialization.
  await job.updateProgress({ step: 'queued->executing' });

  ctx.log.info('draft.publish.done', {
    jobId: job.id,
    accountId: job.data.accountId,
    draftId: job.data.draftId,
  });

  return { ok: true };
}
