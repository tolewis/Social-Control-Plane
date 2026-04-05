# Social Control Plane

Status: Pre-1.0 — integration onboarding complete, end-to-end publish MVP next
Version: 0.9 (1.0 = successful end-to-end social post from the service)
Created: 2026-03-16
Mode: Internal tool first
Desktop + mobile first
Secrets: DB-encrypted (AES-256-GCM) with .env fallback
Style direction: Contractor-AI-inspired layout/feel (not colors)

## Goal
Build an agent-safe social publishing platform to replace the fragile parts of Postiz.

This is **not** a generic schedule-social-posts clone. It is a reliability-first social control plane for Team Lewis: strong API for agents/scripts, human-usable web UI, mobile responsiveness, safer credentialing, deterministic publish queues, and auditability.

## Why this exists
Postiz is usable as a rough UI, but it fails the reliability bar for agent-driven automation: backend instability under bursty write traffic, misleading mutation responses, weak/no idempotency, delete behavior that cannot be trusted blindly, and poor ergonomics for spammy or concurrent agents.

## Product thesis
The right replacement is **API-first, queue-first, credentials-first**. The hardest problem is not rendering a calendar. The hardest problems are provider credentialing + refresh, safe serialized publishing, dedupe/idempotency, and observability/recovery.

## Principles
- Reliability over breadth
- Start with the channels we actually use
- One publish queue per connected account
- Every mutation gets an idempotency key
- Every write leaves an audit trail
- Agents are treated as potentially reckless clients
- Human override always exists
- Support both draft-for-review and direct-publish workflows
- Mobile responsive by default
- Desktop-responsive and mobile-responsive from day one

## MVP scope
### In scope
- Account connections for the first 3-4 platforms that matter most
- Draft / scheduled / published post lifecycle
- Media upload + attachment
- Per-account publish queue with rate limiting
- Idempotent API for agent use
- Mobile-responsive dashboard/calendar/queue view
- Approval/review UI for copy, media, approvals, and rescheduling
- Agents can create drafts for UI approval or publish directly to platforms
- Credential health view (connected, expiring, needs reauth)
- Audit log + job history
- Manual pause / circuit breaker

### Out of scope for MVP
- Every social platform under the sun
- AI content generation inside the product
- Team collaboration complexity beyond what Tim actually needs
- Full analytics suite beyond basic delivery / publish status
- Fancy enterprise roles/permissions before core reliability is proven

## First technical opinion
Do **not** build a Postiz clone monolith. Build a narrower, tougher product around X, LinkedIn, Facebook, and Instagram first.


## Architecture
- `apps/web` — Next.js 16 responsive operator UI (standalone production build)
- `apps/api` — Fastify API with HMAC auth, OAuth flows, encrypted credential storage
- `apps/worker` — BullMQ publish worker with token refresh
- `packages/shared` — shared types/contracts
- `packages/providers` — provider auth adapters (X, LinkedIn, Facebook, Instagram) with credential injection
- `packages/visual-engine` — structured-data infographic renderer + template system
- `prisma/schema.prisma` — Postgres data model (Operator, ApiKey, Connection, Draft, PublishJob, Media, ProviderConfig)
- `docker-compose.dev.yml` — Postgres + Redis for local dev

## Production deployment
Running via PM2 (3 services: scp-api, scp-web, scp-worker).
Reverse-proxied through Nginx Proxy Manager with Let's Encrypt cert.

## Visual engine docs
- Generic reusable skill: `packages/visual-engine/SKILL.md`
- Tackle Room prompting guide: `packages/visual-engine/PROMPTING-GUIDE.md`

If you are integrating visual generation into another agent or app, start with `packages/visual-engine/SKILL.md`.

## What's built (as of 2026-03-21)
- Auth gate (HMAC bearer tokens, login page, middleware)
- OAuth flows for all 4 providers (auth URL generation, callback handling, token storage)
- Encrypted credential storage via Settings UI (AES-256-GCM, per-provider)
- Integration onboarding redesign: 3-state provider cards (unconfigured → configured → connected)
- Connections page: status-aware with deep links to setup
- Draft/schedule/publish lifecycle with 4 publish modes (draft-human, draft-agent, direct-human, direct-agent)
- Review console for human-in-the-loop approval
- Queue and calendar views
- Media upload
- Operator and API key management
- Full mobile-responsive layout
- Help/docs tab with per-provider setup guides and API reference

## What's left for 1.0
- Enter real X credentials via Settings UI and complete OAuth connect
- Publish a real social post end-to-end through the platform
- Verify the full lifecycle: draft → queue → publish → receipt

## Positioning calibration (2026-03-21)

Current plain-English message:

**Social Control Plane is an agent-first social publishing system.**

It exists for the workflow most social tools still handle badly:
- bulk drafting by agents/scripts
- API-driven scheduling/publishing
- human approval before something actually goes live

That is the useful frame. Not "another scheduler," not a vague Postiz replacement, and not an AI-content toy.
