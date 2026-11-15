# 07 · Scene engine and looks — design

_Written in a Claude Code session (2026-11-15). Status: **draft, waiting for approval.** Requirements were approved the same day (D-028)._

## Overview

```
voiceover words ──► slots.detect ──► director (code) ──► component.fill ──► Score (JSON, zod)
                    picks a scene     variety, energy     cheap model           │
                                                                                ▼
   Look (JSON + materials + decor) ──────────────►  Scene.build(ctx, score)
   Image assets (generated, keyed, treated) ─────►    └─ Stage: actors + cues + beats
                                                           │ engine schedules beats on words,
                                                           │ adds juice, keeps read time
                                                           ▼
                                             Composition.seek(t)  (pure, as today)
                                                           ▼
                                   compiler → HyperFrames → preview / render
```

The design keeps everything that exists. **A scene is a `MotionComponent`.** `slot.componentId` holds the scene id and `slot.params` holds the score. So slots, versions, the compiler, the runtime, `edit.patch`, `component.fill`, the inspector and the post-pass need no new concepts, only richer params.

## What goes where

| Package | New |
|---|---|
| `packages/schemas` | `score.ts` (score envelope, energy), `look.ts` (extends `StylePackSchema`), `asset.ts` (image asset records) |
| `packages/motion/src/engine/` | `stage.ts`, `actors/*`, `behaviours/*`, `beats.ts`, `juice.ts`, `camera-track.ts`, `surfaces.ts`, `decor/*`, `materials/*` |
| `packages/motion/src/scenes/<id>/` | `content.ts` (zod), `variants.ts` (layouts per format), `build.ts`, `samples.ts`, `README.md`, tests |
| `packages/motion/src/looks/<id>/` | `look.json`, optional `materials.ts` / `decor.ts` overrides, fonts, `README.md` (provenance) |
| `packages/ai` | `component.fill` gains scene content; `tasks/image-generate.ts`; `direct/variety.ts` (pure) |
| `apps/web` | image pipeline (`lib/images/*`), asset store, export gate, actor drawer in the rail |

`packages/motion/src/components/big-number` stays as an actor; `stat-punch` is the scene built on it. `styles/*.json` move to `looks/` with a re-export so nothing else changes.

## Score (the AI's whole output)

```ts
// packages/schemas/src/score.ts
export const EnergySchema = z.enum(['calm', 'steady', 'lively', 'hype']);

export const ScoreSchema = z.object({
  variant: z.string().optional(),              // one of the scene's variant ids; engine picks if absent
  content: z.record(z.string(), z.unknown()),  // parsed by the scene's content schema
  beats: z.array(z.object({                    // which spoken word each cue lands on
    cue: z.string(),                           // one of the scene's cue ids
    word: z.number().int().nonnegative(),      // index inside the slot's words
  })).max(8).default([]),
  images: z.array(z.object({
    role: z.string(),                          // one of the scene's image roles
    subject: z.string().max(120),              // "an old cargo ship", never style words
    assetId: z.string().optional(),            // set by the app, never by the AI
  })).max(3).default([]),
});
```

- The AI sees, per scene: `id`, `useWhen`, a compact content schema, variant ids with one-line descriptions, cue ids, image roles. It answers with enums, short strings, numbers and word indices. Nothing else is accepted (R1.3).
- Beat anchors are optional. Missing or bad anchors fall back to the tagger: the focal cue lands on the span the slot was detected from, other cues spread by the scene's default pattern.
- `energy` is not in the score. It is a project setting (default: the look's), so one control changes the whole video.
- `content` strings carry max lengths in the schema, so text always fits before `fitText` has to work.

## Scenes

```ts
export interface Scene<C> extends MotionComponent<ScoreOf<C>> {
  useWhen: string;
  content: z.ZodType<C>;
  variants: VariantDef<C>[];        // ≥ 3; each has layouts for 16:9, 9:16, 1:1 and an image-free form
  cues: CueDef[];                   // ordered: e.g. context → focal → label → accent
  imageRoles: ImageRoleDef[];       // e.g. { id: 'subject', aspect: '3:4', optional: true }
  build(ctx: SceneContext, score: ScoreOf<C>): Composition;
}
```

`SceneContext` is `BuildContext` plus:
- `look`: the look (a superset of `style`, which stays for old components);
- `words`: the slot's words with times relative to the slot start;
- `assets`: `assetId → { url, width, height, keyed: boolean }` for images that are ready;
- `energy`, `prevVariant` (for variety).

A scene's `build` is short and declarative. It asks a variant for boxes, puts actors on a stage and attaches behaviours to cues:

```ts
const st = stage(ctx);
const boxes = variant.layout(ctx, content, hasImage);
const num = st.add(actors.number(content.value, fmt), boxes.number, { focal: true });
const label = st.add(actors.text(content.label, 'label'), boxes.label);
st.on('context', enter(ctxLine));
st.on('focal', enter(num, 'count'), mark(num, 'emphasis'));
st.on('label', enter(label));
return st.compile();           // → Composition
```

The scene never names an ease, a duration, a colour or a decoration. Those come from the look through the engine.

### Scenes for Nov 30 (six) and their cues

| Scene | Use when | Cues | Image role | Image-free form |
|---|---|---|---|---|
| `hook-statement` | opening line, claim, chapter | eyebrow → headline (word by word on the voice) → emphasis → subline | backdrop cutout | type-led with decor |
| `stat-punch` | one number | context → number lands → mark → label → delta | subject cutout beside the number | number fills the frame |
| `chart-story` | 2–8 values or a trend | title → axis → series (each bar or segment on its word) → highlight → takeaway | none | n/a |
| `versus` | A against B | left → right → divider slam → verdict | one per side | icon or initial tiles |
| `map-journey` | place, route, spread | world → travel → pin → label → route | none (Natural Earth, bundled) | n/a |
| `photo-evidence` | a thing, person type, object, document | photo lands → annotation 1..3 (each on its word) → caption | the subject (required) | falls back to `concept-card`: icon + labels |

After Nov 30: `list-stack`, `timeline`, `quote`, `concept-diagram`, `document-highlight`, `product-hero`.

Single actors (number, headline, chart, callout, map, image) are exposed as one-actor scenes through a small `solo(actor)` helper, which is what the rail's drawer drops (R2.6).

## Stage engine

- **Actors** create DOM/SVG once at build and expose a `set(props)` used by `seek`. Kinds: `text` (split by line/word/letter), `number`, `bars`, `line`, `map`, `image`, `shape`, `icon`, `annotation`. Each has a depth layer (0 back, 1 mid, 2 front) for parallax.
- **Behaviours** are pure functions `(actor, t0, look) → tracks`. Families:
  - enter: `rise`, `mask`, `wipe`, `pop`, `draw`, `slam`, `type`, `stamp`, `count`;
  - emphasis: `mark` (look decides: highlighter swipe, marker circle, underline, glow), `pulse`, `nudge`;
  - exit: `fall`, `wipe-out`, `cut`;
  - secondary: `settle` (overshoot and rest), `follow` (children lag the parent), `drift` (parallax).
  A scene asks for a family (`enter`); the look's motion personality picks the member and its timing unless the variant pins one.
- **`st.compile()`** resolves cue times (below), turns behaviours into keyframe tracks on the existing `track` / `stagger` core, adds juice, builds the camera track and returns `{ durationMs, seek, dispose, soundCues, report }`. `seek(t)` evaluates every track at `t` and calls `set`. No state is kept between seeks, so `assertSeekPure` holds as today.

### Beats: scheduling on the voice

`scheduleBeats(cues, anchors, words, durationMs, energy, look)`:

1. Each anchored cue gets `t = word.startMs − lead`, where `lead` is the behaviour's time-to-land (so the element **lands** on the word, ± 80 ms; principle 13).
2. Unanchored cues are spread by the scene's default pattern between their neighbours.
3. Order is forced (cues never swap), and each cue keeps a minimum distance from the previous one: the previous text's **read time** (principle 16: 0.8 s + 0.2 s per word beyond three). If the slot is too short, trailing optional cues are dropped, never squeezed, and `report.dropped` lists them.
4. **Budget fill.** Let `I` be the energy interval (3.0 / 2.2 / 1.6 / 1.1 s). For every gap longer than `I` with no visible change, the engine inserts juice beats from the look's ordered list until the gap is covered.
5. Exit starts at `durationMs − exitMs`; exits are 60 % of the entrance length (principle 12).

### Juice: what fills the gaps

Juice beats come from `look.juice`, an ordered list the engine cycles through with the slot seed, skipping any that are not legal at that moment:

| Juice | What it does | Blocked when |
|---|---|---|
| `camera-push` | slow push or pull toward the focal box | never (velocity is capped) |
| `camera-snap` | quick 6–10 % zoom toward a box, then settle | a text block is inside its read time |
| `decor-draw` | a scribble, arrow, underline or stamp draws next to a non-focal actor | it would cover text in read time |
| `parallax-shift` | depth layers slide by small, different amounts | never |
| `surface-flip` | a card or strip re-tapes, tilts or re-stacks | it holds text in read time |
| `accent-sweep` | a colour or light sweep across a surface | it holds text in read time |

Read time is enforced in one place: a `quietWindows` list (text actor box + time range). A juice beat whose target box intersects a quiet window, or a fast camera move during any quiet window, is rejected and the next candidate is tried. If nothing is legal, the engine uses `camera-push`, which always is.

### Camera

The compiler still owns `.mp-cam`. Scenes and juice only emit camera cues ("focus box B at time T"). `camera-track.ts` turns them into one scale-and-translate track using the look's grammar (`push` range, `snap` amount, `whip` allowed or not, parallax depth). Text layout keeps using `insetForCamera`, with the inset taken from the largest zoom the look allows.

## Looks

`LookSchema` extends `StylePackSchema`; every new block is optional, so today's packs are valid looks.

```jsonc
{
  "id": "field-notes", "name": "Field Notes", "energy": "lively",
  "colors": { /* as today */ }, "fonts": { "display": "…", "body": "…", "mono": "…", "hand": "…" },
  "motion": {
    "personality": "snappy",                       // preset; fields below override it
    "enter": { "text": "mask", "number": "count", "image": "slam", "shape": "draw" },
    "ease": { "enter": "outExpo", "move": "inOutCubic", "settle": "outBack" },
    "enterMs": 520, "staggerMs": 45, "overshoot": 0.06, "exitRatio": 0.6
  },
  "camera": { "push": [1.0, 1.06], "snap": 0.08, "whip": false, "parallax": 14 },
  "surfaces": {                                    // semantic surface → material stack
    "card": ["paper", "torn-edge", "shadow-soft"],
    "photo": ["white-border", "tape", "tilt"],
    "label": ["hand", "marker-underline"],
    "strip": ["paper", "torn-edge"]
  },
  "marks": { "emphasis": "marker-circle", "pointer": "marker-arrow", "divider": "torn-rule", "badge": "stamp" },
  "juice": ["decor-draw", "camera-snap", "parallax-shift", "surface-flip", "camera-push"],
  "image": {
    "recipe": "A single {subject}, documentary photograph, soft daylight, slightly desaturated, centred, full subject visible",
    "treatment": ["key", "white-border", "shadow-soft"], "tint": null
  },
  "sound": { "enter": "paper", "mark": "pen", "focal": "thud", "snap": "whoosh" },
  "transitions": ["paper-wipe", "push"]
}
```

**How scenes stay look-free (R3.3):** scenes only ever ask for semantic things: a surface kind (`card`, `photo`, `label`, `strip`), a mark role (`emphasis`, `pointer`, `divider`, `badge`), a behaviour family. The look maps each to an implementation. Field Notes circles a number with a red marker; Paper Collage slaps a torn coral strip behind it; Ink Essay draws a thin underline. Same scene code.

**Materials** (`engine/materials/`) are deterministic builders that return SVG/CSS: `paper` (existing seeded tiles), `torn-edge` (seeded polygon path, not a live filter, so it is identical in preview and render), `tape`, `white-border`, `shadow-soft`, `tilt`, `halftone`, `grain`, `glow`, `grid`. **Decor** (`engine/decor/`) draws marks as SVG paths with a draw-on reveal: `marker-circle`, `marker-arrow`, `marker-underline`, `highlighter`, `stamp`, `torn-rule`, `scribble`.

**Libraries to evaluate in task 1** (licence, bundle size, determinism under a fixed seed), each recorded in `docs/third-party.md` if adopted: `roughjs` and `perfect-freehand` (hand-drawn paths), `d3-shape` / `d3-scale` (charts), `lucide` (icons, already in the app). If a library is not deterministic with our seeded RNG, we write the small path generator ourselves.

**Fonts:** each polished look adds at most two OFL families (a display face and a hand face), as bundled woff2 subsets. Exact families are chosen and licence-checked in the look's task.

**The two polished looks**

| | `field-notes` | `paper-collage` |
|---|---|---|
| Feel | a reporter's desk: maps, documents, taped photos, red marker | cut paper, kraft, tape, stop-motion energy |
| Motion | snappy; things slam down and settle; marker draws on | stepped: paper pieces arrive on 2s (12 fps feel) with slight rotation jitter from the seed |
| Marks | marker circle, arrow, underline, handwritten label | torn colour strip, tape, cut-out letters for emphasis |
| Camera | snap-zooms to evidence, slow pushes | small pushes, layer parallax |
| Shared | `paper`, `torn-edge`, `tape`, `tilt`, `white-border` materials, built once |

Other looks ship as token-level looks first (they already render every scene, because unmapped surfaces and marks fall back to plain defaults).

## Images

```
score.images[] ─► cost chip (☁ N credits) ─► user confirms ─► image.generate (cloud)
   ─► PNG ─► key background ─► treat (look) ─► asset store ─► slot params get assetId ─► recompile
```

- **Task `image.generate`** in `packages/ai`: ONLY_IN_CLOUD, never on-device, never automatic. It goes through the router's rules (kill switch, usage event, cost) with its own provider method, because the output is an image, not JSON. Firebase AI Logic call: `getGenerativeModel(ai, { model, generationConfig: { responseModalities: [ResponseModality.IMAGE], imageConfig: { aspectRatio, imageSize: '1K' } } })`, reading `response.inlineDataParts()`. Shape checked against the docs on 2026-11-15; re-check against the installed SDK types in the task.
- **Prompt** = `look.image.recipe` with `{subject}` filled, plus fixed lines: one subject, plain solid background in the key colour, no text, no logos, no real people by name. The AI's `subject` is validated (length, no style words list) before it is used.
- **Keying** (`apps/web/lib/images/key.ts`, in a worker): estimate the background from the border pixels, build an alpha matte by colour distance with a soft edge, remove spill. If the border is not uniform, or the matte keeps under 5 % or over 90 % of the pixels, keying is skipped and the image is used as a framed rectangle (`keyed: false`), which every image variant supports. No matting model in this spec.
- **Treatment** is applied at build time by the `image` actor from `look.image.treatment`, so switching looks re-treats the same asset without regenerating.
- **Asset store:** `users/{uid}/projects/{pid}/images/{hash}.png` in Storage (IndexedDB blob store in local mode). `hash = sha256(model, recipe version, subject, aspect)`; a hit skips generation and costs nothing (R4.5). The project keeps `assets: { id, hash, status: 'pending' | 'ready' | 'failed', keyed, w, h }`.
- **Cap and cost:** at most `imagesPerVideoMax` (Remote Config, default 6) across the project. Each image costs `imageCredits` (Remote Config, default 2). The chip always reads `☁ N` and the confirm names the count: "Generate 3 images · ☁ 6". Real cost to us: $0.0336 per image (requirements R4.5).
- **Preview:** a pending image shows the scene's image-free form with a small in-look shimmer on the spot where the image will land; when the asset is ready the slot recompiles and the image enters with its normal behaviour at its cue.
- **Failure or block:** the asset becomes `failed`, the slot stays on the image-free form, and the inspector offers Retry and Upload instead.
- **Export gate (spec 08 hook):** `canRender(project)` is true only when no asset is `pending`. The export modal waits ("Finishing 2 images…") and then renders; `failed` assets render the image-free form. The compiler's render mode throws if it is handed a pending asset, so a placeholder can never be exported.
- **Render inputs:** the render job receives the composition plus the asset files; the composition references them as local files, so the "no network in compositions" rule still holds.
- **Upload instead:** any image role accepts a user upload (existing limits: image/*, ≤ 10 MB), keyed and treated the same way.

## AI flow

1. **`slots.detect`** is unchanged in shape. The catalogue it sees is now generated from the scene registry (`id`, `useWhen`, built). The deterministic detector maps span kinds to scenes (number → `stat-punch`, two numbers or a list of values → `chart-story`, place → `map-journey`, comparison words with two subjects → `versus`, a named thing → `photo-evidence`, sentence openers → `hook-statement`).
2. **Director (`packages/ai/src/direct/variety.ts`, pure code, no model call):** after the post-pass it walks the slots in order and (a) swaps a scene that repeats its neighbour when the span allows another, (b) assigns variants so no two neighbours share one, (c) marks at most `imagesPerVideoMax` slots as image candidates, highest score first, spread across the video. Deterministic from the project seed. An AI director can replace it later behind the same function.
3. **`component.fill`** (exists) now takes the scene's compact content schema, variant list, cue list, image roles and the slot's indexed words. Output is the score. Its router check parses `content` with the scene schema and verifies variant, cue and role ids. Auto-fill stays ONLY_ON_DEVICE and never asks for images; **Generate** stays ONLY_IN_CLOUD for 3 credits and may propose images, which the user confirms with their own cost chip.
4. **Hybrid path by Nov 30:** on-device auto-fill of text scenes (free, image-free forms) → cloud Generate → cloud images. Each step shows its route chip first.

## Checks

- **`motion:check`** runs every scene × polished look × format (plus one token-level look) with random and edge-case content: overflow, overlap, contrast ≥ 4.5:1, focal visible at its cue. New assertions from the stage `report`: beat budget met for each energy, read time never violated, no cue dropped at the ideal duration.
- **Variety lint** on a project: no two neighbouring slots with the same scene variant.
- **Property tests (fast-check):**
  1. any schema-valid score for any scene compiles and is seek-pure;
  2. for random words, anchors, durations and energies, `scheduleBeats` keeps cue order, lands anchored cues within ± 80 ms when the slot allows it, never overlaps a read window, and leaves no gap longer than the energy interval;
  3. juice never targets a box inside a quiet window;
  4. the director output never repeats a variant between neighbours and never exceeds the image cap;
  5. `key()` returns alpha in [0, 1], is deterministic, and reports `keyed: false` for non-uniform borders;
  6. `canRender` is false whenever any asset is pending.
- **Parity:** the existing preview/render stills test gains one scene per polished look (torn edges and marks must match).

## Performance targets

Build under 40 ms per slot and `seek` under 2 ms per slot on a mid laptop; keying a 1K image under 150 ms in a worker; a 60 s voiceover's text scores back in under 15 s with parallel cloud fills (R7).

## Edge cases

- Slot shorter than a scene's minimum: the post-pass already widens or drops; the stage drops optional cues and reports it.
- No words in the slot (user-drawn slot over silence): cues use the default pattern from the slot start.
- 9:16 with long text: variants declare a max line count; `fitText` shrinks to the look's minimum size, then the variant with fewer actors is chosen.
- Look switched after images exist: assets are reused, only the treatment changes.
- Image subject that names a real person or a brand: rejected before generation with a short reason; the slot stays image-free.
- Old projects: `big-number` params are wrapped as a `stat-punch` score on load (pure migration, tested against the demo fixture).

## Correctness properties

1. Same score + look + format + energy + assets + t → identical frame.
2. The AI can change what is said and which authored option is used, never how it moves or looks.
3. Text is never moved, covered or fast-zoomed during its read time.
4. No gap without a visible change is longer than the energy interval.
5. A placeholder never reaches a render.
6. Image generation never happens without a shown cloud cost and a confirm, and never more than the cap.
7. Every scene renders in every look and without images.

## Build order (tasks.md will detail)

1. Schemas (`score`, `look`, `asset`) + library evaluation. **[kiro]** property tests for schemas.
2. Stage engine: actors (text, number, shape), behaviours, `scheduleBeats`, quiet windows. **[kiro]** beat-scheduling properties.
3. `stat-punch` + `hook-statement` on the engine with the token-level look; migration of `big-number`.
4. Materials + decor + `field-notes`, then `paper-collage` (reference provenance in the READMEs).
5. `chart-story`, `versus`.
6. Images: `image.generate`, keying, asset store, cost UI, `photo-evidence`, export gate hook.
7. `map-journey` (first to cut if time runs short, as before).
8. Director variety, catalogue wiring into `slots.detect` / `component.fill`, juice tuning per energy, `motion:check` matrix. **[kiro]** check matrix and director properties.

Spec 08 (export) runs in parallel from step 3 on, because the Nov 30 demo needs both.
