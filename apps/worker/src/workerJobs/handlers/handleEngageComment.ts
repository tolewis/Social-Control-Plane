import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import { decrypt } from '../../crypto.js';
import type { EngageCommentJobData } from '../types.js';

// ---------------------------------------------------------------------------
// Post a comment to Facebook via Graph API.
//
// Reddit has NO worker path. Reddit's API is closed to us, and the manual
// browser automation path was unreliable. Reddit comments are posted by the
// operator in the /engage UI via Copy & Open → Mark Posted. The /approve
// endpoint therefore does not enqueue Reddit jobs — if a Reddit payload
// somehow reaches this handler, we fail it with a clear message.
// ---------------------------------------------------------------------------

function isSyntheticFbPostId(fbPostId: string): boolean {
  return /_text_[0-9a-f]{12}$/i.test(fbPostId);
}

function describeApiFailure(status: number, body: unknown): string {
  const error = body && typeof body === 'object'
    ? (body as { error?: { code?: number; error_subcode?: number; message?: string } }).error
    : undefined;

  const parts = [`api_error:${status}`];
  if (error?.code !== undefined) parts.push(`code=${error.code}`);
  if (error?.error_subcode !== undefined) parts.push(`subcode=${error.error_subcode}`);
  if (error?.message) parts.push(error.message);

  const message = parts.join(' | ');
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

// ---------------------------------------------------------------------------
// Facebook comment posting
// ---------------------------------------------------------------------------

async function postFacebookComment(
  accessToken: string,
  fbPostId: string,
  commentText: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(fbPostId)}/comments`;
  const body = new URLSearchParams({
    message: commentText,
    access_token: accessToken,
  }).toString();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({ _raw: 'non_json_response' }));
  return { ok: res.ok, status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleEngageComment(
  job: Job<EngageCommentJobData, unknown, 'engage.comment'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true }> {
  const { db, log } = ctx;
  const { commentId, connectionId, fbPostId, commentText, platform } = job.data;
  const effectivePlatform = platform || 'facebook';

  log.info('engage.comment.start', { jobId: job.id, commentId, fbPostId, platform: effectivePlatform });

  // Reddit should never reach the worker — /approve skips enqueue for Reddit.
  // If it does (legacy job, misconfigured caller), fail fast with a clear
  // message so the operator knows to use the /engage UI manual flow.
  if (effectivePlatform === 'reddit') {
    log.error('engage.comment.reddit_unsupported', { commentId });
    await markCommentFailed(
      db,
      commentId,
      'reddit_manual_post_required: use /engage UI Copy & Open → Mark Posted',
      { platform: 'reddit' },
    );
    return { ok: true };
  }

  // ---------- FACEBOOK PATH ----------
  if (isSyntheticFbPostId(fbPostId)) {
    log.error('engage.comment.invalid_target', { commentId, fbPostId, reason: 'synthetic_fb_post_id' });
    await markCommentFailed(db, commentId, 'non_commentable_target: synthetic_fb_post_id', {
      fbPostId,
      reason: 'synthetic_fb_post_id',
    });
    return { ok: true };
  }

  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    log.error('engage.comment.connection_not_found', { commentId, connectionId });
    await markCommentFailed(db, commentId, 'connection_not_found', { connectionId });
    return { ok: true };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(connection.encryptedToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('engage.comment.token_decrypt_failed', { commentId, err: msg });
    await markCommentFailed(db, commentId, `token_decrypt_failed: ${msg}`, { connectionId });
    return { ok: true };
  }

  await job.updateProgress({ step: 'token_ready' });

  let result: { ok: boolean; status: number; body: unknown };
  try {
    result = await postFacebookComment(accessToken, fbPostId, commentText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('engage.comment.network_error', { commentId, err: msg });
    await markCommentFailed(db, commentId, `network_error: ${msg}`, { fbPostId, connectionId });
    return { ok: true };
  }

  await job.updateProgress({ step: 'api_called' });

  if (result.ok) {
    const fbCommentId = (result.body as { id?: string })?.id ?? null;

    await Promise.all([
      db.engageComment.update({
        where: { id: commentId },
        data: {
          status: 'posted',
          receiptJson: result.body,
          fbCommentId,
          updatedAt: new Date(),
        },
      }),
      db.engageComment.findUnique({ where: { id: commentId } }).then(async (comment) => {
        if (comment) {
          await db.engagePost.update({
            where: { id: comment.engagePostId },
            data: { commented: true },
          });
        }
      }),
      db.auditEvent.create({
        data: {
          entityType: 'EngageComment',
          entityId: commentId,
          action: 'posted',
          payload: { fbPostId, fbCommentId, status: result.status },
        },
      }),
    ]);

    log.info('engage.comment.posted', { commentId, fbCommentId, fbPostId });
    await job.updateProgress({ step: 'succeeded' });
  } else {
    log.error('engage.comment.api_error', { commentId, status: result.status, body: result.body });
    await markCommentFailed(db, commentId, describeApiFailure(result.status, result.body), result.body);

    const error = result.body && typeof result.body === 'object'
      ? (result.body as { error?: { code?: number } }).error
      : undefined;
    if (error?.code === 190) {
      await db.socialConnection.update({
        where: { id: connectionId },
        data: { status: 'reconnect_required', updatedAt: new Date() },
      });
    }

    await job.updateProgress({ step: 'failed' });
  }

  return { ok: true };
}

async function markCommentFailed(
  db: DbClient,
  commentId: string,
  reason: string,
  receiptJson?: unknown,
): Promise<void> {
  try {
    await Promise.all([
      db.engageComment.update({
        where: { id: commentId },
        data: { status: 'failed', rejectionNote: reason, receiptJson: receiptJson ?? undefined, updatedAt: new Date() },
      }),
      db.auditEvent.create({
        data: {
          entityType: 'EngageComment',
          entityId: commentId,
          action: 'failed',
          payload: { reason, receiptJson: receiptJson ?? undefined },
        },
      }),
    ]);
  } catch {
    // Best effort
  }
}
