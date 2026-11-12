---
inclusion: fileMatch
fileMatchPattern: ["packages/skills/**", "packages/engine/**"]
---

# Director skill format

One skill per file: `packages/skills/skills/<skill-id>.md`. Skills are read by the planning engine (as prompt context) **and** parsed by code (for validation and timing). Write for both.

## Front matter (YAML, required)
```yaml
---
name: Shocking Stat Reveal        # human name
id: shocking-stat-reveal          # kebab-case, equals file name
version: 1.0.0                    # semver
use_when: A beat hinges on one surprising number.
works_with: [number-reveal, bar-chart]   # must be registered component ids
energy: high                      # low | medium | high
default_duration: 6               # seconds, number
duration_range: [4, 10]           # seconds, the skill must work at both ends
---
```

## Sections (in this order; all required unless marked)
`## Intent` · `## Shot sequence` · `## Camera` · `## Emphasis` · `## Sound cues` · `## Rules` · `## Anti-patterns` · `## Voice sync` (optional)

## Shot sequence syntax (machine-parsed)
Each beat is one numbered line: `N. <start>–<end>%: <description>` or `N. <at>%: <description>` for an instant.
- Percentages are of total duration, 0–100.
- Beats are in order; starts are non-decreasing; the last beat ends at 100%.
- A hold is a beat whose description starts with `HOLD`.

## Validation (run by the skill validator hook and `pnpm check:skills`)
- Front matter matches the schema; `id` equals the file name.
- Every `works_with` id exists in the component registry.
- Shot sequence parses, is monotonic and covers 0–100%.
- Every hold is long enough to read the text it holds at `duration_range[0]` (see motion principles).
- No brand or creator names (e.g. channel names) anywhere in the file.
