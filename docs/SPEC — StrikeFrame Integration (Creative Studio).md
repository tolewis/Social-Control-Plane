# SPEC — StrikeFrame Integration (Creative Studio)

**Project:** Social Control Plane  
**Feature:** Absorb StrikeFrame rendering engine, add Creative Studio UI  
**Author:** Katya  
**Date:** 2026-04-05  
**Status:** Draft — awaiting Tim review

---

## Problem

StrikeFrame is a standalone CLI tool. To render an image, an agent writes a JSON config, runs `node scripts/render.js config.json`, inspects the output, edits the config, and rerenders. There is no UI, no preview, no bulk workflow. The iteration loop is slow, error-prone, and invisible to Tim.

SCP already handles the downstream pipeline — drafts, media, scheduling, publishing. But creative production (the part before a post has an image) is a disconnected manual process. StrikeFrame images get rendered locally, manually uploaded to SCP or Postiz, and then scheduled. There is no integrated path from "I need 25 ad variants" to "these 8 are approved and scheduled across 4 platforms."

Meta Ads Manager also needs high-quality exports at specific dimensions. Right now those are generated locally and uploaded by hand through the Ads Manager UI.

## Goal

Make SCP the single platform for creative production, review, and publishing. A user or agent should be able to:

1. Pick a primitive (proofHero, comparisonPanel, etc.) and a preset (social-square, landscape-banner, etc.)
2. Fill in content (headline, subhead, CTA, product image, proof screenshot, etc.)
3. Hit "Generate" and see a live preview
4. Hit "Generate Batch" and get 25 variants rendered with controlled parameter diversity
5. Review all 25 in a tiled grid, approve/reject each
6. Approved images become SCP Media records, attachable to Drafts
7. Export approved images at Meta Ads-compliant dimensions for upload to Ads Manager

The critic loop runs automatically on every render. Scores and warnings are visible in the preview UI.

---

## Architecture

### New package: `@scp/renderer`

StrikeFrame's core (`lib/` + `scripts/render.js`) ported to TypeScript inside `packages/renderer/`.

```
packages/renderer/
├── src/
│   ├── index.ts              # public API: render(), renderBatch(), critique()
│   ├── render.ts             # main composition pipeline (port of render.js)
│   ├── normalize.ts          # config normalization + preset resolution
│   ├── svg.ts                # SVG layer builders (text, shapes, badges, icons)
│   ├── overlay.ts            # gradient overlay generation
│   ├── geometry/
│   │   ├── rect.ts
│   │   ├── text.ts
│   │   └── safezone.ts
│   ├── primitives/
│   │   ├── registry.ts       # register/detect/build orchestration
│   │   ├── proofHero.ts
│   │   ├── comparisonPanel.ts
│   │   ├── offerFrame.ts
│   │   ├── benefitStack.ts
│   │   ├── testimonial.ts
│   │   ├── splitReveal.ts
│   │   ├── authorityBar.ts
│   │   └── actionHero.ts
│   └── critic/
│       └── index.ts          # 5-dimension scoring
├── assets/
│   └── fonts/                # Montserrat, Source Sans Pro (for text measurement)
├── package.json              # deps: sharp
└── tsconfig.json
```

**Public API:**

```typescript
// Single render
render(config: RenderConfig): Promise<RenderResult>
// → { image: Buffer, layout: LayoutSidecar, critique: CritiqueResult, warnings: string[] }

// Batch render (25 variants from a base config + variation rules)
renderBatch(config: RenderConfig, options: BatchOptions): Promise<BatchResult>
// → { variants: RenderResult[], summary: BatchSummary }

// Critique only (from existing layout sidecar)
critique(layout: LayoutSidecar): CritiqueResult

// List available primitives and presets
getRegistry(): { primitives: PrimitiveInfo[], presets: PresetInfo[] }
```

**Dependency:** `sharp` only. No new external deps.

### Existing package update: `@scp/visual-engine`

Stays as-is. The visual-engine handles Satori-based infographics (water-temps, species-report, etc.). The renderer handles Sharp-based ad/content creatives. Different tools for different jobs. Both produce Media records.

### API additions (`apps/api`)

New route group: `/studio`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/studio/registry` | List primitives, presets, variant options |
| POST | `/studio/preview` | Render single image from config, return image URL + critique |
| POST | `/studio/batch` | Render 25 variants, return array of preview URLs + critiques |
| GET | `/studio/batch/:batchId` | Get batch status and results |
| POST | `/studio/batch/:batchId/approve` | Approve selected variants → create Media + auto-create Drafts for connected accounts |
| POST | `/studio/export` | Re-render approved image at specified export dimensions |
| DELETE | `/studio/batch/:batchId` | Clean up batch previews |

**Preview storage:** Rendered previews go to `/opt/scp/uploads/studio/{batchId}/` as temporary files. Approved images get promoted to permanent Media records. A cleanup job purges unapproved batches after 24 hours.

**Batch rendering:** Runs in the BullMQ worker as `studio.render-batch` jobs (CPU-intensive Sharp work off the API thread). The API returns a batchId immediately; the client polls for completion.

### Worker additions (`apps/worker`)

New job handlers:

- `studio.render-batch` — Render 25 variants from config + variation rules. Store previews. Update batch record with results.
- `studio.cleanup` — Scheduled job (daily) to purge expired batch previews.

### Database additions (Prisma)

```prisma
model StudioBatch {
  id          String   @id @default(cuid())
  status      String   @default("pending") // pending, rendering, complete, expired
  config      Json     // base RenderConfig
  options     Json     // BatchOptions (variation rules)
  results     Json?    // array of { variantIndex, previewPath, critique, approved }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  expiresAt   DateTime // createdAt + 24h
}
```

### Web UI additions (`apps/web`)

New page: `/studio`

**Layout:** Three-panel design.

**Left panel — Config Builder:**
- Primitive selector dropdown (proofHero, comparisonPanel, offerFrame, benefitStack, testimonial, splitReveal, authorityBar, actionHero)
- Preset selector (social-square, landscape-banner, social-portrait, linkedin-landscape, google-landscape, google-portrait)
- Variant selector (per primitive — e.g., proofHero has standard/quote-hero/attribution-forward)
- Dynamic form fields based on selected primitive:
  - Text fields: headline, subhead, CTA, footer
  - Image upload: background, product photo, proof screenshot
  - Primitive-specific: quote text, star rating, price fields, benefit items, comparison rows
- Layout personality toggle: editorial-left / centered-hero / split-card
- Theme overrides: colors, fonts, overlay opacity

**Center panel — Preview:**
- Single-image preview (live after "Generate")
- Or 25-up grid view (after "Generate Batch")
- Grid shows: thumbnail + critic score badge (green/yellow/red)
- Click any thumbnail to see full-size + full critique report
- Checkbox on each variant for approve/reject
- Sort by critic score or drag to reorder

**Right panel — Critique & Actions:**
- When a single image is selected: full critique breakdown (5 dimensions, score, warnings, failures)
- Geometry visualization overlay toggle (show safe zones, element bounding boxes, collisions)
- Action buttons:
  - "Generate" — single preview
  - "Generate Batch (25)" — batch with variation
  - "Approve Selected" — promote to Media
  - "Create Drafts" — attach to new Drafts (pick connections)
  - "Export for Meta Ads" — download at ad-spec dimensions
  - "Iterate" — re-render with modified config

**Batch variation rules:**
When generating 25 variants, the system varies these parameters within configured ranges:
- Headline Y position (±30px)
- Overlay opacity (±0.1)
- CTA position variants
- Layout personality rotation (if multiple allowed)
- Primitive variant rotation (e.g., cycle through standard/quote-hero/attribution-forward)
- Typography size adjustments (±4px headline, ±2px body)
- Background crop/position shifts

The base config anchors the creative direction. Variations explore the design space around it.

---

## Export for Meta Ads Manager

### Supported export presets

| Name | Dimensions | Use Case |
|------|-----------|----------|
| `meta-feed-square` | 1080x1080 | Facebook/Instagram feed |
| `meta-feed-landscape` | 1200x628 | Facebook feed landscape |
| `meta-story` | 1080x1920 | Instagram/Facebook Stories |
| `meta-carousel` | 1080x1080 | Carousel cards |
| `meta-reels-cover` | 1080x1920 | Reels cover image |

### Export spec
- **Format:** JPG at 95% quality (Meta's recommended quality for ads)
- **Color space:** sRGB
- **Max file size:** < 30 MB (Meta limit)
- **Naming:** `{primitive}-{variant}-{preset}-{index}.jpg`

### Workflow
1. Generate batch in Studio at working dimensions (e.g., social-square 1080x1080)
2. Approve variants
3. Click "Export for Meta Ads" → pick target presets
4. System re-renders approved configs at each target dimension
5. Download as ZIP or individual files
6. Upload to Meta Ads Manager (manual for now; API integration is a future phase)

---

## Integration with existing SCP flows

### Studio → Draft → Publish

```
Studio Generate → Preview → Approve → Media record created
                                         ↓
                                    Create Draft (pick connections)
                                         ↓
                                    Review Console (existing)
                                         ↓
                                    Publish (existing queue)
```

The Studio output feeds directly into SCP's existing draft/review/publish pipeline. No special handling needed — approved variants become standard Media records attached to standard Drafts.

### Agent API usage

Agents can use the Studio API programmatically:

```bash
# Generate a batch (count: 1-50, default 25)
BATCH=$(curl -s $SCP/studio/batch -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config": {...}, "options": {"count": 25}}' | jq -r '.batchId')

# Poll for completion
curl -s $SCP/studio/batch/$BATCH -H "Authorization: Bearer $TOKEN"

# Approve variants → auto-creates Media + Drafts for all connected accounts
curl -s $SCP/studio/batch/$BATCH/approve -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"approved": [0, 3, 7, 12, 18]}'
# Returns: { mediaIds: [...], draftIds: [...] }

# Or scope to specific connections:
curl -s $SCP/studio/batch/$BATCH/approve -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"approved": [0, 3, 7], "connectionIds": ["fb-conn-id", "ig-conn-id"]}'
```

Approve is the terminal action — it creates Media records AND Drafts in one call. Drafts land in the Review Console for final human check before publishing. No separate "create drafts" step needed.

---

---

## Feedback loop (Phase 8 — deferred, architecture-aware)

The hardest problem in AI-assisted creative production is not rendering — it's the round-trip between a human who can see what's wrong and an AI that can fix it but doesn't know what's wrong. Humans think in "that text is too big" and "this feels dark." AIs think in `headlineSize: 48` and `overlayOpacity: 0.82`. The gap kills iteration speed.

**Phase 8 adds a structured annotation layer** that translates human visual feedback into machine-readable revision actions:

- Tap an element in the preview → floating menu: "Too big / Too small / Move / Remove / Recolor"
- Draw a rectangle over a problem area → attach a comment
- Every annotation produces a revision action: `{ target: "headline", action: "resize", direction: "smaller" }`
- The renderer (or agent) applies the action → re-renders → human sees before/after

This is pinned to Phase 8 because:
1. Phases 1-7 work without it (manual config editing is the fallback)
2. It needs real usage data from Phases 3-4 to know which revisions are most common
3. The frontend investment (annotation layer, comment threading, before/after comparison) is significant

But the **revision action schema ships in Phase 1** as part of the critic loop port. The data model is ready; the UI is deferred.

**Design bar:** A 7-billion-parameter model paired with a non-coding marketing human should be able to use every part of Studio — from batch generation to revision feedback — without needing to understand renderer internals. The annotation UI does the translation. The API does the rest.

---

## What this does NOT include

- **AI content generation.** Studio renders from explicit configs. Content (headlines, copy) is written by humans or agents before entering Studio.
- **Meta Ads API integration.** Exports are files for manual upload. Programmatic ad creation via Meta Marketing API is a separate future project.
- **Video rendering.** StrikeFrame is image-only. Video stays in VideoForge.
- **Template marketplace or sharing.** Single-user system.
- **Brand management UI.** Brand tokens (colors, fonts, logos) are in the config. No separate brand settings page yet.

---

## Decisions (locked 2026-04-05)

1. **Visual-engine templates in Studio? YES.** Water-temps, species-report, and other Satori infographics are accessible from the Studio UI. Different rendering backend (Satori vs Sharp) but same preview/approve/draft flow. The primitive selector includes an "Infographics" section alongside the StrikeFrame primitives.

2. **Batch size: CONFIGURABLE.** Default 25, supports 1-50. API accepts `count` in BatchOptions. UI offers presets: 10 / 25 / 50.

3. **Priority: API FIRST.** Ship the `@scp/renderer` package + `/studio/*` API endpoints before building the web UI. Agents can use Studio immediately. UI follows in Phase 3-4.

4. **Auto-create Drafts from approved variants: YES.** When variants are approved, Drafts are automatically created for all connected accounts (one Draft per connection per approved variant). The approve endpoint accepts optional `connectionIds` to scope which accounts get Drafts; defaults to all connected accounts if omitted. Drafts land in the Review Console for final human check before publishing.
