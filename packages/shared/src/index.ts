export const PROVIDERS = ['linkedin', 'facebook', 'instagram', 'x'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type PublishMode = 'draft' | 'direct';
export type DraftStatus = 'draft' | 'queued' | 'published' | 'failed';

export interface DraftRecord {
  id: string;
  connectionId: string;
  publishMode: PublishMode;
  content: string;
  scheduledFor?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionStatus = 'pending' | 'connected' | 'revoked' | 'error';

export interface ConnectionRecord {
  id: string;
  provider: ProviderId;
  displayName?: string;
  accountRef?: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export type PublishJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface PublishJobRecord {
  id: string;
  draftId: string;
  connectionId: string;
  status: PublishJobStatus;
  idempotencyKey: string;
  receiptJson?: unknown;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export class NotImplementedError extends Error {
  override name = 'NotImplementedError';
}

export const assertUnreachable = (x: never): never => {
  throw new Error(`Unreachable: ${String(x)}`);
};

export const isProviderId = (value: string): value is ProviderId => {
  return (PROVIDERS as readonly string[]).includes(value);
};

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  /** For POSTs, generally application/x-www-form-urlencoded or JSON. */
  body?: string;
}

export interface OAuthAuthorizeParams {
  state: string;
  redirectUri: string;
  /** Provider-specific scopes; if omitted, adapter may use sensible defaults. */
  scopes?: string[];
}

export interface OAuthTokenExchangeParams {
  code: string;
  redirectUri: string;
  /** Original state value — needed by X for PKCE code_verifier derivation. */
  state?: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  /** Seconds from now. */
  expiresInSeconds?: number;
  scope?: string;
  tokenType?: string;
  /** Raw provider response, for debugging/auditing. */
  raw: unknown;
}

/**
 * Auth adapter contract.
 *
 * Design goal: keep providers *pure* by returning request shapes rather than performing network calls.
 * The worker (or an API route, if you choose) can execute the HttpRequest with fetch.
 */
export interface ProviderAuthAdapter {
  provider: ProviderId;

  getAuthorizationUrl(params: OAuthAuthorizeParams): string;

  /** Build a request to exchange an OAuth code for tokens. */
  buildTokenExchangeRequest(params: OAuthTokenExchangeParams): HttpRequest;

  /** Build a request to refresh tokens (if the provider supports refresh tokens). */
  buildRefreshRequest?: (params: { refreshToken: string }) => HttpRequest;

  /** Normalize the provider-specific token response into a stable shape. */
  normalizeTokenResponse(raw: unknown): OAuthTokenResponse;
}

export interface ProviderPublishAdapter {
  provider: ProviderId;

  /**
   * Build a request to publish content.
   *
   * NOTE: many providers require multi-step flows (upload media, then create post).
   * This method is for the "simple text post" happy-path; advanced flows can be added later.
   */
  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest;
}
