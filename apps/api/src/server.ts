import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { randomUUID, createHmac, timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, unlinkSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createAuthAdapter,
  LinkedInAdapter,
  FacebookAdapter,
  InstagramAdapter,
  XAdapter,
  type ProviderCredentials,
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
type SocialConnectionRow = {
  id: string;
  provider: string;
  displayName: string;
  accountRef: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
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
// Operator auth — HMAC-signed bearer tokens
// ---------------------------------------------------------------------------
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signToken(): string {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  const sig = createHmac('sha256', key).update(`scp:${expiry}`).digest('hex');
  return `${expiry}.${sig}`;
}

function verifyToken(token: string): boolean {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiryStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (isNaN(expiry) || Date.now() > expiry) return false;
  const expected = createHmac('sha256', key).update(`scp:${expiry}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const PUBLIC_PATHS = new Set(['/health', '/auth/login', '/auth/check']);

app.addHook('onRequest', async (request, reply) => {
  // Skip auth if no ADMIN_PASSWORD configured (dev mode / backwards compat)
  if (!process.env.ADMIN_PASSWORD) return;

  const urlPath = request.url.split('?')[0];
  if (PUBLIC_PATHS.has(urlPath)) return;
  // OAuth exchange endpoint — validated by state parameter, needs to work from popup without session cookie
  if (urlPath.match(/^\/auth\/[^/]+\/exchange$/)) return;
  // Allow static uploads without auth
  if (urlPath.startsWith('/uploads/')) return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const bearerValue = authHeader.slice(7);

  // API key auth: scp_ prefix
  if (bearerValue.startsWith('scp_')) {
    const keyHash = createHash('sha256').update(bearerValue).digest('hex');
    const apiKey = await prisma.apiKey.findFirst({ where: { keyHash }, include: { operator: true } });
    if (!apiKey) return reply.code(401).send({ error: 'invalid_api_key' });
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'api_key_expired' });
    }
    // Update lastUsedAt (fire-and-forget)
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    // Attach operator info to request for audit
    (request as unknown as Record<string, unknown>).operatorId = apiKey.operator.id;
    (request as unknown as Record<string, unknown>).operatorName = apiKey.operator.name;
    (request as unknown as Record<string, unknown>).operatorRole = apiKey.operator.role;
    return;
  }

  // HMAC token auth (human login)
  if (!verifyToken(bearerValue)) {
    return reply.code(401).send({ error: 'invalid_or_expired_token' });
  }
});

app.post('/auth/login', async (request, reply) => {
  const body = z.object({ password: z.string().min(1) }).parse(request.body);
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return reply.code(500).send({ error: 'ADMIN_PASSWORD not configured' });
  }
  if (body.password !== expected) {
    return reply.code(401).send({ error: 'wrong_password' });
  }
  return { token: signToken() };
});

app.get('/auth/check', async (request) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { authenticated: false };
  }
  return { authenticated: verifyToken(authHeader.slice(7)) };
});

// ---------------------------------------------------------------------------
// Auth sessions stay in-memory — they're short-lived, pre-login state.
// ---------------------------------------------------------------------------
const authSessions = new Map<
  string,
  { provider: ProviderId; redirectUri: string; createdAtIso: string }
>();

const nowIso = () => new Date().toISOString();

const envRedirectUri = (provider: ProviderId): string => {
  switch (provider) {
    case 'linkedin': return process.env.LINKEDIN_REDIRECT_URI || '';
    case 'facebook': return process.env.FACEBOOK_REDIRECT_URI || '';
    case 'instagram': return process.env.INSTAGRAM_REDIRECT_URI || '';
    case 'x': return process.env.X_REDIRECT_URI || '';
    default: throw new Error(`unknown provider: ${provider}`);
  }
};

/** Check DB-stored config first, fall back to .env */
async function redirectUriFor(provider: ProviderId): Promise<string> {
  const config = await prisma.providerConfig.findUnique({ where: { provider } });
  if (config?.redirectUri) return config.redirectUri;
  return envRedirectUri(provider);
}

/** Load provider credentials from DB (decrypted), or undefined for .env fallback */
async function loadProviderCreds(provider: ProviderId): Promise<ProviderCredentials | undefined> {
  const config = await prisma.providerConfig.findUnique({ where: { provider } });
  if (!config) return undefined;
  try {
    return {
      clientId: decrypt(config.encryptedClientId),
      clientSecret: decrypt(config.encryptedClientSecret),
    };
  } catch {
    return undefined;
  }
}

/** Check whether a provider has credentials configured (DB or env) */
function envHasCredentials(provider: ProviderId): boolean {
  switch (provider) {
    case 'linkedin': return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
    case 'facebook': return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
    case 'instagram': return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
    case 'x': return !!(process.env.X_API_KEY && process.env.X_API_SECRET);
    default: return false;
  }
}

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

async function fetchInstagramIdentityFromPage(
  pageId: string,
  accessToken: string,
): Promise<{ displayName: string; accountRef: string; pageAccessToken?: string }> {
  const pageRes = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!pageRes.ok) throw new Error(`instagram_page_failed:${pageRes.status}`);
  const pageData = (await pageRes.json()) as {
    id?: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id?: string };
  };

  const igAccountId = pageData.instagram_business_account?.id || '';
  if (!igAccountId) {
    throw new Error('instagram_page_missing_business_account');
  }

  const igRes = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(igAccountId)}?fields=id,name,username&access_token=${encodeURIComponent(pageData.access_token || accessToken)}`,
  );
  if (!igRes.ok) throw new Error(`instagram_account_fetch_failed:${igRes.status}`);
  const igData = (await igRes.json()) as { id?: string; name?: string; username?: string };

  return {
    displayName: igData.username ? `@${igData.username}` : igData.name || pageData.name || 'Instagram',
    accountRef: igData.id || igAccountId,
    pageAccessToken: pageData.access_token,
  };
}

type MetaPageDiscovery = {
  pageId: string;
  pageName: string;
  pageAccessToken?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  instagramName?: string;
};

async function discoverMetaPages(accessToken: string): Promise<MetaPageDiscovery[]> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) throw new Error(`meta_pages_discovery_failed:${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string; name?: string };
    }>;
  };

  return (data.data ?? [])
    .filter((page) => page.id && page.name)
    .map((page) => ({
      pageId: page.id!,
      pageName: page.name!,
      pageAccessToken: page.access_token,
      instagramAccountId: page.instagram_business_account?.id,
      instagramUsername: page.instagram_business_account?.username,
      instagramName: page.instagram_business_account?.name,
    }));
}

async function fetchXIdentity(accessToken: string): Promise<{ displayName: string; accountRef: string }> {
  const res = await fetch('https://api.x.com/2/users/me', {
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
// Provider configuration — credential management via UI
// ---------------------------------------------------------------------------

app.get('/providers/status', async () => {
  const configs = await prisma.providerConfig.findMany();
  const connections = await prisma.socialConnection.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const result: Record<string, unknown> = {};
  for (const provider of PROVIDERS) {
    const dbConfig = configs.find((c) => c.provider === provider);
    const hasEnv = envHasCredentials(provider);
    const configured = !!dbConfig || hasEnv;
    const providerConnections = connections
      .filter((c) => c.provider === provider)
      .map((c: SocialConnectionRow) => ({
        id: c.id,
        provider: c.provider,
        displayName: c.displayName,
        accountRef: (c as Record<string, unknown>).accountRef as string,
        status: c.status,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));

    result[provider] = {
      configured,
      source: dbConfig ? 'database' : hasEnv ? 'env' : null,
      redirectUri: dbConfig?.redirectUri || envRedirectUri(provider) || '',
      clientIdPrefix: dbConfig ? decrypt(dbConfig.encryptedClientId).slice(0, 6) : null,
      connections: providerConnections,
    };
  }

  return { providers: result };
});

app.put('/providers/:provider/config', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }

  const body = z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.string().optional(),
  }).parse(request.body);

  const provider = params.provider;
  const redirectUri = body.redirectUri || envRedirectUri(provider) || `${process.env.PUBLIC_URL || 'http://localhost:3000'}/integrations/${provider}/callback`;

  await prisma.providerConfig.upsert({
    where: { provider },
    create: {
      provider,
      encryptedClientId: encrypt(body.clientId),
      encryptedClientSecret: encrypt(body.clientSecret),
      redirectUri,
    },
    update: {
      encryptedClientId: encrypt(body.clientId),
      encryptedClientSecret: encrypt(body.clientSecret),
      redirectUri,
    },
  });

  await audit('provider_config', provider, 'credentials_saved', { provider });
  return { saved: true, provider };
});

app.delete('/providers/:provider/config', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }

  await prisma.providerConfig.deleteMany({ where: { provider: params.provider } });
  await audit('provider_config', params.provider, 'credentials_deleted', { provider: params.provider });
  return { deleted: true, provider: params.provider };
});

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.get('/auth/urls', async () => {
  const result: Record<string, { url?: string; state?: string; error?: string }> = {};

  for (const provider of PROVIDERS) {
    try {
      const redirectUri = await redirectUriFor(provider);
      if (!redirectUri) throw new Error(`missing_redirect_uri:${provider}`);

      const state = crypto.randomUUID();
      authSessions.set(state, { provider, redirectUri, createdAtIso: nowIso() });

      const creds = await loadProviderCreds(provider);
      const adapter = createAuthAdapter(provider, creds);
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
  const redirectUri = query.redirectUri || await redirectUriFor(provider);
  if (!redirectUri) return reply.code(400).send({ error: 'missing_redirect_uri' });

  const state = crypto.randomUUID();
  authSessions.set(state, { provider, redirectUri, createdAtIso: nowIso() });

  const creds = await loadProviderCreds(provider);
  const adapter = createAuthAdapter(provider, creds);
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

  const creds = await loadProviderCreds(params.provider);
  const adapter = createAuthAdapter(params.provider, creds);
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
// Direct token connect — for providers that don't support OAuth (e.g. Facebook/Instagram
// with a "Login for Business" app type). Accepts a raw Page Access Token, validates it
// by fetching identity from the Graph API, and creates a connection record.
// ---------------------------------------------------------------------------
app.post('/auth/:provider/connect-token', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }
  const provider = params.provider;

  const body = z
    .object({
      accessToken: z.string().min(1),
      pageId: z.string().optional(),
      accountRef: z.string().optional(),
      displayName: z.string().optional(),
      instagramAccountId: z.string().optional(),
    })
    .parse(request.body);

  // Validate token + resolve identity
  let resolvedDisplayName = body.displayName || provider;
  let resolvedAccountRef = body.accountRef || '';
  let tokenToStore = body.accessToken;

  try {
    switch (provider) {
      case 'facebook': {
        if (body.pageId) {
          // If pageId is provided, fetch Page name + get a Page token if access_token is a User token
          const pageRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(body.pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(body.accessToken)}`
          );
          if (!pageRes.ok) {
            return reply.code(400).send({ error: 'facebook_page_fetch_failed', status: pageRes.status });
          }
          const pageData = (await pageRes.json()) as { id?: string; name?: string; access_token?: string };
          resolvedDisplayName = body.displayName || pageData.name || 'Facebook Page';
          resolvedAccountRef = pageData.id || body.pageId;
          // If the page has its own access_token (user token exchange), prefer it
          if (pageData.access_token) tokenToStore = pageData.access_token;
        } else {
          // Fall back: treat accessToken as a Page Access Token directly
          const identity = await fetchFacebookIdentity(body.accessToken);
          resolvedDisplayName = body.displayName || identity.displayName;
          resolvedAccountRef = identity.accountRef;
          if (identity.pageAccessToken) tokenToStore = identity.pageAccessToken;
        }
        break;
      }
      case 'instagram': {
        if (body.instagramAccountId) {
          const igRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(body.instagramAccountId)}?fields=id,name,username&access_token=${encodeURIComponent(body.accessToken)}`
          );
          if (!igRes.ok) {
            return reply.code(400).send({ error: 'instagram_account_fetch_failed', status: igRes.status });
          }
          const igData = (await igRes.json()) as { id?: string; name?: string; username?: string };
          resolvedDisplayName = body.displayName || (igData.username ? `@${igData.username}` : igData.name || 'Instagram');
          resolvedAccountRef = igData.id || body.instagramAccountId;
        } else if (body.pageId) {
          const identity = await fetchInstagramIdentityFromPage(body.pageId, body.accessToken);
          resolvedDisplayName = body.displayName || identity.displayName;
          resolvedAccountRef = identity.accountRef;
          if (identity.pageAccessToken) tokenToStore = identity.pageAccessToken;
        } else {
          const identity = await fetchInstagramIdentity(body.accessToken);
          resolvedDisplayName = body.displayName || identity.displayName;
          resolvedAccountRef = identity.accountRef;
        }
        break;
      }
      default:
        return reply.code(400).send({ error: 'provider_not_supported_for_direct_token', provider });
    }
  } catch (err) {
    return reply.code(400).send({
      error: 'token_validation_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }

  if (!resolvedAccountRef) {
    return reply.code(400).send({
      error: 'could_not_resolve_account_ref',
      hint: provider === 'instagram' ? 'Provide instagramAccountId or the linked Facebook pageId' : 'Provide pageId',
    });
  }

  const encryptedToken = encrypt(tokenToStore);

  // Page Access Tokens don't expire — no expiresAt set
  const connection = await prisma.socialConnection.create({
    data: {
      provider,
      displayName: resolvedDisplayName,
      accountRef: resolvedAccountRef,
      encryptedToken,
      encryptedRefresh: null,
      scopes: [],
      expiresAt: null,
      status: 'connected',
    },
  });

  await audit('connection', connection.id, 'token_connected', { provider, accountRef: resolvedAccountRef });

  return {
    connection: {
      id: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      accountRef: connection.accountRef,
      status: connection.status,
      expiresAt: null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    },
  };
});

app.post('/auth/:provider/discover', async (request, reply) => {
  const params = z.object({ provider: z.string() }).parse(request.params);
  if (!isProviderId(params.provider)) {
    return reply.code(400).send({ error: 'invalid_provider' });
  }
  if (params.provider !== 'facebook' && params.provider !== 'instagram') {
    return reply.code(400).send({ error: 'provider_not_supported_for_discovery', provider: params.provider });
  }

  const body = z.object({ accessToken: z.string().min(1) }).parse(request.body);

  try {
    const pages = await discoverMetaPages(body.accessToken);
    const assets = params.provider === 'facebook'
      ? pages.map((page) => ({
          pageId: page.pageId,
          pageName: page.pageName,
          displayName: page.pageName,
        }))
      : pages
        .filter((page) => page.instagramAccountId)
        .map((page) => ({
          pageId: page.pageId,
          pageName: page.pageName,
          instagramAccountId: page.instagramAccountId!,
          instagramUsername: page.instagramUsername,
          instagramName: page.instagramName,
          displayName: page.instagramUsername ? `@${page.instagramUsername}` : page.instagramName || page.pageName,
        }));

    return { provider: params.provider, assets };
  } catch (err) {
    return reply.code(400).send({
      error: 'meta_discovery_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
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

app.post('/connections/:id/refresh', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);

  const connection = await prisma.socialConnection.findUnique({ where: { id: params.id } });
  if (!connection) return reply.code(404).send({ error: 'connection_not_found' });
  if (!connection.encryptedRefresh) {
    return reply.code(400).send({ error: 'no_refresh_token', message: 'This connection has no refresh token stored.' });
  }

  const creds = await loadProviderCreds(connection.provider as ProviderId);
  const adapter = createAuthAdapter(connection.provider as ProviderId, creds);
  if (typeof adapter.buildRefreshRequest !== 'function') {
    return reply.code(400).send({ error: 'refresh_not_supported', message: `Provider ${connection.provider} does not support token refresh.` });
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(connection.encryptedRefresh);
  } catch {
    return reply.code(500).send({ error: 'refresh_token_decrypt_failed' });
  }

  const refreshReq = adapter.buildRefreshRequest({ refreshToken });
  const res = await fetch(refreshReq.url, {
    method: refreshReq.method,
    headers: refreshReq.headers,
    body: refreshReq.method === 'POST' ? refreshReq.body : undefined,
  });

  const raw = await res.json().catch(() => ({ error: 'non_json_response' }));
  if (!res.ok) {
    await prisma.socialConnection.update({
      where: { id: params.id },
      data: { status: 'reconnect_required', updatedAt: new Date() },
    });
    return reply.code(400).send({ error: 'refresh_failed', status: res.status, raw });
  }

  const tokens = adapter.normalizeTokenResponse(raw);
  const newExpiresAt = typeof tokens.expiresInSeconds === 'number'
    ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
    : null;

  const updated = await prisma.socialConnection.update({
    where: { id: params.id },
    data: {
      encryptedToken: encrypt(tokens.accessToken),
      encryptedRefresh: tokens.refreshToken ? encrypt(tokens.refreshToken) : connection.encryptedRefresh,
      expiresAt: newExpiresAt,
      status: 'connected',
      updatedAt: new Date(),
    },
  });

  await audit('connection', params.id, 'token_refreshed', { provider: connection.provider });

  return {
    refreshed: true,
    connection: {
      id: updated.id,
      provider: updated.provider,
      displayName: updated.displayName,
      accountRef: updated.accountRef,
      status: updated.status,
      expiresAt: newExpiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
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
    publishMode: d.publishMode,
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

app.get('/drafts', async (request) => {
  const query = z.object({
    page: z.coerce.number().min(1).optional(),
    pageSize: z.coerce.number().min(1).max(200).optional(),
    status: z.enum(['draft', 'queued', 'published', 'failed']).optional(),
    connectionId: z.string().optional(),
  }).parse(request.query);

  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.connectionId) where.connectionId = query.connectionId;

  if (query.page) {
    const pageSize = query.pageSize ?? 50;
    const skip = (query.page - 1) * pageSize;
    const [drafts, total] = await Promise.all([
      prisma.draft.findMany({ where, orderBy: { createdAt: 'desc' }, take: pageSize, skip }),
      prisma.draft.count({ where }),
    ]);
    return { drafts: drafts.map((d: DraftRow) => draftToJson(d)), total, page: query.page, pageSize };
  }

  const drafts = await prisma.draft.findMany({ where, orderBy: { createdAt: 'desc' } });
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
      publishMode: z.enum(['draft-human', 'draft-agent', 'direct-human', 'direct-agent']),
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

  const isDraft = body.publishMode.startsWith('draft');

  const draft = await prisma.draft.create({
    data: {
      connectionId: body.connectionId,
      publishMode: body.publishMode,
      content: body.content,
      title: body.title ?? null,
      mediaJson: body.mediaIds ?? [],
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      status: isDraft ? 'draft' : 'queued',
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
      publishMode: z.enum(['draft-human', 'draft-agent', 'direct-human', 'direct-agent']).optional(),
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
    data.publishMode = body.publishMode;
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
        publishMode: draft.publishMode,
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
// Visual generation — render infographic from template + data
// ---------------------------------------------------------------------------
const VALID_TEMPLATES = ['water-temps', 'species-report', 'tide-chart', 'catch-of-the-week', 'product-spotlight', 'tournament-results', 'article-ad'] as const;

app.post('/drafts/:id/generate-visual', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({
    templateName: z.enum(VALID_TEMPLATES),
    templateData: z.record(z.unknown()),
  }).parse(request.body);

  const draft = await prisma.draft.findUnique({ where: { id: params.id } });
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });

  // Ensure uploads directory exists
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // Lazy-import visual-engine to avoid hard dep at startup
  const { generateInfographic } = await import('@scp/visual-engine');

  let buf: Buffer;
  try {
    buf = await generateInfographic(
      body.templateName as any,
      body.templateData as any,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.log.error({ err: msg, templateName: body.templateName }, 'visual render failed');
    return reply.code(422).send({ error: 'render_failed', message: msg });
  }

  // Save as Media entry
  const filename = `visual-${params.id}-${Date.now()}.png`;
  const storagePath = join(UPLOADS_DIR, filename);
  try {
    writeFileSync(storagePath, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.log.error({ err: msg, storagePath }, 'visual write failed');
    return reply.code(500).send({ error: 'write_failed', message: 'Failed to save image' });
  }

  const media = await prisma.media.create({
    data: {
      filename,
      originalName: `${body.templateName}.png`,
      mimeType: 'image/png',
      sizeBytes: buf.length,
      storagePath,
      width: 1080,
      height: 1350,
    },
  });

  // Create VisualSpec record
  await prisma.visualSpec.create({
    data: {
      draftId: params.id,
      templateName: body.templateName,
      templateData: body.templateData as Prisma.InputJsonValue,
      generatedMediaId: media.id,
    },
  });

  // Append to draft's mediaJson
  const existingMedia = Array.isArray(draft.mediaJson) ? (draft.mediaJson as string[]) : [];
  await prisma.draft.update({
    where: { id: params.id },
    data: {
      mediaJson: [...existingMedia, media.id],
      updatedAt: new Date(),
    },
  });

  await audit('draft', params.id, 'visual_generated', {
    templateName: body.templateName,
    mediaId: media.id,
  });

  return {
    mediaId: media.id,
    url: `/uploads/${filename}`,
    templateName: body.templateName,
    sizeBytes: buf.length,
  };
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

  // --- Rate limit: block only if a job is actively PROCESSING ---
  // PENDING jobs are delayed BullMQ jobs waiting for their scheduledFor time.
  // Multiple scheduled posts per connection is normal for agents doing bulk work.
  // We only block if something is actively publishing right now.
  const processingJob = await prisma.publishJob.findFirst({
    where: {
      connectionId: draft.connectionId,
      status: 'PROCESSING',
    },
  });
  if (processingJob) {
    return reply.code(429).send({
      error: 'rate_limited',
      message: 'A job is actively publishing on this connection. Wait for it to complete.',
      activeJobId: processingJob.id,
      retryAfterMs: 5000,
    });
  }

  // Queue depth guard: prevent runaway agents from flooding a connection
  const pendingCount = await prisma.publishJob.count({
    where: {
      connectionId: draft.connectionId,
      status: 'PENDING',
    },
  });
  if (pendingCount >= 200) {
    return reply.code(429).send({
      error: 'queue_depth_exceeded',
      message: `${pendingCount} pending jobs on this connection. Max 200. Wait for some to complete.`,
      pendingCount,
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
      publishMode: draft.publishMode,
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
      publishMode: draft.publishMode,
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
// Bulk publish — queue multiple drafts in one call (agent-friendly)
// ---------------------------------------------------------------------------
app.post('/publish/bulk', async (request, reply) => {
  const body = z.object({
    draftIds: z.array(z.string()).min(1).max(200),
  }).parse(request.body);

  const results: Array<{ draftId: string; status: 'queued' | 'skipped' | 'error'; jobId?: string; reason?: string }> = [];

  for (const draftId of body.draftIds) {
    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) {
      results.push({ draftId, status: 'skipped', reason: 'not_found' });
      continue;
    }
    if (draft.status !== 'draft' && draft.status !== 'failed') {
      results.push({ draftId, status: 'skipped', reason: `status_${draft.status}` });
      continue;
    }

    // Queue depth check
    const pendingCount = await prisma.publishJob.count({
      where: { connectionId: draft.connectionId, status: 'PENDING' },
    });
    if (pendingCount >= 200) {
      results.push({ draftId, status: 'error', reason: 'queue_depth_exceeded' });
      continue;
    }

    try {
      const idemKey = `bulk-${draftId}-${Date.now()}`;
      const job = await prisma.publishJob.create({
        data: {
          draftId: draft.id,
          connectionId: draft.connectionId,
          status: 'PENDING',
          idempotencyKey: idemKey,
        },
      });

      await prisma.draft.update({
        where: { id: draft.id },
        data: { status: 'queued' },
      });

      const connection = await prisma.socialConnection.findUnique({
        where: { id: draft.connectionId },
      });

      const scheduledDelay = draft.scheduledFor
        ? Math.max(0, new Date(draft.scheduledFor).getTime() - Date.now())
        : 0;

      await publishQueue.add(
        'draft.publish',
        {
          accountId: draft.connectionId,
          draftId: draft.id,
          connectionId: draft.connectionId,
          provider: connection?.provider ?? 'linkedin',
          publishMode: draft.publishMode,
          idempotencyKey: idemKey,
        },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          delay: scheduledDelay,
        },
      );

      results.push({ draftId, status: 'queued', jobId: job.id });
    } catch (err) {
      results.push({ draftId, status: 'error', reason: err instanceof Error ? err.message : 'unknown' });
    }
  }

  const queued = results.filter(r => r.status === 'queued').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errored = results.filter(r => r.status === 'error').length;

  await audit('bulk_publish', 'batch', 'enqueued', { total: body.draftIds.length, queued, skipped, errored });

  return {
    total: body.draftIds.length,
    queued,
    skipped,
    errored,
    results,
  };
});

// ---------------------------------------------------------------------------
// Bulk draft creation (agent-friendly)
// ---------------------------------------------------------------------------
app.post('/drafts/bulk', async (request, reply) => {
  const body = z.object({
    drafts: z.array(z.object({
      connectionId: z.string(),
      publishMode: z.string().optional(),
      content: z.string(),
      title: z.string().optional(),
      mediaIds: z.array(z.string()).optional(),
      scheduledFor: z.string().datetime().optional(),
    })).min(1).max(500),
  }).parse(request.body);

  const created: Array<{ id: string; connectionId: string; scheduledFor?: string }> = [];

  for (const d of body.drafts) {
    const draft = await prisma.draft.create({
      data: {
        connectionId: d.connectionId,
        publishMode: d.publishMode ?? 'draft-agent',
        content: d.content,
        title: d.title ?? null,
        mediaJson: (d.mediaIds ?? null) as any,
        scheduledFor: d.scheduledFor ? new Date(d.scheduledFor) : null,
      },
    });
    created.push({
      id: draft.id,
      connectionId: draft.connectionId,
      scheduledFor: d.scheduledFor,
    });
  }

  await audit('bulk_draft', 'batch', 'created', { count: created.length });

  return reply.code(201).send({
    created: created.length,
    drafts: created,
  });
});

// ---------------------------------------------------------------------------
// Jobs — read-only listing
// ---------------------------------------------------------------------------
app.get('/jobs', async (request) => {
  const query = z.object({
    page: z.coerce.number().min(1).optional(),
    pageSize: z.coerce.number().min(1).max(200).optional(),
    status: z.enum(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RECONCILING', 'CANCELED']).optional(),
    connectionId: z.string().optional(),
  }).parse(request.query);

  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.connectionId) where.connectionId = query.connectionId;

  const mapJob = (j: PublishJobRow) => ({
    id: j.id, draftId: j.draftId, connectionId: j.connectionId, status: j.status,
    idempotencyKey: j.idempotencyKey, receiptJson: j.receiptJson, errorMessage: j.errorMessage,
    createdAt: j.createdAt.toISOString(), updatedAt: j.updatedAt.toISOString(),
  });

  if (query.page) {
    const pageSize = query.pageSize ?? 50;
    const skip = (query.page - 1) * pageSize;
    const [jobs, total] = await Promise.all([
      prisma.publishJob.findMany({ where, orderBy: { createdAt: 'desc' }, take: pageSize, skip }),
      prisma.publishJob.count({ where }),
    ]);
    return { jobs: jobs.map(mapJob), total, page: query.page, pageSize };
  }

  const jobs = await prisma.publishJob.findMany({ where, orderBy: { createdAt: 'desc' } });
  return { jobs: jobs.map(mapJob) };
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

  const pubCreds = await loadProviderCreds(connection.provider as ProviderId);
  const authAdapter = createAuthAdapter(connection.provider as ProviderId, pubCreds);
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
// Operators — user/agent management
// ---------------------------------------------------------------------------
app.get('/operators', async () => {
  const operators = await prisma.operator.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { apiKeys: true } } },
  });
  return {
    operators: operators.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      role: o.role,
      hasPassword: !!o.password,
      apiKeyCount: o._count.apiKeys,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  };
});

app.post('/operators', async (request) => {
  const body = z.object({
    name: z.string().min(1),
    role: z.enum(['human', 'agent']).default('human'),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  }).parse(request.body);

  let passwordHash: string | null = null;
  if (body.password) {
    // Simple SHA-256 hash for passwords (no bcrypt dep needed)
    passwordHash = createHash('sha256').update(body.password).digest('hex');
  }

  const operator = await prisma.operator.create({
    data: {
      name: body.name,
      role: body.role,
      email: body.email ?? null,
      password: passwordHash,
    },
  });

  await audit('operator', operator.id, 'created', { name: body.name, role: body.role });

  return {
    operator: {
      id: operator.id,
      name: operator.name,
      email: operator.email,
      role: operator.role,
      createdAt: operator.createdAt.toISOString(),
    },
  };
});

app.delete('/operators/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  try {
    await prisma.operator.delete({ where: { id: params.id } });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'operator_not_found' });
    throw err;
  }
  await audit('operator', params.id, 'deleted');
  return { deleted: true };
});

// ---------------------------------------------------------------------------
// API Keys — agent/programmatic access
// ---------------------------------------------------------------------------
app.get('/api-keys', async () => {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    include: { operator: { select: { name: true, role: true } } },
  });
  return {
    apiKeys: keys.map((k) => ({
      id: k.id,
      operatorId: k.operatorId,
      operatorName: k.operator.name,
      operatorRole: k.operator.role,
      name: k.name,
      prefix: k.prefix,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  };
});

app.post('/api-keys', async (request) => {
  const body = z.object({
    operatorId: z.string().min(1),
    name: z.string().min(1),
    expiresAt: z.string().datetime().optional(),
  }).parse(request.body);

  // Verify operator exists
  const operator = await prisma.operator.findUnique({ where: { id: body.operatorId } });
  if (!operator) throw new Error('Operator not found');

  // Generate key: scp_ + 40 random hex chars
  const rawKey = `scp_${randomBytes(20).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.slice(0, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      operatorId: body.operatorId,
      name: body.name,
      keyHash,
      prefix,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  await audit('api_key', apiKey.id, 'created', { operatorId: body.operatorId, name: body.name });

  // Return the raw key ONCE — it's never stored or retrievable again
  return {
    apiKey: {
      id: apiKey.id,
      key: rawKey,
      prefix,
      name: apiKey.name,
      operatorId: apiKey.operatorId,
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      createdAt: apiKey.createdAt.toISOString(),
    },
  };
});

app.delete('/api-keys/:id', async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  try {
    await prisma.apiKey.delete({ where: { id: params.id } });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'api_key_not_found' });
    throw err;
  }
  await audit('api_key', params.id, 'revoked');
  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Zod validation error handler — return 400, not 500
// ---------------------------------------------------------------------------
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: 'validation_error',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  // Let Fastify handle everything else (logs + 500)
  reply.send(error);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully…`);
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
  }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Global safety nets — log before dying
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'Unhandled promise rejection — crashing');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'Uncaught exception — crashing');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Proactive token refresh — runs every 30 minutes
// Refreshes any connections with tokens expiring within 60 minutes
// ---------------------------------------------------------------------------
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const TOKEN_REFRESH_WINDOW_MS = 60 * 60 * 1000; // refresh if expiring within 60 min

async function proactiveTokenRefresh(): Promise<void> {
  const threshold = new Date(Date.now() + TOKEN_REFRESH_WINDOW_MS);
  const expiring = await prisma.socialConnection.findMany({
    where: {
      expiresAt: { lt: threshold },
      encryptedRefresh: { not: null },
      status: { not: 'reconnect_required' },
    },
  });

  for (const conn of expiring) {
    try {
      const creds = await loadProviderCreds(conn.provider as ProviderId);
      const adapter = createAuthAdapter(conn.provider as ProviderId, creds);
      if (typeof adapter.buildRefreshRequest !== 'function') continue;

      const refreshToken = decrypt(conn.encryptedRefresh!);
      const refreshReq = adapter.buildRefreshRequest({ refreshToken });
      const res = await fetch(refreshReq.url, {
        method: refreshReq.method,
        headers: refreshReq.headers,
        body: refreshReq.method === 'POST' ? refreshReq.body : undefined,
      });

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}));
        app.log.warn({ provider: conn.provider, connectionId: conn.id, status: res.status, raw }, 'proactive_refresh_failed');
        // If refresh token is revoked/invalid, mark for re-auth
        if (res.status === 401 || res.status === 400) {
          await prisma.socialConnection.update({
            where: { id: conn.id },
            data: { status: 'reconnect_required', updatedAt: new Date() },
          });
        }
        continue;
      }

      const raw = await res.json();
      const tokens = adapter.normalizeTokenResponse(raw);
      const newExpiresAt = typeof tokens.expiresInSeconds === 'number'
        ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
        : null;

      await prisma.socialConnection.update({
        where: { id: conn.id },
        data: {
          encryptedToken: encrypt(tokens.accessToken),
          encryptedRefresh: tokens.refreshToken ? encrypt(tokens.refreshToken) : conn.encryptedRefresh,
          expiresAt: newExpiresAt,
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      await audit('connection', conn.id, 'token_auto_refreshed', { provider: conn.provider });
      app.log.info({ provider: conn.provider, connectionId: conn.id, newExpiresAt }, 'proactive_refresh_ok');
    } catch (err) {
      app.log.error({ provider: conn.provider, connectionId: conn.id, err }, 'proactive_refresh_error');
    }
  }
}

// ---------------------------------------------------------------------------
// Studio routes (Creative Studio — batch rendering + approval)
// ---------------------------------------------------------------------------
import { registerStudioRoutes } from './studio.js';
registerStudioRoutes(app, prisma, publishQueue);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = Number(process.env.APP_PORT || 4001);
try {
  await app.listen({ port, host: '0.0.0.0' });

  // Start proactive refresh loop after server is ready
  proactiveTokenRefresh().catch((err) => app.log.error({ err }, 'initial_proactive_refresh_failed'));
  setInterval(() => {
    proactiveTokenRefresh().catch((err) => app.log.error({ err }, 'proactive_refresh_failed'));
  }, TOKEN_REFRESH_INTERVAL_MS);
  app.log.info({ intervalMs: TOKEN_REFRESH_INTERVAL_MS, windowMs: TOKEN_REFRESH_WINDOW_MS }, 'proactive_token_refresh_enabled');
} catch (err) {
  app.log.fatal({ err }, `Failed to bind port ${port}`);
  process.exit(1);
}
