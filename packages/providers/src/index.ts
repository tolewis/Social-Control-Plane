import {
  NotImplementedError,
  type HttpRequest,
  type OAuthAuthorizeParams,
  type OAuthTokenExchangeParams,
  type OAuthTokenResponse,
  type ProviderAuthAdapter,
  type ProviderId,
  type ProviderPublishAdapter,
} from '../../shared/src/index.js';

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

const asRecord = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
};

const toStringOrUndef = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const toNumberOrUndef = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const formBody = (pairs: Record<string, string>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(pairs)) sp.set(k, v);
  return sp.toString();
};

export class LinkedInAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'linkedin' as const;

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    const clientId = requiredEnv('LINKEDIN_CLIENT_ID');

    const scopes = (params.scopes?.length ? params.scopes : [
      'openid',
      'profile',
      'email',
      // posting
      'w_member_social',
      // org posting/admin (may require app review)
      'r_organization_social',
      'rw_organization_admin',
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
    const clientId = requiredEnv('LINKEDIN_CLIENT_ID');
    const clientSecret = requiredEnv('LINKEDIN_CLIENT_SECRET');

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
    const clientId = requiredEnv('LINKEDIN_CLIENT_ID');
    const clientSecret = requiredEnv('LINKEDIN_CLIENT_SECRET');

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
    // This is a *best-effort* LinkedIn "simple text" post shape.
    // LinkedIn has multiple posting APIs (ugcPosts, shares, assets upload flows).
    // This is intentionally minimal; the worker should own multi-step media flows.

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
        // Best-effort idempotency. LinkedIn may ignore unknown headers.
        'x-scp-idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify(body),
    };
  }
}

export class FacebookAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'facebook' as const;

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    const clientId = requiredEnv('FACEBOOK_APP_ID');
    const scopes = (params.scopes?.length ? params.scopes : [
      'pages_show_list',
      'business_management',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_read_engagement',
      'read_insights',
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
    const appId = requiredEnv('FACEBOOK_APP_ID');
    const appSecret = requiredEnv('FACEBOOK_APP_SECRET');

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
    const appId = requiredEnv('FACEBOOK_APP_ID');
    const appSecret = requiredEnv('FACEBOOK_APP_SECRET');

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
}

export class InstagramAdapter implements ProviderAuthAdapter, ProviderPublishAdapter {
  provider = 'instagram' as const;

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    // Instagram Graph uses the Meta app auth dialog.
    const clientId = requiredEnv('FACEBOOK_APP_ID');
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
    const appId = requiredEnv('FACEBOOK_APP_ID');
    const appSecret = requiredEnv('FACEBOOK_APP_SECRET');

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
    // Instagram Content Publishing API is a 2-step flow:
    //   1. POST /{accountRef}/media  (create media container)
    //   2. POST /{accountRef}/media_publish  (publish the container using creation_id)
    // Instagram does NOT support text-only posts — an image or video URL is required.
    // For MVP, the worker will need to orchestrate the 2-step flow for media posts.
    throw new NotImplementedError(
      'Instagram requires media (image/video) for publishing. Text-only posts not supported.',
    );
  }
}

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

  /**
   * PKCE note: the adapter is stateless, so we derive the code_verifier deterministically
   * from the `state` parameter. The caller must pass the same state value during both
   * the authorize and token-exchange steps.
   */

  getAuthorizationUrl(params: OAuthAuthorizeParams): string {
    // This method is synchronous per the interface, but PKCE S256 needs a hash.
    // We compute it synchronously using Node's createHash (available everywhere).
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const clientId = requiredEnv('X_API_KEY');

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
      'https://twitter.com/i/oauth2/authorize'
      + `?response_type=code`
      + `&client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(params.redirectUri)}`
      + `&scope=${encodeURIComponent(scopes.join(' '))}`
      + `&state=${encodeURIComponent(params.state)}`
      + `&code_challenge=${encodeURIComponent(codeChallenge)}`
      + `&code_challenge_method=S256`
    );
  }

  buildTokenExchangeRequest(params: OAuthTokenExchangeParams & { state?: string }): HttpRequest {
    const clientId = requiredEnv('X_API_KEY');
    const clientSecret = requiredEnv('X_API_SECRET');

    // code_verifier must match the code_challenge sent during authorization.
    // We derived code_challenge from state, so code_verifier = state.
    const codeVerifier = (params as { state?: string }).state ?? '';

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return {
      method: 'POST',
      url: 'https://api.twitter.com/2/oauth2/token',
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
    const clientId = requiredEnv('X_API_KEY');
    const clientSecret = requiredEnv('X_API_SECRET');

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return {
      method: 'POST',
      url: 'https://api.twitter.com/2/oauth2/token',
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
      url: 'https://api.twitter.com/2/tweets',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: input.text }),
    };
  }
}

export const createAuthAdapter = (provider: ProviderId): ProviderAuthAdapter => {
  switch (provider) {
    case 'linkedin':
      return new LinkedInAdapter();
    case 'facebook':
      return new FacebookAdapter();
    case 'instagram':
      return new InstagramAdapter();
    case 'x':
      return new XAdapter();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};
