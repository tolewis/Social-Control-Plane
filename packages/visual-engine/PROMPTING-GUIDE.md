# Visual Engine — Agent Prompting Guide

This document defines how agents interact with the visual-engine to produce consistent, on-brand infographics for The Tackle Room. Copy the relevant sections into your agent's system prompt or reference them during content workflows.

## Core Rule

**Never ask an image model to generate these graphics.** All infographics are rendered from structured data via `POST /drafts/:id/generate-visual`. The agent's job is to gather the right data, pick the right template, and format the API call. The visual-engine handles layout, fonts, colors, and branding.

## Available Templates

| Template | Use When | Data Source |
|----------|----------|-------------|
| `water-temps` | Weekly water temperature update | NOAA buoy data, regional fishing reports |
| `species-report` | What's biting this week | Captain reports, local fishing forums, bait shop intel |
| `tide-chart` | Weekly tide windows for a location | NOAA tide predictions |
| `catch-of-the-week` | Featuring a notable catch | Customer submissions, tournament catches, guide reports |
| `product-spotlight` | Promoting gear/bait we carry | Product catalog, manufacturer specs |
| `tournament-results` | Post-tournament leaderboard | Tournament weigh-in results |
| `article-ad` | Driving traffic to a published article | Article title, summary, key takeaways, URL |

## Prompting Rules for Each Template

### water-temps

**When to use:** Every Monday morning. This is the anchor content — it always goes out.

**Data to gather:**
- Current water temp for each region (NOAA buoys or fishing report sites)
- Previous week's temp (store last week's data or pull 7-day history)
- Species activity notes for each region

**Prompt pattern:**
```
Check current water temperatures for these regions: Outer Banks NC, Mid-Atlantic, Charleston SC, Cape Fear NC, Hilton Head/Savannah, Jacksonville FL.

Compare to last week's temps. For each region, note any species arrivals or departures.

Then call generate-visual with template "water-temps" and this data:
- weekOf: "Week of [current date]"
- regions: sorted by largest delta first
- include species notes where something changed
```

**Rules:**
- Always sort regions by delta (biggest mover first) — this is what stops the scroll
- Round deltas to 1 decimal place
- Species notes should be 3-4 words max: "Kings + Cobia arrived", "Flounder slowing down"
- Minimum 4 regions, maximum 7

---

### species-report

**When to use:** Mid-week (Wednesday/Thursday) for a specific region. Pairs with water-temps.

**Data to gather:**
- 4-6 species relevant to the region and season
- Status: hot (fish are crushing it), active (consistent bites), slow (occasional), off (not here yet)
- Where they're being caught (structure type, depth range)
- What bait/technique is working

**Prompt pattern:**
```
Create a species report for [region] for this week.

For each species currently in season, assess:
- Status: hot, active, slow, or off
- Where: specific structure/depth (keep to ~6 words)
- Bait: what's working (keep to ~5 words)
- Note: only if something notable (just showed up, leaving soon, etc.)

Sort by status: hot first, off last.
Call generate-visual with template "species-report".
```

**Rules:**
- Always include water temp if available
- Status MUST be one of: hot, active, slow, off — no other values
- WHERE and BAIT should be concise fishing shorthand, not full sentences
- Lead with the hot species — that's the scroll-stopper
- Include 1-2 "off" species if they're expected soon (builds anticipation)

---

### tide-chart

**When to use:** Sunday evening or Monday morning for the upcoming week.

**Data to gather:**
- High/low tide times and heights for 5-7 days
- Best fishing windows (typically 1-2 hours before/after a tide change)

**Prompt pattern:**
```
Pull tide data for [location] for the next 5 days.

For each day, identify the best fishing window based on:
- Incoming tide changes (generally better than outgoing)
- Dawn/dusk overlap with tide movement
- Moon phase considerations

Call generate-visual with template "tide-chart".
Include a note on any day with exceptional or poor conditions.
```

**Rules:**
- Best window should be a time range, e.g. "5:30-7:30 AM"
- Heights to 1 decimal place in feet
- Notes should explain WHY (e.g., "Neap tide — weaker movement", "New moon — strongest currents")
- Day labels as "Mon 4/7" format
- 5 days is ideal, 7 max

---

### catch-of-the-week

**When to use:** When a notable catch comes in — customer submission, guide report, or tournament fish.

**Prompt pattern:**
```
Create a catch-of-the-week card for:
- Angler: [name]
- Species: [what they caught]
- Weight/length if known
- Location: [where]
- Bait/technique: [how]
- Date: [when]
- Quote from the angler if available

Call generate-visual with template "catch-of-the-week".
```

**Rules:**
- Species name should be the common name anglers use (e.g., "King Mackerel" not "Scomberomorus cavalla")
- Weight as "XX lbs", length as 'XX"'
- Quote should be conversational, not formal — this is a fisherman talking
- If no quote, skip it — don't fabricate one

---

### product-spotlight

**When to use:** When promoting a specific product — new arrival, sale item, or seasonal recommendation.

**Prompt pattern:**
```
Create a product spotlight for [product name]:
- Category: [reel/rod/bait/tackle/apparel]
- Price: if applicable
- Key specs: 4-6 most important specs for this product type
- Pitch: 1-2 sentences on why an angler should care (not marketing speak — fishing reasons)
- In stock: true/false

Call generate-visual with template "product-spotlight".
```

**Rules:**
- Spec labels should be industry-standard terms (Gear Ratio, Drag Max, Line Cap, not marketing names)
- Pitch should sound like a recommendation from a fishing buddy, not a product listing
- Never use words like "revolutionary", "game-changing", "best-in-class" — that's slop
- If price is unknown or varies, omit it

---

### tournament-results

**When to use:** Immediately after tournament weigh-in results are available.

**Prompt pattern:**
```
Create tournament results for [tournament name]:
- Date and location
- Top 6 finishers with weights
- Total participants if known
- Any records broken

Call generate-visual with template "tournament-results".
```

**Rules:**
- Always include species for each entry (even if they're all the same — it confirms what was targeted)
- Weights as "XX.X lbs"
- Notes only for genuinely notable things: records, tiebreakers, first-time winners
- Top 6 is the sweet spot — enough to be interesting, fits the card well

---

### article-ad

**When to use:** After publishing a technical article, guide, or review on the website.

**Prompt pattern:**
```
Create an article ad for: [article title]
- URL: [article URL]
- Category: what type of content (rigging guide, gear review, technique breakdown, seasonal guide)
- Hook: 1-2 sentences that make someone want to click — address a specific pain point
- Takeaways: 3-4 specific things they'll learn (not vague — be concrete)
- Read time: estimate based on article length

Call generate-visual with template "article-ad".
```

**Rules:**
- Hook must address a pain point or promise a specific outcome: "Stop losing kings at the boat" not "Learn about king mackerel fishing"
- Takeaways must be specific and actionable: "Drag settings for 30lb+ fish on light tackle" not "Learn about drag settings"
- CTA defaults to "Read the full guide →" — only change it if the content type warrants it (e.g., "Watch the video →")
- Category should be 1-2 words max in all caps

## Content Calendar Pattern

A good weekly rhythm:

| Day | Template | Purpose |
|-----|----------|---------|
| Monday AM | `water-temps` | Anchor content — sets the week |
| Monday AM | `tide-chart` | Pairs with water-temps |
| Wednesday | `species-report` | Mid-week engagement |
| Thursday | `article-ad` | Drive traffic to new content |
| Friday | `catch-of-the-week` | Weekend engagement / UGC |
| Saturday | `product-spotlight` | Weekend shopping behavior |
| As needed | `tournament-results` | Event coverage |

## Anti-Patterns (Don't Do This)

1. **Don't fabricate data.** If you don't have real water temps, don't make them up. Skip the post.
2. **Don't use AI-generated images alongside these templates.** The visual-engine handles all graphics. Adding DALL-E/Midjourney images creates brand inconsistency.
3. **Don't over-post.** 1-2 infographics per day max. These are data-forward — they lose impact if spammed.
4. **Don't editorialize in the data.** The template handles presentation. Pass clean data. "Kings + Cobia arrived" not "AMAZING news — kings and cobia have finally arrived in huge numbers!"
5. **Don't use slop language in any field.** No "exciting", "incredible", "don't miss out", "game-changing". Write like a fishing report, not an ad.
6. **Don't skip the sort order.** water-temps sorts by delta, species-report sorts by status. This is intentional — biggest story first.

## API Call Format

Every template follows the same pattern:

```
POST /drafts/:id/generate-visual
{
  "templateName": "<template-name>",
  "templateData": { ... typed data matching the template ... }
}
```

The API renders the image, saves it as Media, and attaches it to the draft. The draft then publishes normally through the existing SCP pipeline.

## Adding Your Own Templates

If you need a new infographic type:

1. Define the data shape in `packages/visual-engine/src/templates/types.ts`
2. Create the JSX template in `packages/visual-engine/src/templates/<name>.tsx`
3. Register it in `packages/visual-engine/src/templates/index.ts`
4. Add sample data in `packages/visual-engine/src/cli.ts`
5. Test: `npx tsx src/cli.ts render <name> --out test.png`
6. Add prompting rules to this guide
