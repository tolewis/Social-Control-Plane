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
- one active publish worker per connected account
- idempotency key on every mutation
- dedupe hash on account + content + media + scheduled time window
- no hard delete by default
- ambiguous result => reconciliation state, not silent failure

## Delete model
Default = soft delete / canceled. Hard delete only for cleanup/admin flows. Provider-side delete should be separated from internal record deletion.

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


## Secret-management stance
- Start with **local encrypted secrets** for v1
- Keep the credential abstraction clean so KMS/cloud-secret backends can be added later
- Do not make v1 hostage to enterprise secret plumbing


## Design direction
- Desktop and mobile are both first-class, not desktop-now/mobile-later
- Use `contractor-ai.com` as inspiration for layout polish, spacing, hierarchy, and overall product feel
- Do **not** copy the Contractor-AI color palette; styling inspiration is structure/system quality, not brand colors
- Aim for a modern 2030-grade interface: clean typography, calm density, strong information hierarchy, and touch-friendly controls
