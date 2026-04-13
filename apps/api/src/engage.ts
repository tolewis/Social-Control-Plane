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

// Volume guidance — configurable via env. These are soft guide rails, not hard stops.
const DEFAULT_DAILY_CAP = 300;
const DEFAULT_PER_PAGE_CAP = 3;

export function registerEngageRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  publishQueue: Queue,
): void {

  function getTargetStatus(target: { fbPostId: string; postUrl?: string | null }) {
    if (/_text_[0-9a-f]{12}$/i.test(target.fbPostId)) {
      return {
        isCommentable: false,
        reason: 'synthetic_fb_post_id',
        message: 'Discovered target is a page-root placeholder, not a direct Facebook post.',
      } as const;
    }

    return {
      isCommentable: true,
      reason: null,
      message: null,
    } as const;
  }

  function withTargetStatus<T extends { fbPostId: string; postUrl?: string | null }>(target: T) {
    return {
      ...target,
      targetStatus: getTargetStatus(target),
    };
  }

  function startOfToday(): Date {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return todayStart;
  }

  function postedTodayWhere(todayStart: Date) {
    return {
      reviewedAt: { gte: todayStart },
      status: { in: ['approved', 'posted', 'failed'] as string[] },
    };
  }

  function getCapGuidance(todayCount: number, pageCommentToday: number, dailyCap: number, perPageCap: number) {
    const overDailyCap = todayCount >= dailyCap;
    const overPageCap = pageCommentToday >= perPageCap;

    if (!overDailyCap && !overPageCap) return null;

    return {
      overDailyCap,
      overPageCap,
      todayCount,
      pageCommentToday,
      dailyCap,
      perPageCap,
      message: overDailyCap && overPageCap
        ? `Soft cap exceeded: ${todayCount}/${dailyCap} today and ${pageCommentToday}/${perPageCap} on this page.`
        : overDailyCap
          ? `Soft daily cap exceeded: ${todayCount}/${dailyCap} today.`
          : `Soft per-page cap exceeded: ${pageCommentToday}/${perPageCap} on this page today.`,
    };
  }

  // Helper: audit event
  async function audit(entityType: string, entityId: string, action: string, payload?: unknown) {
    await prisma.auditEvent.create({
      data: { entityType, entityId, action, payload: payload ?? undefined },
    });
  }

  // -----------------------------------------------------------------------
  // Pages — target communities (Facebook pages + Reddit subreddits)
  // -----------------------------------------------------------------------

  app.get('/engage/pages', async (request) => {
    const { enabled, platform } = request.query as { enabled?: string; platform?: string };
    const where: Record<string, unknown> = {};
    if (enabled === 'true') where.enabled = true;
    if (enabled === 'false') where.enabled = false;
    if (platform) where.platform = platform;
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
      platform: z.enum(['facebook', 'reddit']).default('facebook'),
      category: z.string().default('community'),
      notes: z.string().optional(),
    }).parse(request.body);

    const page = await prisma.engagePage.create({
      data: {
        fbPageId: body.fbPageId,
        platform: body.platform,
        name: body.name,
        category: body.category,
        notes: body.notes,
      },
    });

    await audit('EngagePage', page.id, 'created', { name: body.name, fbPageId: body.fbPageId, platform: body.platform });
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

    const targetStatus = getTargetStatus({ fbPostId: body.fbPostId, postUrl: body.postUrl });
    const existingDirectPost = await prisma.engagePost.findUnique({ where: { fbPostId: body.fbPostId } });

    if (!existingDirectPost && targetStatus.isCommentable && body.postText) {
      const placeholderPost = await prisma.engagePost.findFirst({
        where: {
          engagePageId: body.engagePageId,
          postText: body.postText,
          fbPostId: { contains: '_text_' },
        },
        orderBy: { discoveredAt: 'desc' },
      });

      if (placeholderPost) {
        const promotedPost = await prisma.engagePost.update({
          where: { id: placeholderPost.id },
          data: {
            fbPostId: body.fbPostId,
            postUrl: body.postUrl,
            postText: body.postText,
            authorName: body.authorName,
            postedAt: body.postedAt ? new Date(body.postedAt) : undefined,
            likeCount: body.likeCount,
            commentCount: body.commentCount,
            shareCount: body.shareCount,
          },
        });

        await audit('EngagePost', promotedPost.id, 'promoted_direct_post', {
          previousFbPostId: placeholderPost.fbPostId,
          fbPostId: body.fbPostId,
          postUrl: body.postUrl,
        });

        return reply.code(201).send({
          post: withTargetStatus(promotedPost),
          promotedFromPlaceholder: placeholderPost.fbPostId,
        });
      }
    }

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
        postUrl: body.postUrl,
        postText: body.postText,
        authorName: body.authorName,
        postedAt: body.postedAt ? new Date(body.postedAt) : undefined,
        likeCount: body.likeCount,
        commentCount: body.commentCount,
        shareCount: body.shareCount,
      },
    });

    return reply.code(201).send({ post: withTargetStatus(post) });
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
      include: { engagePage: { select: { name: true, category: true, platform: true } } },
    });
    return { posts: posts.map((post) => withTargetStatus(post)) };
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
            engagePage: { select: { name: true, platform: true } },
          },
        },
      },
    });
    return {
      comments: comments.map((comment) => ({
        ...comment,
        engagePost: comment.engagePost ? withTargetStatus(comment.engagePost) : comment.engagePost,
      })),
    };
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
      include: { engagePost: { include: { engagePage: true } } },
    });
    if (!comment) return reply.code(404).send({ error: 'comment_not_found' });
    if (comment.status !== 'pending_review') {
      return reply.code(400).send({ error: 'comment_not_pending', status: comment.status });
    }

    const finalText = body.editedText || comment.commentText;
    const platform = (comment.engagePost.engagePage as { platform?: string })?.platform ?? 'facebook';
    const targetStatus = getTargetStatus(comment.engagePost);

    if (!targetStatus.isCommentable) {
      return reply.code(409).send({
        error: 'comment_target_not_commentable',
        reason: targetStatus.reason,
        message: targetStatus.message,
      });
    }

    const dailyCap = Number(process.env.ENGAGE_DAILY_CAP) || DEFAULT_DAILY_CAP;
    const perPageCap = Number(process.env.ENGAGE_PER_PAGE_CAP) || DEFAULT_PER_PAGE_CAP;
    const todayStart = startOfToday();

    const [todayCount, pageCommentToday] = await Promise.all([
      prisma.engageComment.count({ where: postedTodayWhere(todayStart) }),
      prisma.engageComment.count({
        where: {
          ...postedTodayWhere(todayStart),
          engagePost: { engagePageId: comment.engagePost.engagePageId },
        },
      }),
    ]);

    const capGuidance = getCapGuidance(todayCount, pageCommentToday, dailyCap, perPageCap);

    // Reddit has no worker-backed posting path — Reddit's API is closed to
    // us. Approving a Reddit comment just records review state; the operator
    // posts manually via the "Copy & Open" UI button and then hits
    // /engage/comments/:id/mark-posted when done.
    const manualPlatform = platform === 'reddit';

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

    let jobId: string | null = null;
    if (!manualPlatform) {
      // Enqueue the comment posting job with 30-second delay (breathing room)
      jobId = `engage:comment:${id}`;
      await publishQueue.add(
        'engage.comment',
        {
          commentId: id,
          connectionId: comment.connectionId,
          fbPostId: comment.engagePost.fbPostId,
          commentText: finalText,
          platform,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: 30_000,
        },
      );
    }

    await audit('EngageComment', id, 'approved', {
      reviewedBy: body.reviewedBy,
      fbPostId: comment.engagePost.fbPostId,
      platform,
      manualPlatform,
      capGuidance,
    });

    return { comment: { id, status: 'approved', jobId }, capGuidance, manualPlatform };
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
  // Mark posted — operator posted this comment manually (Reddit flow, or FB
  // fallback). Updates status to 'posted' without touching the worker queue.
  // Also flips the parent EngagePost.commented flag so we don't re-draft.
  // Accepts any comment in pending_review | approved | failed.
  // -----------------------------------------------------------------------

  app.post('/engage/comments/:id/mark-posted', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      reviewedBy: z.string().optional(),
      commentUrl: z.string().url().optional(),
      fbCommentId: z.string().optional(),
      note: z.string().optional(),
    }).parse(request.body ?? {});

    const comment = await prisma.engageComment.findUnique({
      where: { id },
      include: { engagePost: true },
    });
    if (!comment) return reply.code(404).send({ error: 'comment_not_found' });

    const allowedFrom = ['pending_review', 'approved', 'failed'];
    if (!allowedFrom.includes(comment.status)) {
      return reply.code(400).send({
        error: 'comment_not_markable',
        status: comment.status,
        message: `Only pending_review/approved/failed comments can be marked posted (current: ${comment.status})`,
      });
    }

    const receipt = {
      manual: true,
      commentUrl: body.commentUrl ?? null,
      note: body.note ?? null,
    };

    await Promise.all([
      prisma.engageComment.update({
        where: { id },
        data: {
          status: 'posted',
          reviewedBy: body.reviewedBy ?? comment.reviewedBy ?? 'operator',
          reviewedAt: comment.reviewedAt ?? new Date(),
          fbCommentId: body.fbCommentId ?? comment.fbCommentId,
          receiptJson: receipt,
          updatedAt: new Date(),
        },
      }),
      prisma.engagePost.update({
        where: { id: comment.engagePostId },
        data: { commented: true },
      }),
      audit('EngageComment', id, 'marked-posted', {
        reviewedBy: body.reviewedBy,
        commentUrl: body.commentUrl,
        fbCommentId: body.fbCommentId,
        note: body.note,
      }),
    ]);

    return { comment: { id, status: 'posted', commentUrl: body.commentUrl ?? null } };
  });

  // -----------------------------------------------------------------------
  // Auto-post — create + immediately enqueue (bypasses review)
  // Used by Captain Bill in autonomous mode after quality gates pass.
  // Accepts a scheduledFor timestamp to spread comments through the day.
  // -----------------------------------------------------------------------

  app.post('/engage/auto-post', async (request, reply) => {
    const body = z.object({
      engagePostId: z.string().min(1),
      connectionId: z.string().min(1),
      commentText: z.string().min(1).max(8000),
      kbSources: z.array(z.string()).default([]),
      slopScore: z.number().int().min(0).max(100).default(0),
      scheduledFor: z.string().datetime().optional(), // ISO timestamp for delayed posting
    }).parse(request.body);

    // Rate limit checks apply to actual posting attempts, not stored drafts.
    const dailyCap = Number(process.env.ENGAGE_DAILY_CAP) || DEFAULT_DAILY_CAP;
    const perPageCap = Number(process.env.ENGAGE_PER_PAGE_CAP) || DEFAULT_PER_PAGE_CAP;
    const todayStart = startOfToday();

    const todayCount = await prisma.engageComment.count({
      where: postedTodayWhere(todayStart),
    });

    const post = await prisma.engagePost.findUnique({
      where: { id: body.engagePostId },
      select: { engagePageId: true, fbPostId: true, postUrl: true, engagePage: { select: { platform: true } } },
    });
    if (!post) return reply.code(404).send({ error: 'post_not_found' });
    const postPlatform = (post as { engagePage?: { platform?: string } }).engagePage?.platform ?? 'facebook';

    const targetStatus = getTargetStatus(post);
    if (!targetStatus.isCommentable) {
      return reply.code(409).send({
        error: 'comment_target_not_commentable',
        reason: targetStatus.reason,
        message: targetStatus.message,
      });
    }

    const pageCommentToday = await prisma.engageComment.count({
      where: {
        ...postedTodayWhere(todayStart),
        engagePost: { engagePageId: post.engagePageId },
      },
    });
    const capGuidance = getCapGuidance(todayCount, pageCommentToday, dailyCap, perPageCap);

    // Create comment record with status 'approved' (auto-approved by quality gates)
    const comment = await prisma.engageComment.create({
      data: {
        engagePostId: body.engagePostId,
        connectionId: body.connectionId,
        commentText: body.commentText,
        kbSources: body.kbSources,
        slopScore: body.slopScore,
        status: 'approved',
        reviewedBy: 'auto:quality-gates',
        reviewedAt: new Date(),
      },
    });

    // Calculate delay — either from scheduledFor or random 30-120s
    let delayMs = Math.floor(30_000 + Math.random() * 90_000); // 30-120s default
    if (body.scheduledFor) {
      const targetTime = new Date(body.scheduledFor).getTime();
      const now = Date.now();
      delayMs = Math.max(0, targetTime - now);
    }

    // Enqueue for posting
    const jobId = `engage:comment:${comment.id}`;
    await publishQueue.add(
      'engage.comment',
      {
        commentId: comment.id,
        connectionId: body.connectionId,
        fbPostId: post.fbPostId,
        commentText: body.commentText,
        platform: postPlatform,
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        delay: delayMs,
      },
    );

    await audit('EngageComment', comment.id, 'auto-posted', {
      engagePostId: body.engagePostId,
      slopScore: body.slopScore,
      scheduledDelayMs: delayMs,
      capGuidance,
    });

    return reply.code(201).send({
      comment: { id: comment.id, status: 'approved', jobId },
      scheduledDelayMs: delayMs,
      capGuidance,
    });
  });

  // -----------------------------------------------------------------------
  // Stats — daily engagement summary
  // -----------------------------------------------------------------------

  app.get('/engage/stats', async () => {
    const todayStart = startOfToday();

    const [todayComments, pendingCount, postedCount, totalPages] = await Promise.all([
      prisma.engageComment.count({ where: postedTodayWhere(todayStart) }),
      prisma.engageComment.count({ where: { status: 'pending_review' } }),
      prisma.engageComment.count({ where: { status: 'posted' } }),
      prisma.engagePage.count({ where: { enabled: true } }),
    ]);

    return {
      today: todayComments,
      dailyCap: Number(process.env.ENGAGE_DAILY_CAP) || DEFAULT_DAILY_CAP,
      perPageCap: Number(process.env.ENGAGE_PER_PAGE_CAP) || DEFAULT_PER_PAGE_CAP,
      capMode: 'soft',
      pending: pendingCount,
      totalPosted: postedCount,
      activePages: totalPages,
    };
  });
}
