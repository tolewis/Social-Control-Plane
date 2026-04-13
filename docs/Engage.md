# Engage — Facebook + Reddit community commenting

## Purpose
Engage is SCP's approval-safe workflow for commenting on Facebook page posts and Reddit submissions as a connected account.

It exists for cases like Tackle Room community engagement, where agents should:
- find active discussion threads
- draft helpful comments
- route them through approval when needed
- track volume guidance without hard-blocking good opportunities
- post through the worker, not directly from random scripts

## Scope
Current implementation supports two platforms behind a single data model:

- **Facebook** — page-post commenting via Graph API, using a stored Page connection token
- **Reddit** — submission replies via PRAW subprocess, using worker-env credentials

Platform is selected by the `EngagePage.platform` field (`facebook` | `reddit`, defaults to `facebook`). The worker branches on this value at posting time.

Main pieces:
- target page / subreddit registry
- discovered post store
- comment draft / approve / reject flow
- auto-post shortcut for already-approved comments (supports optional `scheduledFor` delay)
- worker-backed posting with per-platform adapters
- soft daily and per-page volume guidance (not hard stops)

## Core data flow
1. Add target pages / subreddits to monitor (`EngagePage` with `platform` set)
2. Discover posts worth commenting on (platform-specific scraper)
3. Store those posts in `EngagePost`
4. Create comment drafts in `EngageComment`
5. Approve or reject drafts
6. Worker posts approved comments via the right adapter (Graph API or PRAW)
7. Store receipt + mark post as commented

### Data-model reuse note
The `EngagePost.fbPostId` column is platform-agnostic despite the name:
- Facebook: `{numeric_page_id}_{post_id}` (or a `_text_{hash12}` synthetic placeholder when direct id is unknown)
- Reddit: the short submission id (e.g. `abc1234`)

Same goes for `EngagePage.fbPageId`: FB numeric id OR `r/SubredditName` for Reddit.

## Main API surface
Implemented in `apps/api/src/engage.ts`.

### Pages
- `GET /engage/pages` — supports `?enabled=true|false` and `?platform=facebook|reddit` filters
- `POST /engage/pages` — accepts `platform: 'facebook' | 'reddit'` (defaults to `facebook`), `fbPageId`, `name`, `category`, `notes`
- `DELETE /engage/pages/:id`

Use these to manage the list of Facebook pages and Reddit subreddits SCP watches.

### Posts
- `POST /engage/posts`
- `GET /engage/posts`

`POST /engage/posts` upserts discovered posts by `fbPostId`.

Stored fields include:
- page reference
- post URL
- post text
- author name
- posted time
- like/comment/share counts when available
- `commented` flag

### Comments
- `POST /engage/comments`
- `GET /engage/comments`
- `POST /engage/comments/:id/approve`
- `POST /engage/comments/:id/reject`

This is the normal review workflow.

### Auto-post shortcut
- `POST /engage/auto-post` — accepts optional `scheduledFor` ISO timestamp to spread comments over time (defaults to random 30-120s delay)

Use this only when comment text is already approved and you want SCP to create, approve, and enqueue in one step.

### Stats
- `GET /engage/stats` — returns `{ today, dailyCap, perPageCap, capMode: 'soft', pending, totalPosted, activePages }`

## Worker behavior
Implemented in `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`.

The worker branches on the `platform` field of the posting job:

### Facebook path
1. loads the connected Facebook Page token from `SocialConnection`
2. decrypts the token from stored credentials
3. rejects synthetic `_text_` placeholder targets before calling Graph API
4. posts to `POST /{fbPostId}/comments` on Graph API v20.0
5. stores the provider receipt on success and on failure when available
6. marks the parent post as `commented=true`
7. marks connection `reconnect_required` if Facebook returns token error code `190`

### Reddit path (important — not autonomous)

Reddit does not grant us API access, so the SCP worker does **not** post Reddit comments on its own. Posting is manual-assisted via headed Chrome:

1. Tim runs `scripts/engage-reddit-login.py` once to save a `u/thetackleroom` session to `scripts/reddit-state.json` (gitignored).
2. For each approved Reddit comment, Tim runs `scripts/engage-reddit-poster.py --submission-url <url> --text "..."`.
3. The poster launches **headed Chrome** (`channel="chrome"`, `headless=False`), loads the submission on `old.reddit.com`, types the comment with realistic pacing, and **pauses** for Tim to review and solve any bot-check in the browser.
4. Tim presses ENTER in the terminal to submit, or Ctrl+C to cancel.
5. The script extracts the new comment permalink and prints `{ok, commentUrl, error}` JSON.

The legacy `handleEngageComment.ts` worker Reddit branch — which used an embedded PRAW subprocess reading `REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD` from env — is **dead code**. It will fail on missing credentials and should be removed or guarded with a "use scripts/engage-reddit-poster.py manually" error message. Leaving it in place is non-destructive but wasteful.

**Planned fallback workflow (not built):** SCP review UI exposes each approved Reddit comment with a direct submission link and a "copy comment" button so Tim can paste and post manually in his own browser. This mirrors how TikTok operators handle similar ToS constraints. If headed Playwright gets too unreliable against Reddit's anti-bot stack, switch to this.

## Discovery tooling
Discovery helpers live in `scripts/`.

### Facebook
- `scripts/engage-fb-login.py` — one-off interactive login to produce `engage-fb-state.json` (Playwright storage state, **gitignored**)
- `scripts/engage-scraper.py` — two-phase Playwright scraper
  - `--resolve` phase: loads `facebook.com/{slug}` in desktop mode, extracts numeric page id (`userID` pattern) from page source
  - `--scrape` phase: loads `mbasic.facebook.com/{numeric_id}?v=timeline` in mobile context, parses post ids from `data-video-tracking` and `data-tracking` JSON, matches body-text sections to post ids
- `scripts/seed-engage-pages.json` — seed list of target pages with slugs, names, categories

### Reddit
- `scripts/engage-reddit-scraper.py` — public JSON scraper, no auth
  - Reads `https://www.reddit.com/r/{sub}/hot.json`
  - Filters: min 3 upvotes, min 1 comment, min 30 chars, max 72h age
  - Skips stickied, removed, locked, and image-only posts
  - Rate limit handling: 10s backoff on HTTP 429, 5s polite delay between subreddits
- `scripts/reddit-join-subs.py` — utility for onboarding new subreddits

Reddit posting happens in the worker via PRAW. Separate from discovery.

## Rate limits and guardrails
Env-driven guidance values:
- `ENGAGE_DAILY_CAP`
- `ENGAGE_PER_PAGE_CAP`

These are soft guide rails, not hard stops. SCP records and surfaces when posting volume moves past the configured guidance, but approval and auto-post can still proceed. Draft creation stays open so approval-first queues do not burn the guideline before anything goes live.

Current operating stance:
- keep daily volume intentionally bounded
- avoid repeated hits on the same page unless there is a real reason
- prefer active discussion threads over dead posts
- do not let agents spray comments without review logic

## Recommended workflow
For production use, prefer this order:
1. discover candidate posts
2. filter for real discussion and visibility
3. draft comment text with concrete value
4. human approval when needed
5. enqueue through SCP
6. verify receipts and failures in worker logs / UI

## Operational notes
- The connected Page token lives in `SocialConnection`, not in scripts.
- Posting should happen through SCP worker jobs, not direct one-off Graph calls, when you want auditability.
- `commented=true` on a post is the main dedupe signal for avoiding repeat comments on the same stored post.
- Discovery can still create synthetic `_text_` placeholder ids when the scraper only finds page-root text. Those records are useful for review, but they are not directly commentable.
- Approval and auto-post now block synthetic placeholder targets. Re-scrape the page until SCP has a real direct post id before approving.
- When a later scrape finds a direct post id for the same page and text, SCP promotes the older placeholder record in place so existing draft links stay usable.
- Comment quality policy lives outside SCP code. SCP handles workflow, caps, queueing, and receipts.

## Known gaps
- Discovery quality still depends on the scraper and the source pages.
- Some real Facebook posts can still reject comments because of permissions or page-specific restrictions even when SCP has a direct post id.
- Engagement scoring is still light. Human review remains important.
- Operator docs for exact page-selection heuristics should live alongside agent runbooks, not only in SCP.

## File map
- API: `apps/api/src/engage.ts`
- Worker: `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`
- Worker types: `apps/worker/src/workerJobs/types.ts`
- DB access: `apps/worker/src/db.ts`
- Facebook scraper: `scripts/engage-scraper.py` (two-phase: resolve + scrape)
- Facebook login: `scripts/engage-fb-login.py`
- Facebook state: `scripts/engage-fb-state.json` (**gitignored**)
- Reddit scraper: `scripts/engage-reddit-scraper.py` (public JSON)
- Reddit login (one-off): `scripts/engage-reddit-login.py` (headed Chrome, saves session)
- Reddit poster: `scripts/engage-reddit-poster.py` (headed Chrome, manual-assisted)
- Reddit state: `scripts/reddit-state.json` (**gitignored**)
- Reddit subreddit joiner: `scripts/reddit-join-subs.py`
- Target seed list: `scripts/seed-engage-pages.json`
- Agent runbook: `~/Documents/projects/90 System/40 Agent System/Agents/skills/scp-engage/SKILL.md`
