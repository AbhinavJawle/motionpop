# Spec 07c · Engine v2 and first-load pictures · requirements

Written in a Claude Code session (Fable 5.2, 2026-11-17) after the founder's ask: "use images more also on the initial load dude and make the engine v2 better. way better. be creative". Steering: `motion-principles.md`, `component-contract.md`, `hybrid-ai.md`, `security-and-cost.md`. Builds on spec 07 (scene engine and looks), spec 06 (slot detection and auto-fill) and D-070 (pictures in scenes). Film mode (spec 07b) is unchanged.

**Why.** A contact sheet of the free engine on a 37 s voiceover (`packages/motion/.check/reel/before-suez/sheet.jpg`) showed:
- every number centred alone, with labels lifted from the wrong words ("It took", "It sat there");
- small hook cards, the same layout twice in a row;
- empty frames between graphics;
- no pictures unless the creator added them.

Each slot was built as its own box with nothing tying the video together. Every requirement below runs on the device, costs nothing and makes no model call.

## R1 · Pictures arrive on the first load
1. WHEN a project opens in the editor (not a film) THE SYSTEM SHALL search the open media library (Openverse, CC0 and CC BY, through `/api/media/search`) for each graphic that can take a picture and has none, then attach the first suitable result through the existing picture flow (`addOwnImage`, source `openverse`, with attribution), without a confirm and without credits.
2. THE search words SHALL come from what the narration names inside the slot: a place from the tagger first (a name ending in a landform such as "Suez Canal" also counts as a place), else the first concrete, photographable noun from the companion lexicon (never an abstract one such as growth or time). Person names and other names SHALL never be searched.
3. A `stat-punch` whose number becomes a physical count (R2.1: a grid, dots, icons or a ruler) SHALL NOT get a picture.
4. THE SYSTEM SHALL search at most `min(6, imagesPerVideoMax)` times per project, one search at a time; remember per project in the browser which slots were tried, so reopening a project searches nothing; cache answers in the browser for 24 hours and on the server for 6 hours.
5. WHEN a search is rate-limited (HTTP 429) THE SYSTEM SHALL stop for this load; WHEN a search or download fails THE SYSTEM SHALL skip that slot. Nothing is shown to the creator for a failure (they can still add pictures by hand).
6. THE SYSTEM SHALL refuse search words containing a brand or company name, and results whose titles look like a logo, mark, icon, chart, map, poster or screenshot, or carry ™ ® ©. It SHALL skip slivers (aspect outside 1:2 to 2.2:1) and pictures smaller than 480 px on the long side.
7. WHEN the slot changed meanwhile (deleted, a different graphic, a picture added) THE SYSTEM SHALL leave it alone. THE paid image model SHALL never be called from this flow.
8. THE picture's treatment SHALL follow the look (D-070 image layer: key, duotone, halftone, torn edge, tape).

## R2 · Companions: numbers you can see
1. WHEN a scene has room beside its words THE engine SHALL derive a companion from the slot's content and spoken words, a pure function of them:
   - a percentage from 0 to 100 → a 10×10 unit grid filling to that share;
   - a length (km, miles, metres, feet…) → a ruler drawn out;
   - money, or a number with a k/M/B suffix → a stamp with a money icon;
   - a whole number from 2 to 12 with a noun that has an icon → that many icons;
   - a whole number from 2 to 500 (not a year) → that many dots;
   - otherwise a stamp with the first icon the words name, or nothing.
2. Counting companions SHALL count in step with the number's count-up and finish on the spoken word (the focal cue's land time).
3. WHEN a companion or a picture splits the frame THE text SHALL stay inside the frame's safe area (its sub-frame is sized so the scene's own safe area lies inside the frame's, with room for glyph overhang and tilt), and the pair SHALL sit near the optical centre.
4. A figure longer than 8 characters as shown ("$1,234,567.89bn") SHALL get no companion: it needs the whole width.
5. THE companion SHALL use the look's accent and paper treatments (torn paper discs and hand rings in stepped and torn looks) and be deterministic for a given seed.

## R3 · A whole-video plan
1. THE engine SHALL plan the whole video before building slots (`planVideo`): which slot is the climax, which gets a companion, which side the words sit on, and the camera station of each slot.
2. THE climax SHALL be the slot with the strongest number (money and scale outrank percentages and counts), never the first slot, only in videos of 3 or more slots. It SHALL use the scene's peak variant full-frame (no companion) and be entered with a pull seam.
3. THE slot before the climax SHALL be staged calm (stillness before the climax).
4. Neighbouring slots SHALL NOT repeat the same scene and companion kind; a repeat drops the companion. Split layouts SHALL alternate sides.
5. Custom and film slots SHALL be left out of the plan. WHEN `staging: false` is passed to the compiler THE engine SHALL behave as before this spec.

## R4 · One world
1. WHEN a project is staged THE backdrop SHALL be one continuous world instead of a separate backdrop per slot: a ground grid, far landmarks with parallax and a hand-drawn thread through the slots' stations, revealed as the camera travels.
2. THE camera SHALL travel between stations in the direction of reading, its moves joined velocity-matched at each seam (mirrored power4 halves meeting at the cut); a gap longer than 700 ms gets a smooth move so the frame is never empty and still.
3. THE thread SHALL stay in the bottom band of the frame, under the graphics, so it never crosses text being read.
4. All seams in a staged project SHALL travel in one direction (the film's current).

## R5 · Better labels
1. THE free slot detector SHALL take a number's label from the words after it in the same sentence ("369 ships queued up at both ends" → "Ships queued up at both ends"), at most 6 words, cut before a trailing preposition when the limit cuts the phrase, and fall back to the words before it.
2. THE stat label SHALL be larger relative to the number (wide 0.058, square 0.058, tall 0.036 of the frame height in the stack variant).

## R6 · Same everywhere
1. Everything in R2–R4 SHALL run inside the composition runtime, so preview and the render service (`projectCompileInput` + `compileProject`) produce the same frames.
2. Everything SHALL be a pure function of time and seed: no `Math.random`, `Date.now`, timers, CSS animations or GSAP; times in integer milliseconds.
3. `motion:check` SHALL measure scenes staged (as the app shows them), counting a companion or picture as part of the composition; `MP_CHECK_STAGING=0` measures each scene alone.
