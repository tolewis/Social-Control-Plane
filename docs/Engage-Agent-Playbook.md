# Engage Agent Playbook

**Audience:** AI agents working on or around SCP's community engagement
pipeline. Captain Bill, his subagents, Claude Code sessions touching
engage code, and any future agent that gets asked "run the engage
cycle" or "what's in the engage queue".

**Authority:** this doc is the canonical operator-facing playbook for
agent behavior. If it conflicts with something you remember, trust this
file. It is checked into `tolewis/Social-Control-Plane` on `main` and
surfaced via the in-app `/docs` dock so the operator sees exactly what
the agents are supposed to do.

---

## The three hard rules

### Rule 1 — Never run engage scripts inline from your Bash tool

Forbidden commands in an interactive agent session:

- `python3 /opt/scp/scripts/engage-scraper.py ...`
- `python3 state/social/fb_engage_review_runner.py`
- `python3 state/social/reddit_engage_review_runner.py`
- Any pipe like `| tail`, `| head`, `| less` on the above (these block
  stdout for the full scrape duration and guarantee a watchdog timeout)
- `bash /home/tlewis/bin/run_captain_bill_fb_engage.sh`
- `bash /home/tlewis/bin/run_captain_bill_reddit_engage.sh`

These commands take 1-20 minutes each and produce no incremental stdout.
Running any of them from your main session will stall it, burn your
context, and eventually crash the agent runtime. Running them happened
on 2026-04-13 and took OpenClaw down. This rule exists to prevent a
repeat.

### Rule 2 — Prefer the systemd services; they already own the engage cycle

Two services run four times a day each:

| Service | Times (ET) | What it does |
|---|---|---|
| `captain-bill-fb-engage.service` | 06:00, 12:00, 17:30, 20:30 | Scrape FB pages, resolve canonical IDs via Graph API, auto-post LLM-tailored comments, flip reels/gates to `needs_attention` |
| `captain-bill-reddit-engage.service` | 06:15, 12:15, 17:45, 20:45 | Scrape Reddit subs, draft LLM-tailored comments, queue to `/engage` for manual review |

Both services post their Discord digest automatically via the same
`openclaw message send` path. The digest is a short notification with
links wrapped in `<...>` so Discord doesn't build preview cards.

**Digest formatting is the RUNNER's responsibility, not yours.** If you
see bare unwrapped URLs or a long per-draft block in a digest, that
means the runner code is out of date — spawn a captain.bill-sub to
investigate the sync, don't try to reformat the output yourself or
promise to "use `<link>` format from now on".

**To trigger an ad-hoc run** when the operator says "run it now",
"fire engage", "run the engage cycle":

```
systemctl --user start captain-bill-fb-engage.service
systemctl --user start captain-bill-reddit-engage.service
```

Fire-and-forget. Tell the operator both services started and move on.
FB digest lands in ~20 minutes. Reddit digest lands in ~3 minutes.

**To check state without firing a run:**

```
GET http://localhost:4001/engage/stats                           # today's counts + cap
GET http://localhost:4001/engage/posts?commented=false           # remaining candidate queue
GET http://localhost:4001/engage/comments?limit=20               # recent comments
GET http://localhost:4001/engage/comments?status=needs_attention # action-required inbox
GET http://localhost:4001/engage/config                          # platform enabled / caps
```

These are fast (<100ms), read-only, and don't touch the scraper.

**To check whether a recent cron run succeeded:**

```
systemctl --user status captain-bill-fb-engage.service
journalctl --user -u captain-bill-fb-engage.service --since "2h ago" --no-pager | tail -20
```

### Rule 3 — Self-spawn a subagent for non-standard scraper work

If the operator asks for something genuinely custom — testing a new
`--category` flag, ingesting a specific URL, iterating on a review
runner, debugging why a scrape returned zero posts — **do not run the
scraper inline yourself**. Spawn a sub with a clean context:

```
sessions_spawn agentId="captain.bill" task="
## Why
Mission: TackleRoom organic + paid growth
Project: FB community engagement
Goal: Validate new scraper --category filter
Sub-goal: Check that --category offshore returns only offshore pages
This task: Run `python3 /opt/scp/scripts/engage-scraper.py --scrape --category offshore --limit 10` in /opt/scp, capture stdout, return the list of pages scraped and total post count. Do NOT post anything. Report in under 200 words.
"
```

The sub inherits your identity, auth, and brand knowledge. It runs in a
clean context window so the 1-3 min scraper stdout goes into its log,
not yours. You stay responsive to the operator while the sub runs.

---

## What to do when the operator asks…

| Operator asks | You do |
|---|---|
| "How's engagement today?" | `GET /engage/stats` + `/engage/comments?limit=10` → synthesize a 3-line answer |
| "What's in the queue?" | `GET /engage/posts?commented=false&limit=20` → list top 10 by category |
| "What needs my attention?" | `GET /engage/comments?status=needs_attention` → list pages where TackleRoom needs to Like/Follow on FB, or reels that need manual comment |
| "Run the engage cycle now" / "Fire engage" | `systemctl --user start captain-bill-fb-engage.service` + tell the operator it started; digest lands in ~20 min |
| "Fire the Reddit engage cycle" | `systemctl --user start captain-bill-reddit-engage.service` + tell them it started; digest in ~3 min |
| "Fire both" / "end to end test" | Start BOTH services back-to-back, tell the operator both are running, point them at `/engage?status=needs_attention` while they wait |
| "Pause FB engage" | `PUT /engage/config/facebook {"enabled": false}` — next fire emits a PAUSED digest and exits clean |
| "Resume FB engage" | `PUT /engage/config/facebook {"enabled": true}` |
| "Set FB cap to 10" | `PUT /engage/config/facebook {"perRunCap": 10}` — runner reads it on next fire |
| "Did the 12:00 cron fire?" | `journalctl --user -u captain-bill-fb-engage.service --since "3h ago"` → quote the last success/failure |
| "Try the scraper with `--category offshore`" | Self-spawn a captain.bill-sub with the brief pattern above |
| "Why is the cron failing?" | `journalctl` + check the scraper log at `Agents/captain-bill/state/social/logs/scraper-*.log`; if the scraper itself is broken, self-spawn a sub to investigate, don't debug inline |
| "The Discord digest is ugly / has preview cards" | Check the runner code — the runner should already wrap URLs in `<...>`. If it doesn't, the vault hasn't synced or the runner was reverted. Flag it; don't promise to reformat anything yourself. |

None of these paths involves running a scraper directly from your Bash
tool. If you find yourself reaching for `python3 engage-scraper.py`,
stop and ask "which of the three rules above am I about to break?"

---

## Understanding the comment status machine

```
         pending_review ──── approve ─────→ approved ──┐
                │                                      │
                │                                      ├─→ posted
                │                                      │
    needs_attention ──── approve (operator Liked) ────→┘
                │
                ├── reject ────→ rejected
                │
                └── mark-posted (operator did it manually) ─→ posted
```

**`pending_review`** — normal review queue. Draft is waiting for operator
approval (or auto-post). Reddit drafts always live here.

**`needs_attention`** — the worker's Graph API resolver determined the
post can't receive a page-to-page comment right now. Three reasons
surfaced in the `rejectionNote`:

1. **REEL / VIDEO** — Graph returned `type=video`. Operator opens the
   URL and comments manually in the FB app as TackleRoom.
2. **Permission gate** — Graph returned code 100/200/10. Operator
   Likes/Follows the target page as TackleRoom, then hits Approve (the
   worker uses the cached `canonicalFbPostId` so the retry is clean).
3. **Post not accessible** — same surface. Operator handles manually.

Do NOT auto-blacklist pages in `needs_attention`. The operator may want
to Like/Follow them. Do NOT re-approve `needs_attention` comments as an
agent without the operator's go-ahead.

**`approved`** — human-approved, waiting on the worker to post. Usually
short-lived. Reddit `approved` stays there until the operator hits Mark
Posted.

**`posted`** — the comment is live. For FB, the worker did it via Graph
API and stored the receipt. For Reddit, the operator did it manually
and flipped the row via Mark Posted.

**`failed`** — the worker tried to post and hit a non-recoverable error
that's not a permission gate. These are real failures worth
investigating. Old `failed` rows from before 2026-04-14 that hit FB
code 100/200 were backfilled to `needs_attention`.

**`rejected`** — operator said no. The resolver note (if any) is
preserved and the operator's reason is appended with `[rejected]`.

---

## Understanding the data model at a glance

| Model | Per-row meaning | Unique by |
|---|---|---|
| `EngagePage` | One FB page or Reddit sub in the registry | `fbPageId` |
| `EngagePost` | One discovered post on that page/sub | `fbPostId` |
| `EngageComment` | One draft reply we're considering posting | (no natural key) |
| `EngageConfig` | One platform's live settings (enabled, cap, cadence) | `platform` |

Three new fields as of 2026-04-14:

- `EngagePage.realFbPageId` — canonical Graph API page id, often
  different from the mbasic legacy `fbPageId`. Cached by the worker
  resolver.
- `EngagePage.lastPostedAt` — rotation signal. Set every time the
  worker successfully posts a comment on this page. Runners prefer
  pages with oldest or null `lastPostedAt`.
- `EngagePost.canonicalFbPostId` — per-post Graph-confirmed ID, cached
  so retries skip the resolver GET.

---

## Understanding the runner → worker → post pipeline

```
systemd timer fires
  ↓
runner wrapper script (~/bin/run_captain_bill_{fb,reddit}_engage.sh)
  ↓
runner python script (vault: Agents/captain-bill/state/social/...)
  ↓
1. Read /engage/config/{platform}. If enabled=false → PAUSED digest, exit.
2. Scrape (writes to Agents/.../state/social/logs/scraper-*.log)
3. Fetch /engage/posts?commented=false (includes engagePage.lastPostedAt)
4. Sort candidates: (in_cooldown ASC, lastPostedAt ASC, fallback_score)
5. For each candidate up to per_run_cap:
      generate_tailored_comment (Codex 5.4 via `codex exec`)
      slop_check (/slop/check)
      FB: POST /engage/auto-post  →  enqueues BullMQ job
      Reddit: POST /engage/comments (pending_review, no queue)
6. Print short-format digest to stdout
  ↓
wrapper pipes digest into `openclaw message send --channel discord`
  ↓
Discord notification lands in Captain Bill channel
```

Meanwhile, for FB comments, the worker picks up the BullMQ job:

```
handleEngageComment
  ↓
resolveCanonicalFbPostId (GET /v20.0/{fbPostId}?fields=id,from,type)
  ↓
  200 + type=video/reel → needs_attention (REEL), cache canonical id
  200 + type=other      → cache canonical id + real page id, proceed
  400 code 100/200/10   → needs_attention (gate), exit
  5xx / rate-limit      → throw, BullMQ retries with backoff
  ↓
POST /v20.0/{canonicalFbPostId}/comments
  ↓
  success → status=posted, EngagePage.lastPostedAt=now() (rotation signal)
  failure w/ code 100/200/10 → needs_attention (post-time edge)
  failure w/ code 190 → connection status=reconnect_required
  other failure → status=failed
```

---

## Common pitfalls

### "I ran the scraper inline to check something and now I'm stuck"

You broke Rule 1. Kill your session if needed and restart the agent
runtime cleanly. Next time, either (a) hit the fast API endpoints to
check state, or (b) self-spawn a sub with the scraper command in the
brief.

### "I promised Tim I'd use `<link>` format in digests"

Don't. You don't generate digests — the runner does. If digests are
unwrapped, the runner code is stale; spawn a sub to investigate the
vault sync. Just say "the runner wraps those now, if they're unwrapped
it means the vault hasn't synced — let me check" and act on that.

### "Mark Posted / Reject doesn't work for FB comments"

Fixed 2026-04-14. Both routes now accept `needs_attention` in addition
to `pending_review`. If it still doesn't work, the API build is stale.
Check `git log --oneline -3 /opt/scp` and confirm the commit is deployed.

### "I want to blacklist a page that keeps failing"

Don't. Failed pages go into `needs_attention` with a specific reason
(REEL / permission gate / deleted). Operator decides what to do with
them — either Like the page, comment manually, or reject the draft.
Auto-blacklisting is wrong because some Penn Fishing posts ARE
commentable (regular posts) while others aren't (reels).

### "The Codex CLI is returning rc=2 on --ephemeral"

You're running under systemd and picking up the wrong `codex`. The
runner should be pinned to `/home/tlewis/.npm-global/bin/codex` (v0.118)
not `/usr/local/bin/codex` (v0.84 which predates `--ephemeral`). The
runner has `CODEX_BIN` already pinned; if this shows up in a new script
you wrote, pin it there too.

### "Prisma says `Unknown argument canonicalFbPostId`"

pnpm two-copy Prisma client gotcha. After a schema migration, one
`@prisma/client` copy gets regenerated but the other stays stale. Fix:

```bash
FRESH=/opt/scp/node_modules/.pnpm/@prisma+client@6.4.1_prisma@6.4.1_typescript@5.9.3__typescript@5.9.3/node_modules/.prisma
STALE=/opt/scp/node_modules/.pnpm/@prisma+client@6.4.1_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3/node_modules/.prisma
rm -rf "$STALE" && cp -r "$FRESH" "$STALE"
rm -rf /opt/scp/node_modules/.prisma && cp -r "$FRESH" /opt/scp/node_modules/.prisma
pm2 restart scp-worker scp-api
```

Logged as a repeat offender in the Katya workspace LEARNINGS.md.

---

## Growing the page registry

Current registry: ~124 pages. Target: 1000-2000 for variety. Use the
bulk importer:

```bash
./scripts/import-engage-pages.py pages.csv
```

CSV columns:

```csv
fbPageId,name,platform,category,notes
100064554408107,Penn Fishing,facebook,brand,
100064816144831,Salt Water Sportsman,facebook,media,
r/SurfFishing,r/SurfFishing,reddit,subreddit,
```

Duplicates on `fbPageId` are silently skipped.

`platform=facebook` pages need a numeric ID from mbasic. Run
`engage-scraper.py --resolve` to convert slugs to numeric IDs if all
you have is the URL slug. Or use the slug form and let the scraper
resolve it on first scan — it'll UPSERT the numeric ID back.

---

## Quick reference

### Live files

- API routes: `apps/api/src/engage.ts`
- Worker handler: `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`
- DB types: `apps/worker/src/db.ts`
- UI: `apps/web/app/engage/page.tsx` + `apps/web/app/_lib/api.ts`
- FB scraper: `scripts/engage-scraper.py`
- Reddit scraper: `scripts/engage-reddit-scraper.py`
- Bulk importer: `scripts/import-engage-pages.py`

### Vault files (auto-synced)

- FB runner: `Agents/captain-bill/state/social/fb_engage_review_runner.py`
- Reddit runner: `Agents/captain-bill/state/social/reddit_engage_review_runner.py`
- Scraper logs: `Agents/captain-bill/state/social/logs/scraper-*.log`
- Bill's AGENTS.md rules: `Agents/captain-bill/AGENTS.md`
- Agent learnings: `Agents/katya/LEARNINGS.md`

### systemd services

- `~/.config/systemd/user/captain-bill-fb-engage.service`
- `~/.config/systemd/user/captain-bill-fb-engage.timer`
- `~/.config/systemd/user/captain-bill-reddit-engage.service`
- `~/.config/systemd/user/captain-bill-reddit-engage.timer`
- Wrappers: `~/bin/run_captain_bill_{fb,reddit}_engage.sh`

### Related docs

- `docs/Engage.md` — operator-facing canonical reference
- `docs/Agent-Integration.md` — general agent API cookbook
- `docs/Operating-Guide.md` — PM2 / systemd / log locations
