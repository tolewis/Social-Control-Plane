import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
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

// Prisma model types for map callback annotations.
// Defined locally to avoid version-mismatch issues with the generated client.
type SocialConnectionRow = { id: string; provider: string; displayName: string; accountRef: string; status: string; createdAt: Date; updatedAt: Date };
type DraftRow = { id: string; connectionId: string; publishMode: string; content: string; title: string | null; scheduledFor: Date | null; status: string; createdAt: Date; updatedAt: Date };
type PublishJobRow = { id: string; draftId: string; connectionId: string; status: string; idempotencyKey: string; receiptJson: unknown; errorMessage: string | null; createdAt: Date; updatedAt: Date };

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

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
    tokenReq = adapter.buildTokenExchangeRequest({ code: body.code, redirectUri });
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

  const connection = await prisma.socialConnection.create({
    data: {
      provider: params.provider,
      displayName: '',
      accountRef: '',
      encryptedToken: tokens.accessToken,
      encryptedRefresh: tokens.refreshToken ?? null,
      scopes: tokens.scope ? tokens.scope.split(/[\s,]+/) : [],
      expiresAt,
      status: 'connected',
    },
  });

  authSessions.delete(body.state);

  return {
    performed: true,
    connection: {
      id: connection.id,
      provider: connection.provider,
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
      encryptedToken: body.accessToken,
      encryptedRefresh: body.refreshToken ?? null,
      scopes: [],
      expiresAt: body.expiresAtIso ? new Date(body.expiresAtIso) : null,
      status: 'connected',
    },
  });

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

  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Drafts — full CRUD
// ---------------------------------------------------------------------------
app.get('/drafts', async () => {
  const drafts = await prisma.draft.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return {
    drafts: drafts.map((d: DraftRow) => ({
      id: d.id,
      connectionId: d.connectionId,
      publishMode: d.publishMode.toLowerCase(),
      content: d.content,
      title: d.title,
      scheduledFor: d.scheduledFor?.toISOString() ?? undefined,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  };
});

app.get('/drafts/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  const draft = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  return {
    draft: {
      id: draft.id,
      connectionId: draft.connectionId,
      publishMode: draft.publishMode.toLowerCase(),
      content: draft.content,
      title: draft.title,
      scheduledFor: draft.scheduledFor?.toISOString() ?? undefined,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    },
  };
});

app.post('/drafts', async (request, reply) => {
  const body = z
    .object({
      connectionId: z.string().min(1),
      publishMode: z.enum(['draft', 'direct']),
      content: z.string().min(1),
      title: z.string().optional(),
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
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      status: body.publishMode === 'draft' ? 'draft' : 'queued',
    },
  });

  reply.code(201);
  return {
    draft: {
      id: draft.id,
      connectionId: draft.connectionId,
      publishMode: draft.publishMode.toLowerCase(),
      content: draft.content,
      title: draft.title,
      scheduledFor: draft.scheduledFor?.toISOString() ?? undefined,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    },
  };
});

app.put('/drafts/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      content: z.string().min(1).optional(),
      title: z.string().optional(),
      scheduledFor: z.string().datetime().nullable().optional(),
      publishMode: z.enum(['draft', 'direct']).optional(),
    })
    .parse(request.body);

  const existing = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!existing) return reply.code(404).send({ error: 'draft_not_found' });

  const data: Record<string, unknown> = {};
  if (body.content !== undefined) data.content = body.content;
  if (body.title !== undefined) data.title = body.title;
  if (body.scheduledFor !== undefined) {
    data.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  }
  if (body.publishMode !== undefined) {
    data.publishMode = body.publishMode === 'draft' ? 'DRAFT' : 'DIRECT';
  }

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data,
  });

  return {
    draft: {
      id: draft.id,
      connectionId: draft.connectionId,
      publishMode: draft.publishMode.toLowerCase(),
      content: draft.content,
      title: draft.title,
      scheduledFor: draft.scheduledFor?.toISOString() ?? undefined,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    },
  };
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

  return { deleted: true };
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

  let publishReq: HttpRequest;
  try {
    publishReq = publishAdapter.buildPublishRequest({
      accessToken: connection.encryptedToken,
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
// Start
// ---------------------------------------------------------------------------
const port = Number(process.env.APP_PORT || 4001);
app.listen({ port, host: '0.0.0.0' });
