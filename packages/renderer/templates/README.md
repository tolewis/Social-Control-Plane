# Renderer templates

**Heads-up for new deployers:** the `.mjs` files under each subfolder in this
directory are **not part of the SCP runtime**. The canonical renderer
pipeline is `packages/renderer/src/` — that's what the API and worker import
and what actually produces production renders when you hit `/studio/import`
or any of the render endpoints.

These `.mjs` files are **personal ad-generation scripts** written by the
original author (Tim Lewis) for the TackleRoom saltwater-fishing brand. They
are kept in the repo as **reference implementations** so you can see how the
primitives stack up into full 1080×1080 ad creatives. You are expected to
delete them, move them, or — most usefully — copy them into your own parallel
folder structure and edit for your own brand.

## Why they're still here

- They demonstrate the full render-all → critique → save loop end-to-end,
  which is not yet documented elsewhere.
- They show how logo trimming, product-on-shape compositing, and SVG text
  layout work together in practice.
- The inline SVG + sharp pipeline is a useful starting point for anyone
  building their own ad templates.

## What's TackleRoom-specific (don't expect these to run on your machine)

Every `render.mjs` file under this folder has hardcoded absolute paths to
brand assets that exist only on the original author's machine:

- `LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png'`
- `BASE = '/mnt/raid/Data/tmp/openclaw-builds'`
- Product photos named for specific TackleRoom SKUs (epic-axis-kit-product.jpg,
  jagahoo-*, chugger-*, etc.)
- Brand colors `#001EC3` (royal blue) and `#E8722A` (orange) are TackleRoom's
- Watermark text `thetackleroom.com` is hardcoded into the SVG footer of
  several templates
- Copy is fishing-specific (cobia, tuna, bridle, trolling, etc.)

**None of this matters for running SCP itself.** SCP's production code does
not import these files — only the `packages/renderer/src/` pipeline runs in
the API and worker processes.

## How to create your own templates

1. Make a new folder: `packages/renderer/templates/<your-brand>/<template-name>/`
2. Either copy one of the TackleRoom `render.mjs` files as a starting point
   and edit the paths/colors/copy, or start fresh using the primitives in
   `packages/renderer/src/primitives/`.
3. Output renders to a scratch path outside the repo
   (`/tmp/<your-brand>-renders/` or similar).
4. Upload the final PNGs into SCP via the Studio UI — that's the supported
   path, not checking generated assets into the repo.
5. Keep your brand's `LOGO_PATH` etc. in environment variables or a local
   config file, not hardcoded.

## What's actually runtime code in this package

```
packages/renderer/
├── src/                    ← runtime, imported by API + worker
│   ├── render.ts          ← main entry
│   ├── primitives/        ← proofHero, comparisonPanel, actionHero, ...
│   ├── critic/            ← layout / hierarchy / readability scoring
│   ├── geometry/          ← rect, text, safezone
│   └── config/            ← presets (meta-feed-square, etc.)
└── templates/              ← YOU ARE HERE — reference / example scripts
    ├── README.md          ← this file
    ├── shared/            ← shared utilities for the reference scripts
    ├── lmnt-product/      ← TackleRoom Epic Axis example
    ├── testimonial/       ← TackleRoom testimonial example
    ├── contrarian-hook/   ← TackleRoom contrarian hook example
    ├── benefit-grid/      ← TackleRoom benefit grid example
    └── comparison-chart/  ← TackleRoom comparison chart example
```

To use the actual runtime renderer:

```ts
import { render } from '@scp/renderer';
const result = await render({
  preset: 'meta-feed-square',
  primitive: 'proofHero',
  content: { headline: '...', subhead: '...', cta: '...' },
  // ... see packages/renderer/src/config/ for full schema
});
```
