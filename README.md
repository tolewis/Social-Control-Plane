# Social Control Plane

Status: Planning
Owner: Tim + Katya
Created: 2026-03-16
Mode: Internal tool first
Desktop + mobile first
Secrets: local encrypted first
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
