# Testimonial Template

Real customer review as the ad. Dark bg, massive pull-quote, gold stars, Judge.me-style review card.

## Layout
- 1080x1080, dark bg (#1A1A1A)
- Italic serif pull-quote at top (68px, power word in orange)
- 5 gold stars with generous spacing
- White review card: avatar initial, name, verified badge, body text
- Tiny product on roundrect, bottom-right overlapping card edge
- Logo on card, bottom-left (navy on white)

## When to use
- Strong customer reviews exist (Judge.me API: `skills/judgeme/judgeme_api.py`)
- Captain/authority endorsements
- Competitive contrast reviews ("better than Tackle Direct")

## Customizing
Each ad needs:
- `quoteLines` — array of line arrays with `{text, accent}` segments for word-level color control
- `reviewerName` — real name from Judge.me
- `reviewBody` — full review text (auto-wrapped)
- `productPath` — product image

**Power word rule:** The `accent: true` segment should be the emotionally important word, not just the last word.

## Data source
Pull reviews via: `python3 skills/judgeme/judgeme_api.py reviews list --rating 5 --json`

## Design reference
Based on: `AdExamples-kb/02_customer-testimonial-review.jpg`
