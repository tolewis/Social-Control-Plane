import type { Job, Queue } from 'bullmq';

import type { DbClient } from '../../db.js';
import type { Logger } from '../../workerLogger.js';
import { decrypt } from '../../crypto.js';
import type { EngageCommentJobData } from '../types.js';

// ---------------------------------------------------------------------------
// Post a comment to Facebook or Reddit.
//
// Facebook: POST /{fbPostId}/comments on Graph API
// Reddit: Python subprocess calling PRAW (credentials from env)
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
// Reddit comment posting (via Python subprocess using PRAW)
// ---------------------------------------------------------------------------

async function postRedditComment(
  submissionId: string,
  commentText: string,
  log: Logger,
): Promise<{ ok: boolean; commentId: string | null; error: string | null }> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve) => {
    const proc = spawn('python3', [
      '-c',
      `
import praw, os, json, sys

client_id = os.environ.get('REDDIT_CLIENT_ID', '')
client_secret = os.environ.get('REDDIT_CLIENT_SECRET', '')
username = os.environ.get('REDDIT_USERNAME', '')
password = os.environ.get('REDDIT_PASSWORD', '')
user_agent = os.environ.get('REDDIT_USER_AGENT', 'scp-engage/1.0 by u/thetackleroom')

if not all([client_id, client_secret, username, password]):
    print(json.dumps({"ok": False, "error": "Missing Reddit credentials in env", "commentId": None}))
    sys.exit(0)

try:
    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        username=username,
        password=password,
        user_agent=user_agent,
    )
    submission = reddit.submission(id="${submissionId}")
    comment = submission.reply(${JSON.stringify(commentText)})
    print(json.dumps({"ok": True, "commentId": comment.id, "error": None}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e), "commentId": None}))
`,
    ]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        log.error('engage.reddit.parse_error', { stdout, stderr, code });
        resolve({ ok: false, commentId: null, error: `process exit ${code}: ${stderr || stdout}` });
      }
    });

    // Timeout after 30s
    setTimeout(() => {
      proc.kill();
      resolve({ ok: false, commentId: null, error: 'timeout' });
    }, 30000);
  });
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

  // ---------- REDDIT PATH ----------
  if (effectivePlatform === 'reddit') {
    await job.updateProgress({ step: 'posting_reddit' });

    const result = await postRedditComment(fbPostId, commentText, log);

    if (result.ok) {
      await Promise.all([
        db.engageComment.update({
          where: { id: commentId },
          data: {
            status: 'posted',
            receiptJson: { platform: 'reddit', commentId: result.commentId },
            fbCommentId: result.commentId,
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
            payload: { platform: 'reddit', submissionId: fbPostId, redditCommentId: result.commentId },
          },
        }),
      ]);
      log.info('engage.comment.reddit.posted', { commentId, redditCommentId: result.commentId });
      await job.updateProgress({ step: 'succeeded' });
    } else {
      log.error('engage.comment.reddit.failed', { commentId, error: result.error });
      await markCommentFailed(db, commentId, `reddit_error: ${result.error}`, { platform: 'reddit', error: result.error });
      await job.updateProgress({ step: 'failed' });
    }

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
