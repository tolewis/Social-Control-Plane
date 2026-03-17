import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Pass URL string directly to BullMQ to avoid ioredis version mismatch between deps.
export const publishQueue = new Queue('scp-jobs', {
  connection: { url: REDIS_URL, maxRetriesPerRequest: null },
});
