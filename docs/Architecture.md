# Architecture — Social Control Plane

## Core design stance
The system should be built around **command safety**, not around a calendar widget.

## Primary services
1. **Web app** — draft editor, queue view, connection health, copy/media review, approvals, rescheduling, direct-publish controls, kill switch, mobile responsive
2. **API service** — authenticated UI API, agent API, OAuth callbacks, webhook intake
3. **Worker service** — publish jobs, token refresh jobs, reconciliation jobs, media jobs
4. **Database** — accounts, connections, credentials metadata, posts, media, publish jobs, audit events, idempotency keys

## Credential model
Separate three things: app credentials, connection tokens, and operational mapping.

### Required behavior
- encrypt tokens at rest
- track expiry
- track scopes
- show reconnect-needed state in UI
- never let agents touch raw provider credentials directly

## Agent-safe mutation model
All agent writes go through a strict command path: create draft -> attach media -> schedule/publish request -> queue assignment -> provider publish attempt -> receipt/reconciliation.

### Guardrails
- one active publish worker per connected account (serialized queue, no burst)
- idempotency key on every mutation
- dedupe hash on account + content + media + scheduled time window
- agents are rate-limited per account — cannot flood-publish
- publish failures are visible and explainable, not silently swallowed

## Delete model
**Hard delete.** No soft delete. Agent memory can repost anything deleted. Keep the data model simple — when something is deleted, it's gone. Provider-side delete is a separate action from internal record deletion.

## Frontend stance
Frontend for 2030 should mean fast, touch-friendly, clear states, responsive layouts that do not suck on phone, and no overdesigned glassmorphism bullshit.

## Recommended first platform order
1. LinkedIn
2. X
3. Facebook
4. Instagram


## Workflow modes
- **Draft-for-review mode** where agents create drafts and the UI handles review/approval
- **Direct publish mode** where agents can publish straight to platforms when appropriate
- UI must support reviewing copy, reviewing media, approving, rejecting, rescheduling, and promoting drafts to publish


## Deployment model
- **Local-first** with robust self-hosting as the primary target
- Final destination is **web-based** (hosted deployment)
- Login/auth screen is **deferred** for local mode — can be overridden/skipped when running locally
- Architecture must support operator auth so it can be enabled when going web-hosted
- The local experience should work without any login gate

## Secret-management stance
- Start with **local encrypted secrets** for v1
- Keep the credential abstraction clean so KMS/cloud-secret backends can be added later
- Do not make v1 hostage to enterprise secret plumbing


## Design direction
- Desktop and mobile are both first-class, not desktop-now/mobile-later
- Use `contractor-ai.com` as inspiration for layout polish, spacing, hierarchy, and overall product feel
- Do **not** copy the Contractor-AI color palette; styling inspiration is structure/system quality, not brand colors
- Aim for a modern 2030-grade interface: clean typography, calm density, strong information hierarchy, and touch-friendly controls
