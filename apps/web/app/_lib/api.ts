/**
 * API client for Social Plane Fastify backend.
 *
 * Base URL reads from NEXT_PUBLIC_API_URL env var; defaults to http://localhost:4001.
 * All functions throw on non-2xx responses.
 */

const API_PORT = '4001';

function base(): string {
  return `http://${document.location.hostname}:${API_PORT}`;
}

/* ------------------------------------------------------------------ */
/*  Types — mirrors @scp/shared where possible                        */
/* ------------------------------------------------------------------ */

export type ProviderId = 'linkedin' | 'facebook' | 'instagram' | 'x';
export type PublishMode = 'draft' | 'direct';
export type DraftStatus = 'draft' | 'queued' | 'published' | 'failed';
export type ConnectionStatus = 'pending' | 'connected' | 'revoked' | 'error';
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
  const res = await fetch(url, {
    ...init,
    headers,
  });

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
/*  Media                                                              */
/* ------------------------------------------------------------------ */

export async function uploadMedia(file: File): Promise<{ media: MediaRecord }> {
  const form = new FormData();
  form.append('file', file);

  const url = `${base()}/media/upload`;
  const res = await fetch(url, { method: 'POST', body: form });

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
