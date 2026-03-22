# Social Control Plane — TASKS

Status: Pre-1.0 — integration onboarding shipped, end-to-end publish MVP next
Updated: 2026-03-21

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
- [x] Implement auth gate (HMAC bearer tokens, login page, Next.js middleware)
- [x] Implement OAuth callback + token refresh for all 4 providers
- [x] Implement draft/schedule/publish pipeline with 4 publish modes
- [x] Implement review console (human-in-the-loop approval)
- [x] Implement queue and calendar views
- [x] Implement mobile-responsive layout
- [x] Implement media upload pipeline
- [x] Implement operator and API key management
- [x] Wire API to Prisma + Postgres (replace in-memory persistence)
- [x] Wire UI to real API endpoints (replace mock data)
- [x] Production build + PM2 deployment + HTTPS reverse proxy
- [x] Integration onboarding redesign — per-provider setup cards, encrypted credential storage via UI, status-aware connections page

## Phase 4 — v1.0 ship
- [x] Clarify product positioning around **agent-first** bulk drafts + API publishing + human approval
- [ ] Enter X credentials via Settings UI and complete real OAuth connect
- [ ] Publish a real social post end-to-end (draft → queue → publish → receipt)
- [ ] Verify token refresh works in production
- [ ] Connect at least one more provider (LinkedIn or Facebook)
- [ ] Tag v1.0

## Post-1.0 backlog
- [ ] Smoke test a real X post with media attachment from Social Control Plane using a real screenshot / proof asset
- [ ] Capture one clean real product screenshot showing draft -> approval -> scheduled flow for docs and launch content
- [ ] Implement agent API rate limiting per account
- [ ] Add receipt persistence / delivery confirmation after publish
- [ ] Implement queue circuit breaker
- [ ] Fix pre-existing `slop.ts` typecheck error (`SlopResult.rating` missing)
- [ ] Add bulk scheduling / rescheduling support
- [ ] AI-slop detection API
