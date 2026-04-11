# Shared Utilities — Ad Template System

## product-on-shape.mjs

Places a product image on a white geometric shape (roundrect or circle) with drop shadow. Eliminates the need for background removal entirely.

```js
import { productOnShape } from './product-on-shape.mjs';
const buf = await productOnShape('/path/to/product.jpg', 'roundrect', 520, 520, 25, 0.08);
```

**Parameters:**
- `imagePath` — any image format, white bg is fine
- `shape` — `'roundrect'` (standard) or `'circle'`
- `outputW`, `outputH` — dimensions of the shape+product unit
- `padding` — space between product and shape edge (default 30)
- `shadowOpacity` — drop shadow darkness (default 0.08)

**Returns:** PNG buffer with transparent background outside the shape.

**Why this exists:** AI background removal (rembg) and flood-fill both produced artifacts on dark backgrounds. White shapes solve the problem completely — the product sits on a clean white card that works on any background color.

## remove-bg.mjs

AI background removal via rembg (U2Net). Requires the venv at `/mnt/raid/Data/tmp/openclaw-builds/.venv-rembg`. Use `product-on-shape.mjs` instead for ad templates — it's more reliable.

## render-all.mjs

Master render script for templates 1-4 (lmnt-product, contrarian-hook, benefit-grid, comparison-chart). Contains all ad definitions, palette configs, and render functions. Run from `/mnt/raid/Data/tmp/openclaw-builds/` (needs product images there).

## Color Palettes

All templates support 3 palettes:

| Palette | Background | Head Text | Accent | Strip/Bar | Logo |
|---------|-----------|-----------|--------|-----------|------|
| A (warm) | `#F6F5F3` | `#1A1A1A` | `#E8722A` | `#001EC3` | Navy (normal) |
| B (blue) | `#001EC3` | `#FFFFFF` | `#E8722A` | `#E8722A` | White (inverted) |
| C (white) | `#FFFFFF` | `#1A1A1A` | `#E8722A` | `#001EC3` | Navy (normal) |

## Fonts

- Headlines: `Montserrat, Helvetica Neue, Arial, sans-serif` — weight 800-900
- Body/labels: `Source Sans Pro, Helvetica, Arial, sans-serif` — weight 400-700
- Quotes (testimonial): `Georgia, Times New Roman, serif` — italic, weight 700

## Brand Assets

- Logo (horizontal wordmark): `~/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png`
- Mangled lure (comparison "them" side): `~/Dropbox/Tim/TackleRoom/Creative/lures/ad-templates/comparison-chart/mangled.png`
