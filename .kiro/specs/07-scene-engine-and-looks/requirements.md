# 07 · Scene engine and looks — requirements

_Written in a Claude Code session (2026-11-15). Status: **approved by the founder on 2026-11-15, with the changes marked below.** Replaces the earlier plan line "6 components, 5 packs, 8 skills"._

## Why this spec changed

The founder's brief: the product is not "a bar chart and a title". It is **styles so well crafted that a cheap model produces excellent, dynamic motion graphics every time, in seconds**, instead of a great prompt to an expensive model and a long wait.

Research behind the approach (2026-11-15):

- Free-form generation is unreliable. MoVer (arXiv 2502.13372) reports 58.8 % of prompts correct without its verify-and-correct loop. (An earlier draft also quoted a 90 % / 20 % figure from a secondary write-up I had not read in full; it is dropped.)
- Constrained catalogues work. Pipelines where the model can only pick and fill typed, pre-built scenes hold quality, because the model cannot output anything that was not designed.
- Retention guidance for short and explainer video is a visual change every 1–4 s, with varied interrupt types, tied to the voice. This is practitioner advice, not measured research; we treat it as a tunable default.

**So the idea is: the AI never animates. It casts and scores.** Craft (timing, easing, layout, materials, camera, sound) is authored once in code and look data, with help from a top model at build time. At run time a cheap model writes a small JSON "score" that selects and fills that craft. Deterministic checks reject anything dull or broken before the user sees it.

## Glossary (new terms)

| Term | Meaning |
|---|---|
| Look | A complete visual system: palette, type, materials, motion personality, camera grammar, transitions, decorations, image treatment, sound palette. Supersedes "style pack" (a look contains the old tokens). |
| Scene | A hand-crafted, multi-beat choreography for one kind of moment (stat punch, versus, map journey…). Has typed content, several variants, and beat anchors. Supersedes "component" as the unit the AI picks. |
| Actor | A reusable primitive inside scenes (text block, number, chart, map, image cutout, annotation, shape, icon). Actors are also what the sidebar lets a user drop on their own. |
| Beat | A visible change inside a scene (reveal, emphasis, camera move, swap), pinned to a spoken word. |
| Score | The JSON the AI writes for one slot: scene id, variant, content, beat anchors, image requests. Validated by zod. |
| Juice | Secondary craft: decorations, follow-through, parallax, texture, sound cues. Defined by the look, added by the engine, never by the AI. |

## R1 Score: the only thing the AI writes

_As a creator, I want great results from a cheap, fast model, so I don't wait or pay for a frontier model._

1. **R1.1** THE SYSTEM SHALL define a `Score` schema (zod, in `packages/schemas`): `{ sceneId, variant?, content, beats[], images[]?, energy? }`. Every field that can be an enum is an enum. `content` is validated by the scene's own schema.
2. **R1.2** THE SYSTEM SHALL keep a score small enough for on-device generation: the catalogue summary plus one slot's words and the expected output fit Gemini Nano's context (hybrid-ai.md), so `score.fill` can run on-device for simple scenes and in the cloud for scenes with images.
3. **R1.3** THE SYSTEM SHALL never accept positions, colours, durations in ms, easing names or code from the AI. The AI chooses among named options only (scene, variant, emphasis word, beat anchors by word index, image subject).
4. **R1.4** WHEN a score fails validation THE SYSTEM SHALL repair once through the router, then fall back to the scene's deterministic default for that slot (never a blank slot).
5. **R1.5** THE SYSTEM SHALL keep existing behaviour working: `big-number` and the current slot params migrate to a scene with no visible change for saved projects.

## R2 Scenes: authored choreography with variety

_As a viewer, I want every graphic to feel directed, and no two to feel the same._

1. **R2.1** THE SYSTEM SHALL ship these scenes (build order; the first six are the hackathon minimum): `hook-statement`, `stat-punch`, `chart-story` (bar and line), `versus`, `map-journey`, `photo-evidence` (image cutout with annotations), then `list-stack`, `timeline`, `quote`, `concept-diagram`, `document-highlight`, `product-hero`.
2. **R2.2** Each scene that can use images SHALL have, for every variant, an image-free form that looks finished, so the free on-device path and failed generations still look good. Each scene SHALL have at least 3 layout variants and at least 2 entrance choreographies per format, selected by the score or, if absent, by a seeded choice that avoids repeating the previous slot's variant.
3. **R2.3** Each scene SHALL be multi-beat: at least one visible change per beat window (R5.1), each pinned to a word in the slot. The focal beat lands on its spoken word within ± 80 ms.
4. **R2.4** Scenes SHALL follow the existing contract: a pure function of time, per-format layout (16:9, 9:16, 1:1), text fitting, safe areas, transparent root, `data-text` / `data-focal` hooks.
5. **R2.5** Data scenes SHALL stay honest: geometry proportional to the data from a zero baseline, final strings equal to the formatted values.
6. **R2.6** Actors SHALL be usable alone: a user can drop a single chart, number, title, callout, map or image from the sidebar, and it renders in the current look.

## R3 Looks: the craft lives here

_As a creator, I want to pick a look and get a whole visual language, not a colour swap._

1. **R3.1** THE SYSTEM SHALL extend the style schema into a `Look`: tokens (as today) plus `materials` (paper, torn edge, tape, grid, glow, halftone, grain), `motion` personality (ease set, overshoot, stagger, speed, settle), `camera` grammar (push, parallax depth, snap-zoom, whip), `transitions` family, `decor` kit (scribbles, arrows, highlighter, stamps, stickers, particles), `image` treatment and prompt recipe, and `sound` palette.
2. **R3.2** THE SYSTEM SHALL ship these looks with **original names** (no creator or brand names anywhere in the repo, UI or demo; hackathon rule):

   | id | Character |
   |---|---|
   | `editorial-explainer` | Warm paper, ink type, photo cutouts with highlighter and labels, maps. Exists; upgraded. |
   | `field-notes` | A reporter's desk: maps, documents, taped photos, red marker circles and arrows, handwritten labels. |
   | `ink-essay` | Near-black, serif type, thin white line drawings and diagrams. Quiet, confident, idea-driven. |
   | `paper-collage` | Kraft paper, torn strips, tape, slight rotation, stop-motion feel. In the designs. |
   | `bright-science` | Flat vector world, saturated colour, rounded shapes, friendly icons, smooth morphs. |
   | `launch-day` | Product launch: gradients, glass, huge type, device frames, fast snap-zooms. |
   | `dark-money`, `neon-data`, `clean-minimal` | In the designs. Ship as token-level looks on the same scenes; full materials later. |

3. **R3.3** Every scene SHALL render in every look without look-specific scene code: looks change materials, motion, decor and image treatment through the engine. A look may opt a scene variant out.
4. **R3.4** Two looks SHALL get full polish first: `field-notes` and `paper-collage` (they share paper, tape and torn-edge materials, so this costs no more than the first proposal). `editorial-explainer` stays the default token-level look until its upgrade; the rest follow in the order above.
5. **R3.5** Fonts and assets SHALL be bundled, OFL or similarly licensed, and recorded in `docs/third-party.md`.

## R4 Images: generated, treated, consistent

_As a creator, I want real imagery in my graphics without leaving the app._

1. **R4.1** WHEN a score requests an image THE SYSTEM SHALL generate it through Firebase AI Logic with a Gemini image model (default `gemini-nano-banana-2.1` at 1K; name and size from Remote Config; verified against the docs on 2026-11-15, re-verify before coding). Image generation always runs in the cloud, and the UI shows the cloud route and the cost before it starts.
2. **R4.2** THE SYSTEM SHALL build the image prompt from the look's recipe plus the AI's subject, not from free text alone, so images match the look. Looks may supply reference images for consistency.
3. **R4.3** THE SYSTEM SHALL turn generated images into look-treated actors: subject cutout (keyed background, with a matting fallback), then the look's treatment (white stroke and shadow, duotone, halftone, tape, torn edge).
4. **R4.4** THE SYSTEM SHALL never block the preview on images: the scene plays immediately with an in-look placeholder, and the image swaps in when ready. Final renders SHALL wait until every image has settled (ready, replaced, or failed and switched to the image-free form); a placeholder never reaches an export.
5. **R4.5** THE SYSTEM SHALL show the cost before generating images, cache them in Storage per project, reuse identical requests, and cap images per video (Remote Config, default 6). Price checked on Google's pricing page on 2026-11-15: $0.0336 per 1K image for `gemini-nano-banana-2.1` (1,120 output tokens at $30 per 1M), so a full video of 6 images costs about $0.20. That page is the Gemini Developer API list; our calls go through the Agent Platform backend, whose page could not be read, so confirm on the first bill.
6. **R4.6** Users SHALL be able to replace any generated image with an upload.
7. **R4.7** IF image generation fails or is blocked THEN THE SYSTEM SHALL keep the placeholder variant, which must look finished on its own.

## R5 Quality gates: dull or broken never ships

_As a creator, I want the result to be good every single time._

1. **R5.1** THE SYSTEM SHALL enforce a beat budget set by an **energy** setting with four steps, calm → steady → lively → hype (defaults: a visible change at least every 3.0 / 2.2 / 1.6 / 1.1 s). Energy comes from the project (user setting), defaulting to the look's energy; calm lessons get slower beats. A scene below budget gets engine-added beats (camera move, decor, emphasis), never empty holds.
2. **R5.1b** Text SHALL stay still long enough to be read: after a text block lands, nothing moves or covers it for its read time (at least 0.8 s, longer for more words), and no fast camera move happens during that time. Engine-added beats respect this.
2. **R5.2** THE SYSTEM SHALL extend `motion:check` to every scene × look × format with random and edge-case content: no overflow, no overlap, contrast ≥ 4.5:1, focal visible at its beat, beat budget met, no two consecutive slots with the same scene variant.
3. **R5.3** THE SYSTEM SHALL prove with fast-check that any schema-valid score compiles to a composition that is seek-pure and passes the layout checks.
4. **R5.4** WHERE the cloud is available THE SYSTEM MAY run a cheap vision check on three stills of a generated slot and apply a JSON patch for problems the layout checks cannot see. It is optional, costed and off by default.

## R6 Direction: the video as a whole

_As a viewer, I want the video to feel like one piece with rhythm, not a slideshow._

1. **R6.1** THE SYSTEM SHALL run a director pass over all slots (one cloud call, or deterministic rules offline) that assigns scene and variant per slot with variety: no scene twice in a row, an energy curve across the video, and recurring motifs from the look.
2. **R6.2** THE SYSTEM SHALL connect neighbouring slots with the look's transitions when they touch, and keep the camera alive across a slot.
3. **R6.3** THE SYSTEM SHALL add look-defined sound cues at beats (synthesized, deterministic; mixing is spec 12).
4. **R6.4** Director skills in `skills/` SHALL keep working: a skill maps to preferred scenes, variants and beat patterns.

## R7 Speed and cost

1. **R7.1** A slot without images SHALL preview in under 3 s on the cloud route and be free on-device.
2. **R7.2** A full first pass on a 60 s voiceover SHALL finish its text scores in under 15 s (parallel fills), with images arriving after.
3. **R7.3** Credits: on-device fills free; cloud fill 3 credits (as designed); each generated image costed separately and shown first.

## R8 Build-time craft transfer (how the quality gets in)

1. **R8.1** For each look, reference animations MAY be produced with a top model outside the product. Timings, eases, layout ratios, type scale and decoration rules are then extracted by hand into the look and scenes. The provenance goes in each README. No reference output ships.
2. **R8.2** Motion principles are revised (approved): one focal point per frame, purposeful secondary motion allowed, and text stays still long enough to be read. Logged as D-028.

## Non-functional

- Deterministic: same score + look + format + t → identical frame.
- No GSAP. Any new library is MIT / Apache / ISC / BSD, bundled, and recorded in `docs/third-party.md`. Candidates to evaluate in design: rough.js and perfect-freehand (hand-drawn strokes), flubber (shape morphs), d3-shape / d3-scale (charts), lucide (icons), an on-device matting model with a permissive licence.
- Image generation costs real money per image. It is capped and costed (founder's cost rule).
- Everything from the AI and every image response is zod-validated.

## Out of scope here

Tier-2 free-form generation (spec 15, now the escape hatch), 3D scenes, character animation, video footage, music.

## Decisions (founder, 2026-11-15)

1. Looks have original names; the references guide the craft only.
2. Nov 30 scope: engine + 6 scenes + 2 polished looks (`field-notes`, `paper-collage`) + images. Export (spec 08) and the hybrid path must work by then. The rest lands before Dec 4.
3. At most 6 images per video; every scene works without images; real price recorded in R4.5; images always show the cloud route and cost first.
4. Motion rules loosened as in R8.2, with the read-time rule (R5.1b).
5. Beat interval follows the energy setting (R5.1).
6. Final renders wait for every image; only the preview uses placeholders (R4.4).
