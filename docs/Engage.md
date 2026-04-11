# Engage — Facebook community commenting

## Purpose
Engage is SCP's approval-safe workflow for commenting on Facebook page posts as a connected Page.

It exists for cases like Tackle Room community engagement, where agents should:
- find active discussion threads
- draft helpful comments
- route them through approval when needed
- enforce volume limits
- post through the worker, not directly from random scripts

## Scope
Current implementation is built for Facebook page-post commenting.

Main pieces:
- target page registry
- discovered post store
- comment draft / approve / reject flow
- auto-post shortcut for already-approved comments
- worker-backed posting to the Graph API
- daily and per-page rate caps

## Core data flow
1. Add target pages to monitor
2. Discover posts worth commenting on
3. Store those posts in `EngagePost`
4. Create comment drafts in `EngageComment`
5. Approve or reject drafts
6. Worker posts approved comments to Facebook
7. Store receipt + mark post as commented

## Main API surface
Implemented in `apps/api/src/engage.ts`.

### Pages
- `GET /engage/pages`
- `POST /engage/pages`
- `DELETE /engage/pages/:id`

Use these to manage the list of Facebook pages SCP watches.

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
- `POST /engage/auto-post`

Use this only when comment text is already approved and you want SCP to create, approve, and enqueue in one step.

## Worker behavior
Implemented in `apps/worker/src/workerJobs/handlers/handleEngageComment.ts`.

The worker:
1. loads the connected Facebook Page token
2. decrypts the token from stored credentials
3. rejects synthetic `_text_` placeholder targets before calling Graph API
4. posts to `POST /{fbPostId}/comments` on Graph API for real post ids
5. stores the provider receipt on success and on failure when available
6. marks the parent post as `commented=true`
7. marks connection `reconnect_required` if Facebook returns token error `190`

## Discovery tooling
Current discovery helpers live in `scripts/`.

Important files:
- `scripts/engage-scraper.py`
- `scripts/engage-fb-login.py`
- `scripts/seed-engage-pages.json`

These support page targeting, authenticated scraping, and post discovery before data is submitted into SCP.

## Rate limits and guardrails
Env-driven caps:
- `ENGAGE_DAILY_CAP`
- `ENGAGE_PER_PAGE_CAP`

These are enforced on actual posting attempts, at approve-time and auto-post time. Draft creation stays open so approval-first queues do not burn the daily cap before anything goes live.

Current operating stance:
- keep daily volume intentionally bounded
- avoid repeated hits on the same page
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
- Scraper: `scripts/engage-scraper.py`
- Target seed list: `scripts/seed-engage-pages.json`
