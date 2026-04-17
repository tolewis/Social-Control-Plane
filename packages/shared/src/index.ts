export const PROVIDERS = ['linkedin', 'facebook', 'instagram', 'x'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type PublishMode = 'draft-human' | 'draft-agent' | 'direct-human' | 'direct-agent';
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

/* ------------------------------------------------------------------ */
/*  Media publishing types                                             */
/* ------------------------------------------------------------------ */

export interface MediaAttachment {
  id: string;
  mimeType: string;
  /** Public URL for platforms that fetch media server-side (e.g. Instagram). */
  url: string;
  /** Absolute local filesystem path for binary upload to platforms. */
  storagePath: string;
  sizeBytes: number;
  originalName: string;
}

export interface PublishInput {
  accessToken: string;
  accountRef: string;
  text: string;
  idempotencyKey: string;
  media?: MediaAttachment[];
}

export interface PublishResult {
  ok: boolean;
  status: number;
  body: unknown;
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
   * Build a request to publish a text-only post.
   * The worker executes this request via fetch.
   */
  buildPublishRequest(input: {
    accessToken: string;
    accountRef: string;
    text: string;
    idempotencyKey: string;
  }): HttpRequest;

  /**
   * Publish content with media attachments.
   * Handles the full multi-step flow (upload media → create post) internally.
   * If not implemented, the adapter only supports text-only posts.
   */
  publish?(input: PublishInput): Promise<PublishResult>;
}

/* ------------------------------------------------------------------ */
/*  AI Slop Detector — rule-based, no AI.                              */
/*  Patterns sourced from github.com/hardikpandya/stop-slop             */
/* ------------------------------------------------------------------ */

export interface SlopMatch {
  category: string;
  match: string;
  /** Character offset in the original text */
  index: number;
}

export type SlopLabel = 'Clean' | 'Minor' | 'Heavy';

export interface SlopResult {
  /** 0–100, higher = more slop */
  score: number;
  /** 0–10 scale (ceil of score/10) */
  rating: number;
  matches: SlopMatch[];
  label: SlopLabel;
  flagCount: number;
}

const SLOP_PHRASE_PATTERNS: [string, RegExp][] = [
  ["Throat-clearing opener", /\b(?:here'?s the thing|here'?s what|here'?s why|the uncomfortable truth is|it turns out|the real \w+ is|let me be clear|the truth is|i'?ll say it again|i'?m going to be honest|can we talk about|here'?s what i find interesting|here'?s the problem)\b/gi],
  ["Emphasis crutch", /\b(?:full stop|let that sink in|this matters because|make no mistake|here'?s why that matters)\b/gi],
  ["Emphasis crutch", /\.\s*Period\./gi],
  ["Filler phrase", /\b(?:at its core|in today'?s \w+|it'?s worth noting|at the end of the day|when it comes to|in a world where|the reality is)\b/gi],
  ["Business jargon", /\b(?:navigate (?:the |these |those )?challenges?|unpack (?:the |this |that )?|lean(?:ing)? into|(?:the |this )?landscape|game[- ]?changer|double(?:d)? down|deep dive|take a step back|moving forward|circle back|on the same page)\b/gi],
  ["Adverb/softener", /\b(?:genuinely|honestly|simply|fundamentally|inherently|inevitably|interestingly|importantly|crucially|deeply|truly)\b/gi],
  ["Meta-commentary", /\b(?:hint:|plot twist:|spoiler:|you already know this|but that'?s another post|is a feature,? not a bug|dressed up as|the rest of this (?:essay|post|article)|let me walk you through|in this section|as we'?ll see|i want to explore)\b/gi],
  ["Performative emphasis", /\b(?:creeps? in|i promise|they exist,? i promise)\b/gi],
  ["Telling not showing", /\b(?:this is genuinely hard|this is what (?:leadership|it) actually looks like|actually matters)\b/gi],
  ["Vague declarative", /\b(?:the reasons are structural|the implications are significant|this is the deepest problem|the stakes are high|the consequences are real)\b/gi],
];

const SLOP_STRUCTURE_PATTERNS: [string, RegExp][] = [
  ["Em dash", /\u2014/g],
  ["Em dash (double hyphen)", /(?<!\w)--(?!\w)/g],
  ["Binary contrast", /\bnot because .{3,40}?\. because\b/gi],
  ["Binary contrast", /\bisn'?t (?:the |a )?(?:problem|answer|question)\. .{3,30}? is\./gi],
  ["Binary contrast", /\bit feels like .{3,30}\. it'?s actually\b/gi],
  ["Binary contrast", /\bstops being .{3,30} and starts being\b/gi],
  ["Binary contrast", /\bnot just .{3,30} but also\b/gi],
  ["Dramatic fragment", /\bthat'?s it\.\s*that'?s the\b/gi],
  ["Rhetorical setup", /\b(?:what if (?:we |you |i )?(?:could|were|had)|here'?s what i mean:|think about it:?|and that'?s okay\.?)\b/gi],
  ["False agency", /\b(?:the (?:conversation|culture|market|decision|data) (?:shifts?|moves?|rewards?|tells?|emerges?))\b/gi],
  ["Passive voice", /\b(?:was created|is believed|were made|was reached|was decided|been established|is considered|was determined)\b/gi],
  ["Staccato hedging", /\bnot \w+\.\s*not \w+\./gi],
];

export function detectSlop(text: string): SlopResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, rating: 0, matches: [], label: 'Clean', flagCount: 0 };
  }

  const matches: SlopMatch[] = [];

  for (const [category, pattern] of [...SLOP_PHRASE_PATTERNS, ...SLOP_STRUCTURE_PATTERNS]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({ category, match: m[0], index: m.index });
    }
  }

  // Deduplicate overlapping matches (keep the longer one)
  matches.sort((a, b) => a.index - b.index);
  const deduped: SlopMatch[] = [];
  for (const m of matches) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.index < prev.index + prev.match.length) {
      if (m.match.length > prev.match.length) {
        deduped[deduped.length - 1] = m;
      }
    } else {
      deduped.push(m);
    }
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const matchCount = deduped.length;
  const perMatchWeight = wordCount < 50 ? 15 : wordCount < 150 ? 10 : 6;
  const rawScore = matchCount * perMatchWeight;
  const score = Math.min(100, rawScore);

  let label: SlopLabel;
  if (score === 0) label = 'Clean';
  else if (score <= 20) label = 'Minor';
  else label = 'Heavy';

  const rating = Math.ceil(score / 10);

  return { score, rating, matches: deduped, label, flagCount: deduped.length };
}

/**
 * Group matches by category. Returns a plain object so the result is
 * JSON-serializable for the HTTP API while still iterable via Object.entries
 * on the web side.
 */
export function groupSlopMatches(matches: SlopMatch[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const m of matches) {
    const bucket = groups[m.category] ?? (groups[m.category] = []);
    const text = m.match.length > 40 ? m.match.slice(0, 40) + '\u2026' : m.match;
    if (!bucket.includes(text)) bucket.push(text);
  }
  return groups;
}
