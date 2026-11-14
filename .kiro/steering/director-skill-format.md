---
inclusion: fileMatch
fileMatchPattern: ["skills/**", "packages/schemas/src/skill*", "packages/ai/src/prompts/**"]
---

# Director skill format

Director skills are Markdown files in `skills/` that tell the AI how to direct a type of scene. Users can read them in the Styles drawer, edit them and save their own ("Save as my style"). Parsed with `DirectorSkillSchema` (front matter + sections).

```md
---
id: shocking-stat-reveal
name: Shocking Stat Reveal
version: 1
use_when: the narration states a single surprising number, percentage or money amount
works_with: [big-number, kinetic-headline]
energy: high            # low | medium | high
default_duration: 4     # seconds (converted to ms on parse)
---
## Intent
## Shot sequence (percent of duration)
- 0–15%: …
## Camera
## Emphasis
## Sound cues
## Rules
## Anti-patterns
## Voice sync
keyMoment = start of the spoken number word.
```

- The 8 MVP skills already exist in `skills/`: shocking-stat-reveal, slow-build-trend, contrast-split, journey-along-a-timeline, zoom-from-world-to-place, countdown-ranking, calm-explanation, brand-sting.
- `works_with` must only list real component ids.
- `slots.detect` picks a skill per slot; `component.fill` receives its shot sequence and emphasis and turns them into params (timing, highlight, emphasis).
- The Styles drawer shows Intent, Shot list (as a "SHARE OF DURATION" bar), Camera, Emphasis and Rules.
