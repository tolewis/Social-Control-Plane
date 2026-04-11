# LMNT-Style Product Ad Template

Replicates the LMNT "Everything you need. Nothing you don't." layout for TackleRoom product ads.

## Layout

- 1080x1080 square (Meta feed)
- Warm stone background (#F6F5F3)
- Bold two-line headline at top (line 1 dark, line 2 orange accent)
- Orange underline accent beneath headline
- Product image centered, white background auto-removed
- 4 stat callouts radiating from product (top-left, top-right, bottom-left, bottom-right)
- Each stat: large blue value → label → orange bar underneath
- Curved arrows pointing from stats toward product
- TackleRoom wordmark logo at bottom
- URL text below logo

## Usage

```bash
cd /opt/scp/packages/renderer/templates/lmnt-product
node render.mjs
```

Output lands at the path set in `OUTPUT` constant (default: `/mnt/raid/Data/tmp/openclaw-builds/`).

## Customizing for a new product

Edit these constants in `render.mjs`:

| Constant | What to change |
|----------|---------------|
| `OUTPUT` | Output file path |
| `PRODUCT_PATH` | Path to product image (white bg, will be auto-removed) |
| Headline `tspan` text | Line 1 (dark) and line 2 (orange) of the hook |
| `stats[]` array | 4 objects: `{ value, label, x, y }` — the spec callouts |

### Stat positioning guide

Stats are positioned in pairs:
- Top row: `y: 300` — flanks the top of the product
- Bottom row: `y: 830` — flanks the bottom
- Left stats: `x: 145`
- Right stats: `x: 935`

Adjust if the product image has a different aspect ratio.

## Brand colors

| Color | Hex | Usage |
|-------|-----|-------|
| Royal Blue | `#001EC3` | Stat values, brand accent |
| Orange | `#E8722A` | Headline L2, accent bars, CTA elements |
| Warm Stone | `#F6F5F3` | Background |
| Dark | `#1A1A1A` | Headline L1 |
| Gray | `#888888` | Stat labels |

## Dependencies

- Sharp (from SCP monorepo: `createRequire('/opt/scp/packages/renderer/package.json')`)
- No other dependencies — bypasses StrikeFrame dark-mood pipeline intentionally

## Design reference

Based on LMNT ad examples in `/home/tlewis/Dropbox/Tim/Datasets/AdExamples-kb/`:
- `03_ingredient-purity-stack.jpg` — primary layout reference
- `06_science-backed-feature-stack.jpg` — stat callout style

## Proven output

First approved version: `lure-ad-test-E.png` (Epic Axis Wahoo Kit, 2026-04-08)
