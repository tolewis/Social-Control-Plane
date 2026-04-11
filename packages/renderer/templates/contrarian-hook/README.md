# Contrarian Hook Template

Replicates the LMNT "Your sports drink is lying to you" dark scroll-stopper layout for TackleRoom product ads.

## Layout

- 1080x1080 square (Meta feed)
- Dark charcoal background (#1E1E1E)
- MASSIVE white headline, left-aligned, stacked (2-3 words per line, ~92px)
- Orange accent block — diagonal polygon on right side
- Product image positioned over the accent block, lower-right
- Brand logo + tagline bottom-left
- Maximum simplicity — the headline IS the ad

## When to use

This template is a **pattern-interrupt scroll-stopper**. Use it for:
- Contrarian hooks ("The guys catching wahoo aren't building their own rigs.")
- Provocative challenges ("Your wahoo rig is failing you.")
- Short punchy statements ("Stop rigging in the dark.")
- Authority claims ("A chugger caught the world record.")

NOT for: spec-heavy product showcases (use `lmnt-product` template instead).

## Usage

```bash
cd /opt/scp/packages/renderer/templates/contrarian-hook
node render.mjs
```

## Customizing

Edit the `ads` array in `render.mjs`:

```js
{
  id: 'hook-01-wahoo-rigs',           // output filename
  product: '/path/to/product.jpg',     // white-bg product image
  lines: ['The guys', 'catching', 'wahoo aren\u2019t', 'building', 'their own', 'rigs.'],
  tagline: 'Pre-Rigged Wahoo Lure Kits',
}
```

### Headline rules
- 2-3 words per line maximum
- 4-6 lines total (fits at 92px font size)
- End with a period. Premium brands use periods.
- The headline does ALL the work — no body copy in the image

## Brand colors

| Color | Hex | Usage |
|-------|-----|-------|
| Dark BG | `#1E1E1E` | Background |
| White | `#FFFFFF` | Headline text |
| Orange | `#E8722A` | Accent block (diagonal polygon) |
| White 60% | `rgba(255,255,255,0.6)` | Tagline text |

## Known issues

- TackleRoom logo is navy blue — invisible on dark bg. Need a white/inverted logo variant, or use text-only branding.
- Product images with non-white backgrounds won't clean up properly via the flood-fill remover.

## Design reference

Based on LMNT ad example: `AdExamples-kb/08_contrarian-hook-sports-drink-lying.jpg`

## Proven output

First batch: 4 hook variants (2026-04-08) — wahoo rigs, hardware failing, stop rigging, chugger record.
