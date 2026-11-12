# Requirements: Style Packs & Director Skills

## Introduction
Style packs define the look; director skills define the cinematic direction. Skills are the product's USP and must be readable markdown.

## Glossary
- **Style pack**: token set (palette roles, typography, easing, durations, background, camera default).
- **Director skill**: markdown with YAML front matter and fixed sections (see product spec section 8.2).
- **Skill_Parser**: converts skill markdown into a typed object.

## Requirements

### R1: Style packs
1. THE system SHALL ship 3 packs: `editorial-explainer`, `math-elegance`, `money-documentary`, validated by `StylePackSchema`.
2. Pack names SHALL be descriptive and SHALL NOT use third-party brand names.
3. WHEN a brand kit is applied, THE style resolver SHALL map brand colours onto palette roles and brand fonts onto typography without mutating the pack.
4. THE resolver SHALL return a deep-frozen token object for rendering.

### R2: Skill format
1. THE Skill_Parser SHALL read front matter fields: `name`, `id`, `version`, `use_when`, `works_with`, `energy`, `default_duration`.
2. THE Skill_Parser SHALL read sections: Intent, Shot sequence, Camera, Emphasis, Sound cues, Rules, Anti-patterns, Voice sync (optional).
3. THE Skill_Parser SHALL parse shot-sequence lines of the form `a–b%: text` into `{ startPct, endPct, description }`.
4. IF a required field or section is missing, THEN THE Skill_Parser SHALL return an error naming the file and the missing item.

### R3: Skill validation
1. THE validator SHALL reject shot sequences whose ranges overlap, run backwards, or fall outside 0–100%.
2. THE validator SHALL warn when a gap exists between consecutive ranges.
3. THE validator SHALL reject `works_with` ids not present in `ComponentTypeSchema`.
4. THE validator SHALL run on every `.md` save in `packages/skills` (Kiro hook) and in CI.

### R4: Built-in skills
THE system SHALL ship 8 skills: Shocking Stat Reveal, Slow-Build Trend, Contrast Split, Journey Along a Timeline, Zoom From World to Place, Countdown / Ranking, Calm Explanation, Brand Sting. (Three already exist; five to add.)

### R5: Explainability
1. THE system SHALL expose each skill's `use_when` and `Intent` so the UI can show "Why this direction?".
2. THE skill's timing percentages SHALL be convertible to seconds for any duration: `seconds = pct/100 * duration`.

## Out of scope
Skill editor with live preview, Save as Skill, fork styles, marketplace [V1/V2].
