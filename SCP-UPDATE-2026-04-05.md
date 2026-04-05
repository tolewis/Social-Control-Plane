# Social Control Plane — Update 2026-04-05

## Secrets & Public Exposure Cleanup

Repo went public. Scrubbed all infrastructure leaks:

- Removed owner names ("Tim + Katya"), internal IP (192.168.0.114), live domain (social-plane.teamlewis.co) from README
- Deleted RELOCATED-ARTIFACTS.md (exposed /mnt/raid/... and /home/tlewis/... paths)
- server.ts redirect fallback now uses process.env.PUBLIC_URL instead of hardcoded domain
- HelpTab.tsx API base URL derives from window.location.origin instead of hardcoded domain
- next.config.mjs allowedDevOrigins moved to ALLOWED_DEV_ORIGINS env var
- start-dev.sh uses localhost instead of internal IP
- scripts/switch-to-social-domain.sh parameterized — no hardcoded domains, takes args

**No actual secrets (API keys, tokens, passwords) were ever exposed.** Credential handling (AES-256-GCM, .env gitignored) was already solid.

## New Package: @scp/visual-engine

Code-driven infographic renderer. Replaces prompt-based image generation entirely.

- **Stack:** Satori (JSX to SVG) + sharp (SVG to PNG)
- **Location:** packages/visual-engine/
- **First template:** water-temps — Tackle Room water temperature card
- **Output:** 1080x1350px PNG (Instagram portrait optimal)
- **Key point:** Text sizes, logo placement, colors, layout are all locked in code. Agents send structured data, not image prompts. Logo can't shrink, text can't get formal — it's deterministic.

Setup requires:

- Run bash packages/visual-engine/scripts/setup-fonts.sh (downloads Inter TTF)
- Copy real Tackle Room logo to packages/visual-engine/assets/logo.png

## Schema Change: VisualSpec

New Prisma model tying infographic specs to drafts:

- draftId — links to Draft
- templateName — e.g. "water-temps"
- templateData — JSON blob of structured data
- generatedMediaId — ref to the rendered Media record
- validated — boolean, default false

Requires npx prisma db push to apply.

## Pipeline Integration

- **API:** POST /drafts/:id/generate-visual — accepts templateName + templateData, renders PNG, saves to Media, attaches to draft
- **Worker:** draft.generate-visual BullMQ job type — same render flow, queueable
- Both lazy-import @scp/visual-engine to avoid startup overhead

## Configuration Changes

- ALLOWED_DEV_ORIGINS — new env var (comma-separated hostnames), replaces hardcoded list in next.config.mjs
- PUBLIC_URL — now used as redirect URI fallback in server.ts, replaces hardcoded domain

## PR

tolewis/Social-Control-Plane#1 — branch claude/check-exposed-secrets-85j1Z, not yet merged to main

## Still TODO

- Drop real Tackle Room logo into assets/logo.png
- Run npx prisma db push on production DB
- Build additional templates (species reports, tide charts)
- Connect agent prompts to use POST /drafts/:id/generate-visual instead of image model prompts
