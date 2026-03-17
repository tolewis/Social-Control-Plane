/**
 * API client for Social Control Plane Fastify backend.
 *
 * Base URL reads from NEXT_PUBLIC_API_URL env var; defaults to http://localhost:4001.
 * All functions throw on non-2xx responses.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';

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
  createdAt: string;
  updatedAt: string;
}

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
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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
  return apiFetch<{ persistence: string; connections: ConnectionRecord[] }>('/connections');
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
  return apiFetch<{ persistence: string; drafts: DraftRecord[] }>('/drafts');
}

export function fetchDraft(id: string) {
  return apiFetch<DraftRecord>(`/drafts/${id}`);
}

export function createDraft(data: {
  connectionId: string;
  publishMode: PublishMode;
  content: string;
  scheduledFor?: string;
}) {
  return apiFetch<{ draft: DraftRecord }>('/drafts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateDraft(id: string, data: Partial<Pick<DraftRecord, 'content' | 'scheduledFor' | 'publishMode'>>) {
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
  return apiFetch<{ persistence: string; jobs: PublishJobRecord[] }>('/jobs');
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
