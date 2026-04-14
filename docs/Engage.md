# Engage — Facebook + Reddit community commenting

## Purpose

Engage is SCP's approval-safe workflow for commenting on Facebook page posts
and Reddit submissions as a connected account.

It exists for cases like Tackle Room community engagement, where agents
should:

- find active discussion threads
- draft helpful comments grounded in the actual post
- auto-post when that's safe, queue for human review when it isn't
- flag pages that need the operator's attention (Like/Follow, permission
  gate, reel/video) instead of silently dropping them
- rotate through pages so the same 8 don't get hit every run
- track volume against a per-platform cap without hard-blocking good
  opportunities
- post through the worker, not directly from random scripts

## Scope

Two platforms behind one data model:

- **Facebook** — page-post commenting via Graph API, using a stored Page
  connection token. Worker-automated when Graph API will allow it.
  Manual-fallback via the `/engage` UI for everything else.
- **Reddit** — submission replies. Reddit's API is closed to us and
  browser-automation approaches were both tried and abandoned. Reddit
  is **always manual**: runner drafts, operator copies + pastes in their
  own logged-in browser, then hits Mark Posted.

Platform is selected by `EngagePage.platform` (`facebook` | `reddit`,
defaults to `facebook`).

## The lifecycle of one comment

```
  [runner fire]                        systemd timer (4× / day each platform)
       |
       v
  config check  ----- enabled=false → short PAUSED digest, exit clean
       |
       v
  scraper (mbasic FB or public Reddit JSON)
       |
       v
  discovered post   ---------------→ EngagePost row (fbPostId + postUrl + postText)
       |
       v
  rotation sort   (lastPostedAt ASC NULLS FIRST, soft 24h cooldown)
       |
       v
  candidate loop (per_run_cap posts, 8 default)
       |
       v
  generate_tailored_comment (Codex 5.4 via codex exec)
       | SKIP → stats['llm_skipped'] += 1, continue
       |
       v
  slop check (SCP /slop/check)
       | score > 10 → stats['slop_rejected'] += 1, continue
       |
       v
  FB: POST /engage/auto-post  →  EngageComment(status=approved) + BullMQ job
  Reddit: POST /engage/comments → EngageComment(status=pending_review)
       |
  (FB only)
       v
  handleEngageComment worker
       |
       v
  resolveCanonicalFbPostId  ———— Graph API GET /{fbPostId}?fields=id,from,type
       |                              200 + type=status/photo/link → cache + POST
       |                              200 + type=video/reel       → needs_attention (REEL)
       |                              400 code=100/200/10         → needs_attention (gate)
       |                              5xx/rate-limit              → retry with backoff
       v
  POST /v20.0/{canonicalFbPostId}/comments
       |
       v
  status=posted, EngagePage.lastPostedAt=now() (rotation signal)
  or status=needs_attention if the POST itself returns code 100/200/10
```

## Core data flow

1. **Registry**: target pages / subreddits in `EngagePage`
2. **Discovery**: platform-specific scraper writes to `EngagePost`
3. **Draft**: runner generates a tailored comment, writes to `EngageComment`
4. **Resolve + post (FB)**: worker resolves canonical IDs, posts via Graph
5. **Manual post (Reddit)**: operator clicks Copy & Open + Mark Posted in `/engage`
6. **Receipt**: receipt JSON stored on the comment, parent post flipped `commented=true`
7. **Rotation**: `EngagePage.lastPostedAt` updated on success — next run prefers pages not recently posted to

## Data model

### `EngagePage`

| Field | Type | Purpose |
|---|---|---|
| `id` | cuid | PK |
| `fbPageId` | string, unique | FB numeric (from mbasic scraper) OR `r/SubName` for Reddit |
| `platform` | string | `facebook` \| `reddit` |
| `name` | string | display name |
| `category` | string | `community \| brand \| charter \| media \| subreddit \| tournament \| conservation` |
| `enabled` | bool | scraping enabled (not to be confused with EngageConfig.enabled which is the platform-wide kill switch) |
| `lastScanned` | datetime? | last scraper fire that touched this page |
| **`realFbPageId`** | string? | **canonical Graph API page id** — often differs from `fbPageId` which is the legacy mbasic owner id. Learned lazily by the worker resolver. |
| **`lastPostedAt`** | datetime? | **rotation signal** — set on every successful auto-post. Runners sort candidates by this ASC NULLS FIRST so pages with no posts yet get priority. |
| `notes` | string? | free-form |

### `EngagePost`

| Field | Type | Purpose |
|---|---|---|
| `id` | cuid | PK |
| `engagePageId` | fk | → EngagePage |
| `fbPostId` | string, unique | `{owner_id}_{post_id}` from the scraper |
| **`canonicalFbPostId`** | string? | **Graph-confirmed canonical id** — cached by the worker on first comment attempt so retries skip the resolver GET |
| `postUrl` | string? | direct Facebook / Reddit URL |
| `postText` | string? | scraped post body |
| `discoveredAt` | datetime | when the scraper found it |
| `commented` | bool | dedupe signal — set to true once any child EngageComment lands `status=posted` |

### `EngageComment`

| Field | Type | Purpose |
|---|---|---|
| `id` | cuid | PK |
| `engagePostId` | fk | → EngagePost |
| `connectionId` | string | FB SocialConnection id, or `reddit-manual` sentinel |
| `commentText` | text | the draft (or posted) comment body |
| `slopScore` | int | result of /slop/check on the draft |
| `status` | string | `pending_review \| needs_attention \| approved \| posted \| failed \| rejected \| expired` |
| `rejectionNote` | string? | resolver reason (REEL, permission gate, etc.) plus any operator reason appended with `[rejected]` marker |
| `receiptJson` | json? | FB Graph response or resolver error body |
| `fbCommentId` | string? | Graph comment id on success |

### `EngageConfig`  ← **NEW**

| Field | Type | Purpose |
|---|---|---|
| `id` | cuid | PK |
| `platform` | string, unique | `facebook` or `reddit` |
| **`enabled`** | bool | kill switch — `false` pauses the runner; it emits a short PAUSED digest and exits clean |
| **`perRunCap`** | int | comments to attempt per timer fire (default 8) |
| **`runsPerDay`** | int | advisory — the actual schedule lives in systemd user timers |
| `updatedBy` | string? | last editor (operator / bill / agent name) |

Seed rows for both platforms are inserted by the
`20260414150000_engage_config` migration, so the API never has to
create-on-read.

## Comment status machine

```
                  pending_review ──────── approve ─────→ approved ──┐
                         │                                          │
                         │                                          ├─→ posted
                         │                                          │     (FB: worker, Reddit: mark-posted)
            needs_attention (from worker) ─── approve + manual ───→─┘
                         │
                         ├─ reject ────→ rejected
                         │
                         └─ mark-posted (operator did it manually) ─→ posted
```

`needs_attention` is a new terminal-ish state the worker flips comments
into when Graph API tells us this target can't receive a page-to-page
comment right now. Three reasons:

1. **REEL / VIDEO** — Graph returned `type=video`; page-to-page comments on
   video objects are gated. Banner text: *"REEL / VIDEO: target is
   type=video. Open the post URL in Facebook, comment manually as Tackle
   Room Fishing Supply."*
2. **Permission gate** — Graph returned `code=100` or `code=200` ("Story
   does not exist" / "Permissions error"). Banner text: *"Page likely
   needs TackleRoom Fishing Supply to Like/Follow before Bill can comment.
   Open the post, Like the page on Facebook, then return here and hit
   Approve."*
3. **Object not found / unknown error** — falls through to the same
   needs_attention surface.

Rate-limit codes (4/17/32/613) and 5xx errors throw instead, so BullMQ
retries with exponential backoff.

## API surface

Implemented in `apps/api/src/engage.ts`.

### Config  ← **NEW**

- `GET /engage/config` — all platform configs
- `GET /engage/config/:platform` — one row
- `PUT /engage/config/:platform` — body `{ enabled?, perRunCap?, runsPerDay?, updatedBy? }`

Live-editable from the `/engage` UI settings bar and from any agent /
script that can hit the API. Runners read their row on startup.

### Pages

- `GET /engage/pages` — `?enabled=`, `?platform=`
- `POST /engage/pages` — `{ fbPageId, name, platform, category?, notes? }`
- **`POST /engage/pages/bulk`** — **NEW** — accepts 1–2000 pages in one
  shot, skips duplicates by `fbPageId` (unique constraint). Returns
  `{ created, skipped, total }`.
- `DELETE /engage/pages/:id`

### Posts

- `POST /engage/posts` — upsert discovered post
- `GET /engage/posts` — `?engagePageId=`, `?commented=`, `?limit=`. Now
  includes `engagePage.lastPostedAt` so the runner can sort.

### Comments

- `POST /engage/comments` — create draft (`pending_review`)
- `GET /engage/comments` — `?status=`, `?limit=`
- `POST /engage/comments/:id/approve` — accepts both `pending_review` AND
  `needs_attention` so re-approval-after-Like works
- `POST /engage/comments/:id/reject` — accepts both `pending_review` AND
  `needs_attention`, preserves any existing `rejectionNote` and appends
  the operator's reason with a `[rejected]` marker
- `POST /engage/comments/:id/mark-posted` — accepts `pending_review |
  needs_attention | approved | failed`, bypasses the worker, flips
  `EngagePost.commented=true`
- `POST /engage/auto-post` — create + immediately enqueue (runner path)

### Stats

- `GET /engage/stats` — `{ today, dailyCap, perPageCap, capMode, pending, totalPosted, activePages }`

## Worker behavior

Implemented in `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`.

```
1. Reject Reddit jobs (should never reach here — /approve skips enqueue
   for Reddit)
2. Reject synthetic _text_ placeholder targets
3. Decrypt Page access token
4. Load EngageComment → EngagePost → EngagePage (three findUnique calls)
5. If engagePost.canonicalFbPostId is already cached, use it; otherwise:
     resolveCanonicalFbPostId()
       - GET /v20.0/{fbPostId}?fields=id,from,type
       - 200 + type in (video, reel) → kind=video → mark needs_attention,
         still cache the canonical id + realFbPageId for future reference
       - 200 + other type              → kind=ok → cache canonicalFbPostId
         on EngagePost and realFbPageId on EngagePage, proceed
       - 400 code 100/200/10           → kind=needs_attention → mark + exit
       - 5xx / codes 4/17/32/613       → kind=retry → throw, BullMQ backoff
6. POST /v20.0/{effectiveFbPostId}/comments with the access token
7. Success → status=posted, EngagePost.commented=true, EngagePage.lastPostedAt=now()
8. Failure with code 100/200/10 → needs_attention (post-time edge: post
   deleted between resolve and POST, or mid-request permission flip)
9. Failure with code 190 → connection status = reconnect_required
10. Everything else → status=failed
```

## Discord digests — short notification format

As of 2026-04-14 evening, runner digests are **short notifications**, not
walls of text. Tim's rule: *"less detail in Discord, I can go to SCP to
review the work. Just a notification would be sufficient."*

Happy path FB:

```
FB ENGAGE ✓ Apr 14 — posted 3, skipped 14
Pages: Big Rock Blue Marlin Tournament, Team Buck Rogers Charters, BlacktipH
Review in SCP: <https://social-plane.teamlewis.co/engage?status=posted>
```

Happy path Reddit:

```
REDDIT ENGAGE ✓ Apr 14 — queued 8 for review
Subs: r/Fishing, r/FishingForBeginners, r/Fishing_Gear, r/kayakfishing
Review in SCP: <https://social-plane.teamlewis.co/engage?status=pending_review>
```

Paused:

```
FB ENGAGE ⏸ Apr 14 — paused in /engage settings
Toggle in SCP: <https://social-plane.teamlewis.co/engage?status=posted>
```

All URLs are wrapped in `<...>` so Discord suppresses its auto-embed
preview cards. The runners handle this — **agents and operators typing
responses in the Discord channel should ALSO wrap links in `<...>`**, but
the digest text itself is the runner's responsibility, not the agent's.

A `Notes:` block appears only when there's something off-happy-path to
see (degraded scrape, post-api failures, zero-post runs). Full notes also
always appear on zero-post runs so the operator knows why nothing landed.

## Rotation

`EngagePage.lastPostedAt` is set every time the worker successfully posts
a comment. Runners sort candidates:

```python
cooldown_hours = ROTATION_COOLDOWN_HOURS  # default 24
def rotation_key(post):
    last = post.engagePage.lastPostedAt
    if not last:
        return (0, datetime.min)           # never posted → top of queue
    in_cooldown = 1 if last >= cutoff else 0
    return (in_cooldown, last)             # recently posted → back of queue
```

Pages posted to within the cooldown window get pushed to the back of the
candidate list but **are not dropped** — they can still be picked if
nothing fresher is available. This prevents the "same 8 pages every run"
problem without starving the runner when the registry is small.

Grow the registry with `/engage/pages/bulk` or the
`scripts/import-engage-pages.py` CLI (pass a CSV with columns
`fbPageId,name,platform,category,notes`).

## Kill switch + per-run cap

The `/engage` UI settings bar (above the tab chips) shows two rows —
Facebook and Reddit — with three controls each:

- **Enabled** checkbox — saves immediately on click. `false` → next
  runner fire prints a PAUSED digest and exits clean (no scraper burn,
  no LLM burn, no wasted Graph API calls).
- **Per-run cap** — comments to attempt per fire. Live-editable; next
  run reads it.
- **Runs/day** — advisory number, doesn't drive schedule (systemd timers
  do). Tim keeps it here as a reference for the intended cadence.

All three are stored in `EngageConfig` and fully API-addressable via
`PUT /engage/config/:platform`.

## Runner-side details

Canonical files (auto-synced from the vault):

- `~/Documents/projects/90 System/40 Agent System/Agents/captain-bill/state/social/fb_engage_review_runner.py`
- `~/Documents/projects/90 System/40 Agent System/Agents/captain-bill/state/social/reddit_engage_review_runner.py`

Both runners:

1. Call `SCPClient.config(platform)` on startup. If `enabled=false` →
   print paused digest, exit 0.
2. Scrape via their respective `engage-scraper.py` / `engage-reddit-scraper.py`
   with timestamped logs to
   `~/Documents/.../captain-bill/state/social/logs/scraper-YYYY-MM-DD_HHMMSS.log`
3. Fetch uncommented posts from `/engage/posts?commented=false`
4. Sort candidates with `rotation_key` then `fallback_score`
5. For each candidate up to `per_run_cap`:
   - Call `generate_tailored_comment()` (Codex 5.4 via `codex exec`)
   - If it returns None → skip
   - Run `/slop/check` on the output
   - FB: `POST /engage/auto-post` (goes straight to worker)
   - Reddit: `POST /engage/comments` as `pending_review`
6. Build the short notification digest and print it. The wrapper script
   (`~/bin/run_captain_bill_{fb,reddit}_engage.sh`) pipes that stdout
   into `openclaw message send` which posts it to the Captain Bill
   Discord channel.

### Codex CLI pinning (systemd PATH gotcha)

**Do not** let the runner call bare `codex` from a systemd context. There
are two codex binaries on this machine:

- `/usr/local/bin/codex` — v0.84.0 (root-installed, no `--ephemeral` flag)
- `/home/tlewis/.npm-global/bin/codex` — v0.118.0+ (Tim's install, has
  `--ephemeral`)

Systemd user PATH picks up the 0.84.0 copy, which returns
`rc=2: error: unexpected argument '--ephemeral' found`. The runner has
`CODEX_BIN = os.environ.get("CODEX_BIN") or "/home/tlewis/.npm-global/bin/codex"`
hardcoded to short-circuit this.

## Discovery tooling

### Facebook

- `scripts/engage-fb-login.py` — one-off interactive login → `engage-fb-state.json`
- `scripts/engage-scraper.py` — two-phase Playwright scraper
  - `--resolve` — extract numeric page id from `facebook.com/{slug}` desktop view
  - `--scrape` — read posts from `mbasic.facebook.com/{id}?v=timeline`
- `scripts/seed-engage-pages.json` — seed list (~140 entries)
- **`scripts/import-engage-pages.py`** — **NEW** — CSV bulk import.
  Usage: `./import-engage-pages.py pages.csv [--platform facebook]`.
  Columns: `fbPageId,name,platform,category,notes`.

### Reddit

- `scripts/engage-reddit-scraper.py` — public JSON, no auth, rate-limit aware
- `scripts/reddit-join-subs.py` — one-off utility

## Known gaps

- **Discovery depth is still limited by the scraper.** mbasic only
  surfaces ~recent posts per page, and the scraper captures the legacy
  owner_id (which the Graph resolver corrects at post time).
- **Page-to-page Graph commenting is genuinely restricted by Meta.** Some
  pages will always return `needs_attention` — no code fix will recover
  them. Those require the operator to Like/Follow as TackleRoom or post
  manually via the `/engage` Copy & Open flow.
- **Registry is still ~124 pages.** The bulk importer exists; the list
  does not yet. Growing toward 1000-2000 is a follow-up — either via a
  curated CSV or a future discovery script that scrapes Facebook
  category pages.
- **`runsPerDay` in EngageConfig is display-only.** The real schedule
  lives in `~/.config/systemd/user/captain-bill-{fb,reddit}-engage.timer`.
  If you want a different cadence, edit the `.timer` file and
  `systemctl --user daemon-reload`.

## Operational notes

- The connected Page token lives in `SocialConnection`, not in scripts.
- Posting goes through SCP worker jobs for auditability.
- `commented=true` on a post is the main dedupe signal against re-drafting.
- Synthetic `_text_` placeholder ids are blocked pre-worker by
  `isSyntheticFbPostId()`.
- Comment quality policy lives in the runner (LLM voice validation,
  fishing-relevance check, slop gate). SCP handles workflow, caps,
  queueing, and receipts.

## File map

- API: `apps/api/src/engage.ts`
- Worker: `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`
- Worker types: `apps/worker/src/workerJobs/types.ts`
- DB access: `apps/worker/src/db.ts`
- UI: `apps/web/app/engage/page.tsx`, `apps/web/app/_lib/api.ts`
- Facebook scraper: `scripts/engage-scraper.py` (two-phase)
- Facebook login: `scripts/engage-fb-login.py`
- Facebook state: `scripts/engage-fb-state.json` (**gitignored**)
- Reddit scraper: `scripts/engage-reddit-scraper.py`
- Reddit subreddit joiner: `scripts/reddit-join-subs.py`
- Target seed list: `scripts/seed-engage-pages.json`
- Bulk importer: `scripts/import-engage-pages.py`
- Runners (vault): `~/Documents/projects/90 System/40 Agent System/Agents/captain-bill/state/social/`
- Systemd services: `~/.config/systemd/user/captain-bill-{fb,reddit}-engage.{service,timer}`
- Agent playbook: `docs/Engage-Agent-Playbook.md`
