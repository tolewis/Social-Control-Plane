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
  ConnectionRecord,
  DraftRecord,
  HttpRequest,
  ProviderId,
  PublishJobRecord,
  ProviderPublishAdapter,
} from '@scp/shared';
import { isProviderId, NotImplementedError, PROVIDERS } from '@scp/shared';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const nowIso = () => new Date().toISOString();

/**
 * NOTE: This API currently uses in-memory storage.
 * The Prisma schema exists for the durable implementation, but wiring is intentionally deferred.
 */
const connections = new Map<string, ConnectionRecord>();
const connectionSecrets = new Map<
  string,
  { accessToken: string; refreshToken?: string; expiresAtIso?: string }
>();

const drafts = new Map<string, DraftRecord>();
const publishJobs = new Map<string, PublishJobRecord>();

const authSessions = new Map<
  string,
  { provider: ProviderId; redirectUri: string; createdAtIso: string }
>();

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
      // Exhaustive by type, but keep runtime safety.
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

app.get('/health', async () => ({ ok: true, service: 'api' }));

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
      /** If true, API will execute the request with fetch(). Useful for local dev only. */
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
      note: 'Token exchange is designed to be executed by the worker (network side-effects). Set perform=true for local dev.'
    };
  }

  // Best-effort local dev flow.
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

  const id = crypto.randomUUID();
  const connection: ConnectionRecord = {
    id,
    provider: params.provider,
    status: 'connected',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  connections.set(id, connection);

  const expiresAtIso =
    typeof tokens.expiresInSeconds === 'number'
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
      : undefined;

  connectionSecrets.set(id, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAtIso,
  });

  // State is single-use.
  authSessions.delete(body.state);

  return {
    performed: true,
    connection,
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

app.get('/connections', async () => ({
  persistence: 'memory',
  connections: Array.from(connections.values()),
}));

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

  const id = crypto.randomUUID();
  const connection: ConnectionRecord = {
    id,
    provider: body.provider,
    displayName: body.displayName,
    accountRef: body.accountRef,
    status: 'connected',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  connections.set(id, connection);
  connectionSecrets.set(id, {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAtIso: body.expiresAtIso,
  });

  reply.code(201);
  return { connection };
});

app.get('/drafts', async () => ({
  persistence: 'memory',
  drafts: Array.from(drafts.values()),
}));

app.post('/drafts', async (request, reply) => {
  const body = z
    .object({
      connectionId: z.string().min(1),
      publishMode: z.enum(['draft', 'direct']),
      content: z.string().min(1),
      scheduledFor: z.string().datetime().optional(),
    })
    .parse(request.body);

  const connection = connections.get(body.connectionId);
  if (!connection) return reply.code(400).send({ error: 'unknown_connection' });

  const draft: DraftRecord = {
    id: crypto.randomUUID(),
    connectionId: body.connectionId,
    publishMode: body.publishMode,
    content: body.content,
    scheduledFor: body.scheduledFor,
    status: body.publishMode === 'draft' ? 'draft' : 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  drafts.set(draft.id, draft);
  reply.code(201);
  return { draft };
});

app.post('/publish/:draftId', async (request, reply) => {
  const params = z.object({ draftId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      idempotencyKey: z.string().min(1).optional(),
    })
    .parse(request.body ?? {});

  const draft = drafts.get(params.draftId);
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  draft.status = 'queued';
  draft.updatedAt = nowIso();
  drafts.set(draft.id, draft);

  const job: PublishJobRecord = {
    id: crypto.randomUUID(),
    draftId: draft.id,
    connectionId: draft.connectionId,
    status: 'pending',
    idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  publishJobs.set(job.id, job);

  return { queued: true, draft, job };
});

app.get('/jobs', async () => ({
  persistence: 'memory',
  jobs: Array.from(publishJobs.values()),
}));

app.post('/jobs/:jobId/execute', async (request, reply) => {
  const params = z.object({ jobId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      perform: z.boolean().optional().default(false),
    })
    .parse(request.body ?? {});

  const job = publishJobs.get(params.jobId);
  if (!job) return reply.code(404).send({ error: 'job_not_found' });

  const draft = drafts.get(job.draftId);
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  const connection = connections.get(job.connectionId);
  const secrets = connectionSecrets.get(job.connectionId);

  if (!connection || !secrets) return reply.code(400).send({ error: 'connection_not_ready' });

  const authAdapter = createAuthAdapter(connection.provider);
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
      accessToken: secrets.accessToken,
      accountRef: connection.accountRef,
      text: draft.content,
      idempotencyKey: job.idempotencyKey,
    });
  } catch (err) {
    const msg = err instanceof NotImplementedError ? err.message : (err instanceof Error ? err.message : 'publish_build_failed');
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
      note: 'Publish execution is typically worker-owned. Set perform=true for local dev.'
    };
  }

  job.status = 'processing';
  job.updatedAt = nowIso();
  publishJobs.set(job.id, job);

  const res = await fetch(publishReq.url, {
    method: publishReq.method,
    headers: publishReq.headers,
    body: publishReq.body,
  });
  const raw = await res.json().catch(() => ({ error: 'non_json_response' }));

  if (!res.ok) {
    job.status = 'failed';
    job.errorMessage = `publish_failed:${res.status}`;
    job.updatedAt = nowIso();
    publishJobs.set(job.id, job);

    draft.status = 'failed';
    draft.updatedAt = nowIso();
    drafts.set(draft.id, draft);

    return reply.code(400).send({ error: 'publish_failed', status: res.status, raw });
  }

  job.status = 'succeeded';
  job.receiptJson = raw;
  job.updatedAt = nowIso();
  publishJobs.set(job.id, job);

  draft.status = 'published';
  draft.updatedAt = nowIso();
  drafts.set(draft.id, draft);

  return { performed: true, job, receipt: raw };
});

const port = Number(process.env.APP_PORT || 4001);
app.listen({ port, host: '0.0.0.0' });
