import { Queue, QueueEvents, Worker, type Job } from 'bullmq';

import { makeConfig } from './workerConfig.js';
import { createLogger } from './workerLogger.js';
import {
  QUEUE_NAME,
  type JobNameToData,
  type ScpJobData,
  type ScpJobName,
  isScpJobName,
} from './workerJobs/types.js';
import { createAccountLockManager } from './workerLocks/accountLocks.js';
import { createJobHandlers } from './workerJobs/handlers.js';
import { getDb, disconnectDb } from './db.js';

async function main(): Promise<void> {
  const config = makeConfig(process.env);
  const log = createLogger({
    level: config.logLevel,
    service: 'scp-worker',
    workerId: config.workerId,
  });

  log.info('boot', {
    node: process.version,
    queueName: QUEUE_NAME,
    redisUrl: config.redisUrl,
    concurrency: config.concurrency,
  });

  const connection = {
    url: config.redisUrl,
    // Required for BullMQ blocking connections.
    // ioredis will otherwise throw after 20 retries in some cases.
    maxRetriesPerRequest: null,
  } as const;

  const queue = new Queue<ScpJobData, unknown, ScpJobName>(QUEUE_NAME, {
    connection,
  });

  const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady();

  const accountLocks = createAccountLockManager({
    redisUrl: config.redisUrl,
    workerId: config.workerId,
    log,
    lockTtlMs: config.accountLockTtlMs,
  });

  const db = await getDb();
  const handlers = createJobHandlers({ log, queue, db });

  const worker = new Worker<ScpJobData, unknown, ScpJobName>(
    QUEUE_NAME,
    async (job: Job<ScpJobData, unknown, ScpJobName>) => {
      if (!isScpJobName(job.name)) {
        log.error('job.unknown_name', { jobId: job.id, name: job.name });
        throw new Error(`Unknown job name: ${job.name}`);
      }

      // Studio jobs don't require account-level locks
      if (job.name === 'studio.render-batch') {
        return await handlers['studio.render-batch'](
          job as Job<JobNameToData['studio.render-batch'], unknown, 'studio.render-batch'>,
        );
      }
      if (job.name === 'studio.cleanup') {
        return await handlers['studio.cleanup'](
          job as Job<JobNameToData['studio.cleanup'], unknown, 'studio.cleanup'>,
        );
      }

      // Draft jobs use account-level locking
      const accountId = (job.data as { accountId?: string }).accountId;
      if (!accountId) throw new Error(`Job ${job.name} missing accountId`);
      const lock = await accountLocks.acquireOrDelay(job, accountId);

      try {
        switch (job.name) {
          case 'draft.publish':
            return await handlers['draft.publish'](
              job as Job<JobNameToData['draft.publish'], unknown, 'draft.publish'>,
            );
          case 'draft.reconcile':
            return await handlers['draft.reconcile'](
              job as Job<JobNameToData['draft.reconcile'], unknown, 'draft.reconcile'>,
            );
          case 'draft.cancel':
            return await handlers['draft.cancel'](
              job as Job<JobNameToData['draft.cancel'], unknown, 'draft.cancel'>,
            );
          case 'draft.generate-visual':
            return await handlers['draft.generate-visual'](
              job as Job<JobNameToData['draft.generate-visual'], unknown, 'draft.generate-visual'>,
            );
          default: {
            throw new Error(`Unknown job name: ${job.name}`);
          }
        }
      } finally {
        await accountLocks.release(lock);
      }
    },
    {
      connection,
      concurrency: config.concurrency,
      name: config.workerId,
    },
  );

  worker.on('ready', () => log.info('worker.ready'));
  worker.on('active', (job) => log.info('job.active', { jobId: job.id, name: job.name }));
  worker.on('completed', (job) =>
    log.info('job.completed', { jobId: job.id, name: job.name }),
  );
  worker.on('failed', (job, err) =>
    log.error('job.failed', {
      jobId: job?.id,
      name: job?.name,
      err: err?.message,
      stack: err?.stack,
    }),
  );
  worker.on('error', (err) =>
    log.error('worker.error', { err: err.message, stack: err.stack }),
  );

  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown.start', { signal });
    // Stop fetching new jobs and wait for active job to finish.
    await worker.close();
    await queueEvents.close();
    await queue.close();
    await accountLocks.close();
    await disconnectDb();
    log.info('shutdown.done');
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[scp-worker] fatal', err);
  process.exitCode = 1;
});
