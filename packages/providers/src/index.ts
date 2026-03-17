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

export class FacebookAdapter implements ProviderAuthAdapter {
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
}

export class InstagramAdapter implements ProviderAuthAdapter {
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
}

export class XAdapter implements ProviderAuthAdapter {
  provider = 'x' as const;

  getAuthorizationUrl(_params: OAuthAuthorizeParams): string {
    throw new NotImplementedError('X auth flow not implemented (OAuth 1.0a / OAuth2 PKCE varies by app)');
  }

  buildTokenExchangeRequest(_params: OAuthTokenExchangeParams): HttpRequest {
    throw new NotImplementedError('X token exchange not implemented');
  }

  normalizeTokenResponse(_raw: unknown): OAuthTokenResponse {
    throw new NotImplementedError('X token normalization not implemented');
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
