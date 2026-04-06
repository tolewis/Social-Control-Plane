# Social Control Plane — TASKS

Status: Pre-1.0 — media publishing shipped, real FB publish verified
Updated: 2026-03-22

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
- [x] Fix PM2 crash loop — rewrote ecosystem.config.cjs to use tsx directly as interpreter (no bash wrappers), .env parsed in config
- [x] Media publishing — all 4 platform adapters (FB, IG, X, LinkedIn) implement publish() with multi-step media upload flows. Worker loads media from DB, adapter uploads binary and creates post. Verified end-to-end on Facebook (receipt: 1669244329963758_1997534617736331).

## Phase 4 — v1.0 ship
- [x] Clarify product positioning around **agent-first** bulk drafts + API publishing + human approval
- [x] Publish a real social post end-to-end (draft → queue → publish → receipt) — Facebook photo post verified 2026-03-22
- [ ] Enter X credentials via Settings UI and complete real OAuth connect
- [ ] Verify token refresh works in production
- [ ] Connect at least one more provider (LinkedIn — already has credentials)
- [ ] Tag v1.0

## Post-1.0 backlog
- [ ] Smoke test a real X post with media attachment
- [ ] Capture one clean real product screenshot showing draft -> approval -> scheduled flow for docs and launch content
- [ ] Implement agent API rate limiting per account
- [ ] Add receipt persistence / delivery confirmation after publish
- [ ] Implement queue circuit breaker
- [ ] Fix pre-existing `slop.ts` typecheck error (`SlopResult.rating` missing)
- [x] Re-enable PM2 systemd startup: `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u tlewis --hp /home/tlewis` (enabled 2026-03-23)
- [ ] Add bulk scheduling / rescheduling support
- [ ] AI-slop detection API

## Creative Studio — StrikeFrame Integration
Spec: `docs/SPEC — StrikeFrame Integration (Creative Studio).md`
Work plan: `docs/WORK PLAN — StrikeFrame Integration.md`

- [x] Phase 1 — Port StrikeFrame to `@scp/renderer` (commit `08f1d2d`, 2026-04-05)
- [x] Phase 2 — Studio API (`/studio/*` endpoints, StudioBatch model, worker jobs, variation engine) — commit `a9fe064`, 2026-04-05
- [x] Phase 3 — Studio UI single preview + batch grid (`/studio` page, config builder, preview, batch, approve) — commit `7499cdf`, 2026-04-06
- [x] Phase 4 — Studio UI batch grid (configurable 1-50, approve/reject, auto-draft) — shipped with Phase 3
- [ ] Phase 5 — Draft integration UI (approve confirmation, Review Console navigation)
- [ ] Phase 6 — Meta Ads export (re-render at ad dimensions, ZIP download)
- [ ] Phase 7 — Agent API docs + skill (SCP skill updated, smoke test)
- [ ] Phase 8 — Feedback loop (annotation layer, revision compiler, round-trip UI)
