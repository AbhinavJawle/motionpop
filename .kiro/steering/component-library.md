---
inclusion: fileMatch
fileMatchPattern: ["packages/motion/src/components/**", "packages/motion/src/styles/**"]
---

# Component library (MVP)

All components follow `component-contract.md` and `motion-principles.md`. Every param has `.describe()`. Shared timing params:

```ts
timing: z.object({
  speed: z.number().min(0.5).max(2).default(1).describe("Global speed multiplier. 0.8 = slower, 1.2 = faster"),
  enter: z.enum(["default", "soft", "punchy"]).default("default").describe("Entrance character"),
  ease: z.enum(["inOut", "out", "linear"]).default("inOut").describe("Main move ease (inspector 'Ease in-out')"),
  fade: z.boolean().default(true).describe("Fade/slide out at the end (inspector 'Fade')"),
}).default({})
```

Build order: kinetic-headline → big-number → bar-chart → line-chart → callout → map-zoom (first to cut).

## 1. `kinetic-headline`
**Use when:** a strong statement, title, chapter, hook or quote without data.
`{ eyebrow?: string ≤32 (uppercase label, e.g. "THE BIGGER PICTURE"), headline: string ≤60, highlight?: substring of headline, subline?: string ≤90, reveal: "words"|"letters"|"lines" = "words", align: "left"|"center" = "left" }`
**Motion:** eyebrow slides in → headline words stagger up with mask reveal (0.05 s) → highlight swipe on the key phrase at the key moment → subline fades in → hold → fast exit.
**Layouts:** 16:9 left at 8 % margin, ≤ 2 lines · 9:16 centred, ≤ 4 lines, larger · 1:1 centred, ≤ 3 lines. Balanced lines, no orphans.

## 2. `big-number`
**Use when:** one striking number, percentage, money amount or count.
`{ value: number, prefix?: "$", suffix?: "%"|"M"|"k"…, decimals: 0–2, label: string ≤48, context?: string ≤60, delta?: { value, direction: "up"|"down", label? }, countFrom: number = 0 }`
**Motion:** context enters → number counts up (ease-out) and **lands exactly at the key moment** → accent on the final value → label slides in → hold.
**Rules:** number ≥ 22 % of frame height (16:9), ≥ 30 % (9:16); tabular figures; the final string equals the formatted value exactly.

## 3. `bar-chart` (the design's hero example)
**Use when:** comparing 2–8 values.
`{ eyebrow?, title?, highlight?: substring of title, subtitle?, data: { label, value }[2..8], highlightIndex?: number (default max), valueFormat: { prefix?, suffix?, decimals?, compact? }, orientation: "vertical"|"horizontal" = "vertical", sourceNote?: string ≤60 }`
**Motion:** title enters → baseline draws → bars grow from zero with 0.08 s stagger, the highlighted bar last, landing at the key moment → value labels count up above the bars → highlighted bar gets the accent gradient + floor glow → hold.
**Rules:** heights proportional from zero (property test); labels never overlap; 9:16 switches to horizontal bars above 4 items.
Reference look: `editor.png` ("THE BIGGER PICTURE", "Revenue grew 40%", "Three years. A whole new trajectory.", bars $100k/$120k/$140k, "Revenue, in USD", "MOTIONPOP / EDITORIAL").

## 4. `line-chart`
**Use when:** a trend over time, growth or decline.
`{ title?, subtitle?, series: { name, points: { x, y }[3..24] }[1..2], emphasis: "end"|"max"|"min"|{ index } = "end", valueFormat, annotation?: { index, text ≤40 } }`
**Motion:** axes fade in → line draws left to right, area fill follows → end dot pulses once at the key moment with its value → optional annotation with leader line → hold.
**Rules:** y from 0 unless all values are far from 0 (then show an axis-break marker); ≤ 6 axis labels.

## 5. `callout`
**Use when:** introducing a person or term, a quote, a takeaway, or labelling something.
`{ variant: "lower-third"|"label"|"quote"|"takeaway", title ≤40, subtitle? ≤60, quote? ≤140, attribution?, value?: string (e.g. "40%" for takeaway), position: "bottom-left"|"bottom-right"|"top-left"|"center" = "bottom-left" }`
**Motion:** lower-third: bar wipes in, text slides up with mask · label: dot, leader line draws, label fades · quote: big quote mark scales from 96 %, words stagger · takeaway: value chip pops, line reveals.

## 6. `map-zoom`
**Use when:** a place, route or spread is mentioned.
`{ target: { name, lat, lon, kind: "country"|"city"|"region" }, startView: "world"|"continent" = "world", label? ≤40, route?: { from, to }, highlightCountryIso3?, pinStyle: "dot"|"pin" = "dot" }`
**Motion:** world view → in-out camera move to the target, settling at the key moment → country fill to accent → pin drops with a ripple → label with leader line → optional route arc.
**Data:** d3-geo + Natural Earth TopoJSON bundled locally; a bundled gazetteer (countries + top cities). The AI may only choose names in the gazetteer, otherwise `needsInput`.

## Runtime overlay: `captions`
Presets `pop` (2–3 words, bold, current word in accent), `clean` (one line, current word underlined), `boxed` (rounded dark box). Lines from `captions.chunk`. Lower third (16:9) or centre-low inside the safe zone (9:16). Captions are an overlay, never a reserved band.

## Style packs (5, as designed)
| id | Name | Tagline | Look (from the design thumbnails) |
|---|---|---|---|
| `editorial-explainer` | Editorial Explainer | "A point of view for every idea." | warm paper #F2EDE4-ish, dark ink headline, lavender/violet bars, ember highlight bar, eyebrow "THE BIGGER PICTURE" |
| `dark-money` | Dark Money | "Make the numbers tell a story." | deep green-black, lime/green bars, big "$2.4M", "↑ 32.8% this quarter", "FOLLOW THE MONEY" |
| `clean-minimal` | Clean Minimal | "Less noise. More meaning." | pale grey-blue, one blue focus circle, crisp sans, "LESS, BUT BETTER." |
| `paper-collage` | Paper Collage | "A little rough. Full of character." | kraft paper, torn cream + coral strips, tape, slight rotation, "Cut. Paste. Make it move." |
| `neon-data` | Neon Data | "Big signals. Bold energy." | deep purple grid, lime + violet columns, "+128%", "SIGNAL / NOISE" |

Editorial Explainer and Dark Money get full polish; the other three ship as token sets on the same components. Exact colours: sample from the thumbnail frames in `design/figma-export.css` (Projects / Styles frames).

## Reference provenance
For a component, we may generate 2–3 reference animations with a top model outside the product, then hand-extract **timings, eases, layout ratios and type scale** into the component and style pack. The README records what was adopted from which reference. Product code never ships model output that hasn't passed the contract and checks.
