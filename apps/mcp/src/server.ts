#!/usr/bin/env tsx
/**
 * Social Control Plane — MCP Server (stdio).
 *
 * Wraps the SCP HTTP API as MCP tools so AI agents (Claude Desktop,
 * Claude Code, etc.) can draft, schedule, publish, and inspect
 * social posts without speaking raw HTTP.
 *
 * Config via environment:
 *   SCP_API_URL   base URL of the SCP API (e.g. http://localhost:4001)
 *   SCP_API_KEY   API key from SCP /settings → API Keys (scp_...)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadConfigFromEnv, ScpApiError, ScpClient } from './client.js';
import { registerTools } from './tools.js';

async function main() {
  const config = loadConfigFromEnv();
  const client = new ScpClient(config);

  const server = new McpServer({
    name: 'scp-mcp',
    version: '0.1.0',
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // MCP stdio runs until the parent process closes stdin. Nothing else to do.
}

main().catch((err) => {
  // Any crash here happens before we're connected to a client, so log to
  // stderr (stdout is reserved for the MCP protocol).
  const detail =
    err instanceof ScpApiError
      ? `${err.message}\n${JSON.stringify(err.body, null, 2)}`
      : err instanceof Error
        ? err.stack ?? err.message
        : String(err);
  process.stderr.write(`[scp-mcp] fatal: ${detail}\n`);
  process.exit(1);
});

// Re-export zod so tool modules share the same instance.
export { z };
