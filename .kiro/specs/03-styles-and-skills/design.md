# Design: Styles & Skills

## Packages
- `packages/styles`: JSON packs + `index.js` (existing). Add `resolveStyle(pack, brandKit?)` in `packages/engine/src/style`.
- `packages/skills`: `.md` files + `parseSkill.ts`, `validateSkill.ts`, `loadSkills.ts`, `toSeconds.ts` (in `packages/engine/src/skills` to keep skills folder content-only).

## Types
```ts
type ParsedSkill = {
  meta: { id: string; name: string; version: string; useWhen: string; worksWith: ComponentType[];
          energy: 'low'|'medium'|'high'; defaultDuration: number };
  intent: string;
  shots: Array<{ startPct: number; endPct: number; description: string }>;
  camera: string; emphasis: string; soundCues: string;
  rules: string[]; antiPatterns: string[]; voiceSync?: string;
  markdown: string; // original, sent to the model
};
type SkillIssue = { file: string; severity: 'error'|'warning'; message: string };
```

## Parsing
`gray-matter` for front matter; heading-based section split (`## Name`); regex `^\d+\.\s*(\d+)[–-](\d+)%:\s*(.+)$` for shots. Duration `6s` parsed to number.

## Validation rules
1. Sort shots by start; error on overlap or `start >= end` or out of 0–100.
2. Warning on gaps.
3. Error on unknown `works_with`.
4. Error on missing sections.

## Style resolution
```
resolveStyle(pack, brandKit):
  tokens = clone(pack)
  if brandKit.palette: map roles accent←primary brand colour, background kept unless brand supplies one, etc.
  if brandKit.fonts: typography.display ← fonts.primary; body ← fonts.secondary ?? fonts.primary
  return deepFreeze(tokens)
```
Contrast guard: if text vs background < 4.5:1 after mapping, keep the pack's original text colour and emit a warning.

## Hook
Kiro hook `skill-validator` (PostFileSave on `packages/skills/**/*.md`) runs `npm run validate:skills -w @motionpop/engine`.

## Testing
- Parse all shipped skills; assert no errors.
- Property test: for any valid shots, `toSeconds` results are monotonic and within [0, duration].
- Tests for each validation rule with fixture skills.
