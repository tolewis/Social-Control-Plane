# AGENTS.md — SCP (Social Control Plane)

**Audience:** AI coding assistants (Claude Code, Cursor, Codex CLI, or any
LLM touching this repo). Humans can read it too — the gotchas here are real.

**Scope:** everything under `/opt/scp` / `~/scp` / wherever this repo lives.

---

## What SCP is

A reliability-first social publishing control plane. Replaces fragile
UI-first tools (Postiz, etc.) with:

- **API-first, queue-first, credentials-first** design
- Strong API for agents and scripts + usable web UI
- AES-GCM encrypted provider credentials in Postgres
- Deterministic BullMQ publish queue with idempotency
- Per-connection rate limiting (processing-only, not scheduled-future)
- Auditable publish history
- Multi-provider: LinkedIn, X, Facebook, Instagram, Reddit

Not a calendar clone. The hard problems are credentialing + refresh, safe
serialized publishing, dedupe, and observability. Design for those.

See `README.md` for product thesis and `docs/PLAYBOOK.md` for content
production guidance (carousel rules, copy patterns — not runtime).

## Project structure

```
/opt/scp/
├── apps/
│   ├── api/                  ← Fastify API server (port 4001)
│   │   ├── src/server.ts     ← main entry, all HTTP routes
│   │   └── prisma/           ← schema + migrations
│   ├── web/                  ← Next.js 16 web UI (port 3000)
│   │   └── app/              ← Next.js app router
│   │       ├── _components/  ← shared React components
│   │       ├── _lib/         ← API client (api.ts)
│   │       ├── hooks/        ← useDrafts, useJobs, useConnections
│   │       ├── docs/         ← docs dock (renders docs/*.md)
│   │       └── <route>/      ← one folder per route
│   └── worker/               ← BullMQ worker (draft.publish jobs)
│       └── src/workerJobs/handlers/
├── packages/
│   ├── providers/            ← SocialConnection adapters (LinkedIn, X, FB, IG)
│   │   └── src/index.ts      ← all 4 adapters in one file (1100+ lines)
│   ├── renderer/             ← ad creative rendering (StrikeFrame primitives)
│   │   ├── src/              ← RUNTIME — imported by api + worker
│   │   └── templates/        ← reference .mjs scripts (NOT runtime, see templates/README.md)
│   └── shared/               ← cross-package types and utilities
├── scripts/                  ← standalone Python ops scripts
│   ├── engage-scraper.py     ← FB community engage scraper
│   ├── engage-reddit-scraper.py
│   └── reddit-join-subs.py
├── prisma/                   ← schema, migrations, migration_lock.toml
├── uploads/                  ← user-uploaded content (gitignored except studio/)
├── docs/                     ← all markdown docs, rendered by /docs route in UI
├── docker-compose.dev.yml    ← Postgres + Redis for local dev
├── ecosystem.config.cjs      ← PM2 definitions for api, web, worker
└── .env.example              ← required env, has descriptive comments
```

## Run targets

Three processes, all managed by PM2 in production:

| Process | Port | Script | Reloads on file change? |
|---|---|---|---|
| `scp-api` | 4001 | `apps/api/src/server.ts` (via tsx) | NO — requires `pm2 restart scp-api` |
| `scp-web` | 3000 | `apps/web/.next/standalone/apps/web/server.js` | NO — **production build**, requires `pnpm --filter @scp/web build` + `pm2 restart scp-web` |
| `scp-worker` | — | `apps/worker/src/index.ts` (via tsx) | NO — requires `pm2 restart scp-worker` |

Dev mode (`./start-dev.sh`) has hot reload via tsx watch + next dev.

---

## Hard rules for AI assistants

### DO NOT

1. **Do NOT restart the gateway, any PM2 process, or docker services
   without explicit user approval.** Restarting kills in-flight publishes,
   cancels BullMQ jobs, and produces user-visible downtime. When in doubt,
   ask.

2. **Do NOT delete `prisma/dev.db`** — it's a legacy 0-byte SQLite stub
   but removing it can confuse Prisma. The real DB is in Docker postgres.

3. **Do NOT touch `uploads/`** — these are user-uploaded media files
   (referenced by drafts). Deleting files will break live posts that
   reference them.

4. **Do NOT `git reset --hard`, `git checkout .`, or `git clean -f`** on
   this repo without first running `git stash` to preserve uncommitted
   state. Several bugs have been caused by AI assistants nuking in-flight
   work that looked like WIP.

5. **Do NOT commit with `--no-verify`** or bypass any hooks. If a hook
   fails, fix the underlying problem.

6. **Do NOT add new dependencies without weighing cost.** `pnpm add`
   rebuilds the workspace lockfile and can cascade. If a 100-line inline
   helper solves it, prefer that over a new package.

7. **Do NOT use the web UI for things the API can do better.** Browser
   automation in SCP is fallback-only (mostly Reddit, where there's no
   API path). Anything touchable via HTTP should go via HTTP.

8. **Do NOT call `POST /publish` without `{immediate: true}` if you
   want a post to go out now.** Without the flag, the endpoint honors
   any existing `scheduledFor` on the draft — which means a draft
   scheduled for next Thursday will enqueue with a 6-day BullMQ delay.
   See `docs/Operating-Guide.md` § "Publish semantics".

9. **Do NOT assume `pm2 restart scp-api` cascades to `scp-worker`.** It
   does not. Any change to `packages/providers/` or other workspace
   code imported by both services requires restarting both explicitly.
   This caught us on 2026-04-13 — the worker held stale X-upload code
   for 7 minutes while publishes failed against it.

10. **Do NOT paste secrets into commit messages or logs.** Use environment
    variables. The `.env` file is gitignored; `.env.example` is the
    committed template.

### DO

1. **DO commit and push often** to `main`, per the GitHub Ownership rule
   in each agent's `AGENTS.md`. Small verified increments with clear
   commit messages. SCP is default repo-worthy.

2. **DO use `git stash` before risky operations.** Stash with a clear
   message including date and reason for later recovery.

3. **DO rebuild the web app after any `apps/web/**` change** before
   restarting scp-web. `pnpm --filter @scp/web build`. Otherwise you're
   serving stale compiled CSS/JS from the `.next/standalone/` build.

4. **DO check both `scp-api` and `scp-worker` logs** when debugging
   publish failures. The API handles rate limiting and job creation;
   the worker does the actual HTTP calls to providers. Errors can be
   in either.

5. **DO use `curl` or `httpie` against the API for ground-truth state**
   rather than assuming what the UI shows. The UI has its own refetch
   latency; `GET /engage/stats`, `/jobs`, `/drafts` are authoritative.

6. **DO run `pnpm --filter @scp/providers exec tsc --noEmit`** (or
   equivalent typecheck) after changes to shared packages before
   committing. TypeScript catches things at build time that are painful
   to catch at runtime.

7. **DO check PostgreSQL via `docker exec socialcontrolplane-postgres-1
   psql "$DATABASE_URL" -c "..."`** for direct DB access. Credentials
   live in `/opt/scp/.env` under `DATABASE_URL`.

8. **DO preserve `scheduledFor` behavior on drafts** when implementing
   new publish paths. The semantics are: `scheduledFor` + `status=queued`
   means "waiting for its time"; `scheduledFor=null` + `status=queued`
   means "publish immediately on next worker pickup"; `status=published`
   is terminal and should not be mutated.

9. **DO follow the existing commit message style** — first line is a
   short imperative, then a blank line, then structured paragraphs
   explaining what and why. See recent commits via `git log --oneline`.

10. **DO update the docs when you change behavior.** The `/docs` route
    in the web UI reads from `docs/*.md` at runtime — doc changes show
    up immediately without a rebuild. Keep `docs/Operating-Guide.md`
    and `docs/Agent-Integration.md` in sync with API changes.

---

## Tonight's lessons (2026-04-13)

These were learned the hard way. Don't relearn them:

1. **`pm2 restart scp-api` does NOT cascade to `scp-worker`.** After
   changing `packages/providers/src/index.ts` (X upload fix), only the
   API got the new code. The worker ran the old version for 7 minutes
   and all publishes failed against it. Always restart both explicitly
   when shared code changes.

2. **Next.js production-mode CSS is bundled at build time.** Editing
   `globals.css` and restarting `scp-web` does nothing — the bundled
   CSS hash hasn't changed. Must `pnpm --filter @scp/web build` between
   edit and restart. Hard-refresh browsers after.

3. **`/publish` without `immediate: true` honors `scheduledFor`.** This
   is intentional so the endpoint serves both "publish now" and
   "enqueue with existing schedule" patterns. The queue page's
   "Publish Now" button always sends `immediate: true`. Your scripts
   should too unless you explicitly want delayed publish.

4. **`position: sticky` + ancestor `overflow-x: hidden` is a mobile
   footgun.** `hidden` promotes the element to an implicit scroll
   containing block, trapping sticky descendants on mobile. Use
   `overflow-x: clip` instead.

5. **X API migrated media upload in 2025.** Single-endpoint
   `command=INIT/APPEND/FINALIZE` is removed. Images: one-shot
   multipart to `/2/media/upload` with `media` + `media_category=tweet_image`.
   Video/chunked: dedicated endpoints `/2/media/upload/initialize`,
   `/{media_id}/append`, `/{media_id}/finalize`. `packages/providers/
   src/index.ts` has the image path fixed; video still uses the broken
   legacy flow and is flagged with a warning comment.

6. **`overflow-x: clip` has `Safari 16+` floor.** iOS Safari below 16
   falls back to `visible`. If old-iOS support matters, fall back to
   `position: fixed` on mobile with top padding on `.page`.

7. **BullMQ delayed-set job IDs need BOTH `ZREM bull:scp-jobs:delayed
   <jobId>` AND `DEL bull:scp-jobs:<jobId>`** when force-clearing stuck
   jobs. The sorted-set entry schedules; the hash holds the data.
   Dropping one without the other leaves orphaned state.

---

## Quick commands

```bash
# Process control
pm2 status
pm2 restart scp-api scp-worker scp-web
pm2 logs scp-api --lines 40
pm2 logs scp-worker --err --lines 40

# Rebuild web after UI change
pnpm --filter @scp/web build && pm2 restart scp-web

# Direct DB access
DATABASE_URL=$(grep ^DATABASE_URL= .env | cut -d= -f2- | tr -d '"')
docker exec socialcontrolplane-postgres-1 psql "$DATABASE_URL" -c "SELECT ..."

# BullMQ state
docker exec socialcontrolplane-redis-1 redis-cli ZCARD bull:scp-jobs:delayed
docker exec socialcontrolplane-redis-1 redis-cli LLEN bull:scp-jobs:wait

# Typecheck (scoped to a package)
pnpm --filter @scp/providers exec tsc --noEmit

# Full rebuild + restart of everything
pnpm --filter @scp/web build && pm2 restart scp-api scp-worker scp-web
```

## When in doubt

- Check `docs/Operating-Guide.md` for known failure modes
- Check `docs/Agent-Integration.md` for API semantics
- Check recent commits for similar changes
- If you're about to do something destructive or with wide blast radius,
  ask the user first
- If you must guess, guess conservatively and document the guess
