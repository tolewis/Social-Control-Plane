import os from 'node:os';

export type WorkerConfig = {
  redisUrl: string;
  concurrency: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  workerId: string;
  accountLockTtlMs: number;
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseLogLevel(value: string | undefined): WorkerConfig['logLevel'] {
  const v = (value ?? '').toLowerCase();
  switch (v) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return v;
    default:
      return 'info';
  }
}

export function makeConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';

  const concurrency = Math.max(1, parseIntEnv(env.WORKER_CONCURRENCY, 20));
  const accountLockTtlMs = Math.max(5_000, parseIntEnv(env.ACCOUNT_LOCK_TTL_MS, 5 * 60_000));

  const hostname = env.HOSTNAME ?? os.hostname();
  const workerId = env.WORKER_ID ?? `${hostname}:${process.pid}`;

  return {
    redisUrl,
    concurrency,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    workerId,
    accountLockTtlMs,
  };
}
