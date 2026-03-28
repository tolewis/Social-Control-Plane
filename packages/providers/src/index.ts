import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  NotImplementedError,
  type HttpRequest,
  type MediaAttachment,
  type OAuthAuthorizeParams,
  type OAuthTokenExchangeParams,
  type OAuthTokenResponse,
  type ProviderAuthAdapter,
  type ProviderId,
  type ProviderPublishAdapter,
  type PublishInput,
  type PublishResult,
} from '../../shared/src/index.js';

/* ------------------------------------------------------------------ */
/*  Credential injection                                               */
/* ------------------------------------------------------------------ */

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

/**
 * Resolve a credential value: use injected credentials first, fall back to env.
 */
function resolveCred(
  creds: ProviderCredentials | undefined,
  field: 'clientId' | 'clientSecret',
  envName: string,
): string {
  if (creds?.[field]) return creds[field];
  return requiredEnv(envName);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const asRecord = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
};

/** Read a local media file and return a Blob suitable for FormData. */
function mediaBlob(m: MediaAttachment): Blob {
  const buf = readFileSync(m.storagePath);
  return new Blob([buf], { type: m.mimeType });
}

/** Quick JSON fetch with error handling. */
async function jsonFetch(
  url: string,
  init: RequestInit,
): Promise<PublishResult> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({ _raw: 'non_json_response' }));
  return { ok: res.ok, status: res.status, body };
}

function isImage(m: MediaAttachment): boolean {
  return m.mimeType.startsWith('image/');
}

function isVideo(m: MediaAttachment): boolean {
  return m.mimeType.startsWith('video/');
}

const toStringOrUndef = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const toNumberOrUndef = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const formBody = (pairs: Record<string, string>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(pairs)) sp.set(k, v);
  return sp.toString();
};

/* ------------------------------------------------------------------ */
/*  LinkedIn                                                           */
/* ------------------------------------------------------------------ */

export class LinkedInAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'linkedin' as const;
  private creds?: ProviderCredentials;

  constructor(creds?: ProviderCredentials) { this.creds = creds; }

  private clientId() { return resolveCred(this.creds, 'clientId', 'LINKEDIN_CLIENT_ID'); }
  private clientSecret() { return resolveCred(this.creds, 'clientSecret', 'LINKEDIN_CLIENT_SECRET'); }

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    const clientId = this.clientId();

    const scopes = (params.scopes?.length ? params.scopes : [
      'openid',
      'profile',
      'w_member_social',
    ]);

    const scope = encodeURIComponent(scopes.join(' '));

    return (
      'https://www.linkedin.com/oauth/v2/authorization'
      + `?response_type=code`
      + `&client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
      + `&state=${encodeURIComponent(params.state)}`
      + `&scope=${scope}`
    );
  }

  buildTokenExchangeRequest(params: OAuthTokenExchangeParams): HttpRequest {
    const clientId = this.clientId();
    const clientSecret = this.clientSecret();

    return {
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    };
  }

  buildRefreshRequest(params: { refreshToken: string }): HttpRequest {
    const clientId = this.clientId();
    const clientSecret = this.clientSecret();

    return {
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody({
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    };
  }

  normalizeTokenResponse(raw: unknown): OAuthTokenResponse {
    const r = asRecord(raw);
    const accessToken = toStringOrUndef(r.access_token);
    if (!accessToken) {
      throw new Error('LinkedIn token response missing access_token');
    }

    return {
      accessToken,
      refreshToken: toStringOrUndef(r.refresh_token),
      expiresInSeconds: toNumberOrUndef(r.expires_in),
      scope: toStringOrUndef(r.scope),
      tokenType: toStringOrUndef(r.token_type),
      raw,
    };
  }

  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest {
    if (!input.accountRef) {
      throw new NotImplementedError('LinkedIn publish requires accountRef (person/org id)');
    }

    const body = {
      author: input.accountRef.startsWith('urn:') ? input.accountRef : `urn:li:person:${input.accountRef}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: input.text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    return {
      method: 'POST',
      url: 'https://api.linkedin.com/v2/ugcPosts',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'x-scp-idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify(body),
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const author = input.accountRef.startsWith('urn:')
      ? input.accountRef
      : `urn:li:person:${input.accountRef}`;
    const images = (input.media ?? []).filter(isImage);

    if (images.length === 0) {
      // Text-only — delegate to buildPublishRequest path
      const req = this.buildPublishRequest(input);
      return jsonFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    }

    // Upload each image: register → PUT binary → collect asset URNs
    const assetUrns: string[] = [];
    for (const img of images) {
      // Step 1: Register upload
      const regRes = await jsonFetch(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: author,
              serviceRelationships: [{
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              }],
            },
          }),
        },
      );
      if (!regRes.ok) return regRes;

      const regBody = asRecord(regRes.body);
      const value = asRecord(regBody.value);
      const mechanism = asRecord(
        (value.uploadMechanism as Record<string, unknown>)?.[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ],
      );
      const uploadUrl = mechanism.uploadUrl as string;
      const asset = value.asset as string;
      if (!uploadUrl || !asset) {
        return { ok: false, status: 500, body: { error: 'linkedin_register_missing_fields', raw: regRes.body } };
      }

      // Step 2: PUT binary
      const blob = mediaBlob(img);
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': img.mimeType,
        },
        body: blob,
      });
      if (!putRes.ok) {
        const putBody = await putRes.json().catch(() => ({}));
        return { ok: false, status: putRes.status, body: putBody };
      }

      assetUrns.push(asset);
    }

    // Step 3: Create post with image references
    const postBody = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: input.text },
          shareMediaCategory: 'IMAGE',
          media: assetUrns.map((urn) => ({
            status: 'READY',
            media: urn,
          })),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    return jsonFetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Facebook                                                           */
/* ------------------------------------------------------------------ */

export class FacebookAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'facebook' as const;
  private creds?: ProviderCredentials;

  constructor(creds?: ProviderCredentials) { this.creds = creds; }

  private appId() { return resolveCred(this.creds, 'clientId', 'FACEBOOK_APP_ID'); }
  private appSecret() { return resolveCred(this.creds, 'clientSecret', 'FACEBOOK_APP_SECRET'); }

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    const clientId = this.appId();
    const scopes = (params.scopes?.length ? params.scopes : [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
    ]);

    return (
      'https://www.facebook.com/v20.0/dialog/oauth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
      + `&state=${encodeURIComponent(params.state)}`
      + `&scope=${encodeURIComponent(scopes.join(','))}`
    );
  }

  buildTokenExchangeRequest(params: OAuthTokenExchangeParams): HttpRequest {
    const appId = this.appId();
    const appSecret = this.appSecret();

    return {
      method: 'GET',
      url: (
        'https://graph.facebook.com/v20.0/oauth/access_token'
        + `?client_id=${encodeURIComponent(appId)}`
        + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
        + `&client_secret=${encodeURIComponent(appSecret)}`
        + `&code=${encodeURIComponent(params.code)}`
      ),
      headers: {},
    };
  }

  buildRefreshRequest(params: { refreshToken: string }): HttpRequest {
    const appId = this.appId();
    const appSecret = this.appSecret();

    // Facebook long-lived token exchange: exchange a short-lived token for a long-lived one.
    // The "refresh" is actually an exchange via fb_exchange_token grant type.
    return {
      method: 'GET',
      url: (
        'https://graph.facebook.com/v20.0/oauth/access_token'
        + `?grant_type=fb_exchange_token`
        + `&client_id=${encodeURIComponent(appId)}`
        + `&client_secret=${encodeURIComponent(appSecret)}`
        + `&fb_exchange_token=${encodeURIComponent(params.refreshToken)}`
      ),
      headers: {},
    };
  }

  normalizeTokenResponse(raw: unknown): OAuthTokenResponse {
    const r = asRecord(raw);
    const accessToken = toStringOrUndef(r.access_token);
    if (!accessToken) throw new Error('Facebook token response missing access_token');

    return {
      accessToken,
      expiresInSeconds: toNumberOrUndef(r.expires_in),
      tokenType: toStringOrUndef(r.token_type),
      raw,
    };
  }

  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest {
    // accountRef is the Facebook Page ID
    if (!input.accountRef) {
      throw new NotImplementedError('Facebook publish requires accountRef (Page ID)');
    }

    return {
      method: 'POST',
      url: `https://graph.facebook.com/v20.0/${encodeURIComponent(input.accountRef)}/feed`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody({
        message: input.text,
        access_token: input.accessToken,
      }),
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const pageId = input.accountRef;
    if (!pageId) {
      return { ok: false, status: 400, body: { error: 'missing_page_id' } };
    }

    const images = (input.media ?? []).filter(isImage);
    const videos = (input.media ?? []).filter(isVideo);

    // Text-only
    if (images.length === 0 && videos.length === 0) {
      const req = this.buildPublishRequest(input);
      return jsonFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    }

    // Single video: POST /{pageId}/videos
    if (videos.length > 0) {
      const v = videos[0];
      const form = new FormData();
      form.append('source', mediaBlob(v), v.originalName);
      form.append('description', input.text);
      form.append('access_token', input.accessToken);

      return jsonFetch(
        `https://graph-video.facebook.com/v20.0/${encodeURIComponent(pageId)}/videos`,
        { method: 'POST', body: form },
      );
    }

    // Single image: POST /{pageId}/photos
    if (images.length === 1) {
      const img = images[0];
      const form = new FormData();
      form.append('source', mediaBlob(img), img.originalName);
      form.append('message', input.text);
      form.append('access_token', input.accessToken);

      return jsonFetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/photos`,
        { method: 'POST', body: form },
      );
    }

    // Multiple images: upload each unpublished, then create feed post
    const photoIds: string[] = [];
    for (const img of images) {
      const form = new FormData();
      form.append('source', mediaBlob(img), img.originalName);
      form.append('published', 'false');
      form.append('access_token', input.accessToken);

      const upRes = await jsonFetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/photos`,
        { method: 'POST', body: form },
      );
      if (!upRes.ok) return upRes;
      const upBody = asRecord(upRes.body);
      const photoId = upBody.id as string;
      if (!photoId) {
        return { ok: false, status: 500, body: { error: 'fb_photo_upload_missing_id', raw: upRes.body } };
      }
      photoIds.push(photoId);
    }

    // Create feed post with attached media
    const params: Record<string, string> = {
      message: input.text,
      access_token: input.accessToken,
    };
    photoIds.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });

    return jsonFetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/feed`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody(params),
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Instagram                                                          */
/* ------------------------------------------------------------------ */

export class InstagramAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'instagram' as const;
  private creds?: ProviderCredentials;

  constructor(creds?: ProviderCredentials) { this.creds = creds; }

  private appId() { return resolveCred(this.creds, 'clientId', 'FACEBOOK_APP_ID'); }
  private appSecret() { return resolveCred(this.creds, 'clientSecret', 'FACEBOOK_APP_SECRET'); }

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    // Instagram Graph uses the Meta app auth dialog.
    const clientId = this.appId();
    const scopes = (params.scopes?.length ? params.scopes : [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'business_management',
    ]);

    return (
      'https://www.facebook.com/v20.0/dialog/oauth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
      + `&state=${encodeURIComponent(params.state)}`
      + `&scope=${encodeURIComponent(scopes.join(','))}`
    );
  }

  buildTokenExchangeRequest(params: OAuthTokenExchangeParams): HttpRequest {
    const appId = this.appId();
    const appSecret = this.appSecret();

    // NOTE: For Instagram Graph, the first exchange is still via the Graph OAuth endpoint.
    return {
      method: 'GET',
      url: (
        'https://graph.facebook.com/v20.0/oauth/access_token'
        + `?client_id=${encodeURIComponent(appId)}`
        + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
        + `&client_secret=${encodeURIComponent(appSecret)}`
        + `&code=${encodeURIComponent(params.code)}`
      ),
      headers: {},
    };
  }

  normalizeTokenResponse(raw: unknown): OAuthTokenResponse {
    const r = asRecord(raw);
    const accessToken = toStringOrUndef(r.access_token);
    if (!accessToken) throw new Error('Instagram token response missing access_token');

    return {
      accessToken,
      expiresInSeconds: toNumberOrUndef(r.expires_in),
      tokenType: toStringOrUndef(r.token_type),
      raw,
    };
  }

  buildPublishRequest(_input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest {
    throw new NotImplementedError(
      'Instagram requires media (image/video) for publishing. Text-only posts not supported.',
    );
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const igUserId = input.accountRef;
    if (!igUserId) {
      return { ok: false, status: 400, body: { error: 'missing_ig_user_id' } };
    }

    const media = input.media ?? [];
    if (media.length === 0) {
      return { ok: false, status: 400, body: { error: 'instagram_requires_media' } };
    }

    const images = media.filter(isImage);
    const videos = media.filter(isVideo);

    // Single image or single video (Reel)
    if (media.length === 1) {
      const m = media[0];
      const isVid = isVideo(m);

      // Step 1: Create media container
      const containerParams: Record<string, string> = {
        caption: input.text,
        access_token: input.accessToken,
      };
      if (isVid) {
        containerParams.media_type = 'REELS';
        containerParams.video_url = m.url;
      } else {
        containerParams.image_url = m.url;
      }

      const containerRes = await jsonFetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/media`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: formBody(containerParams),
        },
      );
      if (!containerRes.ok) return containerRes;

      const containerId = (asRecord(containerRes.body).id as string);
      if (!containerId) {
        return { ok: false, status: 500, body: { error: 'ig_container_missing_id', raw: containerRes.body } };
      }

      // For video: poll until container is FINISHED (up to 60s)
      if (isVid) {
        const ready = await this.pollContainer(containerId, input.accessToken);
        if (!ready.ok) return ready;
      }

      // Step 2: Publish the container
      return jsonFetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/media_publish`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: formBody({
            creation_id: containerId,
            access_token: input.accessToken,
          }),
        },
      );
    }

    // Carousel (multiple images/videos)
    const childIds: string[] = [];
    for (const m of media) {
      const isVid = isVideo(m);
      const childParams: Record<string, string> = {
        is_carousel_item: 'true',
        access_token: input.accessToken,
      };
      if (isVid) {
        childParams.media_type = 'VIDEO';
        childParams.video_url = m.url;
      } else {
        childParams.image_url = m.url;
      }

      const childRes = await jsonFetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/media`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: formBody(childParams),
        },
      );
      if (!childRes.ok) return childRes;

      const childId = asRecord(childRes.body).id as string;
      if (!childId) {
        return { ok: false, status: 500, body: { error: 'ig_carousel_child_missing_id', raw: childRes.body } };
      }

      // Poll video children
      if (isVid) {
        const ready = await this.pollContainer(childId, input.accessToken);
        if (!ready.ok) return ready;
      }

      childIds.push(childId);
    }

    // Create carousel container
    const carouselRes = await jsonFetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/media`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody({
          media_type: 'CAROUSEL',
          caption: input.text,
          children: childIds.join(','),
          access_token: input.accessToken,
        }),
      },
    );
    if (!carouselRes.ok) return carouselRes;

    const carouselId = asRecord(carouselRes.body).id as string;
    if (!carouselId) {
      return { ok: false, status: 500, body: { error: 'ig_carousel_missing_id', raw: carouselRes.body } };
    }

    // Publish carousel
    return jsonFetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/media_publish`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody({
          creation_id: carouselId,
          access_token: input.accessToken,
        }),
      },
    );
  }

  /** Poll an IG media container until status is FINISHED (or timeout). */
  private async pollContainer(
    containerId: string,
    accessToken: string,
    maxWaitMs = 60_000,
  ): Promise<PublishResult> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await jsonFetch(
        `https://graph.facebook.com/v20.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
        { method: 'GET' },
      );
      if (!res.ok) return res;
      const status = (asRecord(res.body).status_code as string) ?? '';
      if (status === 'FINISHED') return { ok: true, status: 200, body: res.body };
      if (status === 'ERROR') return { ok: false, status: 400, body: res.body };
      await new Promise((r) => setTimeout(r, 3000));
    }
    return { ok: false, status: 408, body: { error: 'ig_container_poll_timeout', containerId } };
  }
}

/* ------------------------------------------------------------------ */
/*  X (Twitter)                                                        */
/* ------------------------------------------------------------------ */

/**
 * Base64url-encode a buffer (no padding, URL-safe alphabet).
 * Used for PKCE code_challenge derivation.
 */
const base64url = (buf: Uint8Array): string =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * Derive a PKCE code_challenge from a code_verifier using S256.
 * Uses the Node.js crypto module (available in all supported runtimes).
 */
const pkceS256 = async (codeVerifier: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(codeVerifier).digest();
  return base64url(new Uint8Array(digest));
};

export class XAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'x' as const;
  private creds?: ProviderCredentials;

  constructor(creds?: ProviderCredentials) { this.creds = creds; }

  private clientId() { return resolveCred(this.creds, 'clientId', 'X_API_KEY'); }
  private clientSecret() { return resolveCred(this.creds, 'clientSecret', 'X_API_SECRET'); }

  /**
   * PKCE note: the adapter is stateless, so we derive the code_verifier deterministically
   * from the `state` parameter. The caller must pass the same state value during both
   * the authorize and token-exchange steps.
   */

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    const clientId = this.clientId();

    const scopes = (params.scopes?.length ? params.scopes : [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access',
    ]);

    // code_verifier = state (deterministic; stateless adapter)
    const codeVerifier = params.state;
    const digest = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = base64url(new Uint8Array(digest));

    return (
      'https://x.com/i/oauth2/authorize'
      + `?response_type=code`
      + `&client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
      + `&scope=${encodeURIComponent(scopes.join(' '))}`
      + `&state=${encodeURIComponent(params.state)}`
      + `&code_challenge=${encodeURIComponent(codeChallenge)}`
      + `&code_challenge_method=S256`
    );
  }

  buildTokenExchangeRequest(params: OAuthTokenExchangeParams): HttpRequest {
    const clientId = this.clientId();
    const clientSecret = this.clientSecret();

    // code_verifier must match the code_challenge sent during authorization.
    // We derived code_challenge from state, so code_verifier = state.
    const codeVerifier = params.state ?? '';

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return {
      method: 'POST',
      url: 'https://api.x.com/2/oauth2/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basicAuth}`,
      },
      body: formBody({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId,
      }),
    };
  }

  buildRefreshRequest(params: { refreshToken: string }): HttpRequest {
    const clientId = this.clientId();
    const clientSecret = this.clientSecret();

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return {
      method: 'POST',
      url: 'https://api.x.com/2/oauth2/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basicAuth}`,
      },
      body: formBody({
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
        client_id: clientId,
      }),
    };
  }

  normalizeTokenResponse(raw: unknown): OAuthTokenResponse {
    const r = asRecord(raw);
    const accessToken = toStringOrUndef(r.access_token);
    if (!accessToken) throw new Error('X token response missing access_token');

    return {
      accessToken,
      refreshToken: toStringOrUndef(r.refresh_token),
      expiresInSeconds: toNumberOrUndef(r.expires_in),
      scope: toStringOrUndef(r.scope),
      tokenType: toStringOrUndef(r.token_type),
      raw,
    };
  }

  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest {
    return {
      method: 'POST',
      url: 'https://api.x.com/2/tweets',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: input.text }),
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const media = input.media ?? [];

    if (media.length === 0) {
      const req = this.buildPublishRequest(input);
      return jsonFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    }

    // Upload each media file via v1.1 media upload endpoint
    const mediaIds: string[] = [];
    for (const m of media) {
      const blob = mediaBlob(m);
      const form = new FormData();
      form.append('media', blob, m.originalName);
      // media_category helps X process the file correctly
      form.append('media_category', isVideo(m) ? 'tweet_video' : 'tweet_image');

      const upRes = await jsonFetch(
        'https://upload.twitter.com/1.1/media/upload.json',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
          },
          body: form,
        },
      );
      if (!upRes.ok) return upRes;

      const upBody = asRecord(upRes.body);
      const mediaIdStr = (upBody.media_id_string as string) ?? String(upBody.media_id ?? '');
      if (!mediaIdStr) {
        return { ok: false, status: 500, body: { error: 'x_media_upload_missing_id', raw: upRes.body } };
      }

      // For video: poll processing_info until succeeded
      if (isVideo(m) && upBody.processing_info) {
        const pollResult = await this.pollMediaProcessing(mediaIdStr, input.accessToken);
        if (!pollResult.ok) return pollResult;
      }

      mediaIds.push(mediaIdStr);
    }

    // Create tweet with media_ids
    const tweetBody: Record<string, unknown> = { text: input.text };
    if (mediaIds.length > 0) {
      tweetBody.media = { media_ids: mediaIds };
    }

    return jsonFetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });
  }

  /** Poll X media processing until complete (for video uploads). */
  private async pollMediaProcessing(
    mediaId: string,
    accessToken: string,
    maxWaitMs = 120_000,
  ): Promise<PublishResult> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await jsonFetch(
        `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      if (!res.ok) return res;
      const info = asRecord((asRecord(res.body)).processing_info);
      const state = info.state as string;
      if (state === 'succeeded') return { ok: true, status: 200, body: res.body };
      if (state === 'failed') return { ok: false, status: 400, body: res.body };
      const checkAfter = (info.check_after_secs as number) ?? 5;
      await new Promise((r) => setTimeout(r, checkAfter * 1000));
    }
    return { ok: false, status: 408, body: { error: 'x_media_processing_timeout', mediaId } };
  }
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export const createAuthAdapter = (provider: ProviderId, creds?: ProviderCredentials): ProviderAuthAdapter => {
  switch (provider) {
    case 'linkedin':
      return new LinkedInAdapter(creds);
    case 'facebook':
      return new FacebookAdapter(creds);
    case 'instagram':
      return new InstagramAdapter(creds);
    case 'x':
      return new XAdapter(creds);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};
