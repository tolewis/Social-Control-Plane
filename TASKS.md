# Social Control Plane — TASKS

Status: MVP scaffold in progress

## Phase 0 — Direction
- [x] Confirm we should explore replacing Postiz rather than continuing to patch around it
- [x] Create project folder / repo skeleton
- [ ] Lock product name
- [x] Decide MVP platforms (X, LinkedIn, Facebook, Instagram)
- [x] Decide whether credential security should be good-local or future-SaaS-grade from day one (good-local / local encrypted first)

## Phase 1 — Product definition
- [x] Finalize product goal, scope, and non-goals
- [ ] Define agent API requirements
- [ ] Define anti-spam / dedupe / rate-control rules
- [ ] Define post lifecycle + reconciliation model
- [ ] Define delete semantics (soft delete, restore, hard delete)
- [x] Define credential model and security posture
- [x] Define mobile UX priorities
- [x] Define approval workflow policy (both draft-for-review and direct publish must exist)

## Phase 2 — Architecture
- [x] Choose stack for API, frontend, worker, queue
- [x] Define repo structure
- [x] Define provider adapter contract
- [x] Define OAuth callback + token refresh architecture
- [x] Define audit/event model
- [ ] Define deployment model for Team Lewis local hosting

## Phase 3 — MVP build
- [x] Scaffold apps/web, apps/api, apps/worker
- [ ] Implement auth/admin shell
- [ ] Implement account connection flows for first provider
- [ ] Implement media upload pipeline
- [ ] Implement draft/schedule/publish pipeline
- [ ] Implement queue + idempotency + circuit breaker
- [x] Implement mobile-responsive queue/calendar view

## Open decisions for Tim
- [ ] Product name
- [x] MVP platforms
- [x] Internal tool first vs possible product later
- [x] Local-only secret model vs portable cloud-grade secret model


## Immediate next build steps
- [ ] Wire API publish requests into BullMQ so API -> worker is real, not parallel scaffolds
- [ ] Replace in-memory API persistence with Prisma + Postgres
- [ ] Finish LinkedIn auth/connect vertical slice end-to-end
- [ ] Add operator auth/admin shell
- [ ] Add receipt persistence + reconciliation state transitions
