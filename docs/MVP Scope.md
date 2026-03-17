# MVP Scope — Social Control Plane

Status: Draft
Updated: 2026-03-16

## In scope
- Team Lewis internal operator auth
- Social account connection flows for X, LinkedIn, Facebook, Instagram
- Credential health dashboard
- Drafts
- Media attachments
- Schedule / direct publish actions
- Serialized per-account queues
- Idempotent command API
- Audit log / receipts / job history
- Review + approval + rescheduling UI
- Mobile-responsive queue / calendar / post detail screens
- Reconciliation states for ambiguous provider outcomes

## Out of scope
- public multi-tenant signup/billing
- role explosion / enterprise RBAC
- analytics warehouse / BI suite
- content generation assistant inside the product
- support for every network imaginable

## MVP vertical slice
The first true MVP slice should be:
1. operator login
2. connect one provider
3. create draft via API
4. review/approve in UI
5. publish via worker
6. store receipt
7. show success/failure state in queue/history

## Recommended build order
1. repo + stack scaffold
2. operator auth for the app itself
3. DB schema + encryption primitives
4. provider auth abstraction
5. LinkedIn connector first
6. draft + queue + publish pipeline
7. UI shell (dashboard, queue, review screen)
8. Meta connector family (Facebook/Instagram)
9. X connector

## Why LinkedIn first
- standard OAuth 2 flow
- high business value
- lower chaos than Meta/X for the first pass

## Why Meta next
- Facebook + Instagram can share app/auth concepts
- biggest credential pain area, so worth solving early

## Why X after
- useful, but auth mechanics are their own special flavor of nonsense
