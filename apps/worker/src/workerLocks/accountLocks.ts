import { DelayedError, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import type { Logger } from '../workerLogger.js';
import type { ScpJobData, ScpJobName } from '../workerJobs/types.js';

type AccountLock = {
  acquired: true;
  accountId: string;
  key: string;
  value: string;
};

export function createAccountLockManager(opts: {
  redisUrl: string;
  workerId: string;
  log: Logger;
  lockTtlMs: number;
}) {
  const redis = new Redis(opts.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const lockKey = (accountId: string) => `scp:locks:account:${accountId}`;
  const lockValue = (accountId: string) => `${opts.workerId}:${accountId}:${Date.now()}`;

  async function acquireOrDelay(
    job: Job<ScpJobData, unknown, ScpJobName>,
    accountId: string,
  ): Promise<AccountLock> {
    if (!accountId) {
      opts.log.error('lock.missing_account_id', { jobId: job.id, name: job.name });
      throw new Error('Job missing accountId');
    }

    const key = lockKey(accountId);
    const value = lockValue(accountId);

    const setResult = await redis.set(key, value, 'PX', opts.lockTtlMs, 'NX');
    if (setResult === 'OK') {
      return { acquired: true, accountId, key, value };
    }

    // Another job for this account is active. We want serialized-per-account,
    // so move back to delayed with a small jitter.
    const baseDelayMs = 2_000;
    const jitterMs = Math.floor(Math.random() * 1_000);
    const delayMs = baseDelayMs + jitterMs;

    opts.log.debug('lock.busy_delay', {
      jobId: job.id,
      name: job.name,
      accountId,
      delayMs,
    });

    await job.moveToDelayed(Date.now() + delayMs, job.token);

    // BullMQ expects DelayedError when a job moves itself back to delayed.
    throw new DelayedError();
  }

  async function release(lock: AccountLock): Promise<void> {
    // Atomic compare-and-delete.
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

    const result = await redis.eval(script, 1, lock.key, lock.value);
    if (result !== 1) {
      opts.log.warn('lock.release_missed', {
        accountId: lock.accountId,
        key: lock.key,
        result,
      });
    }
  }

  async function close(): Promise<void> {
    await redis.quit();
  }

  return {
    acquireOrDelay,
    release,
    close,
  };
}
