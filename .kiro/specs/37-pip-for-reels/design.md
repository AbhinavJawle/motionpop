# Spec 37: Pip works on video reels (design)

## Data
- `ReelPlan.theme?: { accent, accent2?, background: 'plain'|'soft'|'bold' }` (`ReelThemeSchema`).
  It lives on the plan so every consumer of the plan (preview `mountReel`, export compile,
  `reelCustomScene`, note fix) sees it with no extra plumbing.
- `ReelPlan.sfx?: { kind, atMs, gainDb }[]` (max 40): added hits, merged into `reelSfx`.
- Pip schemas: new model actions `editScene`, `clearScene`, `setReelTheme`, `setReelLook`,
  `regenerateReel`, `setSound`, `setMusic`, `addSound`. The model step keeps its shape; `slot`
  takes scene refs too, colours ride in `instruction` as hex. Plan steps gain `sceneId`, `theme`,
  `look`, `sound`, `music`, `sfxKind`. Steps max 8 → 12.

## Theme in the engine (`packages/motion/src/reel/theme.ts`)
`themedLook(look, theme)` returns a `LookTokens` whose palettes carry the theme:
- `accent` = the theme colour pushed to ≥ 3:1 on the palette background; `accent2` likewise.
- `bgImage` = a linear gradient between tints of accent and accent2 over the palette background
  (soft ≈ 10–14 % mix, bold ≈ 22–30 %), under the grid lines.
- `themed: true`; on mono the tag card becomes the accent (shaded so its white ink reads 4.5:1)
  and accent words use the accent instead of grey.
Templates that drew `look.upper ? pal.ink : pal.accent` now draw `pal.accent`; on the stock mono
palettes accent equals ink, so unthemed reels render byte-for-byte the same.

## Sound
`reelBed(plan, …)` merges `plan.sfx` into the derived hits. The preview's `useReelBedUrl` and the
export's `prepareReelBed` both pass `audioOf(project)`: effects on/off, effects gain, synthesised
music and its gain.

## Pip
- `pipInput` adds `reel { look, captions, theme, sound, scenes[] }`; the prompt (v2) explains
  reel projects and the new actions; the JSON schema enum adds scene refs and reel choices
  (slot-only stage choices are left out on reels to stay under 64 choices).
- `enforcePlan` validates each new action; `stepCredits` prices `editScene` (note price),
  `regenerateReel` (director price) and AI `setMusic` (music price).
- `applyPlan`: theme, look, captions, clear scene, sound, added sounds and synth music are instant
  commands (one composite). `editScene` adds a whole-frame note "Pip: …" on the scene and runs the
  reel note fix (its own credits, review and undo step). `regenerateReel` and AI music run after.
- Chips on reels: "Add colour and a gradient", "Turn sound effects off/on", "Add music",
  "Captions off/on", "Switch look".

## Testing
Unit: theme contrast + unthemed palettes unchanged; `reelSfx` merges added sounds; `pipInput`
carries scenes; `enforcePlan` per new action; `applyPlan` instant reel steps in one undo and
`editScene` calling the note runner; JSON schema keeps ≤ 64 choices.
