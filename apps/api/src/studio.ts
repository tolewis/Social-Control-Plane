/**
 * Studio API routes — Creative Studio for batch rendering + approval.
 *
 * Routes:
 *   GET  /studio/registry         — List primitives, presets, variant options
 *   POST /studio/preview          — Render single image, return URL + critique
 *   POST /studio/batch            — Start batch render (async via worker)
 *   GET  /studio/batch/:batchId   — Get batch status + results
 *   POST /studio/batch/:batchId/approve — Approve variants → create Media + Drafts
 *   DELETE /studio/batch/:batchId — Delete batch + previews
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Queue } from 'bullmq';

import type { PrismaClient } from '@prisma/client';

const UPLOADS_DIR = resolve(join(import.meta.dirname ?? '.', '../../../uploads'));
const STUDIO_DIR = join(UPLOADS_DIR, 'studio');

export function registerStudioRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  publishQueue: Queue,
): void {

  // ---- GET /studio/registry ----
  app.get('/studio/registry', async () => {
    const { getRegistry } = await import('@scp/renderer');
    return getRegistry();
  });

  // ---- POST /studio/preview ----
  app.post('/studio/preview', async (request, reply) => {
    const body = z.object({
      config: z.record(z.unknown()),
      options: z.object({
        format: z.enum(['jpeg', 'png', 'webp']).optional(),
        quality: z.number().min(1).max(100).optional(),
      }).optional(),
    }).parse(request.body);

    const { render } = await import('@scp/renderer');

    const result = await render(body.config, body.options);

    // Save preview to temp location
    const previewId = randomUUID();
    const ext = (body.options?.format ?? 'jpeg') === 'jpeg' ? 'jpg' : (body.options?.format ?? 'png');
    const filename = `preview-${previewId}.${ext}`;
    mkdirSync(join(STUDIO_DIR, 'previews'), { recursive: true });
    const filePath = join(STUDIO_DIR, 'previews', filename);
    writeFileSync(filePath, result.image);

    return {
      previewUrl: `/uploads/studio/previews/${filename}`,
      sizeBytes: result.image.length,
      width: result.config.width,
      height: result.config.height,
      critique: result.critique,
      layout: result.layout,
      warnings: result.warnings,
    };
  });

  // ---- GET /studio/batches ----
  app.get('/studio/batches', async (request) => {
    const batches = await prisma.studioBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      batches: batches.map(b => {
        const results = (b.results ?? []) as Array<{ critiqueScore?: number; approved?: boolean }>;
        const approvedCount = results.filter(r => r.approved).length;
        const avgScore = results.length > 0
          ? Math.round(results.reduce((s, r) => s + (r.critiqueScore ?? 0), 0) / results.length)
          : 0;

        return {
          batchId: b.id,
          status: b.status,
          count: b.count,
          rendered: b.rendered,
          approvedCount,
          avgScore,
          createdAt: b.createdAt.toISOString(),
          expiresAt: b.expiresAt.toISOString(),
        };
      }),
    };
  });

  // ---- POST /studio/batch ----
  app.post('/studio/batch', async (request, reply) => {
    const body = z.object({
      config: z.record(z.unknown()),
      options: z.object({
        count: z.number().min(1).max(50).optional(),
        variations: z.array(z.unknown()).optional(),
        seed: z.number().optional(),
      }).optional(),
    }).parse(request.body);

    const count = body.options?.count ?? 25;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const batch = await prisma.studioBatch.create({
      data: {
        status: 'pending',
        config: body.config as any,
        options: (body.options ?? {}) as any,
        count,
        expiresAt,
      },
    });

    // Enqueue worker job
    await publishQueue.add(
      'studio.render-batch',
      {
        batchId: batch.id,
        config: body.config,
        options: body.options ?? {},
      },
      {
        jobId: `studio:batch:${batch.id}`,
        attempts: 1, // Don't retry batch renders — they're expensive
      },
    );

    await prisma.auditEvent.create({
      data: {
        entityType: 'studio_batch',
        entityId: batch.id,
        action: 'created',
        payload: { count },
      },
    });

    return reply.code(201).send({
      batchId: batch.id,
      status: batch.status,
      count,
      expiresAt: batch.expiresAt.toISOString(),
    });
  });

  // ---- GET /studio/batch/:batchId ----
  app.get('/studio/batch/:batchId', async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    const batch = await prisma.studioBatch.findUnique({ where: { id: batchId } });
    if (!batch) return reply.code(404).send({ error: 'not_found' });

    return {
      batchId: batch.id,
      status: batch.status,
      count: batch.count,
      rendered: batch.rendered,
      results: batch.results ?? [],
      config: batch.config ?? {},
      createdAt: batch.createdAt.toISOString(),
      expiresAt: batch.expiresAt.toISOString(),
    };
  });

  // ---- POST /studio/batch/:batchId/approve ----
  app.post('/studio/batch/:batchId/approve', async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const body = z.object({
      approved: z.array(z.number()),
      connectionIds: z.array(z.string()).optional(),
      content: z.string().optional(),
      scheduledFor: z.string().datetime().optional(),
    }).parse(request.body);

    const batch = await prisma.studioBatch.findUnique({ where: { id: batchId } });
    if (!batch) return reply.code(404).send({ error: 'not_found' });
    if (batch.status !== 'complete') {
      return reply.code(409).send({ error: 'batch_not_complete', status: batch.status });
    }

    const results = (batch.results ?? []) as Array<{
      index: number;
      previewPath: string;
      previewUrl: string;
      critiqueScore: number;
      width: number;
      height: number;
      sizeBytes: number;
      approved: boolean;
      mediaId: string | null;
      draftIds: string[];
    }>;

    // Get connections to create drafts for
    let connections: Array<{ id: string; provider: string; displayName: string }>;
    if (body.connectionIds?.length) {
      connections = await prisma.socialConnection.findMany({
        where: { id: { in: body.connectionIds }, status: 'connected' },
        select: { id: true, provider: true, displayName: true },
      });
    } else {
      connections = await prisma.socialConnection.findMany({
        where: { status: 'connected' },
        select: { id: true, provider: true, displayName: true },
      });
    }

    const mediaIds: string[] = [];
    const draftIds: string[] = [];

    const { readFileSync } = await import('node:fs');

    for (const approvedIdx of body.approved) {
      const variant = results.find(r => r.index === approvedIdx);
      if (!variant || !variant.previewPath) continue;

      // Create Media record from preview file
      let fileBuffer: Buffer;
      try {
        fileBuffer = readFileSync(variant.previewPath);
      } catch {
        continue; // Preview file missing
      }

      const mediaFilename = `studio-${batchId}-${approvedIdx}-${randomUUID().slice(0, 8)}.jpg`;
      const mediaPath = join(UPLOADS_DIR, mediaFilename);
      writeFileSync(mediaPath, fileBuffer);

      const media = await prisma.media.create({
        data: {
          filename: mediaFilename,
          originalName: `variant-${approvedIdx}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: fileBuffer.length,
          storagePath: mediaPath,
          width: variant.width || null,
          height: variant.height || null,
        },
      });

      mediaIds.push(media.id);

      // Mark approved in results
      variant.approved = true;
      variant.mediaId = media.id;

      // Auto-create Drafts for each connection
      const config = batch.config as Record<string, unknown>;
      const text = config.text as Record<string, string> | undefined;
      const draftContent = body.content
        ?? (text?.headline ? `${text.headline}\n\n${text.subhead ?? ''}`.trim() : 'Studio creative');

      const variantDraftIds: string[] = [];
      for (const conn of connections) {
        const draft = await prisma.draft.create({
          data: {
            connectionId: conn.id,
            publishMode: 'draft-agent',
            status: 'draft',
            content: draftContent,
            mediaJson: [media.id],
            scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
          },
        });
        draftIds.push(draft.id);
        variantDraftIds.push(draft.id);
      }
      variant.draftIds = variantDraftIds;
    }

    // Update batch with approval state
    await prisma.studioBatch.update({
      where: { id: batchId },
      data: { results: results as any },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'studio_batch',
        entityId: batchId,
        action: 'approved',
        payload: {
          approvedCount: body.approved.length,
          mediaCount: mediaIds.length,
          draftCount: draftIds.length,
          connectionCount: connections.length,
        },
      },
    });

    return {
      approved: body.approved.length,
      mediaIds,
      draftIds,
      draftsPerVariant: connections.length,
      message: `${body.approved.length} variants approved → ${mediaIds.length} media records → ${draftIds.length} drafts created`,
    };
  });

  // ---- POST /studio/batch/:batchId/review ----
  // Per-variant approve/reject with optional notes. Lightweight — no Media/Draft creation.
  // Used by ad template workflow: approve/reject variants, sync state to manifest.json.
  app.post('/studio/batch/:batchId/review', async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const body = z.object({
      reviews: z.array(z.object({
        index: z.number(),
        decision: z.enum(['approved', 'rejected']),
        notes: z.string().optional(),
      })),
    }).parse(request.body);

    const batch = await prisma.studioBatch.findUnique({ where: { id: batchId } });
    if (!batch) return reply.code(404).send({ error: 'not_found' });
    if (batch.status !== 'complete') {
      return reply.code(409).send({ error: 'batch_not_complete', status: batch.status });
    }

    const results = (batch.results ?? []) as Array<Record<string, unknown>>;
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const review of body.reviews) {
      const variant = results.find(r => (r as { index: number }).index === review.index);
      if (!variant) continue;

      variant.approved = review.decision === 'approved';
      variant.rejected = review.decision === 'rejected';
      if (review.notes) variant.notes = review.notes;
      variant.reviewedAt = new Date().toISOString();

      if (review.decision === 'approved') approvedCount++;
      else rejectedCount++;
    }

    await prisma.studioBatch.update({
      where: { id: batchId },
      data: { results: results as unknown as any },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'studio_batch',
        entityId: batchId,
        action: 'reviewed',
        payload: { approvedCount, rejectedCount, totalReviews: body.reviews.length },
      },
    });

    const totalApproved = results.filter(r => (r as { approved?: boolean }).approved).length;
    const totalRejected = results.filter(r => (r as { rejected?: boolean }).rejected).length;

    return {
      reviewed: body.reviews.length,
      approvedCount,
      rejectedCount,
      totalApproved,
      totalRejected,
      totalPending: results.length - totalApproved - totalRejected,
    };
  });

  // ---- DELETE /studio/batch/:batchId ----
  app.delete('/studio/batch/:batchId', async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    const batch = await prisma.studioBatch.findUnique({ where: { id: batchId } });
    if (!batch) return reply.code(404).send({ error: 'not_found' });

    // Delete preview files
    const batchDir = join(STUDIO_DIR, batchId);
    try { rmSync(batchDir, { recursive: true, force: true }); } catch { /* ignore */ }

    await prisma.studioBatch.delete({ where: { id: batchId } });

    await prisma.auditEvent.create({
      data: {
        entityType: 'studio_batch',
        entityId: batchId,
        action: 'deleted',
      },
    });

    return { deleted: true };
  });

  // ---- POST /studio/export ----
  // Re-render configs at Meta Ads export dimensions
  app.post('/studio/export', async (request, reply) => {
    const body = z.object({
      batchId: z.string(),
      variantIndices: z.array(z.number()),
      presets: z.array(z.string()).min(1),
      quality: z.number().min(1).max(100).optional(),
    }).parse(request.body);

    const batch = await prisma.studioBatch.findUnique({ where: { id: body.batchId } });
    if (!batch) return reply.code(404).send({ error: 'not_found' });

    const { render } = await import('@scp/renderer');
    const baseConfig = batch.config as Record<string, unknown>;
    const results = (batch.results ?? []) as Array<{ index: number }>;

    const exports: Array<{
      variantIndex: number;
      preset: string;
      url: string;
      width: number;
      height: number;
      sizeBytes: number;
    }> = [];

    const exportDir = join(STUDIO_DIR, 'exports', body.batchId);
    mkdirSync(exportDir, { recursive: true });

    for (const idx of body.variantIndices) {
      if (!results.find(r => r.index === idx)) continue;

      for (const presetName of body.presets) {
        try {
          const exportConfig = { ...baseConfig, preset: presetName };
          const result = await render(exportConfig, {
            format: 'jpeg',
            quality: body.quality ?? 95,
          });

          const filename = `export-v${idx}-${presetName}.jpg`;
          writeFileSync(join(exportDir, filename), result.image);

          exports.push({
            variantIndex: idx,
            preset: presetName,
            url: `/uploads/studio/exports/${body.batchId}/${filename}`,
            width: result.config.width,
            height: result.config.height,
            sizeBytes: result.image.length,
          });
        } catch (err) {
          exports.push({
            variantIndex: idx,
            preset: presetName,
            url: '',
            width: 0,
            height: 0,
            sizeBytes: 0,
          });
        }
      }
    }

    return {
      total: exports.length,
      exports: exports.filter(e => e.url),
      failed: exports.filter(e => !e.url).length,
    };
  });

  // ---- POST /studio/revise ----
  // Apply revision actions to a config, re-render, return before/after
  app.post('/studio/revise', async (request, reply) => {
    const body = z.object({
      config: z.record(z.unknown()),
      revisions: z.array(z.object({
        target: z.string(),
        action: z.enum(['resize', 'reposition', 'recolor', 'adjust-contrast', 'remove', 'change-font', 'crop']),
        direction: z.enum(['smaller', 'larger', 'up', 'down', 'left', 'right', 'more', 'less']).optional(),
        value: z.union([z.number(), z.string()]).optional(),
        reason: z.string().optional(),
      })),
      options: z.object({
        format: z.enum(['jpeg', 'png', 'webp']).optional(),
        quality: z.number().min(1).max(100).optional(),
      }).optional(),
    }).parse(request.body);

    const { render, applyRevisions } = await import('@scp/renderer');

    // Apply revisions to config
    const { revisedConfig, result: revisionResult } = applyRevisions(
      body.config,
      body.revisions,
    );

    // Render the revised version
    const revised = await render(revisedConfig, body.options);

    // Save revised preview
    const previewId = randomUUID();
    const ext = (body.options?.format ?? 'jpeg') === 'jpeg' ? 'jpg' : (body.options?.format ?? 'png');
    const filename = `revised-${previewId}.${ext}`;
    mkdirSync(join(STUDIO_DIR, 'previews'), { recursive: true });
    writeFileSync(join(STUDIO_DIR, 'previews', filename), revised.image);

    return {
      previewUrl: `/uploads/studio/previews/${filename}`,
      sizeBytes: revised.image.length,
      width: revised.config.width,
      height: revised.config.height,
      critique: revised.critique,
      layout: revised.layout,
      delta: revisionResult.delta,
      skipped: revisionResult.skipped,
      revisedConfig,
    };
  });
}
