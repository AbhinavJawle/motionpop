---
inclusion: fileMatch
fileMatchPattern: ["packages/motion/src/styles/**", "packages/schemas/src/style*"]
---

# Style pack format

Style packs live in `packages/motion/src/styles/<id>.json`, validated by `StylePackSchema` in `packages/schemas`.

```json
{
  "id": "editorial-explainer",
  "name": "Editorial Explainer",
  "tagline": "A point of view for every idea.",
  "tags": ["Explainer", "Charts"],
  "description": "Warm paper, ink type, one ember accent. Calm and precise.",
  "colors": {
    "bg": "#F2EDE4", "ink": "#151515", "muted": "#6B6560",
    "accent": "#FF7A3D", "accent2": "#8B7CFF", "highlight": "#FFD43B",
    "positive": "#2E9D6B", "negative": "#E4473C",
    "chart": ["#B9B0C9", "#8E80B5", "#FF7A3D"]
  },
  "fonts": { "display": "Geist", "body": "Geist", "mono": "Geist Mono", "displayWeight": 600 },
  "texture": { "grain": 0.03, "paper": true, "vignette": 0.08 },
  "motion": { "enterEase": "outExpo", "moveEase": "inOutCubic", "enterMs": 700, "staggerMs": 60, "holdMs": 1000, "camera": { "pushIn": 1.05 } },
  "shape": { "radius": 6, "stroke": 2 },
  "allowPlayful": false
}
```

- The 5 MVP packs and their looks are listed in `component-library.md`. Sample exact colours from the design thumbnails.
- Fonts must be OFL or similar and bundled locally (licence noted in `docs/third-party.md`).
- Brand-kit overrides (accent colours, fonts, logo) merge on top at build time.
- Names and taglines are descriptive; never named after creators or brands.
