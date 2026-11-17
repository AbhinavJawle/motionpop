# Spec 07b · Film mode · requirements

Written in a Claude Code session (2026-11-17), after the experiment in `docs/research/film-mode.md`. Steering: `product.md`, `hybrid-ai.md`, `ai-tasks.md` §7, `security-and-cost.md` (generated code), `motion-principles.md`. Builds on spec 15 (custom graphics) and spec 07 (scene engine, looks).

**Why.** The scene engine (spec 07) makes every graphic from rules: code decides where graphics go, lifts their words from the transcript, and the model picks among about three variants. Each slot is its own box, so a video reads as a deck. The experiment showed the same cheap model goes from centred text slides to maps, paper, dots and counts once it gets the engine as a toolkit and the craft rules, and that a storyboard plus shared drawings turns separate graphics into one film.

**Two modes.** Quick mode is the scene engine: on the device, free, instant, works offline. Film mode is new: the cloud writes the whole film. Quick mode stays the default and the fallback.

## R1 · A Director writes one storyboard for the whole voiceover
1. WHEN the creator asks for a film THE SYSTEM SHALL send the whole transcript (words with times), the format and the look to `film.direct` in the cloud and receive a storyboard: a thesis, one world, a recurring element, up to 3 shared drawings, and beats.
2. THE beats SHALL cover every word of the transcript in order with no gap or overlap. Each beat SHALL name its lead (picture, map, number, type), its picture, its on-screen text, the word its hero lands on, its staging and the seam into the next beat (push, lift, cover, zoom, match).
3. THE SYSTEM SHALL reject a storyboard, with the reasons sent back to the model (up to 2 repairs), when the beats don't tile the words, a hero lands outside its beat, a beat is under 1.6 s or over 9 s, on-screen text is over 14 words, more than a quarter of the beats (at least 2 allowed) are led by type, or on-screen text shows a figure the narration never says.
4. Beat times SHALL be derived by code from the word times: integer ms, each beat starting up to 250 ms before its first word, each ending where the next starts, the last ending with the voiceover.

## R2 · Builders write the beats on the film kit
1. THE SYSTEM SHALL build every beat with `film.build`, all beats at the same time. A builder receives the film (thesis, world, recurring element, shared drawings), its own beat, its words with times, its duration, and the seams on both sides; never another builder's code.
2. A beat SHALL be a `custom` graphic (spec 15 contract and lint) with `film` set: it owns its entrance, exit and camera, so the runtime adds no whole-frame seam, no push-in and no drifting backdrop.
3. THE film kit (`mp`) SHALL give generated code the engine's own craft: a timeline that is a pure function of time; timing by spoken word (`on`, `at`, `mp.at`); word-by-word text on the voice; torn paper cards and a full-frame sheet; hand-drawn marks and lines; counts; dot fields; a curated icon set; a flat world map with a camera, routes, pins and labels; the film's shared drawings; the two halves of each seam with fixed distances and eases; sound cues. Everything deterministic for a seed.
4. THE SYSTEM SHALL draw the shared drawings once with `film.props` (inline SVG in the look's colours) and give them to every beat, so the recurring element looks the same in each.
5. WHEN a seam hands over through an object (lift, cover) THE beat SHALL stay mounted for a tail after its slot ends, in front of or behind the next beat; slot times themselves never overlap.

## R3 · The craft is in the product prompts
1. THE Director and Builder prompts SHALL carry the distilled craft rules: one world, a recurring element, picture before label, at most two text levels, numbers made physical, entrances on the spoken word, varied moves, no idle loops, seams caused by something on screen, and the banned defaults.
2. THE kit's reference in the Builder prompt SHALL be the text in `packages/motion/src/film/doc.ts`, and a test SHALL fail when it names something the kit doesn't have.

## R4 · A Critic checks every beat and sends problems back
1. THE SYSTEM SHALL run each built beat in the composition sandbox and measure it: script errors; seek purity; an empty opening; a blank settled frame; text off the frame; text under 2.4 % of the short side; overlapping text; more than 30 words; a hero that is too small; a picture that is too small or runs off the frame; type only where a picture was asked for; low contrast; a figure the narration never says; no motion; a beat still on screen at the end of its tail.
2. WHEN the Critic finds blocking problems THE SYSTEM SHALL send them back to the builder with the beat as built, up to 2 times, and keep the best version.
3. WHEN a beat still can't run THE SYSTEM SHALL mark it failed and fill its span with the quick-mode scene for those words, so a film never has a hole.
4. A picture check by a vision model on rendered stills is out of scope here (noted in design §8).

## R5 · The editor
1. THE editor SHALL offer "Make it a film" for the whole video with the cost shown first (`☁ N`, by length) and a route chip; quick mode stays one click away.
2. WHILE a film is being made THE SYSTEM SHALL show progress by role (storyboard, drawings, beats i of n, checking) and keep the current graphics playable until the film is ready.
3. WHEN the film is ready THE SYSTEM SHALL replace the video's slots with the film's beats as one undoable command. Each beat is an ordinary slot: selectable, with versions, and regenerable alone ("Rebuild this beat", which reuses the storyboard).
4. THE storyboard SHALL be saved with the project so a beat can be rebuilt later and the plan can be shown and edited.
5. WHEN the creator is offline, out of credits or cloud AI is paused THE SYSTEM SHALL say so on the button and leave quick mode working.

## R6 · Cost and safety
1. A film SHALL be one credited action, `film`: 5 credits per started 30 s of voiceover, spent before the first call and refunded when no film comes back. Beats that fall back to quick mode are not refunded singly.
2. Generated beats and drawings SHALL pass the spec 15 lint and run only in the opaque-origin sandbox or the render container.
3. Film mode SHALL refuse voiceovers over 3 minutes with a reason (the Director's context and the cost).

## R7 · Export
1. A film SHALL render through the same composition HTML in preview and export, tails and stacking included.
