import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, unlinkSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createAuthAdapter,
  LinkedInAdapter,
  FacebookAdapter,
  InstagramAdapter,
  XAdapter,
} from '@scp/providers';
import type {
  HttpRequest,
  ProviderId,
  ProviderPublishAdapter,
} from '@scp/shared';
import { isProviderId, NotImplementedError, PROVIDERS } from '@scp/shared';
import { prisma } from './db.js';
import { publishQueue } from './queue.js';
import { encrypt, decrypt } from './crypto.js';
import { detectSlop, groupSlopMatches } from './slop.js';

// Prisma model types for map callback annotations.
// Defined locally to avoid version-mismatch issues with the generated client.
type SocialConnectionRow = { id: string; provider: string; displayName: string; accountRef: string; status: string; createdAt: Date; updatedAt: Date };
type DraftRow = { id: string; connectionId: string; publishMode: string; content: string; title: string | null; mediaJson: unknown; scheduledFor: Date | null; status: string; createdAt: Date; updatedAt: Date };
type PublishJobRow = { id: string; draftId: string; connectionId: string; status: string; idempotencyKey: string; receiptJson: unknown; errorMessage: string | null; createdAt: Date; updatedAt: Date };

const UPLOADS_DIR = resolve(join(import.meta.dirname ?? '.', '../../../uploads'));

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB
await app.register(fastifyStatic, {
  root: UPLOADS_DIR,
  prefix: '/uploads/',
  decorateReply: false,
});

// ---------------------------------------------------------------------------
// Auth sessions stay in-memory — they're short-lived, pre-login state.
// ---------------------------------------------------------------------------
const authSessions = new Map<
  string,
  { provider: ProviderId; redirectUri: string; createdAtIso: string }
>();

const nowIso = () => new Date().toISOString();

const redirectUriFor = (provider: ProviderId): string => {
  switch (provider) {
    case 'linkedin':
      return process.env.LINKEDIN_REDIRECT_URI || '';
    case 'facebook':
      return process.env.FACEBOOK_REDIRECT_URI || '';
    case 'instagram':
      return process.env.INSTAGRAM_REDIRECT_URI || '';
    case 'x':
      return process.env.X_REDIRECT_URI || '';
    default:
      throw new Error(`unknown provider: ${provider}`);
  }
};

const safeAdapterName = (provider: ProviderId): string => {
  switch (provider) {
    case 'linkedin':
      return new LinkedInAdapter().provider;
    case 'facebook':
      return new FacebookAdapter().provider;
    case 'instagram':
      return new InstagramAdapter().provider;
    case 'x':
      return new XAdapter().provider;
    default:
      return provider;
  }
};

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------
async function audit(entityType: string, entityId: string, action: string, payload?: unknown) {
  await prisma.auditEvent.create({
    data: { entityType, entityId, action, payload: payload ?? undefined },
  });
}

// ---------------------------------------------------------------------------
// Identity fetch helpers (best-effort, provider-specific)
// ---------------------------------------------------------------------------
async function fetchLinkedInIdentity(accessToken: string): Promise<{ displayName: string; accountRef: string }> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`linkedin_userinfo_failed:${res.status}`);
  const data = (await res.json()) as { sub?: string; name?: string; email?: string };
  return {
    displayName: data.name || data.email || 'LinkedIn User',
    accountRef: data.sub || '',
  };
}

async function fetchFacebookIdentity(accessToken: string): Promise<{ displayName: string; accountRef: string; pageAccessToken?: string }> {
  const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${accessToken}`);
  if (!meRes.ok) throw new Error(`facebook_me_failed:${meRes.status}`);
  const me = (await meRes.json()) as { id?: string; name?: string };

  const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) throw new Error(`facebook_pages_failed:${pagesRes.status}`);
  const pagesData = (await pagesRes.json()) as { data?: Array<{ id: string; name?: string; access_token?: string }> };
  const pages = pagesData.data ?? [];

  return {
    displayName: me.name || 'Facebook User',
    accountRef: pages[0]?.id || me.id || '',
    pageAccessToken: pages[0]?.access_token,
  };
}

async function fetchInstagramIdentity(accessToken: string): Promise<{ displayName: string; accountRef: string }> {
  const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`);
  if (!res.ok) throw new Error(`instagram_pages_failed:${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id: string; name?: string; instagram_business_account?: { id: string } }> };
  const pages = data.data ?? [];
  const igPage = pages.find((p) => p.instagram_business_account);

  return {
    displayName: igPage ? `${igPage.name || 'Page'} (Instagram)` : 'Instagram User',
    accountRef: igPage?.instagram_business_account?.id || '',
  };
}

async function fetchXIdentity(accessToken: string): Promise<{ displayName: string; accountRef: string }> {
  const res = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`x_users_me_failed:${res.status}`);
  const json = (await res.json()) as { data?: { id?: string; username?: string } };
  return {
    displayName: json.data?.username ? `@${json.data.username}` : 'X User',
    accountRef: json.data?.id || '',
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', async () => ({ ok: true, service: 'api' }));

// ---------------------------------------------------------------------------
// Auth routes (unchanged — auth sessions stay in-memory)
// ---------------------------------------------------------------------------
app.get('/auth/urls', async () => {
  const result: Record<string, { url?: string; state?: string; error?: string }> = {};

  for (const provider of PROVIDERS) {
    try {
      const redirectUri = redirectUriFor(provider);
      if (!redirectUri) throw new Error(`missing_redirect_uri:${provider}`);

      const state = crypto.randomUUID();
      authSessions.set(state, { provider, redirectUri, createdAtIso: nowIso() });

      const adapter = createAuthAdapter(provider);
      const url = adapter.getAuthorizationUrl({ state, redirectUri });
      result[provider] = { url, state };
    } catch (err) {
      result[provider] = { error: err instanceof Error ? err.message : 'unknown_error' };
    }
  }

  return result;
});

app.get('/auth/:provider/url', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }

  const query = z
    .object({
      redirectUri: z.string().url().optional(),
    })
    .parse(request.query);

  const provider = params.provider;
  const redirectUri = query.redirectUri || redirectUriFor(provider);
  if (!redirectUri) return reply.code(400).send({ error: 'missing_redirect_uri' });

  const state = crypto.randomUUID();
  authSessions.set(state, { provider, redirectUri, createdAtIso: nowIso() });

  const adapter = createAuthAdapter(provider);
  const url = adapter.getAuthorizationUrl({ state, redirectUri });

  return { provider, adapter: safeAdapterName(provider), state, url };
});

app.post('/auth/:provider/exchange', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }

  const body = z
    .object({
      code: z.string().min(1),
      state: z.string().min(1),
      redirectUri: z.string().url().optional(),
      perform: z.boolean().optional(),
    })
    .parse(request.body);

  const session = authSessions.get(body.state);
  if (!session) return reply.code(400).send({ error: 'invalid_state' });
  if (session.provider !== params.provider) return reply.code(400).send({ error: 'state_provider_mismatch' });

  const redirectUri = body.redirectUri || session.redirectUri;

  const adapter = createAuthAdapter(params.provider);
  let tokenReq: HttpRequest;
  try {
    tokenReq = adapter.buildTokenExchangeRequest({ code: body.code, redirectUri, state: body.state });
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'token_exchange_build_failed' });
  }

  if (!body.perform) {
    return {
      performed: false,
      request: tokenReq,
      note: 'Token exchange is designed to be executed by the worker (network side-effects). Set perform=true for local dev.',
    };
  }

  const res = await fetch(tokenReq.url, {
    method: tokenReq.method,
    headers: tokenReq.headers,
    body: tokenReq.method === 'POST' ? tokenReq.body : undefined,
  });

  const raw = await res.json().catch(() => ({ error: 'non_json_response' }));
  if (!res.ok) {
    return reply.code(400).send({
      error: 'token_exchange_failed',
      status: res.status,
      raw,
    });
  }

  const tokens = adapter.normalizeTokenResponse(raw);

  const expiresAt =
    typeof tokens.expiresInSeconds === 'number'
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : undefined;

  // --- Identity fetch (best-effort) ---
  let displayName: string = params.provider;
  let accountRef = '';
  let pageAccessToken: string | undefined;
  try {
    switch (params.provider) {
      case 'linkedin': {
        const identity = await fetchLinkedInIdentity(tokens.accessToken);
        displayName = identity.displayName;
        accountRef = identity.accountRef;
        break;
      }
      case 'facebook': {
        const identity = await fetchFacebookIdentity(tokens.accessToken);
        displayName = identity.displayName;
        accountRef = identity.accountRef;
        pageAccessToken = identity.pageAccessToken;
        break;
      }
      case 'instagram': {
        const identity = await fetchInstagramIdentity(tokens.accessToken);
        displayName = identity.displayName;
        accountRef = identity.accountRef;
        break;
      }
      case 'x': {
        const identity = await fetchXIdentity(tokens.accessToken);
        displayName = identity.displayName;
        accountRef = identity.accountRef;
        break;
      }
    }
  } catch (identityErr) {
    app.log.error(identityErr, `identity_fetch_failed:${params.provider}`);
  }

  // --- Encrypt tokens before storage ---
  const tokenToStore = pageAccessToken ?? tokens.accessToken;
  const encryptedToken = encrypt(tokenToStore);
  const encryptedRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const connection = await prisma.socialConnection.create({
    data: {
      provider: params.provider,
      displayName,
      accountRef,
      encryptedToken,
      encryptedRefresh,
      scopes: tokens.scope ? tokens.scope.split(/[\s,]+/) : [],
      expiresAt,
      status: 'connected',
    },
  });

  authSessions.delete(body.state);

  await audit('connection', connection.id, 'oauth_connected', { provider: params.provider });

  return {
    performed: true,
    connection: {
      id: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      accountRef: connection.accountRef,
      status: connection.status,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    },
    tokens: {
      accessToken: '[redacted]',
      refreshToken: tokens.refreshToken ? '[redacted]' : undefined,
      expiresInSeconds: tokens.expiresInSeconds,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
    },
    raw,
  };
});

// ---------------------------------------------------------------------------
// Connections — full CRUD
// ---------------------------------------------------------------------------
app.get('/connections', async () => {
  const connections = await prisma.socialConnection.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return {
    connections: connections.map((c: SocialConnectionRow) => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      accountRef: c.accountRef,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
});

app.get('/connections/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  const connection = await prisma.socialConnection.findUnique({
    where: { id: params.id },
  });
  if (!connection) return reply.code(404).send({ error: 'connection_not_found' });

  return {
    connection: {
      id: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      accountRef: connection.accountRef,
      status: connection.status,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    },
  };
});

app.post('/connections', async (request, reply) => {
  const body = z
    .object({
      provider: z.enum(['linkedin', 'facebook', 'instagram', 'x']),
      displayName: z.string().min(1).optional(),
      accountRef: z.string().min(1).optional(),
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1).optional(),
      expiresAtIso: z.string().datetime().optional(),
    })
    .parse(request.body);

  const connection = await prisma.socialConnection.create({
    data: {
      provider: body.provider,
      displayName: body.displayName ?? '',
      accountRef: body.accountRef ?? '',
      encryptedToken: encrypt(body.accessToken),
      encryptedRefresh: body.refreshToken ? encrypt(body.refreshToken) : null,
      scopes: [],
      expiresAt: body.expiresAtIso ? new Date(body.expiresAtIso) : null,
      status: 'connected',
    },
  });

  await audit('connection', connection.id, 'created', { provider: body.provider });

  reply.code(201);
  return {
    connection: {
      id: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      accountRef: connection.accountRef,
      status: connection.status,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    },
  };
});

app.delete('/connections/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  try {
    await prisma.socialConnection.delete({ where: { id: params.id } });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'connection_not_found' });
    throw err;
  }

  await audit('connection', params.id, 'deleted');

  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Drafts — full CRUD
// ---------------------------------------------------------------------------
function draftToJson(d: DraftRow) {
  const slop = detectSlop(d.content);
  return {
    id: d.id,
    connectionId: d.connectionId,
    publishMode: d.publishMode.toLowerCase(),
    content: d.content,
    title: d.title,
    mediaIds: Array.isArray(d.mediaJson) ? d.mediaJson : [],
    scheduledFor: d.scheduledFor?.toISOString() ?? undefined,
    status: d.status,
    slop: {
      score: slop.score,
      rating: slop.rating,
      label: slop.label,
      flagCount: slop.flagCount,
      groups: groupSlopMatches(slop.matches),
    },
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

app.get('/drafts', async () => {
  const drafts = await prisma.draft.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return { drafts: drafts.map((d: DraftRow) => draftToJson(d)) };
});

app.get('/drafts/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  const draft = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  return { draft: draftToJson(draft as DraftRow) };
});

app.post('/drafts', async (request, reply) => {
  const body = z
    .object({
      connectionId: z.string().min(1),
      publishMode: z.enum(['draft', 'direct']),
      content: z.string().min(1),
      title: z.string().optional(),
      mediaIds: z.array(z.string()).optional(),
      scheduledFor: z.string().datetime().optional(),
    })
    .parse(request.body);

  // Verify connection exists.
  const connection = await prisma.socialConnection.findUnique({
    where: { id: body.connectionId },
  });
  if (!connection) return reply.code(400).send({ error: 'unknown_connection' });

  const draft = await prisma.draft.create({
    data: {
      connectionId: body.connectionId,
      publishMode: body.publishMode === 'draft' ? 'DRAFT' : 'DIRECT',
      content: body.content,
      title: body.title ?? null,
      mediaJson: body.mediaIds ?? [],
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      status: body.publishMode === 'draft' ? 'draft' : 'queued',
    },
  });

  await audit('draft', draft.id, 'created', { connectionId: body.connectionId, publishMode: body.publishMode });

  reply.code(201);
  return { draft: draftToJson(draft as DraftRow) };
});

app.put('/drafts/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      content: z.string().min(1).optional(),
      title: z.string().optional(),
      mediaIds: z.array(z.string()).optional(),
      scheduledFor: z.string().datetime().nullable().optional(),
      publishMode: z.enum(['draft', 'direct']).optional(),
    })
    .parse(request.body);

  const existing = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!existing) return reply.code(404).send({ error: 'draft_not_found' });

  // Block edits on published posts
  if (existing.status === 'published') {
    return reply.code(409).send({ error: 'cannot_edit_published', message: 'Published posts cannot be edited.' });
  }

  const data: Record<string, unknown> = {};
  if (body.content !== undefined) data.content = body.content;
  if (body.title !== undefined) data.title = body.title;
  if (body.mediaIds !== undefined) data.mediaJson = body.mediaIds;
  if (body.scheduledFor !== undefined) {
    data.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  }
  if (body.publishMode !== undefined) {
    data.publishMode = body.publishMode === 'draft' ? 'DRAFT' : 'DIRECT';
  }

  // If content or media changed on a queued post, cancel the pending job
  // and reset to draft so the user re-reviews before publishing.
  const contentChanged = body.content !== undefined || body.mediaIds !== undefined;
  if (contentChanged && (existing.status === 'queued' || existing.status === 'failed')) {
    data.status = 'draft';

    // Cancel any pending BullMQ jobs for this draft
    const pendingJobs = await prisma.publishJob.findMany({
      where: { draftId: params.id, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    for (const pj of pendingJobs) {
      try {
        const bullJob = await publishQueue.getJob(pj.id);
        if (bullJob) await bullJob.remove();
      } catch { /* best effort */ }
    }
    await prisma.publishJob.updateMany({
      where: { draftId: params.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'CANCELED', updatedAt: new Date() },
    });
  }

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data,
  });

  await audit('draft', draft.id, 'updated', { fields: Object.keys(body), statusReset: contentChanged && (existing.status === 'queued' || existing.status === 'failed') });

  return { draft: draftToJson(draft as DraftRow) };
});

app.delete('/drafts/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  try {
    await prisma.draft.delete({ where: { id: params.id } });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'draft_not_found' });
    throw err;
  }

  await audit('draft', params.id, 'deleted');

  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Reschedule — change scheduledFor + update BullMQ job delay
// ---------------------------------------------------------------------------
app.post('/drafts/:id/reschedule', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      scheduledFor: z.string().datetime(),
    })
    .parse(request.body);

  const existing = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!existing) return reply.code(404).send({ error: 'draft_not_found' });

  if (existing.status === 'published') {
    return reply.code(409).send({ error: 'cannot_reschedule_published', message: 'Published posts cannot be rescheduled.' });
  }

  const newScheduledFor = new Date(body.scheduledFor);

  // Update the draft's scheduledFor
  const draft = await prisma.draft.update({
    where: { id: params.id },
    data: { scheduledFor: newScheduledFor },
  });

  // If there's a pending BullMQ job, remove it and re-enqueue with the new delay
  const pendingJob = await prisma.publishJob.findFirst({
    where: { draftId: params.id, status: { in: ['PENDING'] } },
  });

  let rescheduledJob = false;
  if (pendingJob) {
    // Remove old BullMQ job
    try {
      const bullJob = await publishQueue.getJob(pendingJob.id);
      if (bullJob) await bullJob.remove();
    } catch { /* best effort */ }

    // Cancel old DB job
    await prisma.publishJob.update({
      where: { id: pendingJob.id },
      data: { status: 'CANCELED', updatedAt: new Date() },
    });

    // Create new job with updated delay
    const connection = await prisma.socialConnection.findUnique({
      where: { id: existing.connectionId },
    });

    const idemKey = crypto.randomUUID();
    const newJob = await prisma.publishJob.create({
      data: {
        draftId: draft.id,
        connectionId: draft.connectionId,
        status: 'PENDING',
        idempotencyKey: idemKey,
      },
    });

    const scheduledDelay = Math.max(0, newScheduledFor.getTime() - Date.now());

    await publishQueue.add(
      'draft.publish',
      {
        accountId: draft.connectionId,
        draftId: draft.id,
        connectionId: draft.connectionId,
        provider: connection?.provider ?? 'linkedin',
        publishMode: draft.publishMode.toLowerCase(),
        idempotencyKey: idemKey,
      },
      {
        jobId: newJob.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        delay: scheduledDelay,
      },
    );

    rescheduledJob = true;
  }

  await audit('draft', draft.id, 'rescheduled', {
    scheduledFor: body.scheduledFor,
    jobRescheduled: rescheduledJob,
  });

  return {
    draft: draftToJson(draft as DraftRow),
    rescheduledJob,
  };
});

// ---------------------------------------------------------------------------
// Revert to draft — cancel pending jobs and reset status
// ---------------------------------------------------------------------------
app.post('/drafts/:id/back-to-draft', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  const existing = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!existing) return reply.code(404).send({ error: 'draft_not_found' });

  if (existing.status === 'published') {
    return reply.code(409).send({ error: 'cannot_revert_published', message: 'Published posts cannot be reverted to draft.' });
  }
  if (existing.status === 'draft') {
    return reply.code(409).send({ error: 'already_draft', message: 'Post is already a draft.' });
  }

  // Cancel any pending/processing BullMQ jobs for this draft
  const pendingJobs = await prisma.publishJob.findMany({
    where: { draftId: params.id, status: { in: ['PENDING', 'PROCESSING'] } },
  });
  for (const pj of pendingJobs) {
    try {
      const bullJob = await publishQueue.getJob(pj.id);
      if (bullJob) await bullJob.remove();
    } catch { /* best effort */ }
  }
  if (pendingJobs.length > 0) {
    await prisma.publishJob.updateMany({
      where: { draftId: params.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'CANCELED', updatedAt: new Date() },
    });
  }

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data: { status: 'draft', updatedAt: new Date() },
  });

  await audit('draft', draft.id, 'reverted_to_draft', { previousStatus: existing.status, jobsCanceled: pendingJobs.length });

  return { draft: draftToJson(draft as DraftRow) };
});

// ---------------------------------------------------------------------------
// Publish — enqueue via BullMQ + rate limit per connection
// ---------------------------------------------------------------------------
app.post('/publish/:draftId', async (request, reply) => {
  const params = z.object({ draftId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      idempotencyKey: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const draft = await prisma.draft.findUnique({ where: { id: params.draftId } });
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  // --- Clean up stale jobs for THIS draft before rate-limiting ---
  // If the draft is in 'draft' or 'failed' status, any old PENDING/PROCESSING
  // jobs are stale leftovers from a previous cycle (edit reset, failed publish, etc).
  if (draft.status === 'draft' || draft.status === 'failed') {
    const staleJobs = await prisma.publishJob.findMany({
      where: { draftId: draft.id, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    for (const sj of staleJobs) {
      try {
        const bullJob = await publishQueue.getJob(sj.id);
        if (bullJob) await bullJob.remove();
      } catch { /* best effort */ }
    }
    if (staleJobs.length > 0) {
      await prisma.publishJob.updateMany({
        where: { draftId: draft.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELED', updatedAt: new Date() },
      });
    }
  }

  // --- Idempotency check ---
  const idemKey = body.idempotencyKey ?? crypto.randomUUID();
  const existingIdem = await prisma.idempotencyKey.findUnique({
    where: { key: idemKey },
  });
  if (existingIdem?.responseJson) {
    // Return cached response.
    return existingIdem.responseJson;
  }

  // --- Rate limit: one active job per connection ---
  const activeJob = await prisma.publishJob.findFirst({
    where: {
      connectionId: draft.connectionId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
  });
  if (activeJob) {
    return reply.code(429).send({
      error: 'rate_limited',
      message: 'An active publish job already exists for this connection. Wait for it to complete.',
      activeJobId: activeJob.id,
    });
  }

  // --- Create job record + enqueue ---
  const job = await prisma.publishJob.create({
    data: {
      draftId: draft.id,
      connectionId: draft.connectionId,
      status: 'PENDING',
      idempotencyKey: idemKey,
    },
  });

  // Mark draft as queued.
  await prisma.draft.update({
    where: { id: draft.id },
    data: { status: 'queued' },
  });

  // Fetch connection to include provider in job data.
  const connection = await prisma.socialConnection.findUnique({
    where: { id: draft.connectionId },
  });

  // Calculate scheduled delay (if draft has a future scheduledFor).
  const scheduledDelay = draft.scheduledFor
    ? Math.max(0, new Date(draft.scheduledFor).getTime() - Date.now())
    : 0;

  // Enqueue BullMQ job — job name must be 'draft.publish' to match worker handler map.
  await publishQueue.add(
    'draft.publish',
    {
      accountId: draft.connectionId,
      draftId: draft.id,
      connectionId: draft.connectionId,
      provider: connection?.provider ?? 'linkedin',
      publishMode: draft.publishMode.toLowerCase(),
      idempotencyKey: idemKey,
    },
    {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      delay: scheduledDelay,
    },
  );

  const responsePayload = {
    queued: true,
    draft: {
      id: draft.id,
      connectionId: draft.connectionId,
      publishMode: draft.publishMode.toLowerCase(),
      content: draft.content,
      status: 'queued',
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    },
    job: {
      id: job.id,
      draftId: job.draftId,
      connectionId: job.connectionId,
      status: job.status,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    },
  };

  // Store idempotency record.
  await prisma.idempotencyKey.upsert({
    where: { key: idemKey },
    create: {
      key: idemKey,
      scope: 'publish',
      requestHash: `draft:${draft.id}`,
      responseJson: responsePayload,
    },
    update: {
      responseJson: responsePayload,
    },
  });

  await audit('job', job.id, 'enqueued', { draftId: draft.id, connectionId: draft.connectionId });

  return responsePayload;
});

// ---------------------------------------------------------------------------
// Jobs — read-only listing
// ---------------------------------------------------------------------------
app.get('/jobs', async () => {
  const jobs = await prisma.publishJob.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return {
    jobs: jobs.map((j: PublishJobRow) => ({
      id: j.id,
      draftId: j.draftId,
      connectionId: j.connectionId,
      status: j.status,
      idempotencyKey: j.idempotencyKey,
      receiptJson: j.receiptJson,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Job execute — kept for local dev / manual testing (worker normally handles this)
// ---------------------------------------------------------------------------
app.post('/jobs/:jobId/execute', async (request, reply) => {
  const params = z.object({ jobId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      perform: z.boolean().optional().default(false),
    })
    .parse(request.body ?? {});

  const job = await prisma.publishJob.findUnique({ where: { id: params.jobId } });
  if (!job) return reply.code(404).send({ error: 'job_not_found' });

  const draft = await prisma.draft.findUnique({ where: { id: job.draftId } });
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  const connection = await prisma.socialConnection.findUnique({
    where: { id: job.connectionId },
  });
  if (!connection) return reply.code(400).send({ error: 'connection_not_ready' });
  if (!connection.encryptedToken) return reply.code(400).send({ error: 'connection_not_ready' });

  const authAdapter = createAuthAdapter(connection.provider as ProviderId);
  const publishAdapter = authAdapter as unknown as ProviderPublishAdapter;

  if (typeof publishAdapter.buildPublishRequest !== 'function') {
    return reply.code(400).send({ error: 'publish_not_supported_for_provider' });
  }

  if (!connection.accountRef) {
    return reply.code(400).send({
      error: 'missing_accountRef',
      note: 'Set connection.accountRef (person/org id or URN) before publishing',
    });
  }

  // Decrypt token for use
  let decryptedToken: string;
  try {
    decryptedToken = decrypt(connection.encryptedToken);
  } catch {
    return reply.code(400).send({ error: 'token_decryption_failed' });
  }

  let publishReq: HttpRequest;
  try {
    publishReq = publishAdapter.buildPublishRequest({
      accessToken: decryptedToken,
      accountRef: connection.accountRef,
      text: draft.content,
      idempotencyKey: job.idempotencyKey,
    });
  } catch (err) {
    const msg =
      err instanceof NotImplementedError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'publish_build_failed';
    return reply.code(400).send({ error: msg });
  }

  if (!body.perform) {
    return {
      performed: false,
      request: {
        ...publishReq,
        headers: {
          ...publishReq.headers,
          authorization: publishReq.headers.authorization ? 'Bearer [redacted]' : undefined,
        },
      },
      note: 'Publish execution is typically worker-owned. Set perform=true for local dev.',
    };
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: 'PROCESSING' },
  });

  const res = await fetch(publishReq.url, {
    method: publishReq.method,
    headers: publishReq.headers,
    body: publishReq.body,
  });
  const raw = await res.json().catch(() => ({ error: 'non_json_response' }));

  if (!res.ok) {
    await prisma.publishJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: `publish_failed:${res.status}` },
    });
    await prisma.draft.update({
      where: { id: draft.id },
      data: { status: 'failed' },
    });

    return reply.code(400).send({ error: 'publish_failed', status: res.status, raw });
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: 'SUCCEEDED', receiptJson: raw },
  });
  await prisma.draft.update({
    where: { id: draft.id },
    data: { status: 'published' },
  });

  return { performed: true, job: { id: job.id, status: 'SUCCEEDED' }, receipt: raw };
});

// ---------------------------------------------------------------------------
// Audit events — read-only listing
// ---------------------------------------------------------------------------
app.get('/audit', async (request) => {
  const query = z.object({ limit: z.coerce.number().optional() }).parse(request.query);
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: query.limit || 50,
  });
  return { events };
});

// ---------------------------------------------------------------------------
// Media — upload, list, delete
// ---------------------------------------------------------------------------
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/quicktime',
]);

app.post('/media/upload', async (request, reply) => {
  const file = await request.file();
  if (!file) return reply.code(400).send({ error: 'no_file' });

  if (!ALLOWED_MIME.has(file.mimetype)) {
    return reply.code(400).send({ error: 'unsupported_mime_type', mime: file.mimetype });
  }

  const ext = extname(file.filename) || '.bin';
  const storedName = `${randomUUID()}${ext}`;
  const storagePath = join(UPLOADS_DIR, storedName);

  await pipeline(file.file, createWriteStream(storagePath));

  // Check if the file was truncated (exceeded size limit)
  if (file.file.truncated) {
    unlinkSync(storagePath);
    return reply.code(413).send({ error: 'file_too_large', maxBytes: 20 * 1024 * 1024 });
  }

  const stats = await import('node:fs/promises').then(fs => fs.stat(storagePath));

  const media = await prisma.media.create({
    data: {
      filename: storedName,
      originalName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: stats.size,
      storagePath,
    },
  });

  await audit('media', media.id, 'uploaded', { originalName: file.filename, mimeType: file.mimetype, sizeBytes: stats.size });

  reply.code(201);
  return {
    media: {
      id: media.id,
      filename: media.filename,
      originalName: media.originalName,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      url: `/uploads/${media.filename}`,
      createdAt: media.createdAt.toISOString(),
    },
  };
});

app.get('/media', async () => {
  const items = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
  return {
    media: items.map((m) => ({
      id: m.id,
      filename: m.filename,
      originalName: m.originalName,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      url: `/uploads/${m.filename}`,
      alt: m.alt,
      createdAt: m.createdAt.toISOString(),
    })),
  };
});

app.get('/media/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const media = await prisma.media.findUnique({ where: { id: params.id } });
  if (!media) return reply.code(404).send({ error: 'media_not_found' });

  return {
    media: {
      id: media.id,
      filename: media.filename,
      originalName: media.originalName,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      url: `/uploads/${media.filename}`,
      alt: media.alt,
      createdAt: media.createdAt.toISOString(),
    },
  };
});

app.delete('/media/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const media = await prisma.media.findUnique({ where: { id: params.id } });
  if (!media) return reply.code(404).send({ error: 'media_not_found' });

  // Delete file from disk
  try { if (existsSync(media.storagePath)) unlinkSync(media.storagePath); } catch { /* best effort */ }

  await prisma.media.delete({ where: { id: params.id } });
  await audit('media', params.id, 'deleted');

  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Slop detection — rule-based AI writing detector (no AI used)
// ---------------------------------------------------------------------------
app.post('/slop/check', async (request) => {
  const body = z.object({ text: z.string().min(1) }).parse(request.body);
  const result = detectSlop(body.text);
  return {
    ...result,
    groups: groupSlopMatches(result.matches),
    source: 'stop-slop (rule-based, no AI)',
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = Number(process.env.APP_PORT || 4001);
app.listen({ port, host: '0.0.0.0' });
