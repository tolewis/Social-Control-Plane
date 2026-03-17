# Stack Decision — Social Control Plane

Status: Proposed
Updated: 2026-03-16

## Recommendation
Use a TypeScript monorepo with separate web, api, and worker apps.

## Chosen stack
- **Workspace:** pnpm workspaces
- **Web:** Next.js 15 + TypeScript + Tailwind + shadcn/ui
- **API:** Fastify + Zod + TypeScript
- **Worker:** Node TypeScript worker
- **DB:** Postgres
- **Queue:** BullMQ + Redis
- **ORM:** Prisma
- **Validation/contracts:** Zod
- **State/query (web):** TanStack Query
- **Auth for product operators:** simple internal auth first (emailless local/admin), expandable later
- **Secrets:** local encrypted first
- **Storage:** local/S3-compatible media abstraction

## Why this stack
### Next.js web
Fast path to a modern desktop/mobile UI with strong component ergonomics.

### Fastify API
Lean, explicit, fast, and easier to keep narrow than a giant framework monolith.

### Worker + BullMQ
Publishing and token-refresh work should not live in request/response paths. Queueing is not optional here.

### Prisma + Postgres
Good enough ergonomics and speed for internal-tool MVP work.

## What we are intentionally not doing
- not building a single-process monolith
- not copying Postiz architecture wholesale
- not letting publish jobs run inside the web server
- not over-optimizing for hypothetical SaaS scale on day one

## Repo shape
- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/providers`
- `packages/shared`
- `packages/ui`
- `docs`

## Design-system direction
- Use Contractor-AI as inspiration for layout quality, hierarchy, spacing, and product polish
- Do not reuse Contractor-AI brand colors
