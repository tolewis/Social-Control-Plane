# Benefit Grid Template

Replicates the LMNT "The Complete Hydration System" layout — dark bg, bold headline, colored benefit strip, large product hero.

## Layout

- 1080x1080 square (Meta feed)
- Dark background (#1C1C1C)
- Bold white uppercase headline at top (auto-sizes: 64px for short, 52px for 25+ chars)
- Orange benefit strip bar below headline — 5 columns with dividers
- Product image centered below strip, large (650px max), white-bg removed
- Subtle orange radial glow behind product
- Inverted (white) TackleRoom logo bottom-left
- URL text bottom-center

## When to use

- "Complete system" positioning — show everything the customer gets
- Multi-benefit products where 5 key features need to land at once
- Product lineup showcases (the chugger color table works great here)
- Kit/bundle products where the sum > parts

## Usage

```bash
cd /opt/scp/packages/renderer/templates/benefit-grid
node render.mjs
```

## Customizing

Edit the `ads` array:

```js
{
  id: 'grid-01-epic-axis-system',
  product: '/path/to/product.jpg',
  headline: 'THE COMPLETE WAHOO SYSTEM',
  benefits: ['Stainless\nSteel', 'Pre-\nRigged', '480lb\nCable', 'UV\nSkirts', '32oz\nWeight'],
}
```

Benefits support `\n` for two-line labels. Exactly 5 benefits per ad.

## Design reference

Based on: `AdExamples-kb/04_benefit-grid-hydration-system.jpg`
