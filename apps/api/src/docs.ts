/**
 * Docs API routes — serve markdown files from the repo for the in-UI docs dock.
 *
 * Routes:
 *   GET /docs              — List all available docs (grouped)
 *   GET /docs/:slug        — Fetch raw markdown content for one doc
 *
 * Design notes:
 * - Whitelist-based: only the docs listed in DOCS_MANIFEST are served. This
 *   prevents exposing arbitrary files from the repo even if the file path
 *   resolution has a bug.
 * - Read at request time (not at boot): doc edits are immediately visible in
 *   the UI without restarting scp-api.
 * - Auth: these routes are registered inside the authenticated surface of
 *   server.ts (same as /engage/*), so they require a valid Bearer token.
 *   The docs are NOT public — they contain operational details about the
 *   deployment that shouldn't leak.
 */

import type { FastifyInstance } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Server file lives at apps/api/src/server.ts → repo root is three levels up.
// Use import.meta.url because tsx runs this as an ES module, where
// __dirname is not defined.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

type DocEntry = {
  slug: string;       // URL-safe id (used by GET /docs/:slug)
  title: string;      // Display name
  group: string;      // Group header in the UI sidebar
  order: number;      // Display order within the group
  filePath: string;   // Absolute path to the markdown file
};

// Curated whitelist of docs to expose. Add new entries here as new docs
// are created. Files that don't exist on the current deployment are silently
// skipped in the listing.
const DOCS_MANIFEST: DocEntry[] = [
  {
    slug: 'readme',
    title: 'Overview',
    group: 'Start here',
    order: 1,
    filePath: path.join(REPO_ROOT, 'README.md'),
  },
  {
    slug: 'setup',
    title: 'Setup',
    group: 'Start here',
    order: 2,
    filePath: path.join(REPO_ROOT, 'docs', 'SETUP.md'),
  },
  {
    slug: 'provider-setup',
    title: 'Provider Setup (OAuth)',
    group: 'Start here',
    order: 3,
    filePath: path.join(REPO_ROOT, 'docs', 'Provider-Setup.md'),
  },
  {
    slug: 'operating-guide',
    title: 'Operating Guide',
    group: 'Operations',
    order: 1,
    filePath: path.join(REPO_ROOT, 'docs', 'Operating-Guide.md'),
  },
  {
    slug: 'playbook',
    title: 'Content Playbook',
    group: 'Operations',
    order: 2,
    filePath: path.join(REPO_ROOT, 'docs', 'PLAYBOOK.md'),
  },
  {
    slug: 'engage',
    title: 'Community Engage System',
    group: 'Operations',
    order: 3,
    filePath: path.join(REPO_ROOT, 'docs', 'Engage.md'),
  },
  {
    slug: 'engage-agent-playbook',
    title: 'Engage Agent Playbook',
    group: 'Operations',
    order: 4,
    filePath: path.join(REPO_ROOT, 'docs', 'Engage-Agent-Playbook.md'),
  },
  {
    slug: 'agent-integration',
    title: 'Agent Integration (API)',
    group: 'Developer',
    order: 1,
    filePath: path.join(REPO_ROOT, 'docs', 'Agent-Integration.md'),
  },
  {
    slug: 'agents',
    title: 'AI Assistant Rules',
    group: 'Developer',
    order: 2,
    filePath: path.join(REPO_ROOT, 'AGENTS.md'),
  },
  {
    slug: 'architecture',
    title: 'Architecture',
    group: 'Design',
    order: 1,
    filePath: path.join(REPO_ROOT, 'docs', 'Architecture.md'),
  },
  {
    slug: 'auth-strategy',
    title: 'Auth Strategy',
    group: 'Design',
    order: 2,
    filePath: path.join(REPO_ROOT, 'docs', 'Auth Strategy.md'),
  },
  {
    slug: 'stack-decision',
    title: 'Stack Decisions',
    group: 'Design',
    order: 3,
    filePath: path.join(REPO_ROOT, 'docs', 'Stack Decision.md'),
  },
  {
    slug: 'prd',
    title: 'Product Requirements',
    group: 'Design',
    order: 4,
    filePath: path.join(REPO_ROOT, 'docs', 'PRD.md'),
  },
  {
    slug: 'mvp-scope',
    title: 'MVP Scope',
    group: 'Design',
    order: 5,
    filePath: path.join(REPO_ROOT, 'docs', 'MVP Scope.md'),
  },
];

// Safety: strip the repo root from any error messages before returning.
function scrubPath(input: string): string {
  return input.replaceAll(REPO_ROOT, '<repo>');
}

export function registerDocsRoutes(app: FastifyInstance): void {
  app.get('/docs', async () => {
    const entries: Array<{
      slug: string;
      title: string;
      group: string;
      order: number;
      size: number;
      updatedAt: string;
    }> = [];

    for (const d of DOCS_MANIFEST) {
      try {
        const s = await stat(d.filePath);
        entries.push({
          slug: d.slug,
          title: d.title,
          group: d.group,
          order: d.order,
          size: s.size,
          updatedAt: s.mtime.toISOString(),
        });
      } catch {
        // File doesn't exist on this deployment — skip silently.
      }
    }

    // Stable sort: group by their manifest order, then by within-group order.
    const groupOrder: Record<string, number> = {};
    DOCS_MANIFEST.forEach((d, i) => {
      if (groupOrder[d.group] === undefined) groupOrder[d.group] = i;
    });
    entries.sort((a, b) => {
      const ga = groupOrder[a.group] ?? 999;
      const gb = groupOrder[b.group] ?? 999;
      if (ga !== gb) return ga - gb;
      return a.order - b.order;
    });

    return { docs: entries };
  });

  app.get<{ Params: { slug: string } }>('/docs/:slug', async (request, reply) => {
    const { slug } = request.params;
    const entry = DOCS_MANIFEST.find((d) => d.slug === slug);
    if (!entry) {
      reply.code(404);
      return { error: 'doc_not_found', slug };
    }

    try {
      const content = await readFile(entry.filePath, 'utf-8');
      const s = await stat(entry.filePath);
      return {
        slug: entry.slug,
        title: entry.title,
        group: entry.group,
        content,
        size: s.size,
        updatedAt: s.mtime.toISOString(),
      };
    } catch (e) {
      reply.code(404);
      const detail = e instanceof Error ? scrubPath(e.message) : 'unknown error';
      return { error: 'doc_not_found', slug, detail };
    }
  });
}
