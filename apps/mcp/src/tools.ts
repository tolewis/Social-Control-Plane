/**
 * MCP tool definitions for the SCP API.
 *
 * Every tool is a thin wrapper over an HTTP endpoint. Input schemas mirror
 * the Zod schemas on the API side; output is the raw JSON response serialized
 * as text (standard MCP result shape).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PROVIDERS } from '@scp/shared';

import { ScpApiError, type ScpClient } from './client.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  const message =
    err instanceof ScpApiError
      ? `${err.message}\n${JSON.stringify(err.body, null, 2)}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

const publishModeSchema = z.enum(['draft-human', 'draft-agent', 'direct-human', 'direct-agent']);
const draftStatusSchema = z.enum(['draft', 'queued', 'published', 'failed']);
const jobStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'RECONCILING',
  'CANCELED',
]);

const providerSchema = z.enum(PROVIDERS);

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of entries) usp.set(k, String(v));
  return `?${usp.toString()}`;
}

export function registerTools(server: McpServer, client: ScpClient): void {
  // ─── Health & provider status ──────────────────────────────────────────────
  server.registerTool(
    'get_health',
    {
      title: 'Health check',
      description: 'Ping the SCP API and confirm the MCP server can reach it with the configured key.',
      inputSchema: {},
    },
    async () => run(() => client.get('/health')),
  );

  server.registerTool(
    'get_providers_status',
    {
      title: 'Provider credential status',
      description:
        'Report which providers (LinkedIn, Facebook, Instagram, X) have OAuth credentials configured and how many connections each has.',
      inputSchema: {},
    },
    async () => run(() => client.get('/providers/status')),
  );

  // ─── Connections ───────────────────────────────────────────────────────────
  server.registerTool(
    'list_connections',
    {
      title: 'List social connections',
      description: 'List every connected social account (provider, display name, status, scopes).',
      inputSchema: {},
    },
    async () => run(() => client.get('/connections')),
  );

  server.registerTool(
    'get_connection',
    {
      title: 'Get connection by id',
      description: 'Fetch a single social connection by id.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => run(() => client.get(`/connections/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'refresh_connection',
    {
      title: 'Refresh connection tokens',
      description: 'Force an OAuth token refresh for one connection. Useful when publish jobs start 401-ing.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      run(() => client.post(`/connections/${encodeURIComponent(id)}/refresh`, {})),
  );

  // ─── Drafts ────────────────────────────────────────────────────────────────
  server.registerTool(
    'list_drafts',
    {
      title: 'List drafts',
      description:
        'List drafts with optional filters. Pagination is server-side; default page size matches the SCP API.',
      inputSchema: {
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
        status: draftStatusSchema.optional(),
        connectionId: z.string().optional(),
      },
    },
    async (args) => run(() => client.get(`/drafts${qs(args)}`)),
  );

  server.registerTool(
    'get_draft',
    {
      title: 'Get draft',
      description: 'Fetch a single draft including content, media ids, schedule, status, and slop score.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => run(() => client.get(`/drafts/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_draft',
    {
      title: 'Create draft',
      description:
        'Create a new draft. Use publishMode "draft-agent" for agent-authored posts awaiting human review, ' +
        '"direct-agent" for agent-authored posts that should skip the review step.',
      inputSchema: {
        connectionId: z.string().min(1),
        content: z.string().min(1),
        publishMode: publishModeSchema.default('draft-agent'),
        title: z.string().optional(),
        mediaIds: z.array(z.string()).optional(),
        scheduledFor: z.string().datetime().optional(),
      },
    },
    async (args) => run(() => client.post('/drafts', args)),
  );

  server.registerTool(
    'update_draft',
    {
      title: 'Update draft',
      description:
        'Edit a draft. Editing content or media on a queued/failed post cancels the pending job and resets ' +
        'status to draft so it can be re-reviewed. Published posts cannot be edited.',
      inputSchema: {
        id: z.string().min(1),
        content: z.string().min(1).optional(),
        title: z.string().optional(),
        mediaIds: z.array(z.string()).optional(),
        scheduledFor: z.string().datetime().nullable().optional(),
        publishMode: publishModeSchema.optional(),
      },
    },
    async ({ id, ...body }) =>
      run(() => client.put(`/drafts/${encodeURIComponent(id)}`, body)),
  );

  server.registerTool(
    'delete_draft',
    {
      title: 'Delete draft',
      description: 'Hard-delete a draft. Cannot be undone.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => run(() => client.delete(`/drafts/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'reschedule_draft',
    {
      title: 'Reschedule draft',
      description:
        'Change the scheduledFor time for a draft. If a BullMQ job is already pending, it is replaced with ' +
        'the new delay so the post fires at the new time.',
      inputSchema: {
        id: z.string().min(1),
        scheduledFor: z.string().datetime(),
      },
    },
    async ({ id, scheduledFor }) =>
      run(() =>
        client.post(`/drafts/${encodeURIComponent(id)}/reschedule`, { scheduledFor }),
      ),
  );

  server.registerTool(
    'back_to_draft',
    {
      title: 'Revert queued post to draft',
      description: 'Cancel a queued publish and move the draft back to draft status for further editing.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      run(() => client.post(`/drafts/${encodeURIComponent(id)}/back-to-draft`, {})),
  );

  server.registerTool(
    'bulk_create_drafts',
    {
      title: 'Bulk create drafts',
      description:
        'Create up to 500 drafts in one call. Designed for agent workflows that generate a batch of posts.',
      inputSchema: {
        drafts: z
          .array(
            z.object({
              connectionId: z.string().min(1),
              content: z.string().min(1),
              publishMode: publishModeSchema.optional(),
              title: z.string().optional(),
              mediaIds: z.array(z.string()).optional(),
              scheduledFor: z.string().datetime().optional(),
            }),
          )
          .min(1)
          .max(500),
      },
    },
    async (args) => run(() => client.post('/drafts/bulk', args)),
  );

  // ─── Publishing ────────────────────────────────────────────────────────────
  server.registerTool(
    'publish_draft',
    {
      title: 'Publish a draft',
      description:
        'Queue one draft for publishing. If the draft has scheduledFor in the future, the job is delayed to ' +
        'that time unless immediate is true.',
      inputSchema: {
        draftId: z.string().min(1),
        immediate: z.boolean().optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    async ({ draftId, ...body }) =>
      run(() => client.post(`/publish/${encodeURIComponent(draftId)}`, body)),
  );

  server.registerTool(
    'bulk_publish',
    {
      title: 'Bulk publish drafts',
      description: 'Queue up to 200 drafts for publishing. Returns per-draft status (queued / skipped / error).',
      inputSchema: {
        draftIds: z.array(z.string().min(1)).min(1).max(200),
      },
    },
    async (args) => run(() => client.post('/publish/bulk', args)),
  );

  // ─── Jobs & audit ──────────────────────────────────────────────────────────
  server.registerTool(
    'list_jobs',
    {
      title: 'List publish jobs',
      description: 'List publish jobs with optional filtering by status and connection.',
      inputSchema: {
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
        status: jobStatusSchema.optional(),
        connectionId: z.string().optional(),
      },
    },
    async (args) => run(() => client.get(`/jobs${qs(args)}`)),
  );

  server.registerTool(
    'retry_job',
    {
      title: 'Retry a failed job',
      description: 'Re-execute a publish job that previously failed. Creates a new attempt.',
      inputSchema: { jobId: z.string().min(1) },
    },
    async ({ jobId }) =>
      run(() => client.post(`/jobs/${encodeURIComponent(jobId)}/execute`, {})),
  );

  server.registerTool(
    'get_audit_log',
    {
      title: 'Read audit log',
      description: 'Fetch recent audit events. Filter by entity type and/or id to trace a specific object.',
      inputSchema: {
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(500).optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      },
    },
    async (args) => run(() => client.get(`/audit${qs(args)}`)),
  );

  // ─── Media ─────────────────────────────────────────────────────────────────
  server.registerTool(
    'list_media',
    {
      title: 'List media assets',
      description: 'List uploaded media (id, mime type, dimensions, size, alt).',
      inputSchema: {},
    },
    async () => run(() => client.get('/media')),
  );

  server.registerTool(
    'get_media',
    {
      title: 'Get media by id',
      description: 'Fetch one media asset.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => run(() => client.get(`/media/${encodeURIComponent(id)}`)),
  );

  // Note: upload_media intentionally omitted — media upload is multipart/form-data
  // and happens best through the web UI or a direct HTTP call. Agents should
  // reference already-uploaded media by id.

  // ─── Quality ───────────────────────────────────────────────────────────────
  server.registerTool(
    'check_slop',
    {
      title: 'Check AI-slop score for text',
      description:
        'Rule-based detector that flags AI-writing tells (em dashes, throat-clearing openers, binary ' +
        'contrasts, business jargon, etc). Returns a 0–100 score, a 0–10 rating, and grouped matches.',
      inputSchema: { text: z.string().min(1) },
    },
    async (args) => run(() => client.post('/slop/check', args)),
  );

  // ─── Engage (community commenting) ─────────────────────────────────────────
  server.registerTool(
    'list_engage_pages',
    {
      title: 'List engage target pages',
      description: 'List community pages (Facebook pages or Reddit subreddits) registered as engage targets.',
      inputSchema: {},
    },
    async () => run(() => client.get('/engage/pages')),
  );

  server.registerTool(
    'list_engage_posts',
    {
      title: 'List discovered engage posts',
      description: 'List posts discovered on engage target pages. Supports status and platform filters.',
      inputSchema: {
        platform: providerSchema.optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => run(() => client.get(`/engage/posts${qs(args)}`)),
  );

  server.registerTool(
    'list_engage_comments',
    {
      title: 'List engage comment drafts',
      description: 'List drafted / approved / posted comments. Filter by status to see only pending approvals.',
      inputSchema: {
        status: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => run(() => client.get(`/engage/comments${qs(args)}`)),
  );

  server.registerTool(
    'get_engage_stats',
    {
      title: 'Engage platform stats',
      description: 'Aggregate counters across engage platforms (comments drafted, approved, posted, rejected).',
      inputSchema: {},
    },
    async () => run(() => client.get('/engage/stats')),
  );

  // ─── Studio (creative batches) ─────────────────────────────────────────────
  server.registerTool(
    'list_studio_batches',
    {
      title: 'List studio batches',
      description: 'List creative render batches (StrikeFrame) with status and counts.',
      inputSchema: {},
    },
    async () => run(() => client.get('/studio/batches')),
  );

  server.registerTool(
    'get_studio_batch',
    {
      title: 'Get studio batch',
      description: 'Fetch one studio batch including each rendered variant and its review state.',
      inputSchema: { batchId: z.string().min(1) },
    },
    async ({ batchId }) =>
      run(() => client.get(`/studio/batch/${encodeURIComponent(batchId)}`)),
  );
}
