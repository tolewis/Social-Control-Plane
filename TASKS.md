# Social Control Plane — TASKS

Status: MVP build in progress

## Phase 0 — Direction
- [x] Confirm we should explore replacing Postiz rather than continuing to patch around it
- [x] Create project folder / repo skeleton
- [x] Lock product name → **Social Control Plane**
- [x] Decide MVP platforms (X, LinkedIn, Facebook, Instagram)
- [x] Decide whether credential security should be good-local or future-SaaS-grade from day one (good-local / local encrypted first)

## Phase 1 — Product definition
- [x] Finalize product goal, scope, and non-goals
- [x] Define agent API requirements → full CRUD (create, edit, delete, schedule, reschedule, modify). Agents can publish but rate-limited per account (no burst-10-at-once). Everything Postiz does, better.
- [x] Define anti-spam / dedupe / rate-control rules → per-account serialized queue (already architected). Agents rate-limited to sane throughput, not burst.
- [x] Define post lifecycle → simple: draft → queued → published → (optionally) deleted. No formal reconciliation model. Platform analytics (FB/IG/LinkedIn/X) can feed back via API if available but not MVP-blocking.
- [x] Define delete semantics → **hard delete**. No soft delete. Agent memory can repost anything deleted. Keep it simple.
- [x] Define credential model and security posture
- [x] Define mobile UX priorities
- [x] Define approval workflow policy (both draft-for-review and direct publish must exist)

## Phase 2 — Architecture
- [x] Choose stack for API, frontend, worker, queue
- [x] Define repo structure
- [x] Define provider adapter contract
- [x] Define OAuth callback + token refresh architecture
- [x] Define audit/event model
- [x] Define deployment model → local-first with robust self-hosting. Final destination is web-based. Login/auth screen deferred for local mode but planned in the architecture.

## Phase 3 — MVP build
- [x] Scaffold apps/web, apps/api, apps/worker
- [ ] Implement auth/admin shell (deferred for local; architecture planned)
- [ ] Implement account connection flows for first provider (LinkedIn)
- [ ] Implement media upload pipeline
- [ ] Implement draft/schedule/publish pipeline
- [ ] Implement queue + idempotency + circuit breaker
- [x] Implement mobile-responsive queue/calendar view

## Open decisions for Tim
- [x] Product name → Social Control Plane
- [x] MVP platforms
- [x] Internal tool first vs possible product later
- [x] Local-only secret model vs portable cloud-grade secret model
- [x] Delete semantics → hard delete
- [x] Agent API scope → full CRUD, rate-limited, no burst
- [x] Deployment → local-first, web final destination, login deferred

## Immediate next build steps
- [ ] Wire API publish requests into BullMQ so API -> worker is real, not parallel scaffolds
- [ ] Replace in-memory API persistence with Prisma + Postgres
- [ ] Finish LinkedIn auth/connect vertical slice end-to-end
- [ ] Wire UI to real API endpoints (replace mock data)
- [ ] Add receipt persistence after publish
- [ ] Implement agent API rate limiting per account
