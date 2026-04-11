# Comparison Chart Template

Replicates the LMNT "vs Sports Drinks" split-panel layout — us vs them, check vs X.

## Layout

- 1080x1080 square
- Left panel dark (#1E1E1E): our product + brand label + green check bullets
- Right panel light (#F2F0ED): "Typical X" label + dashed placeholder + red X bullets
- Orange VS badge centered between panels
- 4 comparison rows, each with check/X icon + text
- Product image upper-left, placeholder upper-right

## When to use

- Direct comparison: pre-rigged kit vs DIY assembly
- Feature superiority: stainless vs mono, tested vs untested
- Price comparison: complete kit vs sum-of-parts
- Any "us vs the old way" narrative

## Customizing

```js
{
  id: 'compare-01-epic-axis-vs-diy',
  product: '/path/to/product-nobg.png',
  ourLabel: 'Epic Axis Kit',
  theirLabel: 'Typical\nDIY Rig',    // supports \n for 2 lines
  rows: [
    { us: '480lb Stainless Cable', them: 'Mono Leader' },
    // ... 4 rows total
  ],
}
```

## Design reference

Based on: `AdExamples-kb/11_comparison-chart-vs-sports-drinks.jpg`
