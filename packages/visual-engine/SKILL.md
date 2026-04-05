# Visual Engine Skill

Baseline generic skill for any agent or developer using `@scp/visual-engine`.

## What this is

`@scp/visual-engine` renders branded social graphics from structured data.

Use it when you want:
- deterministic infographic cards
- repeatable layout and typography
- API-driven media creation
- brand consistency without prompt roulette

Do **not** use an image model for these cards unless you intentionally want freeform art instead of structured branded output.

## Core workflow

1. Pick a template.
2. Gather real structured data.
3. Render through SCP:
   - `POST /drafts/:id/generate-visual`
4. Confirm:
   - HTTP 200
   - Media record created
   - draft now references the media
   - `/uploads/...png` exists on disk

## Current templates

- `water-temps`
- `species-report`
- `tide-chart`
- `catch-of-the-week`
- `product-spotlight`
- `tournament-results`
- `article-ad`

## Verification checklist

When changing templates, renderer code, or API wiring, verify in this order:

1. `pnpm --filter @scp/api prisma:generate`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm --filter @scp/visual-engine run render:sample`
5. Real API smoke test through `POST /drafts/:id/generate-visual`

If step 5 is skipped, verification is incomplete.

## Deployment requirements

### Fonts

The renderer needs TTF fonts present in `packages/visual-engine/assets/`.

Install them with:

```bash
bash packages/visual-engine/scripts/setup-fonts.sh
```

If fonts are missing, render can fail even when the code is correct.

### Brand assets

Put real brand assets in `packages/visual-engine/assets/`.
If you replace a placeholder asset, make sure the template default filename points to the real file.

## Common failure modes

### `React is not defined`
Cause:
- runtime JSX path needs explicit React import in template `.tsx` files

Fix:
- add `import React from 'react';` to the affected templates

### Render works in CLI but fails through API
Cause:
- runtime path mismatch, missing deploy assets, or API-only import/validation issue

Fix:
- run the real API smoke test, not just CLI render

### Unknown template / validation failure
Cause:
- `templateName` not in the server allowlist

Fix:
- register the template in the visual-engine package and in the SCP API validation layer

## Data rules

- Use real data, not invented filler
- Keep fields concise; templates are designed for short high-signal text
- Let the renderer own layout, hierarchy, and brand treatment
- Do not stuff marketing copy into data fields

## Related docs

- `packages/visual-engine/PROMPTING-GUIDE.md`
- `packages/visual-engine/src/templates/types.ts`
- `packages/visual-engine/src/cli.ts`
