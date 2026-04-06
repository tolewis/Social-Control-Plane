# WORK PLAN — StrikeFrame Integration (Creative Studio)

**Spec:** `docs/SPEC — StrikeFrame Integration (Creative Studio).md`  
**Author:** Katya  
**Date:** 2026-04-05  
**Status:** Draft — awaiting Tim review

---

## Phase summary

| Phase | Name | What ships | Depends on |
|-------|------|-----------|------------|
| 1 | Port StrikeFrame to `@scp/renderer` | New package, `render()` + `critique()` work from TS | — |
| 2 | Studio API | `/studio/*` endpoints, batch rendering in worker | Phase 1 |
| 3 | Studio UI — single preview | `/studio` page with config builder + live preview | Phase 2 |
| 4 | Studio UI — batch grid | Configurable grid, approve/reject, auto-draft | Phase 3 |
| 5 | Draft integration (UI) | Approve confirmation, Review Console navigation | Phase 4 |
| 6 | Meta Ads export | Re-render at ad dimensions, download as ZIP | Phase 4 |
| 7 | Agent API docs + skill | SCP skill updated, agent workflow tested | Phase 5 |
| 8 | Feedback loop — human-AI visual revision | Annotate images, text comments, structured revision requests | Phase 4 |

Each phase produces a working, testable increment. No phase requires all subsequent phases to be useful.

---

## Phase 1 — Port StrikeFrame to `@scp/renderer`

**Goal:** StrikeFrame's rendering engine works as a TypeScript package inside the SCP monorepo.

### Tasks

1. **Create package scaffold**
   - `packages/renderer/package.json` (name: `@scp/renderer`, dep: `sharp`)
   - `packages/renderer/tsconfig.json`
   - Add to `pnpm-workspace.yaml`
   - Note: `@scp/visual-engine` (Satori infographics) stays separate but will be called from Studio API alongside renderer in Phase 2

2. **Port geometry module** (`lib/geometry/` → `packages/renderer/src/geometry/`)
   - `rect.js` → `rect.ts` — add types to all functions (Rect interface, overlaps, intersection, contains, gaps, findCollisions, computeOccupancy)
   - `text.js` → `text.ts` — add types to font metrics, measureWidth, measureBlock, classifyText, wrapText
   - `safezone.js` → `safezone.ts` — add types to platform presets, mobile readability check
   - `index.ts` — re-export all

3. **Port primitives** (`lib/primitives/` → `packages/renderer/src/primitives/`)
   - `index.js` → `registry.ts` — typed register/detect/build/resolve
   - Port all 8 primitives to TS: proofHero, comparisonPanel, offerFrame, benefitStack, testimonial, splitReveal, authorityBar, actionHero
   - Define `PrimitiveInterface` type (id, configKey, variants, resolve, build)
   - Each primitive is a self-contained module, no cross-deps

4. **Port critic** (`lib/critic/` → `packages/renderer/src/critic/`)
   - `index.js` → `index.ts` — typed CritiqueResult, dimension scores

5. **Port render pipeline** (`scripts/render.js` → `packages/renderer/src/`)
   - `render.ts` — main composition (Sharp pipeline)
   - `normalize.ts` — config normalization, preset resolution, logo modes
   - `svg.ts` — SVG layer builders (text, badges, icon glyphs)
   - `overlay.ts` — gradient overlay generation
   - `index.ts` — public API (`render()`, `renderBatch()`, `critique()`, `getRegistry()`)

6. **Define types** (`packages/renderer/src/types.ts`)
   - `RenderConfig` — full config schema (preset, template, text, layout, typography, overlay, theme, primitive configs, imageLayers, textLayers, badges, designIntent, constraintPolicy)
   - `RenderResult` — { image: Buffer, format: string, layout: LayoutSidecar, critique: CritiqueResult, warnings: string[] }
   - `BatchOptions` — { count: number, variations: VariationRule[] }
   - `BatchResult` — { variants: RenderResult[], summary: BatchSummary }
   - `LayoutSidecar`, `CritiqueResult`, `PrimitiveInfo`, `PresetInfo`

7. **Verify** — Write a smoke test script that renders a proofHero config and a comparisonPanel config via the new TS package. Compare output dimensions and critic scores against the original JS output.

### Acceptance
- `pnpm --filter @scp/renderer build` passes
- `render(proofHeroConfig)` produces a 1080x1080 JPG with critic score > 80
- All 8 primitives render without error
- No new external dependencies beyond `sharp`

---

## Phase 2 — Studio API

**Goal:** API endpoints for rendering previews and batches, backed by worker jobs.

### Tasks

1. **Database migration**
   - Add `StudioBatch` model to `prisma/schema.prisma`
   - Run `prisma db push`

2. **Preview storage setup**
   - Create `/opt/scp/uploads/studio/` directory
   - Add static file serving for `/uploads/studio/*` in API

3. **API routes** (in `apps/api/src/server.ts` or new `studio.ts` route module)
   - `GET /studio/registry` — call `getRegistry()` from renderer + list visual-engine templates, return combined JSON
   - `POST /studio/preview` — accept RenderConfig (or `{ engine: "renderer" | "visual-engine", ... }`), route to correct backend, save to `uploads/studio/preview-{id}.jpg`, return URL + critique
   - `POST /studio/batch` — accept config + options (`count`: 1-50, default 25), create StudioBatch record, enqueue `studio.render-batch` job, return batchId
   - `GET /studio/batch/:batchId` — return batch status + results array
   - `POST /studio/batch/:batchId/approve` — accept `{ approved: number[], connectionIds?: string[] }`. Create Media records for approved variants. Auto-create Drafts for each approved variant × each connection (defaults to all connected accounts if connectionIds omitted). Returns mediaIds + draftIds.
   - `DELETE /studio/batch/:batchId` — delete preview files + batch record

4. **Worker job: `studio.render-batch`**
   - Fetch batch record
   - Generate 25 variant configs from base config + variation rules
   - Render each via `render()`, save to `uploads/studio/{batchId}/{index}.jpg`
   - Store results array (previewPath, critique, dimensions) in batch record
   - Mark batch status = "complete"
   - Handle errors per-variant (mark individual failures, don't fail whole batch)

5. **Worker job: `studio.cleanup`**
   - BullMQ repeatable job, runs daily
   - Delete StudioBatch records where `expiresAt < now`
   - Delete corresponding preview files from disk

6. **Variation engine** (`packages/renderer/src/variations.ts`)
   - Takes a base config + BatchOptions
   - Produces N variant configs with controlled parameter changes:
     - Headline Y jitter (±30px)
     - Overlay opacity sweep (±0.1)
     - Primitive variant rotation
     - Layout personality rotation
     - Typography size deltas
     - CTA position variants
   - Deterministic seed per batch for reproducibility

### Acceptance
- `POST /studio/preview` returns a rendered image URL + critique JSON
- `POST /studio/batch` returns batchId; polling shows 25 results
- Approving variants creates Media records visible in SCP media list
- Cleanup job removes expired batches

---

## Phase 3 — Studio UI (single preview)

**Goal:** `/studio` page where Tim can pick a primitive, fill in content, and see a rendered preview.

### Tasks

1. **Page scaffold** — `apps/web/app/studio/page.tsx`

2. **Config Builder component** (left panel)
   - Primitive selector dropdown
   - Preset selector dropdown
   - Dynamic form that changes based on selected primitive:
     - Common fields: headline, subhead, CTA, footer, background image
     - proofHero: quote, star rating, review screenshot, product image
     - comparisonPanel: left/right headers, rows with check/X
     - offerFrame: original price, sale price, savings text
     - benefitStack: list of { icon, label } items
     - testimonial: quote, name, role, star count
     - splitReveal: problem text, solution text
     - authorityBar: publication list text
     - actionHero: (minimal — uses common fields)
   - Layout personality toggle
   - Image upload fields (integrate with existing SCP media upload)

3. **Preview component** (center panel)
   - Display rendered image from `/studio/preview` response
   - Loading state while rendering
   - Image shown at actual aspect ratio, scaled to fit

4. **Critique panel** (right panel)
   - Overall score with color badge
   - 5 dimension bars (geometry, hierarchy, readability, spacing, persuasion)
   - Warnings list
   - Failures list (if any)
   - Stop recommendation (ship / iterate / escalate)

5. **API hooks**
   - `useStudioRegistry()` — fetch primitives + presets on mount
   - `useStudioPreview(config)` — POST to `/studio/preview`, manage loading/result state

### Acceptance
- Select proofHero + social-square, fill in fields, click Generate, see rendered image
- Critique scores visible and match expected ranges
- Works on mobile (responsive layout, stacked panels)

---

## Phase 4 — Studio UI (batch grid)

**Goal:** Generate 25 variants, review in a tiled grid, approve/reject.

### Tasks

1. **Batch trigger** — "Generate Batch" button in config builder
   - Count selector: 10 / 25 / 50 (default 25)
   - Sends config to `POST /studio/batch` with `count`
   - Shows progress indicator (polling batch status)

2. **Grid view component**
   - 5x5 thumbnail grid (responsive: 3-col on tablet, 2-col on mobile)
   - Each tile shows: thumbnail image, critic score badge, checkbox
   - Click tile → full-size preview + full critique in right panel
   - Sort controls: by critic score, by variant index
   - "Select All Passing" button (score ≥ 85)
   - "Deselect All" button

3. **Approve flow**
   - "Approve Selected" button → POST to `/studio/batch/:id/approve`
   - Approved variants get green border, promoted to Media records
   - Drafts auto-created for all connected accounts (or scoped via optional connection picker)
   - Show summary: "8 approved → 48 drafts created (6 accounts × 8 images)"
   - "Go to Review" button navigates to Review Console

4. **Batch status polling**
   - Poll `GET /studio/batch/:id` every 2 seconds while status = "rendering"
   - Show progress bar (variants completed / 25)
   - Stream results as they arrive (show thumbnails incrementally)

### Acceptance
- Click "Generate Batch" → see 25 thumbnails appear as they render
- Click thumbnails to inspect critique details
- Approve 8, see 8 Media records created in SCP
- Grid is responsive across screen sizes

---

## Phase 5 — Draft integration (UI)

**Goal:** Studio UI surfaces the auto-created Drafts and provides navigation to review them.

Note: Draft auto-creation happens in Phase 2 (the approve endpoint creates Drafts automatically). This phase adds UI for the workflow.

### Tasks

1. **Approve confirmation UI** in Studio batch grid
   - After approve call returns, show summary: "5 variants approved → 30 drafts created (6 connections × 5 images)"
   - "Go to Review" button → navigates to `/review`
   - Optional: schedule picker in approve modal (applies scheduledFor to all auto-created drafts)

2. **Connection scoping UI** (optional)
   - Before approving, optionally pick which connections get Drafts
   - Default: all connected accounts (matches API default)

3. **Navigation breadcrumbs**
   - Studio → Review Console link when drafts exist
   - Review Console shows Studio-generated drafts with a "Studio" badge

### Acceptance
- Approve 3 variants → see confirmation with draft count
- Click "Go to Review" → see drafts in Review Console with images attached
- Publishing works normally through existing queue

---

## Phase 6 — Meta Ads export

**Goal:** Re-render approved images at Meta Ads-compliant dimensions, download as files.

### Tasks

1. **Export API endpoint**
   - `POST /studio/export`
   - Body: `{ mediaIds: string[], presets: string[] }` (e.g., presets = ["meta-feed-square", "meta-feed-landscape"])
   - Re-renders original config at each target dimension
   - Returns ZIP download URL or individual file URLs

2. **Export presets** (added to renderer)
   - `meta-feed-square` → 1080x1080
   - `meta-feed-landscape` → 1200x628
   - `meta-story` → 1080x1920
   - `meta-carousel` → 1080x1080
   - `meta-reels-cover` → 1080x1920
   - JPG quality: 95%

3. **Export UI**
   - "Export for Meta Ads" button in Studio (visible after approvals)
   - Preset checkboxes (which dimensions to export)
   - Download button → triggers ZIP download

4. **Config persistence**
   - Store the original RenderConfig in the Media record metadata (or link back to StudioBatch)
   - This allows re-rendering the same creative at different dimensions later

### Acceptance
- Approve an image, export at meta-feed-square + meta-feed-landscape
- Download ZIP with both JPGs at correct dimensions
- JPG quality visibly higher than default web exports

---

## Phase 7 — Agent API docs + skill

**Goal:** Agents can use the Studio programmatically.

### Tasks

1. **Update SCP skill** (`skills/social-control-plane/SKILL.md`)
   - Add Studio section with all endpoints
   - Add example workflows (single preview, batch, approve, draft)
   - Add config schema reference

2. **Update StrikeFrame skill** (`skills/strikeframe/SKILL.md`)
   - Mark standalone CLI as deprecated
   - Point to SCP Studio as canonical rendering path
   - Keep config reference (schema hasn't changed)

3. **Update media-renderer skill** (`skills/media-renderer/SKILL.md`)
   - Route to SCP Studio for all rendering
   - Keep visual-engine path for infographics (water-temps, etc.)

4. **Agent smoke test**
   - Script that: creates a proofHero batch via API → waits → approves top 5 → creates drafts
   - Verify end-to-end programmatic flow

### Acceptance
- An agent can generate, approve, and schedule a creative batch entirely via API
- Skills documentation is current and non-contradictory

---

## Phase 8 — Feedback loop (human-AI visual revision)

**Goal:** A human can look at a rendered image and communicate what's wrong — visually and in text — and the system translates that into structured revision actions that the renderer (or an agent) can execute.

This is the hardest problem in the whole system. AI models know how to adjust typography, swap images, change crops, and fix contrast. But they get garbage input from the human side because there's no structured way to say "the headline is too big and the overlay isn't giving enough contrast on the left side." The human sees the problem but can't articulate it in renderer-config terms. The AI can fix it but doesn't know what's wrong.

### The communication problem

Today's loop: human sees bad image → types vague feedback in chat → agent guesses which config parameters to change → re-renders → human says "no, that's worse" → repeat 5 times → everyone gives up.

What we need: human sees bad image → taps the headline and picks "too big" from a menu → draws a rectangle over the low-contrast area → types "swap this background for something darker" → system packages all of that into a structured revision request → renderer (or agent) applies it → human sees the diff.

### Design (high-level — detailed spec deferred to implementation time)

**Visual annotation layer:**
- Click/tap any element in the preview to select it (uses geometry sidecar bounding boxes)
- Selected element shows a floating action menu: "Too big", "Too small", "Move up/down", "Remove", "Change color", "More contrast"
- Draw a freeform rectangle to highlight an area + attach a comment
- Pinch/drag to suggest crop adjustments on background images

**Text comment panel:**
- Per-image comment thread (like Figma comments)
- Comments can reference specific elements ("@headline is too large")
- Comments can reference areas (linked to drawn rectangles)

**Structured revision output:**
- Every annotation produces a machine-readable revision action:
  ```json
  {
    "target": "headline",
    "action": "resize",
    "direction": "smaller",
    "reason": "user annotation: too big"
  }
  ```
- The renderer's critic loop already defines revision actions (scoped, not "make it better"). These annotations map directly to that vocabulary.
- An agent receiving these actions knows exactly which config parameters to change.

**Round-trip flow:**
1. Human annotates image (visual + text)
2. System generates structured revision actions
3. Agent (or renderer auto-revise) applies changes to config
4. Re-render
5. Human sees before/after comparison (side-by-side or overlay toggle)
6. Repeat until approved

**The "7B model" bar:**
- The revision actions must be simple enough that a small model can interpret them
- No ambiguity: "headline.fontSize: decrease by 8px" not "make the text feel less dominant"
- The annotation UI does the translation — the human points and picks, the system writes the structured action

### Why this is pinned last

- Phases 1-7 work without this. Humans iterate by editing the config form and re-rendering.
- The feedback loop is a UX research problem as much as an engineering one. Needs real usage data from Phases 3-4 to know which revision actions are most common.
- The annotation layer (element selection from geometry sidecar, freeform drawing, comment threading) is a significant frontend investment.
- But: the **data model for revision actions should be designed in Phase 1** (it already exists in StrikeFrame's critic loop). The feedback loop UI is Phase 8, but the revision action schema ships early.

### Tasks (scoped when Phase 8 begins)

1. **Revision action schema** — formalize the vocabulary (resize, reposition, recolor, swap-image, remove, adjust-contrast, crop). Map each to specific config mutations.
2. **Element selection layer** — overlay geometry sidecar bounding boxes on preview image. Click to select. Show floating action menu.
3. **Annotation drawing** — freeform rectangle tool for highlighting areas.
4. **Comment thread** — per-image comments with element/area references.
5. **Revision compiler** — translate annotations → structured revision actions → config delta.
6. **Auto-apply** — renderer accepts a config + revision actions, produces new config + re-render.
7. **Before/after comparison** — side-by-side or overlay toggle view.
8. **Agent revision API** — `POST /studio/revise` accepts revision actions, returns new preview.

### Acceptance
- Human taps "headline" in preview, picks "too big" → system re-renders with smaller headline
- Human draws rectangle over dark area, types "not enough contrast" → system increases overlay opacity in that region
- Human says "swap background" → system shows image picker, re-renders with new image
- Small model (7B) can read the revision action JSON and produce a valid config delta

---

## Usability requirements (applies to ALL phases with UI)

### For humans: every screen must be self-explanatory

- **No blank states.** Every empty screen has a clear "here's what to do" message with a single primary action.
- **Contextual help.** Tooltip on every non-obvious control. Not a manual — a sentence.
- **Field labels are instructions.** "Headline (2-8 words, what stops the scroll)" not just "Headline."
- **Primitive descriptions.** Each primitive in the selector has a one-line description + example thumbnail: "ProofHero — customer review front and center, product supporting."
- **Score explanations.** Critic scores have plain-English tooltips: "Readability: 72 — headline would be 10px on mobile, consider making it larger."
- **Error messages are actions.** "Image too small (minimum 1080px wide) — upload a larger version" not "Invalid image."
- **Progress is visible.** Batch rendering shows "Rendering 14 of 25..." not a spinner.

### For AI agents: the API must be unambiguous at the 7B-model level

The bar: a 7-billion-parameter model with no coding experience, paired with a non-technical marketing human, should be able to use the Studio API correctly by reading the skill doc.

- **Every endpoint has a complete curl example** with realistic data, not `{...}` placeholders.
- **Every field has a type, range, and default** in the schema docs. No implicit knowledge.
- **Error responses include the fix.** `{ "error": "missing_field", "field": "config.text.headline", "fix": "Add a headline string (2-8 words)" }`.
- **The registry endpoint returns everything an agent needs** to build a valid config from scratch — field names, types, ranges, defaults, required/optional, example values. An agent should never need to guess.
- **Revision actions use a closed vocabulary.** No freeform "make it better." The agent picks from: `resize`, `reposition`, `recolor`, `swap-image`, `remove`, `adjust-contrast`, `crop`, `change-font`. Each action has typed parameters.

---

## Execution order and estimates

| Phase | Effort | Can start after |
|-------|--------|----------------|
| 1 — Port to `@scp/renderer` | Large (mostly mechanical TS conversion of ~2500 lines JS) | Now |
| 2 — Studio API | Medium (6 endpoints + 2 worker jobs + 1 migration) | Phase 1 |
| 3 — Studio UI single preview | Medium (3 components + 2 hooks + responsive layout) | Phase 2 |
| 4 — Studio UI batch grid | Medium (grid component + polling + approve flow) | Phase 3 |
| 5 — Draft integration (UI) | Small (approve confirmation + navigation) | Phase 4 |
| 6 — Meta Ads export | Small (1 endpoint + ZIP generation + preset configs) | Phase 4 |
| 7 — Agent docs + skill | Small (documentation + 1 test script) | Phase 5 |
| 8 — Feedback loop | Large (annotation layer + revision compiler + round-trip UI) | Phase 4 |

**Phases 5, 6, and 8 are independent** — can run in parallel after Phase 4.

**Minimum viable path:** Phases 1-4 deliver the core value (render + preview + batch grid + approve + auto-draft). Phase 5 polishes the UI. Phase 6 adds ad export. Phase 7 is documentation. Phase 8 is the long-pole UX investment for human-AI iteration.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sharp version conflict between renderer and visual-engine | Build breaks | Both use sharp ^0.33; pin to same version in workspace root |
| 25 Sharp renders take too long (CPU-bound) | Slow batch UX | Worker renders in parallel (5 at a time with `p-limit`). Show results incrementally as they complete. |
| Config schema is complex, form builder is large | Phase 3 takes longer than expected | Start with proofHero + comparisonPanel only. Add other primitives incrementally. |
| StrikeFrame JS has no tests | Regression risk during TS port | Render a reference set of configs before porting, compare output images after. Pixel-diff or dimension/score comparison. |
| Preview images accumulate disk space | Disk fills up | Cleanup job purges batches after 24h. Batch previews are ~200KB each, 25 = 5MB per batch. Manageable. |

---

## Files modified (existing)

| File | Change |
|------|--------|
| `pnpm-workspace.yaml` | Add `packages/renderer` |
| `prisma/schema.prisma` | Add `StudioBatch` model |
| `apps/api/src/server.ts` | Add `/studio/*` routes (or extract to `studio.ts` route module) |
| `apps/worker/src/index.ts` | Register `studio.render-batch` and `studio.cleanup` handlers |
| `apps/web/app/` | Add `studio/` page directory |
| `apps/web/app/_lib/api.ts` | Add Studio API client functions |
| `apps/web/app/_components/AppNav.tsx` | Add Studio link to sidebar |

## Files created (new)

| File | Purpose |
|------|---------|
| `packages/renderer/` | Entire new package (TS port of StrikeFrame) |
| `apps/api/src/studio.ts` | Studio route handlers (optional — could stay in server.ts) |
| `apps/worker/src/workerJobs/handlers/handleStudioRender.ts` | Batch render job handler |
| `apps/worker/src/workerJobs/handlers/handleStudioCleanup.ts` | Cleanup job handler |
| `apps/web/app/studio/page.tsx` | Studio page |
| `apps/web/app/studio/ConfigBuilder.tsx` | Left panel config form |
| `apps/web/app/studio/PreviewPanel.tsx` | Center panel image display |
| `apps/web/app/studio/CritiquePanel.tsx` | Right panel scoring |
| `apps/web/app/studio/BatchGrid.tsx` | 25-up thumbnail grid |
| `apps/web/app/studio/ExportModal.tsx` | Meta Ads export UI |
| `apps/web/app/studio/DraftModal.tsx` | Create drafts from approved |
