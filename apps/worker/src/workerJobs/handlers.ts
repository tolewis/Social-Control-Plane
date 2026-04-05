import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../db.js';
import type { Logger } from '../workerLogger.js';
import type { JobNameToData, ScpJobName } from './types.js';
import { handleDraftCancel } from './handlers/handleDraftCancel.js';
import { handleDraftGenerateVisual } from './handlers/handleDraftGenerateVisual.js';
import { handleDraftPublish } from './handlers/handleDraftPublish.js';
import { handleDraftReconcile } from './handlers/handleDraftReconcile.js';

type HandlerMap = {
  [K in ScpJobName]: (
    job: Job<JobNameToData[K], unknown, K>,
  ) => Promise<unknown>;
};

export function createJobHandlers(ctx: { log: Logger; queue: Queue; db: DbClient }): HandlerMap {
  return {
    'draft.publish': (job) => handleDraftPublish(job, ctx),
    'draft.reconcile': (job) => handleDraftReconcile(job, ctx),
    'draft.cancel': (job) => handleDraftCancel(job, ctx),
    'draft.generate-visual': (job) => handleDraftGenerateVisual(job, ctx),
  };
}
