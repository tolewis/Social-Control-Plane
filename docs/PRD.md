# PRD — Social Control Plane

Status: Draft
Updated: 2026-03-16

## Product summary
Social Control Plane is a Team Lewis-owned social publishing system built for two realities that Postiz handles poorly:
1. humans need a fast modern UI to review, approve, reschedule, and inspect what is going out
2. agents need a strong API that does not turn bursty automation into duplicate posts, silent failures, or backend collapse

This product is **internal-tool first**. Productization is optional later.

## Problem
Postiz is fragile for agent-driven work:
- backend instability under bursty writes
- weak/no idempotency
- misleading mutation responses
- dangerous delete semantics
- poor observability around auth, retries, and reconciliation

Meanwhile the credential problem is ugly enough that replacing Postiz only makes sense if the replacement treats provider auth/token lifecycle as a first-class system, not an afterthought.

## Users
- Tim on desktop
- Tim on mobile
- Katya / agents via API

## Primary jobs to be done
1. Connect a social account safely
2. Know whether credentials are healthy or need reauth
3. Create a draft with copy + media
4. Review/approve/reschedule in UI
5. Publish directly from API when appropriate
6. Inspect receipts, failures, and retries
7. Stop or pause publishing if something smells wrong

## MVP channels
- X
- LinkedIn
- Facebook
- Instagram

## MVP workflows
### A. Draft for review
- agent creates draft
- UI reviews copy/media
- user approves or reschedules
- queue publishes
- receipt stored

### B. Direct publish
- agent requests direct publish
- API validates + dedupes + enqueues
- worker publishes
- receipt stored
- ambiguous outcomes enter reconciliation

## Agent API requirements
Agents (Katya, etc.) get full CRUD access to the publishing pipeline:
- Create, edit, delete, schedule, reschedule, and modify posts
- Direct publish when appropriate (bypasses review queue)
- Rate-limited per account — no burst publishing (one at a time per account, serialized queue)
- Everything Postiz can do, but with reliable idempotency and clear failure states

## Hard requirements
1. Every mutation must support idempotency keys.
2. Every connected account must have a serialized publish queue.
3. Delete is **hard delete**. No soft delete complexity. Agent memory can repost.
4. Credentials/tokens must be encrypted at rest.
5. Desktop and mobile are first-class UI targets.
6. UI quality bar is modern, calm, touch-friendly, and system-driven.
7. Styling should take structural inspiration from Contractor-AI, but not its color palette.
8. Local-first deployment must be robust. Final destination is web-hosted. Login screen deferred for local but architecture must support it.

## Non-goals for MVP
- broad multi-tenant SaaS complexity
- deep analytics
- long-tail provider support
- AI writing/generation features inside the product

## Acceptance criteria
- One provider can complete connect -> draft -> review -> schedule/publish -> receipt end-to-end
- API prevents duplicate create/publish on retried requests
- A publish failure is visible and explainable in UI
- Mobile UI is usable for review, approval, and queue inspection
- Credential health page makes reauth pain manageable
