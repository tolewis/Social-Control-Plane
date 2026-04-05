import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import type { DraftGenerateVisualJobData } from '../types.js';

// Uploads directory — same convention as apps/api
const UPLOADS_DIR = resolve(join(import.meta.dirname ?? '.', '../../../../uploads'));

export async function handleDraftGenerateVisual(
  job: Job<DraftGenerateVisualJobData, unknown, 'draft.generate-visual'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true }> {
  const { db, log } = ctx;
  const { draftId, templateName, templateData } = job.data;

  log.info('draft.generate-visual.start', { jobId: job.id, draftId, templateName });

  // 1. Verify draft exists
  const draft = await db.draft.findUnique({ where: { id: draftId } });
  if (!draft) {
    log.error('draft.generate-visual.draft_not_found', { jobId: job.id, draftId });
    throw new Error(`Draft not found: ${draftId}`);
  }

  await job.updateProgress({ step: 'rendering' });

  // 2. Ensure uploads directory exists
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // 3. Lazy-import visual-engine (avoids compile-time dep issues)
  const modPath = '@scp/' + 'visual-engine';
  const { generateInfographic } = await import(/* webpackIgnore: true */ modPath) as {
    generateInfographic: (name: string, data: unknown) => Promise<Buffer>;
  };

  // 4. Render — let errors propagate so BullMQ retries the job
  let buf: Buffer;
  try {
    buf = await generateInfographic(templateName, templateData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('draft.generate-visual.render_error', { jobId: job.id, err: msg });
    throw new Error(`Render failed for template "${templateName}": ${msg}`);
  }

  await job.updateProgress({ step: 'saving' });

  // 5. Save to disk + Media record
  const filename = `visual-${draftId}-${Date.now()}.png`;
  const storagePath = join(UPLOADS_DIR, filename);
  try {
    writeFileSync(storagePath, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('draft.generate-visual.write_error', { jobId: job.id, storagePath, err: msg });
    throw new Error(`Failed to write image: ${msg}`);
  }

  const media = await db.media.create({
    data: {
      filename,
      originalName: `${templateName}.png`,
      mimeType: 'image/png',
      sizeBytes: buf.length,
      storagePath,
      width: 1080,
      height: 1350,
    },
  });

  // 6. Create VisualSpec + attach to draft
  await db.visualSpec.create({
    data: {
      draftId,
      templateName,
      templateData,
      generatedMediaId: media.id,
    },
  });

  const existingMedia = Array.isArray(draft.mediaJson) ? (draft.mediaJson as string[]) : [];
  await db.draft.update({
    where: { id: draftId },
    data: {
      mediaJson: [...existingMedia, media.id],
      updatedAt: new Date(),
    },
  });

  log.info('draft.generate-visual.succeeded', {
    jobId: job.id,
    draftId,
    mediaId: media.id,
    sizeBytes: buf.length,
  });

  await job.updateProgress({ step: 'succeeded' });
  return { ok: true };
}
