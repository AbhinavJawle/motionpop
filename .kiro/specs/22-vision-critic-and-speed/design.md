# Spec 22 Design — Multimodal Vision Critic Contact-Sheet QA & Speed Pass

## 1. Contact-Sheet Vision Critic (`packages/ai/src/tasks/film-vision-critic.ts`)
- **Input:**
  - `format`: `'16:9' | '9:16' | '1:1'`
  - `lookName`: string
  - `beats`: `Array<{ id: string; videoStage?: string; archetype?: string; text: string[] }>`
  - `contactSheetBase64`: JPEG base64 of the multi-beat grid
- **Output (`FilmVisionCriticOutputSchema`):**
  - `pass: boolean`
  - `summary: string` (max 240 chars)
  - `flagged: Array<{ beatId: string; severity: 'fix' | 'note'; issue: string; fixHint: string }>` (max 3)
- **Strict Restraint Prompt:** Instructs `gemini-4-neon` to ONLY emit `severity: "fix"` for clear visual defects (cramped/colliding text, illegible contrast, empty/tiny visual, ugly overlapping box over speaker face). Never nitpick clean beats — typical good Reels return `pass: true, flagged: []` in ~3–5 seconds!

## 2. Browser Contact-Sheet Composer (`apps/web/lib/film/vision-qa.ts`)
- Takes the built `FilmBeatResult[]` (up to 6 beats), renders each beat's settled `keyMomentMs` SVG/HTML preview via an SVG `<foreignObject>` data URL onto an offscreen 2×3 or 3×2 `<canvas>` (`1200×675` for 16:9 or `900×1066` for 9:16) with the look background + A-roll frame backdrop (when available) + crisp `b1 · stage` header badge on each tile.
- Encodes the single contact sheet as `image/jpeg` (quality `0.78`), runs `critiqueContactSheet` with an 18-second race timeout so slow networks never stall export/editor delivery.
- For up to 2 `'fix'`-flagged beats, runs `rebuildBeat` in parallel appending the vision critic's concrete `fixHint` into the beat idea, replacing only those beats if the rebuilt version passes lint + DOM critic!
