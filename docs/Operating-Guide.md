# Operating Guide

**Audience:** humans and agents operating a live SCP deployment. You've
got it running, providers connected, and now you need to keep it running
and debug things when they break.

**Complementary docs:**
- `docs/SETUP.md` — first-time install
- `docs/Provider-Setup.md` — OAuth app creation per provider
- `docs/Agent-Integration.md` — API cookbook for scripts/bots
- `AGENTS.md` (repo root) — AI assistant rules and gotcha log

---

## Process model

SCP runs three Node processes + two Docker containers:

| Process | Role | Default port | Restart on change? |
|---|---|---|---|
| `scp-api` | Fastify API — drafts, jobs, providers, publish | 4001 | Manual |
| `scp-web` | Next.js 16 UI — browser-facing | 3000 | Manual, **rebuild required** |
| `scp-worker` | BullMQ worker — runs publish jobs | — | Manual |
| Postgres (docker) | DB — drafts, jobs, connections, audit, etc. | 5432 | — |
| Redis (docker) | BullMQ backing store | 6379 | — |

All three Node processes are managed by **PM2** in the production setup.
The ecosystem file is at `ecosystem.config.cjs`.

## PM2 command cheat sheet

```bash
# Status of all SCP processes
pm2 status

# Full details on one process
pm2 show scp-api

# Logs for one process
pm2 logs scp-api            # follow
pm2 logs scp-api --lines 60 --nostream       # last 60 lines, don't follow
pm2 logs scp-api --err --lines 30 --nostream # stderr only
pm2 logs scp-worker --out --lines 30 --nostream # stdout only

# Restart
pm2 restart scp-api
pm2 restart scp-api scp-worker scp-web       # multiple
pm2 restart all                              # ALL pm2 processes (careful if you run non-SCP stuff too)

# Stop (without deleting)
pm2 stop scp-worker

# Startup on boot
pm2 save            # snapshot current process list
pm2 startup         # emit the command to install the systemd unit
```

PM2 log files live at `~/.pm2/logs/scp-<name>-{out,error}.log`. They
rotate automatically but can grow large under heavy load — clean with
`pm2 flush` if you need to reset.

---

## Critical gotchas (learned the hard way)

### 1. PM2 does NOT cascade restarts

`pm2 restart scp-api` only restarts the API. If you edited anything in
`packages/providers/`, `packages/shared/`, or `packages/renderer/src/`,
the worker is still running the old compiled-in-memory version. **You
must `pm2 restart scp-worker` separately.**

**Symptom**: changes that should be live aren't. API logs show new
code; worker logs show old behavior. Common for provider bug fixes.

**Fix**: always restart both when shared workspace code changes:

```bash
pm2 restart scp-api scp-worker
```

### 2. Next.js web runs in production mode

`scp-web` is running `.next/standalone/apps/web/server.js`, a
pre-built artifact. Editing `.tsx` or `.css` files and restarting
`scp-web` does nothing — the built bundle hasn't changed.

**Fix**: rebuild before restart:

```bash
pnpm --filter @scp/web build
pm2 restart scp-web
```

Hard-refresh browsers after — the CSS bundle filename is hashed and
changes on each build, so cached HTML pointing at the old hash will
404 on the stylesheet. Usually a normal reload picks up the new HTML;
sometimes iOS Safari holds on and needs pull-to-refresh + wait.

### 3. `/publish` semantics: delay vs immediate

The `/publish/:draftId` endpoint has **two modes**, controlled by a
request body flag:

| Mode | Body | Behavior |
|---|---|---|
| **Immediate** | `{immediate: true}` | Cleans up any stale jobs for this draft, clears `scheduledFor`, enqueues with BullMQ `delay=0`. Worker picks up immediately. |
| **Scheduled (default)** | `{}` or `{immediate: false}` | Honors existing `draft.scheduledFor`. If the draft is scheduled for the future, the BullMQ job is enqueued with a delay. If no `scheduledFor`, immediate. |

The web UI's **Publish Now** button always sends `immediate: true`.
Agent scripts using the API must do the same if they want immediate
publish — otherwise they'll hit the "stuck in queued" bug.

### 4. BullMQ delayed-set cleanup needs TWO deletions

When force-clearing a stuck delayed job, both of these must happen:

```bash
# Remove from the sorted set that schedules delayed jobs
docker exec socialcontrolplane-redis-1 redis-cli \
  ZREM bull:scp-jobs:delayed <jobId>

# Delete the job hash that holds the data
docker exec socialcontrolplane-redis-1 redis-cli \
  DEL bull:scp-jobs:<jobId>
```

Also update the Postgres `PublishJob` row:

```sql
UPDATE "PublishJob" SET status='CANCELED', "updatedAt"=NOW()
WHERE id='<jobId>';
```

Doing only one leaves orphaned state. The worker uses BullMQ as source
of truth for "what's next to run" but the API uses Postgres `PublishJob`
for "what's the current state" — both must agree.

### 5. X API media upload migrated in 2025

`command=INIT/APPEND/FINALIZE` on `POST /2/media/upload` is deprecated
and removed. Images use one-shot multipart with `media` and
`media_category=tweet_image`. Video/GIF use dedicated chunked endpoints
(`/2/media/upload/initialize`, `/{media_id}/append`, `/{media_id}/finalize`).

SCP's `uploadImageMedia()` handles images correctly.
`uploadLegacyMedia()` for video still uses the broken flow and will
fail — flagged with a warning comment in `packages/providers/src/index.ts`.

### 6. `overflow-x: hidden` on a parent breaks `position: sticky` children

Known CSS trap. `overflow-x: hidden` promotes the element to an
implicit scroll containing block for both axes, which traps sticky
descendants. Use `overflow-x: clip` instead — it clips without creating
a scroll container. Safari 16+ / Chrome 90+ / Firefox 81+.

---

## Common failure modes

### "Nothing is publishing" → check the worker

First move: `pm2 status scp-worker`. If it's stopped or errored, restart:

```bash
pm2 restart scp-worker
pm2 logs scp-worker --lines 40 --nostream
```

Look for:
- `worker.ready` — the worker is up and listening
- `job.active` / `draft.publish.start` — a job is being processed
- `draft.publish.http_error` — the provider rejected the post (this is
  usually actionable; the error body is included)
- `draft.publish.succeeded` — successful publish

If the worker is up but nothing moves, check BullMQ state:

```bash
docker exec socialcontrolplane-redis-1 redis-cli LLEN bull:scp-jobs:wait
docker exec socialcontrolplane-redis-1 redis-cli LLEN bull:scp-jobs:active
docker exec socialcontrolplane-redis-1 redis-cli ZCARD bull:scp-jobs:delayed
```

`wait > 0` means jobs are queued but the worker isn't pulling them.
That's usually a concurrency/stall issue — restart the worker.

`delayed > 0` with nothing in `wait` or `active` means all jobs are
scheduled for the future. Check their scheduled timestamps.

### "Publish returns 429 rate_limited"

```json
{
  "error": "rate_limited",
  "message": "A job is actively publishing on this connection. Wait for it to complete.",
  "activeJobId": "cmn..."
}
```

Means another job is currently `PROCESSING` on the same connection.
Normal transient state when two publishes fire rapid-fire. Wait 5–10
seconds and retry.

If it's persistent (the same `activeJobId` for minutes), the worker
probably crashed mid-job and didn't mark the job as failed. Manual
cleanup:

```bash
DATABASE_URL=$(grep ^DATABASE_URL= /opt/scp/.env | cut -d= -f2- | tr -d '"')
docker exec socialcontrolplane-postgres-1 psql "$DATABASE_URL" -c \
  "UPDATE \"PublishJob\" SET status='FAILED', \"errorMessage\"='stuck PROCESSING cleanup', \"updatedAt\"=NOW() WHERE id='<activeJobId>';"
```

Then investigate the worker for why it crashed.

### "Publish returns 429 queue_depth_exceeded"

```json
{
  "error": "queue_depth_exceeded",
  "message": "200 pending jobs on this connection. Max 200. Wait for some to complete.",
  "pendingCount": 200
}
```

Runaway agent flooded the queue. Protective limit. Resolution:

1. Figure out which agent/script is flooding:
   ```sql
   SELECT "connectionId", COUNT(*) FROM "PublishJob"
   WHERE status='PENDING' GROUP BY "connectionId" ORDER BY 2 DESC;
   ```
2. Stop the runaway source.
3. Let the queue drain, or force-clear PENDING jobs that aren't legitimate:
   ```sql
   UPDATE "PublishJob" SET status='CANCELED', "errorMessage"='queue flood cleanup'
   WHERE "connectionId"='<id>' AND status='PENDING';
   ```
   Plus the BullMQ cleanup from gotcha #4 above.

### "Publish says SUCCEEDED but queue page shows queued"

Frontend refetch lag OR you're on an old build. Hard-refresh the browser
once. If it persists, check:

```bash
DATABASE_URL=$(grep ^DATABASE_URL= /opt/scp/.env | cut -d= -f2- | tr -d '"')
docker exec socialcontrolplane-postgres-1 psql "$DATABASE_URL" -c \
  "SELECT id, status FROM \"Draft\" WHERE id='<draftId>';"
```

If the DB shows `published` but the UI shows `queued`, you're running
stale JS. Rebuild web + restart + hard-refresh.

### Provider OAuth expired

Connections page shows a yellow or red health indicator. Click **Refresh**
on the affected connection. If that fails, re-authorize via the full
OAuth flow (click **Connect** again).

LinkedIn tokens: 60 days.
X tokens: 2 hours (auto-refreshed via `offline.access` scope).
Meta Page tokens: don't expire if the underlying user token is valid.
Reddit script app: never expires (username/password auth).

### FB engage cron silently not posting

Check:
```bash
systemctl --user status captain-bill-fb-engage.timer
systemctl --user list-timers captain-bill-fb-engage.timer --no-pager
journalctl --user -u captain-bill-fb-engage.service --since "2h ago" --no-pager | tail -40
```

Expected: each scheduled run enters the service, scrapes (~1–3 min),
runs the review runner, posts digest to Discord. If the digest isn't
landing in Discord, check:

1. `DISCORD_BOT_TOKEN` set in `.env`?
2. Daily cap hit? `GET /engage/stats` → if `today >= dailyCap` and
   `capMode=hard`, the runner early-exits silently.
3. Scraper timeout? Old bug: 180s cap killed 100-page scrapes. Current
   default is 1800s via `SCRAPER_TIMEOUT_SECONDS` env.

---

## Daily operations

### Check overall health

```bash
# All processes
pm2 status

# DB reachable
DATABASE_URL=$(grep ^DATABASE_URL= /opt/scp/.env | cut -d= -f2- | tr -d '"')
docker exec socialcontrolplane-postgres-1 psql "$DATABASE_URL" -c "SELECT 1"

# Redis reachable
docker exec socialcontrolplane-redis-1 redis-cli PING

# API responding
curl -s http://localhost:4001/health | head
```

### Check recent publish activity

```sql
SELECT id, "draftId", status, "createdAt"
FROM "PublishJob"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC
LIMIT 20;
```

### Check for stuck jobs

```sql
-- PROCESSING older than 5 minutes = probably stuck
SELECT id, "draftId", "connectionId", "updatedAt"
FROM "PublishJob"
WHERE status='PROCESSING' AND "updatedAt" < NOW() - INTERVAL '5 minutes';
```

### Backup the database

```bash
DATABASE_URL=$(grep ^DATABASE_URL= /opt/scp/.env | cut -d= -f2- | tr -d '"')
BACKUP=~/scp-backup-$(date +%Y%m%d-%H%M%S).sql
docker exec socialcontrolplane-postgres-1 pg_dump "$DATABASE_URL" > "$BACKUP"
gzip "$BACKUP"
```

Store backups offsite. The `uploads/` directory also needs backing up
separately — media files referenced by drafts live there.

### Restore the database

```bash
BACKUP=~/scp-backup-20260413-143022.sql.gz
gunzip -c "$BACKUP" | docker exec -i socialcontrolplane-postgres-1 \
  psql "$DATABASE_URL"
```

### Rotate secrets

If you rotate `ENCRYPTION_KEY`, all stored provider credentials become
unreadable and must be re-authorized from scratch. Don't rotate unless
necessary.

If you rotate `SESSION_SECRET`, all live sessions invalidate and you
must log in again.

`ADMIN_PASSWORD` is checked directly, not hashed — rotating it is safe
and takes effect on next login.

---

## Upgrading SCP

```bash
cd /opt/scp
git fetch origin main
git log HEAD..origin/main --oneline    # see what's changing
git pull --ff-only origin main
pnpm install                            # picks up dependency changes
cd apps/api && pnpm prisma migrate deploy && cd -   # run any new migrations
pnpm --filter @scp/web build
pm2 restart scp-api scp-worker scp-web
```

If you have uncommitted local changes, **stash** them first:

```bash
git stash push -m "local WIP $(date +%Y-%m-%d)"
# ... upgrade ...
git stash pop
# resolve any conflicts
```

Migrations are forward-only. If you need to roll back SCP, restore a
pre-upgrade DB backup and check out the old commit.

---

## Logs and debug surfaces

| What | Where |
|---|---|
| scp-api stdout | `~/.pm2/logs/scp-api-out.log` + `pm2 logs scp-api` |
| scp-api stderr | `~/.pm2/logs/scp-api-error.log` |
| scp-worker | `~/.pm2/logs/scp-worker-{out,error}.log` |
| scp-web | `~/.pm2/logs/scp-web-{out,error}.log` |
| Postgres logs | `docker compose -f docker-compose.dev.yml logs postgres` |
| Redis logs | `docker compose -f docker-compose.dev.yml logs redis` |
| Request logs | All HTTP requests log at level `info` in scp-api — grep for `msg:"incoming request"` |
| Publish events | scp-worker stdout — grep for `draft.publish.` events |
| Docker container state | `docker compose -f /opt/scp/docker-compose.dev.yml ps` |

## Next

- `docs/Agent-Integration.md` — integrate scripts and bots against the API
- `AGENTS.md` — hard rules for AI assistants
