/**
 * Engage API routes — Community engagement (FB commenting on fishing pages).
 *
 * Routes:
 *   GET    /engage/pages              — List target pages
 *   POST   /engage/pages              — Add a target page
 *   DELETE /engage/pages/:id          — Remove a target page
 *   POST   /engage/posts              — Submit a discovered post (with URL/text)
 *   GET    /engage/posts              — List discovered posts
 *   POST   /engage/comments           — Create a comment draft (pending review)
 *   GET    /engage/comments           — List comments (filterable by status)
 *   POST   /engage/comments/:id/approve — Approve + enqueue for posting
 *   POST   /engage/comments/:id/reject  — Reject with note
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';

// Daily cap on comments to prevent abuse
const DAILY_COMMENT_CAP = 5;

export function registerEngageRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  publishQueue: Queue,
): void {

  // Helper: audit event
  async function audit(entityType: string, entityId: string, action: string, payload?: unknown) {
    await prisma.auditEvent.create({
      data: { entityType, entityId, action, payload: payload ?? undefined },
    });
  }

  // -----------------------------------------------------------------------
  // Pages — target Facebook pages to monitor
  // -----------------------------------------------------------------------

  app.get('/engage/pages', async (request) => {
    const { enabled } = request.query as { enabled?: string };
    const where = enabled === 'true' ? { enabled: true } : enabled === 'false' ? { enabled: false } : {};
    const pages = await prisma.engagePage.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return { pages };
  });

  app.post('/engage/pages', async (request, reply) => {
    const body = z.object({
      fbPageId: z.string().min(1),
      name: z.string().min(1),
      category: z.string().default('community'),
      notes: z.string().optional(),
    }).parse(request.body);

    const page = await prisma.engagePage.create({
      data: {
        fbPageId: body.fbPageId,
        name: body.name,
        category: body.category,
        notes: body.notes,
      },
    });

    await audit('EngagePage', page.id, 'created', { name: body.name, fbPageId: body.fbPageId });
    return reply.code(201).send({ page });
  });

  app.delete('/engage/pages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.engagePage.delete({ where: { id } });
    await audit('EngagePage', id, 'deleted');
    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------
  // Posts — discovered Facebook posts worth commenting on
  // -----------------------------------------------------------------------

  app.post('/engage/posts', async (request, reply) => {
    const body = z.object({
      engagePageId: z.string().min(1),
      fbPostId: z.string().min(1),
      postUrl: z.string().optional(),
      postText: z.string().optional(),
      authorName: z.string().optional(),
      postedAt: z.string().datetime().optional(),
      likeCount: z.number().int().optional(),
      commentCount: z.number().int().optional(),
      shareCount: z.number().int().optional(),
    }).parse(request.body);

    // Upsert — same post might be submitted twice
    const post = await prisma.engagePost.upsert({
      where: { fbPostId: body.fbPostId },
      create: {
        engagePageId: body.engagePageId,
        fbPostId: body.fbPostId,
        postUrl: body.postUrl,
        postText: body.postText,
        authorName: body.authorName,
        postedAt: body.postedAt ? new Date(body.postedAt) : undefined,
        likeCount: body.likeCount,
        commentCount: body.commentCount,
        shareCount: body.shareCount,
      },
      update: {
        postText: body.postText,
        likeCount: body.likeCount,
        commentCount: body.commentCount,
        shareCount: body.shareCount,
      },
    });

    return reply.code(201).send({ post });
  });

  app.get('/engage/posts', async (request) => {
    const { engagePageId, commented, limit } = request.query as {
      engagePageId?: string;
      commented?: string;
      limit?: string;
    };
    const where: Record<string, unknown> = {};
    if (engagePageId) where.engagePageId = engagePageId;
    if (commented === 'true') where.commented = true;
    if (commented === 'false') where.commented = false;

    const posts = await prisma.engagePost.findMany({
      where,
      orderBy: { discoveredAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
      include: { engagePage: { select: { name: true, category: true } } },
    });
    return { posts };
  });

  // -----------------------------------------------------------------------
  // Comments — generated comment drafts with review workflow
  // -----------------------------------------------------------------------

  app.post('/engage/comments', async (request, reply) => {
    const body = z.object({
      engagePostId: z.string().min(1),
      connectionId: z.string().min(1),
      commentText: z.string().min(1).max(8000),
      kbSources: z.array(z.string()).default([]),
      slopScore: z.number().int().min(0).max(100).default(0),
    }).parse(request.body);

    // Enforce daily cap
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.engageComment.count({
      where: {
        createdAt: { gte: todayStart },
        status: { not: 'rejected' },
      },
    });
    if (todayCount >= DAILY_COMMENT_CAP) {
      return reply.code(429).send({
        error: 'daily_cap_reached',
        message: `Maximum ${DAILY_COMMENT_CAP} comments per day`,
      });
    }

    // Enforce per-page-per-day cap (max 1 comment per page per day)
    const post = await prisma.engagePost.findUnique({
      where: { id: body.engagePostId },
      select: { engagePageId: true },
    });
    if (post) {
      const pageCommentToday = await prisma.engageComment.count({
        where: {
          createdAt: { gte: todayStart },
          status: { not: 'rejected' },
          engagePost: { engagePageId: post.engagePageId },
        },
      });
      if (pageCommentToday >= 1) {
        return reply.code(429).send({
          error: 'page_daily_cap_reached',
          message: 'Maximum 1 comment per page per day',
        });
      }
    }

    const comment = await prisma.engageComment.create({
      data: {
        engagePostId: body.engagePostId,
        connectionId: body.connectionId,
        commentText: body.commentText,
        kbSources: body.kbSources,
        slopScore: body.slopScore,
      },
    });

    await audit('EngageComment', comment.id, 'created', {
      engagePostId: body.engagePostId,
      slopScore: body.slopScore,
    });

    return reply.code(201).send({ comment });
  });

  app.get('/engage/comments', async (request) => {
    const { status, limit } = request.query as { status?: string; limit?: string };
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const comments = await prisma.engageComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
      include: {
        engagePost: {
          select: {
            fbPostId: true,
            postUrl: true,
            postText: true,
            engagePage: { select: { name: true } },
          },
        },
      },
    });
    return { comments };
  });

  // -----------------------------------------------------------------------
  // Approve — mark approved + enqueue BullMQ job to post
  // -----------------------------------------------------------------------

  app.post('/engage/comments/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      reviewedBy: z.string().optional(),
      editedText: z.string().optional(), // Allow text edit on approval
    }).parse(request.body ?? {});

    const comment = await prisma.engageComment.findUnique({
      where: { id },
      include: { engagePost: true },
    });
    if (!comment) return reply.code(404).send({ error: 'comment_not_found' });
    if (comment.status !== 'pending_review') {
      return reply.code(400).send({ error: 'comment_not_pending', status: comment.status });
    }

    const finalText = body.editedText || comment.commentText;

    // Update status
    await prisma.engageComment.update({
      where: { id },
      data: {
        status: 'approved',
        commentText: finalText,
        reviewedBy: body.reviewedBy ?? 'unknown',
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Enqueue the comment posting job with 30-second delay (breathing room)
    const jobId = `engage:comment:${id}`;
    await publishQueue.add(
      'engage.comment',
      {
        commentId: id,
        connectionId: comment.connectionId,
        fbPostId: comment.engagePost.fbPostId,
        commentText: finalText,
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        delay: 30_000, // 30s delay before posting
      },
    );

    await audit('EngageComment', id, 'approved', {
      reviewedBy: body.reviewedBy,
      fbPostId: comment.engagePost.fbPostId,
    });

    return { comment: { id, status: 'approved', jobId } };
  });

  // -----------------------------------------------------------------------
  // Reject — mark rejected with optional note
  // -----------------------------------------------------------------------

  app.post('/engage/comments/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      reviewedBy: z.string().optional(),
      rejectionNote: z.string().optional(),
    }).parse(request.body ?? {});

    const comment = await prisma.engageComment.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send({ error: 'comment_not_found' });
    if (comment.status !== 'pending_review') {
      return reply.code(400).send({ error: 'comment_not_pending', status: comment.status });
    }

    await prisma.engageComment.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: body.reviewedBy ?? 'unknown',
        reviewedAt: new Date(),
        rejectionNote: body.rejectionNote,
        updatedAt: new Date(),
      },
    });

    await audit('EngageComment', id, 'rejected', {
      reviewedBy: body.reviewedBy,
      reason: body.rejectionNote,
    });

    return { comment: { id, status: 'rejected' } };
  });

  // -----------------------------------------------------------------------
  // Stats — daily engagement summary
  // -----------------------------------------------------------------------

  app.get('/engage/stats', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayComments, pendingCount, postedCount, totalPages] = await Promise.all([
      prisma.engageComment.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.engageComment.count({ where: { status: 'pending_review' } }),
      prisma.engageComment.count({ where: { status: 'posted' } }),
      prisma.engagePage.count({ where: { enabled: true } }),
    ]);

    return {
      today: todayComments,
      dailyCap: DAILY_COMMENT_CAP,
      pending: pendingCount,
      totalPosted: postedCount,
      activePages: totalPages,
    };
  });
}
