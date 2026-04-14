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
// Facebook Graph API: resolve canonical post id + post comment
// ---------------------------------------------------------------------------
//
// The mbasic scraper captures `content_owner_id_new` from HTML, which for
// many pages is a legacy user-migration id, NOT Facebook's canonical Graph
// page id. Commenting against that mbasic id returns code=100 subcode=33
// or code=200 "Permissions error" for a significant fraction of targets.
//
// The fix: before POSTing a comment, call GET {fbPostId}?fields=id,from
// with the page access token. Graph returns the canonical id and the
// canonical from.id — cache both, then comment against the canonical id.
// On subsequent retries of the same EngagePost, the cached canonical id
// lets us skip the GET entirely.
//
// When the resolver GET itself returns code=100 subcode=33 (post genuinely
// unreadable by this page token), we flip the comment to `needs_attention`
// so the operator can click through, Like/Follow the target page on
// Facebook, then re-approve. We do NOT auto-blacklist pages.

type ResolveResult =
  | { kind: 'ok'; canonicalFbPostId: string; realFbPageId: string | null }
  | { kind: 'needs_attention'; reason: string; body: unknown }
  | { kind: 'retry'; reason: string; body: unknown };

async function resolveCanonicalFbPostId(
  accessToken: string,
  fbPostId: string,
): Promise<ResolveResult> {
  const url =
    `https://graph.facebook.com/v20.0/${encodeURIComponent(fbPostId)}` +
    `?fields=id,from&access_token=${encodeURIComponent(accessToken)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'retry', reason: `network:${msg}`, body: null };
  }

  const body = await res.json().catch(() => ({ _raw: 'non_json_response' }));

  if (res.ok) {
    const id = (body as { id?: string }).id;
    const fromId = (body as { from?: { id?: string } }).from?.id ?? null;
    if (!id) {
      return { kind: 'retry', reason: 'resolver_missing_id', body };
    }
    return { kind: 'ok', canonicalFbPostId: id, realFbPageId: fromId };
  }

  const err = (body as { error?: { code?: number; error_subcode?: number; message?: string } }).error;
  const code = err?.code;

  // Graph API transient / rate-limit-ish errors → let BullMQ retry with backoff.
  // - 5xx: server trouble
  // - code 4: application request limit reached
  // - code 17: user request limit reached
  // - code 32: page request limit reached
  // - code 613: calls to this api have exceeded the rate limit
  if (res.status >= 500 || code === 4 || code === 17 || code === 32 || code === 613) {
    return { kind: 'retry', reason: describeApiFailure(res.status, body), body };
  }

  // Permission / object-access errors that indicate the page token simply
  // cannot see or comment on this post:
  // - code 100 (with or without subcode 33): "Story does not exist" / "Object does not exist"
  // - code 200: "Permissions error" — page not allowed to interact
  // - code 10:  "Application does not have permission for this action"
  // All of these → surface as needs_attention so the operator can resolve
  // (Like/Follow the target page, or mark the post dead). Anything else
  // unknown also falls through to needs_attention rather than silent retry.
  return { kind: 'needs_attention', reason: describeApiFailure(res.status, body), body };
}

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

  // Fetch the comment → post → page chain with separate findUnique calls
  // so we can read/cache canonicalFbPostId, realFbPageId, and update
  // lastPostedAt. Three cheap lookups instead of one nested include.
  const commentRow = await db.engageComment.findUnique({ where: { id: commentId } });
  if (!commentRow) {
    log.error('engage.comment.row_not_found', { commentId });
    return { ok: true };
  }
  const engagePost = await db.engagePost.findUnique({ where: { id: commentRow.engagePostId } });
  if (!engagePost) {
    log.error('engage.comment.post_not_found', { commentId, engagePostId: commentRow.engagePostId });
    await markCommentFailed(db, commentId, 'engage_post_not_found', { engagePostId: commentRow.engagePostId });
    return { ok: true };
  }
  const engagePage = await db.engagePage.findUnique({ where: { id: engagePost.engagePageId } });
  if (!engagePage) {
    log.error('engage.comment.page_not_found', { commentId, engagePageId: engagePost.engagePageId });
    await markCommentFailed(db, commentId, 'engage_page_not_found', { engagePageId: engagePost.engagePageId });
    return { ok: true };
  }

  // Use the cached canonical id if the resolver already ran on a previous
  // attempt. First-ever comment on a post → call the resolver now.
  let effectiveFbPostId = engagePost.canonicalFbPostId ?? fbPostId;
  if (!engagePost.canonicalFbPostId) {
    const resolved = await resolveCanonicalFbPostId(accessToken, fbPostId);
    if (resolved.kind === 'retry') {
      log.warn('engage.comment.resolver_retry', { commentId, reason: resolved.reason });
      // Throw so BullMQ applies exponential backoff + retries (3 attempts configured).
      throw new Error(`engage.resolver.retry: ${resolved.reason}`);
    }
    if (resolved.kind === 'needs_attention') {
      log.info('engage.comment.resolver_needs_attention', { commentId, reason: resolved.reason });
      await markCommentNeedsAttention(
        db,
        commentId,
        engagePost.postUrl ?? null,
        engagePage.name ?? null,
        resolved.reason,
        resolved.body,
      );
      await job.updateProgress({ step: 'needs_attention' });
      return { ok: true };
    }
    effectiveFbPostId = resolved.canonicalFbPostId;
    // Persist the canonical post id so retries skip this GET next time.
    await db.engagePost.update({
      where: { id: engagePost.id },
      data: { canonicalFbPostId: resolved.canonicalFbPostId },
    });
    // Persist the canonical page id on the page if it's new or different.
    if (resolved.realFbPageId && engagePage.realFbPageId !== resolved.realFbPageId) {
      await db.engagePage.update({
        where: { id: engagePage.id },
        data: { realFbPageId: resolved.realFbPageId },
      });
    }
    log.info('engage.comment.resolver_ok', {
      commentId,
      scraperFbPostId: fbPostId,
      canonicalFbPostId: resolved.canonicalFbPostId,
      realFbPageId: resolved.realFbPageId,
    });
  }

  let result: { ok: boolean; status: number; body: unknown };
  try {
    result = await postFacebookComment(accessToken, effectiveFbPostId, commentText);
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
      db.engagePost.update({
        where: { id: engagePost.id },
        data: { commented: true },
      }),
      // Rotation signal: record that we successfully posted a comment on
      // this page. Runners use lastPostedAt to spread future comments
      // across the registry instead of hammering the same pages.
      db.engagePage.update({
        where: { id: engagePage.id },
        data: { lastPostedAt: new Date() },
      }),
      db.auditEvent.create({
        data: {
          entityType: 'EngageComment',
          entityId: commentId,
          action: 'posted',
          payload: { fbPostId, canonicalFbPostId: effectiveFbPostId, fbCommentId, status: result.status },
        },
      }),
    ]);

    log.info('engage.comment.posted', { commentId, fbCommentId, fbPostId, canonicalFbPostId: effectiveFbPostId });
    await job.updateProgress({ step: 'succeeded' });
  } else {
    const error = result.body && typeof result.body === 'object'
      ? (result.body as { error?: { code?: number; error_subcode?: number } }).error
      : undefined;

    // Post-time permission / object-access errors. These happen when the
    // resolver succeeded (we confirmed we could READ the post) but the
    // actual comment POST is rejected — usually because the target page
    // moderates who can comment. Codes:
    // - 100: "Story does not exist" / "Object does not exist"
    // - 200: "(#200) Permissions error"
    // - 10:  "Application does not have permission for this action"
    // All of these → surface as needs_attention so the operator can
    // Like/Follow the target page and re-approve, not a silent failure.
    if (error?.code === 100 || error?.code === 200 || error?.code === 10) {
      log.info('engage.comment.post_time_needs_attention', {
        commentId,
        status: result.status,
        code: error?.code,
      });
      await markCommentNeedsAttention(
        db,
        commentId,
        engagePost.postUrl ?? null,
        engagePage.name ?? null,
        describeApiFailure(result.status, result.body),
        result.body,
      );
      await job.updateProgress({ step: 'needs_attention' });
      return { ok: true };
    }

    log.error('engage.comment.api_error', { commentId, status: result.status, body: result.body });
    await markCommentFailed(db, commentId, describeApiFailure(result.status, result.body), result.body);

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

// Surface a comment the operator needs to act on (Like/Follow the target
// page on Facebook, then re-approve). Not the same as 'failed' — the
// /engage UI renders these under an "Action Required" filter with a
// clickable post link, and the approve button stays enabled so the
// operator can re-enqueue after Liking the page.
async function markCommentNeedsAttention(
  db: DbClient,
  commentId: string,
  postUrl: string | null,
  pageName: string | null,
  apiReason: string,
  receiptJson: unknown,
): Promise<void> {
  const note =
    `Page likely needs TackleRoom Fishing Supply to Like/Follow before Bill can comment. ` +
    `Open the post${postUrl ? ` (${postUrl})` : ''}, Like the${pageName ? ` "${pageName}"` : ''} page ` +
    `on Facebook as Tackle Room, then return here and hit Approve. ` +
    `Graph API said: ${apiReason}`;
  try {
    await Promise.all([
      db.engageComment.update({
        where: { id: commentId },
        data: {
          status: 'needs_attention',
          rejectionNote: note,
          receiptJson: receiptJson ?? undefined,
          updatedAt: new Date(),
        },
      }),
      db.auditEvent.create({
        data: {
          entityType: 'EngageComment',
          entityId: commentId,
          action: 'needs_attention',
          payload: { reason: apiReason, pageName, postUrl },
        },
      }),
    ]);
  } catch {
    // Best effort
  }
}
