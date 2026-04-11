# Ad Creative Template System — Playbook

## Overview

8 ad template frameworks derived from LMNT's proven ad library (`~/Dropbox/Tim/Datasets/AdExamples-kb/`). Built with Sharp + SVG composition, bypassing StrikeFrame's dark-mood pipeline. Each template is a reusable framework — swap product, copy, and stats for any product.

## Template Inventory

| # | Template | Ref | Status | Best For |
|---|----------|-----|--------|----------|
| 1 | `lmnt-product` | #03 | **Proven** — 10 ads live on Meta | Product launches, spec-heavy kits |
| 2 | `contrarian-hook` | #08 | **Proven** — 4 ads live on Meta | Pattern-interrupt, provocative claims |
| 3 | `benefit-grid` | #04 | **Proven** — 4 ads live on Meta | System/feature showcase, "complete kit" |
| 4 | `comparison-chart` | #11 | **Proven** — 3 ads live on Meta | Us vs DIY/competitor, side-by-side |
| 5 | `testimonial` | #02 | **In progress** — layout v3, content approved | Social proof, review-based authority |
| 6 | advertorial | #07 | **Not started** — needs lifestyle photography | News-hook, trending angle |
| 7 | bold-slogan | #15 | **Needs rework** — v1 was redundant | Big punchy claim + benefit strip |
| 8 | icon-strip | #12 | **Needs rework** — v1 was sterile | Benefit columns + social proof ticker |

## How to Create Ads for a New Product

### 1. Gather inputs
- **Product image** — white background, from Shopify CDN or `~/Dropbox/Tim/TackleRoom/Creative/`
- **Headline copy** — two lines: setup (dark) + payoff (orange). The payoff line is the scroll-stopper.
- **Stats/specs** — 4 key numbers + labels for lmnt-product and comparison templates
- **Landing page URL** — for the Meta ad copy (not burned into the image)

### 2. Pick a template
- **Launching a new product?** → `lmnt-product` (stat callouts) + `benefit-grid` (feature strip)
- **Need scroll-stop energy?** → `contrarian-hook` (massive headline)
- **Have competitor weakness?** → `comparison-chart` (us vs them)
- **Have strong reviews?** → `testimonial` (pull-quote + review card)

### 3. Add the product to the ads array in the template's render script

```js
{
  id: 'new-product-identity',
  productPath: '/path/to/product.jpg',
  shape: 'roundrect',              // always roundrect
  headL1: 'Setup line.',           // dark text
  headL2: 'Payoff line.',          // orange text (scroll-stopper)
  stats: [
    { v: '480lb', l: 'STAINLESS CABLE' },
    { v: '5', l: 'UV COLORS' },
    { v: '32oz', l: 'WEIGHT' },
    { v: '$84.99', l: 'COMPLETE KIT' },
  ],
}
```

### 4. Render
```bash
cd /mnt/raid/Data/tmp/openclaw-builds
node /opt/scp/packages/renderer/templates/<template>/render.mjs
```

### 5. Review the output yourself before showing Tim
Look at the actual image. Check:
- Is the headline readable at thumbnail size?
- Does the power word emphasis land on the right word?
- Is the product visible but not competing with the headline?
- Is the logo visible and not overlapping anything?
- Would you stop scrolling?

## Template Framework Details

### lmnt-product
- Warm stone bg (#F6F5F3)
- 2-line headline: L1 dark, L2 orange + underline accent
- Product on white roundrect card, centered
- 4 stat callouts at corners: blue value + gray label + orange bar underneath
- Curved arrows pointing from stats toward product
- Logo centered bottom

### contrarian-hook
- Warm stone bg
- MASSIVE dark headline, left-aligned, stacked (2-3 words/line, 92px)
- Orange diagonal accent block on right side
- Product on white roundrect card, lower-right on the orange block
- Logo bottom-left, tagline bottom-right
- The headline IS the ad — keep it confrontational

### benefit-grid
- Warm stone bg
- 2-line headline: L1 dark, L2 orange
- Royal blue benefit strip with 5 columns, white text, dividers
- Product on white roundrect card, centered below strip
- Logo bottom-left

### comparison-chart
- Split panel: royal blue left (us) / warm right (them)
- Product on white roundrect card, upper-left
- Mangled lure on white roundrect card, upper-right
- Orange VS badge centered
- 4 comparison rows: green check (us) vs red X (them)
- White inverted logo on blue panel, bottom-left

### testimonial
- Dark bg (#1A1A1A) — makes white review card pop
- MASSIVE italic serif pull-quote, power word in orange
- 5 gold stars, generous spacing
- White review card (55% of ad): blue avatar initial, name, verified badge, body text
- Tiny product on roundrect, bottom-right corner overlapping card edge
- Logo on card bottom-left (navy on white)

## Headline Copy Rules

1. **Specific, not generic.** Test: could this headline work for ANY fishing product? If yes, it's too weak. "BUILT FOR OFFSHORE." = generic garbage. "12 OUNCES OF WAHOO INSURANCE." = specific, vivid, scroll-stopping.
2. **Identity-first, specs-as-proof.** Lead with who the buyer becomes or what changes, not what the product is. "STOP RIGGING. START FISHING." not "Pre-Rigged Wahoo Kit."
3. **Power word in orange.** Not the last word — the EMOTIONALLY IMPORTANT word.
4. **End with a period.** Premium brands use periods, not exclamation marks.
5. **Create a mental image or challenge.** The reader should see themselves or feel provoked. "29 BUCKS. TOURNAMENT SMOKE." puts them on the boat.
6. **Use the product's sharpest edge.** What's the ONE thing that makes this product different? Time saved? Price per unit? Material grade? Stainless when competitors use chrome? THAT is the headline, not a category label.
7. **Two lines for two-tone templates.** First line = setup (dark). Second line = payoff (orange). Single-line for bold-slogan format.
8. **2-3 words per line** for contrarian hook (stacked). Full sentences for other templates.

### Headline Anti-Patterns (DO NOT USE)
- "YOUR [PRODUCT CATEGORY]." — "Your Wahoo Spread" = category label, not a headline
- "BUILT FOR [CONTEXT]." — "Built for Offshore" = vague, applies to anything
- "[ADJECTIVE] [NOUN]." — "Offshore Ready" = two generic words
- Anything that describes the product category instead of making a CLAIM

### Good Headline Examples (from proven templates)
- "ONE BOX. FULL WAHOO SPREAD." — specific scope, identity
- "IS YOUR HARDWARE READY?" — challenge, provocation
- "STOP RIGGING. START FISHING." — pain→solution, identity shift
- "12 OUNCES OF WAHOO INSURANCE." — vivid, specific, emotional
- "29 BUCKS. TOURNAMENT SMOKE." — price + performance
- "7 LURES. ONE CLIP." — specific number + action

## Logo Rules (HARD REQUIREMENTS)

1. **NEVER invert the TackleRoom logo.** No white logos, no negated logos, no exceptions.
2. **Always place logo on a white or near-white background.** If the surrounding area is dark, create an opaque white rounded rect (`rx=10`, fill="white") behind the logo.
3. **Logo on white elements:** headline band (warm/white bg templates), review card (testimonial), benefit strip (if white), or dedicated white logo frame.
4. **Logo frame on dark areas:** `190×65px` opaque white rounded rect. Center logo inside: `x = frameX + (frameW - logoW) / 2`, `y = frameY + (frameH - logoH) / 2`. The actual logo after `trim()` + `resize({fit:'inside'})` is ~111×50, NOT the target dimensions.
5. **Logo size:** 200px wide on warm/light backgrounds, 140px wide (in 190px frame) on dark backgrounds.

## Pricing & Claims (LEGAL REQUIREMENTS)

1. **Verify EVERY price against Shopify** before burning it into an image. Prices change.
2. **"SAVE $X" must reflect real math.** Kit price vs sum of components. Round to nearest dollar.
3. **Free shipping threshold is $69**, not $99. Confirmed across all email templates and existing Meta ads.
4. **"BEST SELLER" / "5-STAR RATED"** — must be defensible. Verify against sales data or Judge.me reviews.
5. **"FROM $X"** — only use if multiple price points exist. If all variants are the same price, just state the price.

## Badge / Starburst Rules

1. **Composite badges AFTER the product image** in the Sharp layer order. Otherwise the product card covers the badge.
2. **Position badges to intentionally overlap the product card edge** — this creates visual energy (like LMNT's "FREE SAMPLE PACK" starburst).
3. **Badge text must be big enough to read at phone scroll speed.** Use 22-28px font, 900 weight.

## QC Process (MANDATORY before presenting to Tim)

1. **Render all variants.**
2. **Visually inspect every image at full resolution.** Not thumbnails.
3. Check each image for:
   - [ ] Badge fully visible, not hidden behind product
   - [ ] Logo visible on white background, not inverted
   - [ ] Logo centered in its frame
   - [ ] No element overlap (logo vs product, headline vs badge, etc.)
   - [ ] Headline readable at phone scroll speed
   - [ ] All text spelled correctly
   - [ ] Pricing/claims match Shopify reality
   - [ ] Would YOU stop scrolling for this headline?
4. **Fix all issues before presenting.** Don't show work with known bugs.

## Color Palette System

Three palettes × optional mirroring for asymmetric templates:
- **dark/default** — charcoal hero (#1A1A1A), white headline band
- **blue** — royal blue hero (#001EC3), white headline band  
- **warm** — charcoal hero (#2A2A2A), warm stone headline band (#F6F5F3)

## Lessons Learned (prevent repeat mistakes)

1. **Canva AI generation cannot replicate specific ad styles.** It picks generic templates. Don't use it for style replication.
2. **StrikeFrame's dark-mood pipeline fights light backgrounds.** Bypass it — use Sharp + SVG directly.
3. **Background removal is a losing battle.** White roundrect shapes behind products work better than rembg or flood-fill on any background.
4. **SVG tspan elements collapse whitespace.** Use `xml:space="preserve"` on the parent text element.
5. **LMNT's core tactic: the accent color does the stopping, not the headline text.** Colored strips, bars, blocks create the eye-catch. Headlines are mostly white or dark.
6. **White space is a design element.** Cramming quote→stars→card with no air between them kills the premium feel. LMNT uses generous vertical padding between zones.
7. **Generic headlines waste the entire ad.** "Built for Offshore" stops nobody. Every hour spent on layout is wasted if the headline doesn't stop the scroll. Write the headline FIRST, from the product's sharpest competitive edge + the buyer's pain point.
8. **Greenscreen compositing requires professional tools.** PIL/Sharp chroma key can't match lighting, perspective, or edge quality. Don't attempt it — use studio-style (white bg) product shots or real lifestyle photography.
9. **Emoji icons don't reliably render in SVG.** Use SVG path-based icons (bolt, check, shield, target, gear, star, anchor, wave, hook).
10. **Sharp composite order matters.** Layers are painted in array order. Anything that should appear "on top" (badges, logos) must come AFTER the elements they overlap.

## File Locations

| What | Path |
|------|------|
| Template scripts | `/opt/scp/packages/renderer/templates/<name>/render.mjs` |
| Shared utilities | `/opt/scp/packages/renderer/templates/shared/` |
| Product images (source) | `/mnt/raid/Data/tmp/openclaw-builds/` |
| Ad outputs (Dropbox) | `~/Dropbox/Tim/TackleRoom/Creative/lures/ad-templates/` |
| LMNT reference images | `~/Dropbox/Tim/Datasets/AdExamples-kb/` |
| Creative brief | `~/Documents/projects/30 Projects/TackleRoom/Integrations/Meta Ads API/2026-04-08 - Lure Ad Set Creative Brief.md` |
| Meta Ads API skill | `~/Documents/projects/90 System/40 Agent System/Agents/skills/meta-ads-api/SKILL.md` |
| Judge.me API skill | `~/Documents/projects/90 System/40 Agent System/Agents/skills/judgeme/judgeme_api.py` |
