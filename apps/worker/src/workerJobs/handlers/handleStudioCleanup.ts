import type { Job } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import type { StudioCleanupJobData } from '../types.js';

/**
 * Studio cleanup handler.
 * Deletes expired batch records and their preview files from disk.
 */
export async function handleStudioCleanup(
  job: Job<StudioCleanupJobData>,
  ctx: { log: Logger; db: DbClient },
): Promise<void> {
  const { log, db } = ctx;
  const { rmSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');

  // Must match the API's UPLOADS_DIR — monorepo root /uploads (NOT /apps/uploads)
  const uploadsDir = resolve(join(import.meta.dirname ?? '.', '../../../../../uploads'));

  if (job.data.batchId) {
    // Clean specific batch
    const batch = await db.studioBatch.findUnique({ where: { id: job.data.batchId } });
    if (batch) {
      const batchDir = join(uploadsDir, 'studio', batch.id);
      try { rmSync(batchDir, { recursive: true, force: true }); } catch { /* ignore */ }
      await db.studioBatch.delete({ where: { id: batch.id } });
      log.info('studio.cleanup.deleted', { batchId: batch.id });
    }
    return;
  }

  // Clean all expired batches
  const expired = await db.studioBatch.findMany({
    where: { expiresAt: { lt: new Date() } },
  });

  let cleaned = 0;
  for (const batch of expired) {
    const batchDir = join(uploadsDir, 'studio', batch.id);
    try { rmSync(batchDir, { recursive: true, force: true }); } catch { /* ignore */ }
    await db.studioBatch.delete({ where: { id: batch.id } });
    cleaned++;
  }

  log.info('studio.cleanup.complete', { expired: expired.length, cleaned });
}
