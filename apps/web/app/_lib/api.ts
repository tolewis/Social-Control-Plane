/**
 * API client for Social Control Plane Fastify backend.
 *
 * In production, API calls are proxied through Next.js rewrites at /backend/*.
 * In development (localhost), falls back to direct port 4001.
 */

function base(): string {
  if (typeof window === 'undefined') return 'http://localhost:4001';
  const host = document.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:4001`;
  }
  // Production: use same-origin rewrite path
  return `${document.location.origin}/backend`;
}

/** Resolve an API-relative path (like /uploads/...) to a full URL the browser can fetch. */
export function apiUrl(path: string): string {
  return `${base()}${path}`;
}

/* ------------------------------------------------------------------ */
/*  Auth token helpers                                                 */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'scp-token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export async function login(password: string): Promise<{ token: string }> {
  const url = `${base()}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'Wrong password' : `Login failed: ${body}`);
  }
  const data = await res.json() as { token: string };
  setToken(data.token);
  return data;
}

/* ------------------------------------------------------------------ */
/*  Types — mirrors @scp/shared where possible                        */
/* ------------------------------------------------------------------ */

export type ProviderId = 'linkedin' | 'facebook' | 'instagram' | 'x';
export type PublishMode = 'draft-human' | 'draft-agent' | 'direct-human' | 'direct-agent';
export type DraftStatus = 'draft' | 'queued' | 'published' | 'failed';
export type ConnectionStatus = 'pending' | 'connected' | 'revoked' | 'error' | 'reconnect_required';
export type PublishJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface ConnectionRecord {
  id: string;
  provider: ProviderId;
  displayName?: string;
  accountRef?: string;
  status: ConnectionStatus;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaDiscoveryAsset {
  pageId: string;
  pageName: string;
  displayName: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  instagramName?: string;
}

export interface MediaRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  alt?: string;
  createdAt: string;
}

export interface DraftRecord {
  id: string;
  connectionId: string;
  publishMode: PublishMode;
  content: string;
  mediaIds?: string[];
  scheduledFor?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

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

/* ------------------------------------------------------------------ */
/*  Internal fetch helper                                             */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${base()}${path}`;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  // Only set Content-Type for requests that carry a body
  if (init?.body) {
    headers['Content-Type'] ??= 'application/json';
  }
  // Attach auth token
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${path} — ${body}`);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Health                                                            */
/* ------------------------------------------------------------------ */

export function fetchHealth() {
  return apiFetch<{ ok: boolean; service: string }>('/health');
}

/* ------------------------------------------------------------------ */
/*  Connections                                                       */
/* ------------------------------------------------------------------ */

export function fetchConnections() {
  return apiFetch<{ connections: ConnectionRecord[] }>('/connections');
}

export function fetchConnection(id: string) {
  return apiFetch<ConnectionRecord>(`/connections/${id}`);
}

export function createConnection(data: {
  provider: ProviderId;
  displayName?: string;
  accountRef?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAtIso?: string;
}) {
  return apiFetch<{ connection: ConnectionRecord }>('/connections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteConnection(id: string) {
  return apiFetch<void>(`/connections/${id}`, { method: 'DELETE' });
}

export function connectWithToken(
  provider: ProviderId,
  body: { accessToken: string; pageId?: string; instagramAccountId?: string; displayName?: string },
): Promise<{ connection: ConnectionRecord }> {
  return apiFetch<{ connection: ConnectionRecord }>(`/auth/${provider}/connect-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function discoverMetaAssets(
  provider: Extract<ProviderId, 'facebook' | 'instagram'>,
  accessToken: string,
): Promise<{ provider: 'facebook' | 'instagram'; assets: MetaDiscoveryAsset[] }> {
  return apiFetch<{ provider: 'facebook' | 'instagram'; assets: MetaDiscoveryAsset[] }>(`/auth/${provider}/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
}

export function refreshConnection(id: string) {
  return apiFetch<{ refreshed: boolean; connection: ConnectionRecord }>(`/connections/${id}/refresh`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ */
/*  Drafts                                                            */
/* ------------------------------------------------------------------ */

export function fetchDrafts() {
  return apiFetch<{ drafts: DraftRecord[] }>('/drafts');
}

export function fetchDraft(id: string) {
  return apiFetch<DraftRecord>(`/drafts/${id}`);
}

export function createDraft(data: {
  connectionId: string;
  publishMode: PublishMode;
  content: string;
  mediaIds?: string[];
  scheduledFor?: string;
}) {
  return apiFetch<{ draft: DraftRecord }>('/drafts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateDraft(id: string, data: Partial<Pick<DraftRecord, 'content' | 'scheduledFor' | 'publishMode' | 'mediaIds'>>) {
  return apiFetch<{ draft: DraftRecord }>(`/drafts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteDraft(id: string) {
  return apiFetch<void>(`/drafts/${id}`, { method: 'DELETE' });
}

export function rescheduleDraft(id: string, scheduledFor: string) {
  return apiFetch<{ draft: DraftRecord; rescheduledJob: boolean }>(`/drafts/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledFor }),
  });
}

export function revertToDraft(id: string) {
  return apiFetch<{ draft: DraftRecord }>(`/drafts/${id}/back-to-draft`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ */
/*  Publish                                                           */
/* ------------------------------------------------------------------ */

export function publishDraft(draftId: string, idempotencyKey?: string) {
  return apiFetch<{ queued: boolean; draft: DraftRecord; job: PublishJobRecord }>(`/publish/${draftId}`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

/* ------------------------------------------------------------------ */
/*  Jobs                                                              */
/* ------------------------------------------------------------------ */

export function fetchJobs() {
  return apiFetch<{ jobs: PublishJobRecord[] }>('/jobs');
}

/* ------------------------------------------------------------------ */
/*  Provider configuration                                            */
/* ------------------------------------------------------------------ */

export interface ProviderStatusEntry {
  configured: boolean;
  source: 'database' | 'env' | null;
  redirectUri: string;
  clientIdPrefix: string | null;
  connections: ConnectionRecord[];
}

export function fetchProviderStatus() {
  return apiFetch<{ providers: Record<ProviderId, ProviderStatusEntry> }>('/providers/status');
}

export function saveProviderConfig(provider: ProviderId, data: { clientId: string; clientSecret: string }) {
  return apiFetch<{ saved: boolean }>(`/providers/${provider}/config`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteProviderConfig(provider: ProviderId) {
  return apiFetch<{ deleted: boolean }>(`/providers/${provider}/config`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ */
/*  Auth                                                              */
/* ------------------------------------------------------------------ */

export function getAuthUrl(provider: ProviderId) {
  return apiFetch<{ provider: string; adapter: string; state: string; url: string }>(
    `/auth/${provider}/url`,
  );
}

export function exchangeToken(provider: ProviderId, code: string, state: string) {
  return apiFetch<{ performed: boolean; connection?: ConnectionRecord }>(
    `/auth/${provider}/exchange`,
    {
      method: 'POST',
      body: JSON.stringify({ code, state, perform: true }),
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Operators                                                          */
/* ------------------------------------------------------------------ */

export interface OperatorRecord {
  id: string;
  name: string;
  email: string | null;
  role: 'human' | 'agent';
  hasPassword: boolean;
  apiKeyCount: number;
  createdAt: string;
  updatedAt: string;
}

export function fetchOperators() {
  return apiFetch<{ operators: OperatorRecord[] }>('/operators');
}

export function createOperator(data: { name: string; role: 'human' | 'agent'; email?: string; password?: string }) {
  return apiFetch<{ operator: OperatorRecord }>('/operators', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteOperator(id: string) {
  return apiFetch<{ deleted: boolean }>(`/operators/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ */
/*  API Keys                                                           */
/* ------------------------------------------------------------------ */

export interface ApiKeyRecord {
  id: string;
  operatorId: string;
  operatorName: string;
  operatorRole: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreateResult {
  apiKey: ApiKeyRecord;
  rawKey: string;
}

export function fetchApiKeys() {
  return apiFetch<{ apiKeys: ApiKeyRecord[] }>('/api-keys');
}

export function createApiKey(data: { operatorId: string; name: string; expiresAt?: string }) {
  return apiFetch<ApiKeyCreateResult>('/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteApiKey(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api-keys/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ */
/*  Media                                                              */
/* ------------------------------------------------------------------ */

export async function uploadMedia(file: File): Promise<{ media: MediaRecord }> {
  const form = new FormData();
  form.append('file', file);

  const url = `${base()}/media/upload`;
  const uploadHeaders: Record<string, string> = {};
  const tk = getToken();
  if (tk) uploadHeaders['Authorization'] = `Bearer ${tk}`;
  const res = await fetch(url, { method: 'POST', body: form, headers: uploadHeaders });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: /media/upload — ${body}`);
  }
  return res.json();
}

export function fetchMedia() {
  return apiFetch<{ media: MediaRecord[] }>('/media');
}

export function deleteMedia(id: string) {
  return apiFetch<void>(`/media/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ */
/*  Studio — Creative Studio API                                       */
/* ------------------------------------------------------------------ */

export interface StudioPrimitiveInfo {
  id: string;
  configKey: string;
  variants: Array<{ name: string; description: string }>;
}

export interface StudioPresetInfo {
  name: string;
  width: number;
  height: number;
}

export interface StudioRegistry {
  primitives: StudioPrimitiveInfo[];
  presets: StudioPresetInfo[];
}

export interface CritiqueDimension {
  name: string;
  score: number;
  findingCount: number;
}

export interface CritiqueResult {
  version: string;
  status: 'pass' | 'warn' | 'fail';
  overallScore: number;
  dimensions: CritiqueDimension[];
  failures: Array<{ type: string; rule: string; message: string; targets?: string[]; action?: string }>;
  warnings: Array<{ type: string; rule: string; message: string; targets?: string[]; action?: string }>;
  stopRecommendation: 'ship' | 'iterate' | 'escalate';
  summary: string;
}

export interface LayoutRect {
  x: number; y: number; width: number; height: number;
  left: number; top: number; right: number; bottom: number;
  centerX: number; centerY: number; area: number;
}

export interface LayoutElement {
  id: string;
  type: string;
  rect: LayoutRect;
  fontSize?: number;
}

export interface LayoutSidecar {
  canvas?: { width: number; height: number };
  elements?: LayoutElement[];
}

export type RevisionActionType = 'resize' | 'reposition' | 'recolor' | 'adjust-contrast' | 'remove' | 'change-font' | 'crop';

export interface RevisionAction {
  target: string;
  action: RevisionActionType;
  direction?: 'smaller' | 'larger' | 'up' | 'down' | 'left' | 'right' | 'more' | 'less';
  value?: number | string;
  reason?: string;
}

export interface StudioReviseResult {
  previewUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  critique: CritiqueResult;
  layout: LayoutSidecar;
  delta: Record<string, unknown>;
  skipped: Array<{ action: RevisionAction; reason: string }>;
  revisedConfig: Record<string, unknown>;
}

export interface StudioPreviewResult {
  previewUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  critique: CritiqueResult;
  layout?: LayoutSidecar;
  warnings: string[];
}

export interface StudioBatchVariant {
  index: number;
  previewPath: string;
  previewUrl: string;
  critiqueScore: number;
  critiqueStatus: string;
  stopRecommendation: string;
  width: number;
  height: number;
  sizeBytes: number;
  approved: boolean;
  rejected?: boolean;
  notes?: string;
  reviewedAt?: string;
  filename?: string;
  mediaId: string | null;
  draftIds: string[];
  layout?: LayoutSidecar;
}

export interface StudioReviewResult {
  reviewed: number;
  approvedCount: number;
  rejectedCount: number;
  totalApproved: number;
  totalRejected: number;
  totalPending: number;
}

export interface StudioBatchResult {
  batchId: string;
  status: 'pending' | 'rendering' | 'complete' | 'failed' | 'expired';
  count: number;
  rendered: number;
  results: StudioBatchVariant[];
  config?: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export interface StudioApproveResult {
  approved: number;
  mediaIds: string[];
  draftIds: string[];
  draftsPerVariant: number;
  message: string;
}

export interface StudioBatchSummary {
  batchId: string;
  rejectedCount: number;
  status: 'pending' | 'rendering' | 'complete' | 'failed' | 'expired';
  count: number;
  rendered: number;
  approvedCount: number;
  avgScore: number;
  createdAt: string;
  expiresAt: string;
}

export function fetchStudioBatches(): Promise<{ batches: StudioBatchSummary[] }> {
  return apiFetch<{ batches: StudioBatchSummary[] }>('/studio/batches');
}

export function fetchStudioRegistry(): Promise<StudioRegistry> {
  return apiFetch<StudioRegistry>('/studio/registry');
}

export function studioPreview(config: Record<string, unknown>): Promise<StudioPreviewResult> {
  return apiFetch<StudioPreviewResult>('/studio/preview', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

export function studioCreateBatch(
  config: Record<string, unknown>,
  options?: { count?: number; seed?: number },
): Promise<{ batchId: string; status: string; count: number; expiresAt: string }> {
  return apiFetch('/studio/batch', {
    method: 'POST',
    body: JSON.stringify({ config, options }),
  });
}

export function fetchStudioBatch(batchId: string): Promise<StudioBatchResult> {
  return apiFetch<StudioBatchResult>(`/studio/batch/${batchId}`);
}

export function studioApproveBatch(
  batchId: string,
  approved: number[],
  connectionIds?: string[],
  scheduledFor?: string,
): Promise<StudioApproveResult> {
  return apiFetch<StudioApproveResult>(`/studio/batch/${batchId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved, connectionIds, scheduledFor }),
  });
}

export function studioReviewVariant(
  batchId: string,
  reviews: Array<{ index: number; decision: 'approved' | 'rejected'; notes?: string }>,
): Promise<StudioReviewResult> {
  return apiFetch<StudioReviewResult>(`/studio/batch/${batchId}/review`, {
    method: 'POST',
    body: JSON.stringify({ reviews }),
  });
}

export function deleteStudioBatch(batchId: string) {
  return apiFetch<void>(`/studio/batch/${batchId}`, { method: 'DELETE' });
}

export interface StudioExportItem {
  variantIndex: number;
  preset: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export function studioExport(
  batchId: string,
  variantIndices: number[],
  presets: string[],
  quality?: number,
): Promise<{ total: number; exports: StudioExportItem[]; failed: number }> {
  return apiFetch('/studio/export', {
    method: 'POST',
    body: JSON.stringify({ batchId, variantIndices, presets, quality }),
  });
}

export function studioRevise(
  config: Record<string, unknown>,
  revisions: RevisionAction[],
): Promise<StudioReviseResult> {
  return apiFetch<StudioReviseResult>('/studio/revise', {
    method: 'POST',
    body: JSON.stringify({ config, revisions }),
  });
}

export function publishBulk(draftIds: string[]): Promise<{
  total: number;
  queued: number;
  skipped: number;
  errored: number;
  results: Array<{ draftId: string; status: string; jobId?: string; reason?: string }>;
}> {
  return apiFetch('/publish/bulk', {
    method: 'POST',
    body: JSON.stringify({ draftIds }),
  });
}

/* ------------------------------------------------------------------ */
/*  Engage — community commenting                                      */
/* ------------------------------------------------------------------ */

export type EngageTargetStatus = {
  isCommentable: boolean;
  reason: string | null;
  message: string | null;
};

export type EngageCommentRecord = {
  id: string;
  engagePostId: string;
  connectionId: string;
  commentText: string;
  kbSources: string[];
  slopScore: number;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionNote: string | null;
  fbCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  engagePost?: {
    fbPostId: string;
    postUrl: string | null;
    postText: string | null;
    targetStatus?: EngageTargetStatus;
    engagePage?: { name: string };
  };
};

export type EngageStats = {
  today: number;
  dailyCap: number;
  perPageCap: number;
  capMode?: 'soft' | 'hard';
  pending: number;
  totalPosted: number;
  activePages: number;
};

export type EngagePostRecord = {
  id: string;
  engagePageId: string;
  fbPostId: string;
  postUrl: string | null;
  postText: string | null;
  authorName: string | null;
  likeCount: number | null;
  commentCount: number | null;
  discoveredAt: string;
  commented: boolean;
  targetStatus?: EngageTargetStatus;
  engagePage?: { name: string; category: string };
};

export function fetchEngagePosts(commented?: boolean, limit?: number): Promise<{ posts: EngagePostRecord[] }> {
  const params = new URLSearchParams();
  if (commented !== undefined) params.set('commented', String(commented));
  if (limit) params.set('limit', String(limit));
  return apiFetch(`/engage/posts?${params}`);
}

export function fetchEngageComments(status?: string, limit?: number): Promise<{ comments: EngageCommentRecord[] }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  return apiFetch(`/engage/comments?${params}`);
}

export function fetchEngageStats(): Promise<EngageStats> {
  return apiFetch('/engage/stats');
}

export function approveEngageComment(id: string, body?: { reviewedBy?: string; editedText?: string }): Promise<{ comment: { id: string; status: string }; capGuidance?: { message: string } | null }> {
  return apiFetch(`/engage/comments/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function rejectEngageComment(id: string, body?: { reviewedBy?: string; rejectionNote?: string }): Promise<{ comment: { id: string; status: string } }> {
  return apiFetch(`/engage/comments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}
