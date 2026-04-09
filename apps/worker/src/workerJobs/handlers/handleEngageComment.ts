import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import { decrypt } from '../../crypto.js';
import type { EngageCommentJobData } from '../types.js';

// ---------------------------------------------------------------------------
// Post a comment to a Facebook Page post as the TackleRoom Page.
//
// The token is decrypted from the SocialConnection identified by connectionId.
// The comment is posted via POST /{fbPostId}/comments on the Graph API.
// ---------------------------------------------------------------------------

export async function handleEngageComment(
  job: Job<EngageCommentJobData, unknown, 'engage.comment'>,
  ctx: { log: Logger; queue: Queue; db: DbClient },
): Promise<{ ok: true }> {
  const { db, log } = ctx;
  const { commentId, connectionId, fbPostId, commentText } = job.data;

  log.info('engage.comment.start', { jobId: job.id, commentId, fbPostId });

  // 1. Load connection and decrypt token
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    log.error('engage.comment.connection_not_found', { commentId, connectionId });
    await markCommentFailed(db, commentId, 'connection_not_found');
    return { ok: true };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(connection.encryptedToken);
  } catch (err) {
    log.error('engage.comment.token_decrypt_failed', {
      commentId,
      err: err instanceof Error ? err.message : String(err),
    });
    await markCommentFailed(db, commentId, 'token_decrypt_failed');
    return { ok: true };
  }

  await job.updateProgress({ step: 'token_ready' });

  // 2. Post comment via Facebook Graph API
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(fbPostId)}/comments`;
  const body = new URLSearchParams({
    message: commentText,
    access_token: accessToken,
  }).toString();

  let result: { ok: boolean; status: number; body: unknown };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await res.json().catch(() => ({ _raw: 'non_json_response' }));
    result = { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('engage.comment.network_error', { commentId, err: msg });
    await markCommentFailed(db, commentId, `network_error: ${msg}`);
    return { ok: true };
  }

  await job.updateProgress({ step: 'api_called' });

  // 3. Handle response
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
      // Mark the parent post as commented
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
    log.error('engage.comment.api_error', {
      commentId,
      status: result.status,
      body: result.body,
    });
    await markCommentFailed(db, commentId, `api_error:${result.status}`);

    // Check for token invalidation
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

async function markCommentFailed(db: DbClient, commentId: string, reason: string): Promise<void> {
  try {
    await Promise.all([
      db.engageComment.update({
        where: { id: commentId },
        data: { status: 'failed', rejectionNote: reason, updatedAt: new Date() },
      }),
      db.auditEvent.create({
        data: {
          entityType: 'EngageComment',
          entityId: commentId,
          action: 'failed',
          payload: { reason },
        },
      }),
    ]);
  } catch {
    // Best effort
  }
}
