# Film mode: experiment log

2026-11-17 · Claude Code session (Fable 5.2) · founder ask: make the engine stop being boring.

The question: the scene engine places graphics by code, lifts their words from the transcript by code, and lets the model pick among about three variants. Tier 2 (`custom.compose`) lets a model write a whole graphic, but its prompt has none of the craft from our own agent skills, a tiny helper set, and sees one slot at a time. What happens to the same voiceover when those three things change, one at a time?

All files are in `docs/research/experiments/film-mode/`. The harness is `packages/motion/scripts/film-lab/` (`pnpm --filter @motionpop/motion exec node scripts/run-film-lab.ts run|film …`). Videos of the runs are in `~/Movies/motionpop-tests/film-lab/` (not in the repo).

## 1. Setup

- **Voiceover.** `suez-script.txt`, 92 words, spoken by Gemini TTS (voice Charon), 37.5 s: `suez-voice.m4a`. Word times in `suez-voiceover.json` are estimates: phrase starts are measured from the pauses in the audio, and words inside a phrase are spread by syllable count. Gemini's own word timestamps drifted by up to a second and dropped the last two sentences, so they were not used.
- **Reference.** The founder's Opus film of the same story (`ever-given.mp4`, 40 s, silent, on-screen copy only), made in one prompt with the agent skills loaded: `sheet-reference.jpg`. The founder's note: "not the best example, I want to do better than that".
- **Models.** `gemini-3.8-flash` (the product's strong model) and `gemini-3.5-flash-lite` (its cheap one), on Vertex, same `global` endpoint the product uses. There is no Claude key in the project, so Claude was not tested.
- **Look.** Newsprint, 16:9.
- **Setups S1 to S3.** Nine fixed beats (`suez-beats.json`) with neutral briefs, each generated alone through the `custom.compose` contract with one repair, exactly as the product does today.
  - **S1**: today's prompt and helpers.
  - **S2**: S1 plus the craft rules distilled from `.claude/skills/motion-doctrine`, `cut-the-curve` and the HyperFrames story, motion, look and review notes (`scripts/film-lab/craft.ts`).
  - **S3**: S2 plus the film kit: a timeline, timing by spoken word, torn paper, hand-drawn marks, a real map with a camera, dots, icons, counts (`packages/motion/src/film/`).
- **Setup S4, film mode.** A Director writes one storyboard for the whole voiceover; Builders write all the beats at once from it; a Critic measures each beat in a headless browser and sends problems back, up to twice (`packages/ai/src/film/make-film.ts`).
- **What was measured.** Per beat: valid answer, first-try validity, runtime errors, and the critic's counts (shapes drawn, words on screen, and which rules it would send back). Then the contact sheets, looked at by me. The critic gained rules during the day, so its counts for S1 to S3 are from its first version and are indicative only.

## 2. Results, S1 to S3

| Run | Valid | First try | Median shapes | Median words | Beats the critic passes | Seconds a beat |
|---|---|---|---|---|---|---|
| S1 · flash-lite | 9/9 | 9 | 0 | 7 | 0 | 4 |
| S2 · flash-lite | 9/9 | 9 | 0 | 9 | 0 | 7 |
| S3 · flash-lite | 9/9 | 9 | 4 | 8 | 8 | 8 |
| S1 · flash | 9/9 | 9 | 2 | 15 | 0 | 33 |
| S2 · flash | 9/9 | 9 | 11 | 19 | 0 | 30 |
| S3 · flash | 9/9 | 9 | 17 | 22 | 1 | 37 |

What the sheets show:

- **S1 · flash-lite** (`sheet-s1-gemini-3.5-flash-lite.jpg`): nine centred text slides. A number, a line under it, sometimes a rectangle. This is the "2015 software" look.
- **S2 · flash-lite**: the same. Craft rules alone do nothing for the cheap model: it can't draw, so "picture first" has nothing to work with.
- **S3 · flash-lite** (`sheet-s3-gemini-3.5-flash-lite.jpg`): a real map of the canal, torn paper cards, 369 dots, a route around Africa, counts, highlighter, off-centre layouts. The cheap model inherits the finish. Its ideas are still thin (the ship is a red blob, filler icon cards).
- **S1 · flash**: the strong model already draws a picture for most beats, but as nine unrelated report pages: header rules, corner labels, tiny type, a hand-drawn Africa.
- **S2 · flash**: clearly better composed. Hero on a third, the picture on the rest, the ship recurring. Still nine films, not one.
- **S3 · flash** (`sheet-s3-gemini-3.8-flash.jpg`): the richest per-beat frames: real map, paper, dot clusters at both canal mouths, good ship drawings.

Faults in every S1 to S3 run on the strong model:
- **Invented facts.** "KM 151", "193 km", "canal width 205 m", "$400M every hour", "North entry: 194", "$54 billion". None is in the narration.
- **Tiny labels.** 31 to 39 texts under 2.4 % of the frame's short side per run.
- **No film.** The ship is drawn differently in every beat, and nothing connects one beat to the next.

Two bugs the experiment found in our own code, both fixed:
- The spec 15 lint rejected the kit's own style. `return tl;` failed "script must return { seek }", and the option names `parent` and `top` failed "reaches outside its root". In the first S3 run every beat wasted its one repair on this and four flash-lite beats were lost. The table above is the rerun after the fix.
- The critic's contrast check read the wrong element behind text inside a `pointer-events: none` card.

## 3. Results, S4 (film mode)

| Run | Beats | Calls | Wall time | Model cost | Repairs | Failed beats |
|---|---|---|---|---|---|---|
| S4, first run | 10 | 19 | 3 min 43 s | $0.29 | 6 | 0 |
| S4, second run | 10 | 20 | 6 min 4 s | $0.40 | 7 | 0 |

- **First run** (`sheet-s4-first-run.jpg`): one film for the first time. The same top-down ship in every beat, the pitches appear under it, it turns and wedges. But the frames were timid (small heroes, a small ship in an empty frame), one beat's ship ran off the frame, one map was hidden behind a blue box the model added itself, and the Director still wrote figures of its own ("193 km", "14 tugboats · March 29").
- **Changes between the runs:** the storyboard check and the critic now reject any figure the narration doesn't say; the critic gained "hero too small", "picture too small" and "picture off the frame"; the prompts state sizes; `mp.sheet()` adopts a beat's content so nothing has to be re-parented.
- **Second run** (`sheet-s4-film-mode.jpg`, seams in `sheet-s4-seams.jpg`, storyboard in `suez-storyboard.json`, video `2026-11-17-film-mode-suez.mp4`): an illustrated container ship is the hook, gets a 400 m ruler, sits over four pitches (the ship holds its place across the cut), wedges in the canal, becomes a stack of halted containers, is a cluster of dots on the map, is towed free, and closes the film beside "One 400-metre mistake. One global lesson." No invented figure is on screen.

Against the reference film: it has a voice and lands on it, one recurring drawing, a real map, and no made-up facts. The reference still has the better map work (one camera move carried across three scenes) and denser frames.

Still wrong in the second run:
- The 369 ships are a small clump in a zoomed-out map (the beat fights its own camera).
- The two map beats don't meet on the same view, so their "match" seam jumps.
- A "lift" uncovers a beat whose picture hasn't arrived yet, and one "push" leaves about 0.4 s of empty paper.
- The first frame is an empty ring for half a second.
- Six minutes is slow. Most of it is repair rounds that run one after another per beat.

## 4. What this decides

1. **The kit is the multiplier for cheap models, the storyboard for strong ones.** Flash-lite needs the kit to draw at all. Flash needs a Director to stop making nine films. Both are in spec 07b.
2. **Builders can work in parallel.** Continuity came from the storyboard, the shared drawings and the kit's fixed seam halves, not from seeing each other's code.
3. **The critic earns its calls.** 6 to 7 of 10 beats needed a repair, and every repair cleared what was measured. What it can't see is the picture itself (a hidden map passed). A cheap vision pass on stills is the next thing to add.
4. **Facts need code, not prompts.** "Never invent facts" in three prompts did not stop invented figures. Checking every on-screen number against the narration did.
5. **Quick mode stays.** The scene engine is still the instant, free, on-device path, and the fallback for any beat that fails.

## 5. Cost of the experiment

131 model calls, $1.40 in total (Vertex list prices from the harness ledger), plus one TTS call and one transcription call (cents). Higher than "a few cents" because each strong-model beat writes 4,000 to 15,000 tokens.

## 6. Not tested

- Claude as Director or Builder (no key in the project).
- 9:16 and 1:1.
- Real Whisper word times (the lab's are estimated from pauses).
- A second topic. Everything above is one voiceover; the prompts may be fitted to it.
- Flash-lite as Builder under a flash Director.
