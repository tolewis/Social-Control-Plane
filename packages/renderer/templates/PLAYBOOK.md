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

1. **Two lines.** First line is the setup. Second line is the payoff.
2. **Power word in orange.** Not the last word — the EMOTIONALLY IMPORTANT word.
3. **End with a period.** Premium brands use periods, not exclamation marks.
4. **2-3 words per line** for contrarian hook (stacked). Full sentences for other templates.
5. **Identity-first, specs-as-proof.** "Stop rigging at 5 AM." not "480lb stainless cable."

## Lessons Learned (prevent repeat mistakes)

1. **Canva AI generation cannot replicate specific ad styles.** It picks generic templates. Don't use it for style replication.
2. **Canva editing API cannot change font family.** Supports size/weight/color but not the font itself.
3. **StrikeFrame's dark-mood pipeline fights light backgrounds.** Bypass it — use Sharp + SVG directly.
4. **Background removal is a losing battle.** White roundrect shapes behind products work better than rembg or flood-fill on any background.
5. **SVG tspan elements collapse whitespace.** Use `xml:space="preserve"` on the parent text element.
6. **Don't invert the TackleRoom logo for dark backgrounds.** It looks bad. Either place the logo on a white element (card, strip) or use a light-bg template.
7. **Review every render before showing Tim.** AI-on-AI stacking produces garbage. Look at your output.
8. **Emphasis the right word, not the last word.** "quality" not "Room." "second to none" not just "none."
9. **LMNT's core tactic: the accent color does the stopping, not the headline text.** Colored strips, bars, blocks create the eye-catch. Headlines are mostly white or dark.
10. **White space is a design element.** Cramming quote→stars→card with no air between them kills the premium feel. LMNT uses generous vertical padding between zones.

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
