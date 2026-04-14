# SCP Setup

**Audience:** someone bringing SCP up on a fresh machine for the first time.
**Time budget:** ~30 minutes if everything works, ~90 if you hit a provider
OAuth wall.

If you're an AI agent reading this, see also `AGENTS.md` at the repo root.
If you already have SCP running and want to know how to operate it day-to-day,
see `docs/Operating-Guide.md`.

---

## 1. Prerequisites

You need:

| | Minimum | How to check |
|---|---|---|
| **Node.js** | 22.x | `node --version` |
| **pnpm** | 9.x | `pnpm --version` (install via `corepack enable && corepack prepare pnpm@latest --activate`) |
| **Docker** + Compose | any recent | `docker --version && docker compose version` |
| **Git** | any | `git --version` |
| **Linux / macOS** | — | Windows works via WSL2 but isn't tested |
| **Ports available** | 3000, 4001, 5432, 6379 | `ss -tlnp 2>&1 \| grep -E ':(3000\|4001\|5432\|6379)'` should be empty |
| **RAM** | 4 GB free | — |
| **Disk** | 2 GB free | for postgres + uploads |

You do NOT need:
- A managed Postgres — the included `docker-compose.dev.yml` ships one
- A managed Redis — same
- A server — this runs fine on a laptop for testing
- Provider OAuth apps yet — you can boot SCP first and connect providers later

---

## 2. Clone and bootstrap

```bash
git clone git@github.com:tolewis/Social-Control-Plane.git scp
cd scp
pnpm install
```

`pnpm install` will take 1–3 minutes on first run. It resolves the whole
monorepo: `apps/api`, `apps/web`, `apps/worker`, `packages/providers`,
`packages/renderer`, `packages/shared`.

## 3. Configure the environment

Copy the example env file and fill in the bits you actually need:

```bash
cp .env.example .env
```

Open `.env` in your editor. The **required** keys you must set before SCP
will start cleanly:

| Key | What to put there |
|---|---|
| `ADMIN_PASSWORD` | Your single-admin login password. Pick something real — **not** `replace-me`. |
| `SESSION_SECRET` | `openssl rand -base64 32` output |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` output (used for AES-GCM of provider tokens in DB) |
| `DATABASE_URL` | Leave the default (`postgresql://postgres:postgres@localhost:5432/social_control_plane`) if you're using the bundled docker-compose |
| `REDIS_URL` | Leave the default (`redis://localhost:6379`) |

Everything else is **optional** and only matters for specific features.
Provider OAuth credentials (LinkedIn, X, Meta, Reddit) are covered
separately in `docs/Provider-Setup.md` — **skip them for now** and come
back when you want to actually post somewhere.

## 4. Start the dependencies

Postgres and Redis come from a single compose file. Start them:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Check they're both up:

```bash
docker compose -f docker-compose.dev.yml ps
```

You should see two containers: `socialcontrolplane-postgres-1` and
`socialcontrolplane-redis-1`, both `Up`.

## 5. Run database migrations

SCP uses Prisma. One command migrates an empty database to the current
schema:

```bash
cd apps/api
pnpm prisma migrate deploy
cd ../..
```

For local development where you'll be iterating on the schema, use
`pnpm prisma migrate dev` instead (which creates migration files for
unstaged schema changes).

## 6. First boot — dev mode

Three processes need to run: the API (`scp-api` on 4001), the worker
(`scp-worker`), and the web UI (`scp-web` on 3000).

For quick local dev, use the provided helper:

```bash
./start-dev.sh
```

This starts all three in the current shell with live reload (tsx watch +
next dev). Keep an eye on the output for the first 30 seconds — if any
of them crash immediately, the error text is your starting point.

For production-style boot, use PM2 (see `docs/Operating-Guide.md` §
"PM2 deployment").

## 7. Log in

Open `http://localhost:3000/` in a browser. You'll be redirected to
`/login`. The only credential is the `ADMIN_PASSWORD` you set in step 3.

Once logged in you'll see the dashboard. You have zero connections, zero
drafts, zero jobs — that's expected.

## 8. Connect a provider (your choice)

Pick at least one provider to connect so you can actually publish. Each
requires creating an OAuth app at the provider's developer portal and
pasting the credentials into SCP's Settings → Integrations tab.

Full per-provider instructions: **`docs/Provider-Setup.md`**.

Shortest path to your first published post:

1. **LinkedIn** is usually the fastest to set up — Microsoft's developer
   portal is straightforward and LinkedIn doesn't require a review for
   `w_member_social` on a personal-scope app.
2. **X** is second. The OAuth app is quick but **don't forget to add
   the `media.write` scope** — without it, image uploads silently fail
   with a permission error.
3. **Meta (Facebook + Instagram)** is the slowest because App Review
   gates the `pages_manage_posts` permission for anything beyond your
   own test pages.

## 9. Sanity check the full pipeline

After you've connected one provider:

1. Go to **Compose** in the top nav.
2. Write a short test post. Select your connection.
3. Click **Save as Draft**.
4. Go to **Queue**. You should see your draft with status `queued`.
5. Click **Publish Now**.
6. Watch the page — within 5–10 seconds the status should flip to
   `running`, then to `published`.
7. Check the provider (e.g. your LinkedIn feed) for the live post.

If it's stuck at `queued` forever, something's wrong with the worker or
the provider token. See the Troubleshooting section below.

## 10. Production deployment

For a server deployment where SCP stays up across reboots and crashes,
use PM2. The included `ecosystem.config.cjs` defines all three processes:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed instructions to enable on boot
```

Next.js serves from the standalone build for production mode, so you
also need to build the web app first:

```bash
pnpm --filter @scp/web build
pm2 restart scp-web
```

Put SCP behind a reverse proxy (Caddy, nginx, Tailscale Funnel, etc.)
for HTTPS. The API listens on 4001; the web UI on 3000. Web talks to API
at `NEXT_PUBLIC_API_BASE_URL` — set that to your public API URL in `.env`
before building.

**Reminder from tonight's lessons:** in production mode, CSS/TSX changes
do **not** hot-reload. Any change to `apps/web/**` needs:

```bash
pnpm --filter @scp/web build
pm2 restart scp-web
```

Hard-refresh your browser after restart (the hashed CSS bundle name
changes on every build, so browser caches naturally bust on load — but
service workers and aggressive proxies can still hold stale assets).

---

## Troubleshooting

### `pnpm install` fails with peer dep warnings
Safe to ignore on Node 22. SCP's workspace is strict about versions but
not about peer deps.

### Postgres won't come up
Check if another Postgres is already on 5432:
```
ss -tlnp | grep 5432
```
Either stop the other one or change `DATABASE_URL` to a different port
and update `docker-compose.dev.yml` accordingly.

### `scp-api` can't connect to postgres
Wait 3–5 seconds after `docker compose up` — postgres takes a moment to
be ready to accept connections. If it keeps failing, check container logs:
```
docker compose -f docker-compose.dev.yml logs postgres
```

### Login page returns 401 even with the right password
Check that `ADMIN_PASSWORD` in `.env` matches what you're typing. If you
changed the password after first boot, also check for any cached sessions
— clear cookies for localhost:3000.

### `/health` returns ok but `/login` is unreachable
The API (`/health`) is on port 4001. The web UI (`/login`) is on port
3000. If only the API works, `scp-web` didn't start. Check `pm2 logs
scp-web` or whichever process manager you're using.

### Queue shows `queued` forever on publish
The worker isn't processing. Check:
```
pm2 status scp-worker
pm2 logs scp-worker --lines 40
```
If the worker is stopped, `pm2 restart scp-worker`. If it's running but
not picking up jobs, restart it explicitly — PM2 does NOT cascade
restarts across `scp-api` and `scp-worker`, and stale worker code after
a deploy is a common failure mode.

### Publishing to X fails with "media.write" or schema errors
Your X OAuth app is missing the `media.write` scope OR the app is still
using the old v1.1 credentials. See `docs/Provider-Setup.md` § "X".

### Publishing to LinkedIn 401s
LinkedIn tokens expire after 60 days. The health indicator on
Connections will show yellow — click Refresh. If refresh fails, you'll
need to re-authorize the full OAuth flow.

---

## What you have when you're done

- SCP running on ports 3000 (web) + 4001 (api)
- Postgres on 5432, Redis on 6379 via docker
- An admin account with your password
- One or more connected social providers
- The full **Compose → Draft → Review → Queue → Publish** pipeline working
- Logs under `~/.pm2/logs/scp-*.log` (or your shell's stdout in dev mode)

## Next

- `docs/Provider-Setup.md` — detailed per-provider OAuth app creation
- `docs/Operating-Guide.md` — day-to-day operations, troubleshooting,
  upgrades, common failures
- `docs/Agent-Integration.md` — API cookbook for scripts and LLM agents
- `AGENTS.md` — rules for AI assistants touching this repo
