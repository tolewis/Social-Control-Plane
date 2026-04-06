import type { Job } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import type { StudioRenderBatchJobData } from '../types.js';

/**
 * Studio batch render handler.
 *
 * 1. Load batch record from DB
 * 2. Generate variant configs via variation engine
 * 3. Render each variant via @scp/renderer
 * 4. Save previews to uploads/studio/{batchId}/
 * 5. Update batch record with results
 */
export async function handleStudioRenderBatch(
  job: Job<StudioRenderBatchJobData>,
  ctx: { log: Logger; db: DbClient },
): Promise<void> {
  const { batchId, config, options } = job.data;
  const { log, db } = ctx;

  log.info('studio.render-batch.start', { batchId, count: options.count ?? 25 });

  // Lazy-import renderer to avoid startup overhead
  const { render, generateVariants } = await import('@scp/renderer');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const sharp = (await import('sharp')).default;

  // Must match the API's UPLOADS_DIR — monorepo root /uploads (NOT /apps/uploads)
  const uploadsDir = resolve(join(import.meta.dirname ?? '.', '../../../../../uploads'));
  const batchDir = join(uploadsDir, 'studio', batchId);
  mkdirSync(batchDir, { recursive: true });

  // Update status to rendering
  await db.studioBatch.update({
    where: { id: batchId },
    data: { status: 'rendering' },
  });

  const variants = generateVariants(
    config,
    options as Parameters<typeof generateVariants>[1],
  );

  const results: Array<{
    index: number;
    previewPath: string;
    previewUrl: string;
    critiqueScore: number;
    critiqueStatus: string;
    stopRecommendation: string;
    width: number;
    height: number;
    sizeBytes: number;
    approved: boolean;
    mediaId: string | null;
    draftIds: string[];
  }> = [];

  let rendered = 0;

  for (let i = 0; i < variants.length; i++) {
    try {
      const result = await render(variants[i]);

      const filename = `variant-${String(i).padStart(3, '0')}.jpg`;
      const filePath = join(batchDir, filename);
      writeFileSync(filePath, result.image);

      // Get actual dimensions
      const meta = await sharp(result.image).metadata();

      results.push({
        index: i,
        previewPath: filePath,
        previewUrl: `/uploads/studio/${batchId}/${filename}`,
        critiqueScore: result.critique.overallScore,
        critiqueStatus: result.critique.status,
        stopRecommendation: result.critique.stopRecommendation,
        width: meta.width ?? result.config.width,
        height: meta.height ?? result.config.height,
        sizeBytes: result.image.length,
        approved: false,
        mediaId: null,
        draftIds: [],
      });

      rendered++;

      // Update progress every 5 variants
      if (rendered % 5 === 0 || rendered === variants.length) {
        await db.studioBatch.update({
          where: { id: batchId },
          data: { rendered, results: results as unknown as Record<string, unknown>[] },
        });
      }
    } catch (err) {
      log.error('studio.render-batch.variant_error', {
        batchId,
        variantIndex: i,
        error: err instanceof Error ? err.message : String(err),
      });

      results.push({
        index: i,
        previewPath: '',
        previewUrl: '',
        critiqueScore: 0,
        critiqueStatus: 'error',
        stopRecommendation: 'escalate',
        width: 0,
        height: 0,
        sizeBytes: 0,
        approved: false,
        mediaId: null,
        draftIds: [],
      });
    }
  }

  // Final update
  await db.studioBatch.update({
    where: { id: batchId },
    data: {
      status: 'complete',
      rendered,
      results: results as unknown as Record<string, unknown>[],
    },
  });

  log.info('studio.render-batch.complete', {
    batchId,
    rendered,
    total: variants.length,
    avgScore: results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.critiqueScore, 0) / results.length)
      : 0,
  });
}
