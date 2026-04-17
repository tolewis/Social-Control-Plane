# MCP Server

Social Control Plane ships an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server so AI agents — Claude Desktop, Claude Code, or any MCP-aware client — can drive the platform through structured tools instead of raw HTTP.

The server lives at `apps/mcp` and is a thin wrapper over the existing SCP HTTP API. No new business logic: every tool call becomes one HTTP request authenticated with an SCP API key.

## Prerequisites

1. A running SCP API (local `http://localhost:4001` or the deployed `https://social.teamlewis.co/backend`).
2. An SCP API key. Create one in the web UI at **Settings → API Keys**. It starts with `scp_`.
3. Node 20+ and `pnpm` (already required for the rest of the monorepo).

## Environment

The server reads two variables:

| Variable | Required | Example |
|---|---|---|
| `SCP_API_URL` | yes | `http://localhost:4001` |
| `SCP_API_KEY` | yes | `scp_…` |

## Running locally

```bash
pnpm --filter @scp/mcp start
```

The process speaks the MCP protocol on **stdio**, so it has no visible output when healthy — it waits for a client to connect.

## Using with Claude Desktop

Add an entry to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scp": {
      "command": "pnpm",
      "args": ["--silent", "--filter", "@scp/mcp", "start"],
      "cwd": "/absolute/path/to/Social-Control-Plane",
      "env": {
        "SCP_API_URL": "http://localhost:4001",
        "SCP_API_KEY": "scp_replace_me"
      }
    }
  }
}
```

Restart Claude Desktop. The tools below appear in the tool picker.

## Using with Claude Code

From the project root:

```bash
claude mcp add scp \
  --env SCP_API_URL=http://localhost:4001 \
  --env SCP_API_KEY=scp_replace_me \
  -- pnpm --silent --filter @scp/mcp start
```

## Tool reference

All tools return JSON (stringified). Arguments are validated with Zod before the HTTP call.

### Health & status
- `get_health` — ping the API.
- `get_providers_status` — per-provider credential + connection counts.

### Connections
- `list_connections`
- `get_connection` — `id`
- `refresh_connection` — `id`

### Drafts
- `list_drafts` — `page?`, `pageSize?`, `status?`, `connectionId?`
- `get_draft` — `id`
- `create_draft` — `connectionId`, `content`, `publishMode?` (default `draft-agent`), `title?`, `mediaIds?`, `scheduledFor?`
- `update_draft` — `id`, `content?`, `title?`, `mediaIds?`, `scheduledFor?`, `publishMode?`
- `delete_draft` — `id`
- `reschedule_draft` — `id`, `scheduledFor`
- `back_to_draft` — `id`
- `bulk_create_drafts` — `drafts[]` (up to 500)

### Publishing
- `publish_draft` — `draftId`, `immediate?`, `idempotencyKey?`
- `bulk_publish` — `draftIds[]` (up to 200)

### Jobs & audit
- `list_jobs` — `page?`, `pageSize?`, `status?`, `connectionId?`
- `retry_job` — `jobId`
- `get_audit_log` — `page?`, `pageSize?`, `entityType?`, `entityId?`

### Media
- `list_media`
- `get_media` — `id`

*Note:* media uploads are multipart and are not exposed through MCP. Upload via the web UI (or `POST /media/upload` directly) and reference the returned `id` in `create_draft`.

### Quality
- `check_slop` — `text` (rule-based AI-writing detector)

### Engage (community commenting)
- `list_engage_pages`
- `list_engage_posts` — `platform?`, `status?`, `page?`, `pageSize?`
- `list_engage_comments` — `status?`, `page?`, `pageSize?`
- `get_engage_stats`

### Studio (creative batches)
- `list_studio_batches`
- `get_studio_batch` — `batchId`

## Design notes

- **Wraps HTTP, doesn't bypass it.** The MCP server reuses the same auth, rate-limiting, audit log, and BullMQ queue as any other client. No direct Prisma access.
- **Stdio transport.** One MCP server per client session. Multiple agents can run in parallel; each holds its own HTTP client.
- **No destructive defaults.** `publish_draft` does not set `immediate: true` by default — scheduled posts still respect `scheduledFor`.
- **Idempotency.** `publish_draft` accepts an `idempotencyKey`; pass one from the agent to get safe retries.
