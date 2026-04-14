# Agent Integration

**Audience:** scripts, LLM agents, and other programmatic clients that
need to drive SCP via its HTTP API without touching the web UI.

**Prereq:** SCP is already running and at least one provider is connected.
See `docs/SETUP.md` and `docs/Provider-Setup.md` if not.

---

## Base URL

- Local dev: `http://localhost:4001`
- Production: whatever you've set `APP_BASE_URL` to in `.env`

All routes in this doc are paths off that base.

## Authentication

SCP uses a single-admin password model. You log in once to get a JWT,
then send it as a Bearer token on every subsequent request.

### Log in

```http
POST /auth/login
Content-Type: application/json

{"password": "<ADMIN_PASSWORD>"}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

Tokens last 7 days. Cache the token; refresh when it expires (401 on
any other route). There's no refresh endpoint — just log in again.

### Example with curl

```bash
ADMIN_PW=$(grep ^ADMIN_PASSWORD= /opt/scp/.env | cut -d= -f2- | tr -d '"')
TOKEN=$(curl -s -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PW\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "$TOKEN"
```

### Example with Python

```python
import os
import requests

SCP_BASE = os.environ.get("SCP_API_BASE", "http://localhost:4001")

def login(password: str) -> str:
    r = requests.post(
        f"{SCP_BASE}/auth/login",
        json={"password": password},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["token"]

token = login(os.environ["ADMIN_PASSWORD"])
session = requests.Session()
session.headers["Authorization"] = f"Bearer {token}"
```

---

## Core entities

```
SocialConnection   → one per provider+account you're publishing as
Draft              → the post content (+ optional media + optional schedule)
PublishJob         → a run attempt. Exactly one draft can have many jobs (retries).
Media              → an uploaded asset you can attach to drafts
```

## Happy path: create and publish

The canonical flow is:

1. **Upload media** (optional, if your post has images)
2. **Create a draft** (content + connectionId + mediaIds[])
3. **Publish the draft** with `immediate: true`
4. **Poll for status** (or rely on push-based announce)

### Step 1: Upload media (optional)

```http
POST /media/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

[multipart body with `file` field]
```

Response:

```json
{"media": {"id": "cmn...", "filename": "original.jpg", ...}}
```

Save the `id`. You'll reference it as a `mediaId` on the draft.

### Step 2: Create the draft

```http
POST /drafts
Authorization: Bearer <token>
Content-Type: application/json

{
  "connectionId": "cmnxyaq97001wjl58au2g1q67",
  "content": "Your post text here. Plain text or provider-native markup.",
  "publishMode": "draft-agent",
  "mediaIds": ["cmn..."]
}
```

Response:

```json
{"draft": {"id": "cmn...", "status": "draft", ...}}
```

Fields:
- `connectionId` (required) — which connection to publish through.
  List connections with `GET /connections`.
- `content` (required) — post body. For X, keep under 280 chars unless
  the connection has premium. For LinkedIn, max ~3000. No provider-
  specific formatting (hashtags, @mentions) is enforced here — just
  send the text.
- `publishMode` (required) — usually `"draft-agent"` (immediate) or
  `"schedule"` (with `scheduledFor`). Other modes exist; `"draft-agent"`
  is what you want.
- `mediaIds` (optional) — array of media IDs from step 1. Up to 4 for X,
  up to 10 for LinkedIn.
- `scheduledFor` (optional) — ISO 8601 timestamp for scheduled publish.
  Leave out for immediate.

### Step 3: Publish the draft

```http
POST /publish/<draftId>
Authorization: Bearer <token>
Content-Type: application/json

{"immediate": true}
```

Response:

```json
{
  "queued": true,
  "draft": {"id": "cmn...", "status": "queued", ...},
  "job": {"id": "cmn...", "status": "PENDING", ...}
}
```

**CRITICAL: always pass `immediate: true`** unless you specifically
want the scheduled-publish behavior. Without it, `/publish` honors the
draft's `scheduledFor` — meaning a draft scheduled for next week gets
enqueued with a 7-day BullMQ delay and won't actually fire now.

The `immediate: true` flag also cleans up any previously-pending jobs
for the same draft, preventing double-publishes if you hit the button
twice.

### Step 4: Check the outcome

**Option A — poll:**

```http
GET /jobs/<jobId>
Authorization: Bearer <token>
```

Response:

```json
{
  "job": {
    "id": "cmn...",
    "draftId": "cmn...",
    "status": "SUCCEEDED",
    "receiptJson": {"providerPostId": "...", ...},
    "errorMessage": null,
    "updatedAt": "2026-04-14T01:54:19.780Z"
  }
}
```

Job status transitions: `PENDING → PROCESSING → SUCCEEDED` (or `FAILED`).

Poll at 1–2 second intervals. Most publishes complete in 2–5 seconds;
complex multi-image posts up to 15.

**Option B — check the draft directly:**

```http
GET /drafts/<draftId>
```

When the worker successfully publishes, it atomically sets
`draft.status = 'published'`. That's the sticky ground-truth — once
it's `published`, the post is live forever, even if later job retries
mark themselves as failed.

**Option C — list all jobs for a connection:**

```http
GET /jobs?connectionId=<id>&limit=50
```

Useful for building dashboards or monitoring scripts.

---

## Idempotency

Every `POST /publish` accepts an optional `idempotencyKey`:

```http
POST /publish/<draftId>

{"immediate": true, "idempotencyKey": "your-deterministic-key"}
```

If a request with the same idempotency key has already been processed
and stored a response, SCP returns the cached response rather than
re-enqueueing the job. Use this when:

- You're retrying a network failure from a script and don't know whether
  the first call succeeded
- You have a cron that publishes on a schedule and want to guarantee
  at-most-once delivery even on re-runs

Keys are scoped to the `publish` operation. Any string up to ~100 chars
works. Safe default: `"<your-system>:<draftId>:<timestamp-bucket>"`.

---

## Error codes you should handle

| HTTP | `error` | Meaning | Retry? |
|---|---|---|---|
| 401 | unauthorized | Token expired or missing | Log in again |
| 404 | draft_not_found | The draftId doesn't exist | No — fix the ID |
| 429 | rate_limited | Another job is actively PROCESSING on this connection | Wait 5s, retry |
| 429 | queue_depth_exceeded | Too many PENDING jobs on connection (>200) | Backoff heavily; something upstream is flooding |
| 409 | conflict | Draft is already in a terminal state | Don't retry — check `/drafts/:id` status |
| 500 | internal_error | Server bug | Log it, retry once, escalate if persistent |

The response body always has `{error, message}` at minimum and may
include more fields (e.g. `activeJobId`, `pendingCount`, `retryAfterMs`).

---

## Rate limiting conventions

SCP's rate limiting is **per-connection**, not per-API-key, and only
blocks when a job is **actively PROCESSING**. Scheduled-for-future jobs
do NOT count as active.

If you need to publish multiple drafts on the same connection back-to-back,
wait for each one to reach a terminal state (`SUCCEEDED` or `FAILED`)
before firing the next. Rough cadence: **1 publish every 5–10 seconds
per connection** is safe; faster than that will hit the rate limit
intermittently.

Different connections have no cross-limit — you can fan out as long as
each one serializes internally.

---

## Listing, filtering, and pagination

### List drafts

```http
GET /drafts?status=queued&connectionId=<id>&limit=50&offset=0
```

Filters: `status`, `connectionId`. Pagination: `limit` (default 100,
max 500), `offset`.

### List jobs

```http
GET /jobs?status=FAILED&limit=50
```

### List connections

```http
GET /connections
```

No filters — all connections are returned. Usually you cache this.

### List media

```http
GET /media?limit=50&offset=0
```

---

## Schedules vs immediate publish

To create a **scheduled** draft (publishes automatically at a future time):

```http
POST /drafts

{
  "connectionId": "...",
  "content": "...",
  "publishMode": "schedule",
  "scheduledFor": "2026-04-15T14:30:00.000Z"
}
```

Then call `POST /publish/<draftId>` **without** `immediate: true`:

```http
POST /publish/<draftId>

{}
```

This enqueues a BullMQ delayed job that fires at `scheduledFor`. The
worker picks it up when the delay expires and posts at that moment.

To **override** a scheduled draft and publish NOW, pass `immediate: true`
on the `/publish` call. This clears `scheduledFor`, cancels any pending
delayed BullMQ job, and enqueues a fresh immediate job.

To **reschedule** a draft without publishing, use:

```http
POST /drafts/<id>/reschedule

{"scheduledFor": "2026-04-16T09:00:00.000Z"}
```

This updates the draft's `scheduledFor` AND updates the underlying
BullMQ job's delay so the scheduled publish fires at the new time.

---

## Example: complete Python script

```python
#!/usr/bin/env python3
"""
Publish a draft with an image via SCP API.
Requires: ADMIN_PASSWORD env var + image file path.
"""
import os
import sys
import time
import requests

SCP_BASE = os.environ.get("SCP_API_BASE", "http://localhost:4001")
PASSWORD = os.environ["ADMIN_PASSWORD"]
CONNECTION_ID = os.environ["SCP_CONNECTION_ID"]  # which provider to post as
IMAGE_PATH = sys.argv[1] if len(sys.argv) > 1 else None

# 1. Auth
session = requests.Session()
login_resp = session.post(f"{SCP_BASE}/auth/login", json={"password": PASSWORD}, timeout=20)
login_resp.raise_for_status()
session.headers["Authorization"] = f"Bearer {login_resp.json()['token']}"

# 2. Upload media (optional)
media_ids = []
if IMAGE_PATH:
    with open(IMAGE_PATH, "rb") as f:
        up_resp = session.post(
            f"{SCP_BASE}/media/upload",
            files={"file": (os.path.basename(IMAGE_PATH), f, "image/jpeg")},
            timeout=60,
        )
    up_resp.raise_for_status()
    media_ids.append(up_resp.json()["media"]["id"])

# 3. Create draft
draft_resp = session.post(
    f"{SCP_BASE}/drafts",
    json={
        "connectionId": CONNECTION_ID,
        "content": "Hello from an agent script. 🎣",
        "publishMode": "draft-agent",
        "mediaIds": media_ids,
    },
    timeout=20,
)
draft_resp.raise_for_status()
draft_id = draft_resp.json()["draft"]["id"]
print(f"Draft created: {draft_id}")

# 4. Publish immediately
pub_resp = session.post(
    f"{SCP_BASE}/publish/{draft_id}",
    json={
        "immediate": True,
        "idempotencyKey": f"script-{draft_id}-{int(time.time())}",
    },
    timeout=20,
)
if pub_resp.status_code == 429:
    print(f"Rate limited: {pub_resp.json()}", file=sys.stderr)
    sys.exit(2)
pub_resp.raise_for_status()
job_id = pub_resp.json()["job"]["id"]
print(f"Job queued: {job_id}")

# 5. Poll for completion
for _ in range(30):  # up to 60s
    time.sleep(2)
    job = session.get(f"{SCP_BASE}/jobs/{job_id}", timeout=10).json()["job"]
    status = job["status"]
    print(f"  status={status}")
    if status == "SUCCEEDED":
        print("Published!")
        if job.get("receiptJson"):
            print(f"  provider response: {job['receiptJson']}")
        sys.exit(0)
    if status == "FAILED":
        print(f"Failed: {job.get('errorMessage')}", file=sys.stderr)
        sys.exit(1)

print("Timed out waiting for completion", file=sys.stderr)
sys.exit(3)
```

Run it:

```bash
export ADMIN_PASSWORD=your-password
export SCP_CONNECTION_ID=cmnxyaq97001wjl58au2g1q67
python3 publish_script.py /path/to/image.jpg
```

---

## Anti-patterns (learned the hard way)

### 1. Don't poll `/jobs` in a tight loop

The `/jobs` list query is cheap but not free. Polling every 100ms
against a busy worker is wasteful. 1–2 second polls are plenty for
normal publishes; longer for scheduled runs.

### 2. Don't create a draft for every retry

When a publish fails, retry by calling `POST /publish/<draftId>` again
(with a fresh idempotency key) — don't create a new draft. The same
draftId can have many jobs, and the queue page tracks them correctly.

### 3. Don't re-upload the same media

Media is deduped by SCP, but uploading the same file twice creates two
Media rows with different IDs. Cache your media IDs if you're going to
reuse them across drafts.

### 4. Don't use idempotency keys that include a random component

Defeats the purpose. Keys should be deterministic — same logical
operation → same key → cached response on retry.

### 5. Don't bypass the API for writes

The web UI and the API both write to the same DB and Redis. But SCP
also emits audit events, updates search indexes, and triggers hooks
on writes via the API. Direct DB writes bypass all of that and leave
the system in an inconsistent state. Always go through the API for
anything mutating.

### 6. Don't assume `publishMode="draft-agent"` is the only mode

Other publish modes exist for specific workflows (approval queues,
two-person review, etc.). If a deployment uses those, plain
`draft-agent` drafts will act differently than you expect. Check
`GET /providers/status` or whatever your deployment docs say.

---

## Webhooks (not yet implemented)

The API does not currently push webhooks on job state changes. If you
need async notification of publish completion, poll `/jobs/<id>` or
`/drafts/<id>` after publishing. A webhook system is a planned feature;
watch the repo.

## Next

- `AGENTS.md` (repo root) — hard rules if your agent writes code in
  the SCP repo
- `docs/Operating-Guide.md` — operational runbook for when things
  break in ways the API alone can't explain
