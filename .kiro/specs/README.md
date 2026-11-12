# Motionpop Specs

One spec per feature. Each folder holds `requirements.md` (EARS), `design.md`, `tasks.md`.
Priority tags: **[MVP]** = hackathon (by Dec 3, 2026), **[V1]** = public launch, **[V2]** = later.
This phase covers **MVP only**. V1/V2 items appear under "Out of scope" in each spec.

| # | Spec | Delivers | Depends on |
|---|------|----------|-----------|
| 01 | `render-export-pipeline` | Scene JSON → Remotion composition → MP4 via Lambda | schemas |
| 02 | `component-library` | 8 handcrafted Remotion components + registry + catalog | 01 (composition root) |
| 03 | `styles-and-skills` | Style pack tokens, director skill parser/validator, 8 skills | schemas |
| 04 | `planning-engine` | Intent → plan → props → validate → patch, model routing | 02, 03 |
| 05 | `studio-editor` | Canvas, prompt bar, plan chips, refine, versions | 01, 04 |
| 06 | `brand-kit-and-formats` | Logo → palette, fonts, 4 formats, auto-reframe, safe zones | 02, 03 |
| 07 | `personal-library` | Save, tag, browse, "use as reference", BYOK, auth | 04, 05 |
| 08 | `quality-checks` | Deterministic checks: overflow, collisions, safe zones, data match | 02 |

## Golden rules (apply to every spec)
1. The runtime AI outputs **validated JSON only**. It never writes animation code.
2. Same props → same frames (deterministic rendering).
3. No hardcoded colours or fonts in components; everything comes from style tokens.
4. Edits are JSON patches. Nothing unrelated changes.
5. Numbers shown on screen must equal input data (verified in code, not by AI).
