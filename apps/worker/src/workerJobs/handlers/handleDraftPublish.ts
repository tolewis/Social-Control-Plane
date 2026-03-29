import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import { decrypt, encrypt } from '../../crypto.js';
import type { DraftPublishJobData } from '../types.js';

// ---------------------------------------------------------------------------
// Inline provider adapter usage (avoids compile-time dep on @scp/providers
// when the workspace link isn't resolved). At runtime the dynamic import
// brings in the real LinkedInAdapter.
// ---------------------------------------------------------------------------

interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

interface MediaAttachment {
  id: string;
  mimeType: string;
  url: string;
  storagePath: string;
  sizeBytes: number;
  originalName: string;
}

interface PublishResult {
  ok: boolean;
  status: number;
  body: unknown;
}

function resolvePublicUploadBase(): string {
  const webBase = process.env.WEB_BASE_URL?.trim().replace(/\/$/, '');
  const explicitPublicBase = process.env.PUBLIC_URL?.trim().replace(/\/$/, '');
  const appBase = process.env.APP_BASE_URL?.trim().replace(/\/$/, '');

  if (webBase) return `${webBase}/backend`;
  if (explicitPublicBase && !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(explicitPublicBase)) {
    return explicitPublicBase;
  }
  if (appBase && !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(appBase)) {
    return appBase;
  }
  return 'http://localhost:4001';
}

function shouldMarkReconnectRequired(provider: string, body: unknown): boolean {
  if (provider !== 'facebook' && provider !== 'instagram') return false;
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  if (!error || typeof error !== 'object') return false;

  const code = typeof (error as { code?: unknown }).code === 'number'
    ? (error as { code: number }).code
    : undefined;
  const subcode = typeof (error as { error_subcode?: unknown }).error_subcode === 'number'
    ? (error as { error_subcode: number }).error_subcode
    : undefined;
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message.toLowerCase()
    : '';

  if (code === 190) return true;
  if (subcode === 463 || subcode === 467) return true;
  return message.includes('access token') || message.includes('session was invalidated');
}

interface ProviderPublishAdapter {
  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest;

  publish?(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
    media?: MediaAttachment[];
  }): Promise<PublishResult>;
}

interface ProviderAuthAdapter {
  buildRefreshRequest?: (params: { refreshToken: string }) => HttpRequest;
  normalizeTokenResponse(raw: unknown): {
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
  };
}

type FullAdapter = ProviderPublishAdapter & ProviderAuthAdapter;

async function loadProviderAdapter(provider: string): Promise<FullAdapter | null> {
  // Construct the module specifier at runtime so tsc doesn't try to resolve
  // the workspace link before dependencies are installed.
  const modPath = '@scp/' + 'providers';
  const mod = await import(/* webpackIgnore: true */ modPath) as {
    LinkedInAdapter: new () => FullAdapter;
    FacebookAdapter: new () => FullAdapter;
    InstagramAdapter: new () => FullAdapter;
    XAdapter: new () => FullAdapter;
  };

  switch (provider) {
    case 'linkedin':
      return new mod.LinkedInAdapter();
    case 'facebook':
      return new mod.FacebookAdapter();
    case 'instagram':
      return new mod.InstagramAdapter();
    case 'x':
      return new mod.XAdapter();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute an HttpRequest shape via native fetch and return parsed JSON + status. */
async function executeRequest(req: HttpRequest): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'POST' ? req.body : undefined,
  });

  const body = await res.json().catch(() => ({ _raw: 'non_json_response' }));
  return { ok: res.ok, status: res.status, body };
}

/** Resolve a publish adapter for the given provider string. */
async function getPublishAdapter(provider: string): Promise<(ProviderPublishAdapter & ProviderAuthAdapter) | null> {
  return loadProviderAdapter(provider);
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshTokenIfNeeded(
  db: DbClient,
  connectionId: string,
  adapter: ProviderAuthAdapter,
  log: Logger,
): Promise<{ accessToken: string } | { error: string }> {
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) return { error: 'connection_not_found' };

  const encToken = connection.encryptedToken;
  if (!encToken) return { error: 'missing_token' };

  // Decrypt stored token
  let plainToken: string;
  try {
    plainToken = decrypt(encToken);
  } catch (err) {
    log.error('token.decrypt_failed', { connectionId, err: err instanceof Error ? err.message : String(err) });
    return { error: 'token_decrypt_failed' };
  }

  // Check expiry
  if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
    log.info('token.expired', { connectionId, expiresAt: connection.expiresAt.toISOString() });

    // Attempt refresh — decrypt the refresh token first
    const encRefresh = connection.encryptedRefresh;
    if (!encRefresh) return { error: 'token_expired' };

    let plainRefresh: string;
    try {
      plainRefresh = decrypt(encRefresh);
    } catch (err) {
      log.error('token.refresh_decrypt_failed', { connectionId, err: err instanceof Error ? err.message : String(err) });
      return { error: 'token_expired' };
    }

    if (typeof adapter.buildRefreshRequest !== 'function') {
      return { error: 'token_expired' };
    }

    const refreshReq = adapter.buildRefreshRequest({ refreshToken: plainRefresh });
    let refreshResult: { ok: boolean; status: number; body: unknown };
    try {
      refreshResult = await executeRequest(refreshReq);
    } catch (err) {
      log.error('token.refresh_network_error', {
        connectionId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { error: 'token_expired' };
    }

    if (!refreshResult.ok) {
      log.error('token.refresh_failed', {
        connectionId,
        status: refreshResult.status,
        body: refreshResult.body,
      });
      return { error: 'token_expired' };
    }

    // Parse refreshed tokens and encrypt before storing
    const normalized = adapter.normalizeTokenResponse(refreshResult.body);

    const newExpiresAt = typeof normalized.expiresInSeconds === 'number'
      ? new Date(Date.now() + normalized.expiresInSeconds * 1000)
      : null;

    await db.socialConnection.update({
      where: { id: connectionId },
      data: {
        encryptedToken: encrypt(normalized.accessToken),
        encryptedRefresh: normalized.refreshToken ? encrypt(normalized.refreshToken) : connection.encryptedRefresh,
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      },
    });

    log.info('token.refreshed', { connectionId });
    return { accessToken: normalized.accessToken };
  }

  return { accessToken: plainToken };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleDraftPublish(
  job: Job<DraftPublishJobData, unknown, 'draft.publish'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true }> {
  const { db, log } = ctx;
  const { draftId, connectionId, provider, idempotencyKey } = job.data;

  log.info('draft.publish.start', {
    jobId: job.id,
    accountId: job.data.accountId,
    draftId,
    connectionId,
    provider,
  });

  // 1. Mark job as PROCESSING
  try {
    await db.publishJob.updateMany({
      where: { draftId, connectionId, status: 'PENDING' },
      data: { status: 'PROCESSING', updatedAt: new Date() },
    });
  } catch (err) {
    log.warn('draft.publish.status_update_warn', {
      jobId: job.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await job.updateProgress({ step: 'processing' });

  // 2. Fetch draft and connection from DB
  let draft: Awaited<ReturnType<typeof db.draft.findUnique>>;
  let connection: Awaited<ReturnType<typeof db.socialConnection.findUnique>>;
  try {
    [draft, connection] = await Promise.all([
      db.draft.findUnique({ where: { id: draftId } }),
      db.socialConnection.findUnique({ where: { id: connectionId } }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('draft.publish.db_fetch_error', { jobId: job.id, err: msg });
    await markFailed(db, draftId, connectionId, `db_error: ${msg}`);
    return { ok: true };
  }

  if (!draft) {
    log.error('draft.publish.draft_not_found', { jobId: job.id, draftId });
    await markFailed(db, draftId, connectionId, 'draft_not_found');
    return { ok: true };
  }

  if (!connection) {
    log.error('draft.publish.connection_not_found', { jobId: job.id, connectionId });
    await markFailed(db, draftId, connectionId, 'connection_not_found');
    return { ok: true };
  }

  await job.updateProgress({ step: 'loaded_records' });

  // 3. Resolve publish adapter
  const adapter = await getPublishAdapter(provider);
  if (!adapter) {
    log.error('draft.publish.unsupported_provider', { jobId: job.id, provider });
    await markFailed(db, draftId, connectionId, `unsupported_provider: ${provider}`);
    return { ok: true };
  }

  // 4. Token refresh if needed
  const tokenResult = await refreshTokenIfNeeded(db, connectionId, adapter, log);
  if ('error' in tokenResult) {
    log.error('draft.publish.token_error', { jobId: job.id, error: tokenResult.error });
    await markFailed(db, draftId, connectionId, tokenResult.error);
    return { ok: true };
  }

  await job.updateProgress({ step: 'token_ready' });

  // 5. Resolve media attachments from draft.mediaJson
  const mediaIds = Array.isArray(draft.mediaJson) ? (draft.mediaJson as string[]) : [];
  let mediaAttachments: MediaAttachment[] = [];
  if (mediaIds.length > 0) {
    try {
      const mediaRecords = await db.media.findMany({
        where: { id: { in: mediaIds } },
      });
      const publicBase = resolvePublicUploadBase();
      mediaAttachments = mediaRecords.map((m) => ({
        id: m.id,
        mimeType: m.mimeType,
        url: `${publicBase}/uploads/${m.filename}`,
        storagePath: m.storagePath,
        sizeBytes: m.sizeBytes,
        originalName: m.originalName,
      }));
      log.info('draft.publish.media_loaded', { jobId: job.id, count: mediaAttachments.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('draft.publish.media_load_error', { jobId: job.id, err: msg });
      // Continue — publish without media rather than failing
    }
  }

  await job.updateProgress({ step: 'publishing' });

  // 6. Publish: use adapter.publish() for media, buildPublishRequest for text-only
  const idemKey = idempotencyKey ?? job.id ?? crypto.randomUUID();
  let result: { ok: boolean; status: number; body: unknown };

  if (mediaAttachments.length > 0 && typeof adapter.publish === 'function') {
    // Media publish — adapter handles multi-step upload + post internally
    try {
      result = await adapter.publish({
        accessToken: tokenResult.accessToken,
        accountRef: connection.accountRef,
        text: draft.content,
        idempotencyKey: idemKey,
        media: mediaAttachments,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('draft.publish.media_publish_error', { jobId: job.id, err: msg });
      await markFailed(db, draftId, connectionId, `media_publish_error: ${msg}`);
      return { ok: true };
    }
  } else {
    // Text-only publish — existing path
    let publishReq: HttpRequest;
    try {
      publishReq = adapter.buildPublishRequest({
        accessToken: tokenResult.accessToken,
        accountRef: connection.accountRef,
        text: draft.content,
        idempotencyKey: idemKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('draft.publish.build_request_error', { jobId: job.id, err: msg });
      await markFailed(db, draftId, connectionId, `build_request_error: ${msg}`);
      return { ok: true };
    }

    try {
      result = await executeRequest(publishReq);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('draft.publish.network_error', { jobId: job.id, err: msg });
      await markFailed(db, draftId, connectionId, `network_error: ${msg}`);
      return { ok: true };
    }
  }

  // 7. Handle response
  if (result.ok) {
    // SUCCESS -- persist receipt and mark draft published
    await Promise.all([
      db.publishJob.updateMany({
        where: { draftId, connectionId, status: 'PROCESSING' },
        data: {
          status: 'SUCCEEDED',
          receiptJson: result.body,
          updatedAt: new Date(),
        },
      }),
      db.draft.update({
        where: { id: draftId },
        data: { status: 'published', updatedAt: new Date() },
      }),
      db.socialConnection.update({
        where: { id: connectionId },
        data: { status: 'connected', updatedAt: new Date() },
      }),
    ]);

    log.info('draft.publish.succeeded', {
      jobId: job.id,
      draftId,
      status: result.status,
    });

    await job.updateProgress({ step: 'succeeded' });
  } else {
    // HTTP 4xx/5xx -- mark FAILED
    const errorMsg = `publish_failed:${result.status}`;
    const updates: Array<Promise<unknown>> = [
      db.publishJob.updateMany({
        where: { draftId, connectionId, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          errorMessage: errorMsg,
          receiptJson: result.body,
          updatedAt: new Date(),
        },
      }),
      db.draft.update({
        where: { id: draftId },
        data: { status: 'failed', updatedAt: new Date() },
      }),
    ];
    if (shouldMarkReconnectRequired(provider, result.body)) {
      updates.push(
        db.socialConnection.update({
          where: { id: connectionId },
          data: { status: 'reconnect_required', updatedAt: new Date() },
        }),
      );
    }
    await Promise.all(updates);

    log.error('draft.publish.http_error', {
      jobId: job.id,
      draftId,
      status: result.status,
      body: result.body,
    });

    await job.updateProgress({ step: 'failed' });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared failure helper
// ---------------------------------------------------------------------------

async function markFailed(
  db: DbClient,
  draftId: string,
  connectionId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await Promise.all([
      db.publishJob.updateMany({
        where: {
          draftId,
          connectionId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'FAILED',
          errorMessage,
          updatedAt: new Date(),
        },
      }),
      db.draft.update({
        where: { id: draftId },
        data: { status: 'failed', updatedAt: new Date() },
      }),
    ]);
  } catch {
    // Best effort -- don't let DB error crash the worker
  }
}
