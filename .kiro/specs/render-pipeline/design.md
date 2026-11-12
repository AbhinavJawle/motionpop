# Design: render-pipeline

## Overview
```
SceneSpec (JSON) ──parse──▶ validated SceneSpec
        │                         │
        │            getSceneVideoConfig()  (one pure function)
        │                         │
        ▼                         ▼
  <SceneRenderer>  ◀── registry: component id → { schema, Component, phases, catalog }
        │
   ┌────┴──────────────┬───────────────────────────┐
   ▼                   ▼                           ▼
Remotion Player     Node renderer (local)      Remotion Lambda
(/playground)       renderMedia + bundle       renderMediaOnLambda → S3 (private)
                    → renders/*.mp4            → signed URL
```
One component tree (`SceneRenderer`) drives all three outputs, so the preview and the exports show the same frames (Req 5.1).

## Key decisions
| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| R1 | **One generic composition `Scene`** with the scene spec as input props, and `calculateMetadata` deriving size/fps/duration via `getSceneVideoConfig` | One composition per component | Lambda and the local renderer take a composition id + input props. A single entry point means new components need no render changes. |
| R2 | **Lambda for production exports, Node renderer for local/dev** | Client-side rendering (`@remotion/web-renderer`, stable since 4.0.491) | Client rendering emulates CSS on a canvas: no `perspective`, no `backdrop-filter`, filters unsupported in Safari, single-threaded. That would cap component craft (globe, glows). Server rendering screenshots real Chrome, so output matches the preview exactly. Client rendering stays an option for a later "instant draft" export. |
| R3 | **Pre-built bundle, two destinations.** `pnpm --filter @motionpop/render bundle` builds the Remotion bundle once; the local renderer serves it from disk and `lambda:deploy` uploads it with `deploySite` | Calling `bundle()` inside a Next route handler | Bundling (webpack) inside Next's server is slow and fragile. A prebuilt bundle is the same artifact everywhere. |
| R4 | **Direction = phases + camera keyframes.** Each component declares named phases with defaults; `direction.phases` overrides them | Free-form timeline per element | Gives skills (spec #4) a small, validatable surface: a skill's shot sequence maps onto named phases. Easy to property-test. |
| R5 | **Component schema + catalog co-located with the component, exported from a React-free subpath `@motionpop/components/catalog`** | Put prop schemas in `@motionpop/schemas` | Keeps the component contract (one folder per component, scaffolder-friendly) while letting `engine` validate props without importing React/Remotion. Requires a one-line `structure.md` update: `engine → @motionpop/components/catalog`. |
| R6 | **Number layout uses monospace numerals** (JetBrains Mono, tabular figures) | Measure text in the browser (`@remotion/layout-utils`) | Monospace advance width (0.6 em) makes fitting a pure function: testable in Node and identical in every renderer. Display/body text uses a conservative width estimate plus `overflow-wrap`, checked by the property test. |
| R7 | **No CloudFront yet.** Lambda writes privately to its S3 bucket; downloads use presigned URLs | CloudFront signed URLs | Same security, less infrastructure in week 1. CloudFront moves to the `auth-and-infra` spec. |
| R8 | **Production guard:** `/api/render` returns 403 when `NODE_ENV=production` until auth exists | Shared-secret header | Simplest way to guarantee Req 6.4. |

## Data model (`@motionpop/schemas`)
```ts
// direction.ts
Phase          = { start: number; end: number }                 // fractions, 0 ≤ start ≤ end ≤ 1
CameraKeyframe = { t: number; scale: number }                   // t in 0–1, scale in 0.8–1.25
Direction      = { phases?: Record<string, Phase>; camera?: CameraKeyframe[]; shake?: { at: number; frames: 1 | 2 } }

// style-pack.ts
StylePack = { id, name, palette: {8 roles}, typography: { display, body, numerals },
              easing: { enter, exit, emphasis: [x1,y1,x2,y2] all in 0–1 },
              durations: { enter, exit, hold }, background: { type: 'solid'|'gradient'|'grain', ... } }

// formats.ts (extended)
FormatPreset += typeScale: { hero: number; title: number; body: number; label: number }  // px at native size

// scene.ts
SceneSpecBase = { version: 1, component: string, format: FormatId, durationSeconds: number (1–30),
                  stylePack: string, props: unknown, direction: Direction }
```
`SceneSpecBase` lives in `schemas` (no component knowledge). Full validation (Req 1.2) is `parseSceneSpec(input, registry)` in `@motionpop/components/catalog`, which looks up the component schema and also runs component-level checks such as context read time (Req 2.6). It returns `{ ok: true, spec } | { ok: false, issues: { path, message }[] }`.

Type scale per format (minimums from `motion-principles.md`):

| format | hero (max) | title | body | label |
|---|---|---|---|---|
| youtube-16x9 / product-demo-16x9 | 260 | 64 | 40 | 32 |
| shorts-9x16 | 240 | 60 | 40 | 32 |
| square-1x1 | 220 | 56 | 36 | 30 |

## Package layout
```
packages/schemas/src/       formats.ts (+typeScale) · direction.ts · style-pack.ts · scene.ts · *.test.ts
packages/styles/src/        packs/money-documentary.ts · index.ts (registry: id → StylePack)
packages/components/src/
  catalog.ts                React-free: registry of { id, schema, phases, catalog }, parseSceneSpec
  index.ts                  React: SceneRenderer, componentMap
  remotion/entry.ts         registerRoot(Root)
  remotion/Root.tsx         <Composition id="Scene"> + per-format preview compositions for Studio
  core/                     video-config.ts · camera.ts · easing.ts · fonts.ts · Background.tsx · SceneFrame.tsx
  scenes/number-reveal/     schema.ts · catalog.ts · NumberReveal.tsx · timing.ts · layout.ts · format.ts
                            number-reveal.test.ts · number-reveal.property.test.ts
packages/render/src/        bundle.ts · targets/local.ts · targets/lambda.ts · render-target.ts · file-name.ts
                            cli/render-local.ts · cli/lambda-deploy.ts
apps/web/src/app/
  playground/page.tsx       client: Player, format switcher, safe-zone toggle, JSON editor, Export button
  api/render/route.ts       POST: parse spec → target.start() → { jobId }
  api/render/[id]/route.ts  GET: target.progress(jobId) → { status, progress, url?, error? }
```

## Number Reveal

### Phases (defaults)
| phase | default | behaviour |
|---|---|---|
| `intro` | 0.00–0.08 | background and label fade in (enter easing); number area empty |
| `count` | 0.08–0.45 | count from 0 to `value`; progress = `emphasis` easing so it decelerates hard at the end |
| `hold` | 0.45–1.00 | final value fixed; nothing moves except camera drift |
| `context` | 0.55–1.00 | context line fades to 0.7 opacity over 0.4 s, then stays |

Default camera: `[{t:0, scale:1}, {t:0.45, scale:1.06}, {t:1, scale:1.07}]`. Optional `shake` (≤ 2 frames, ≤ 2 px) at the end of `count`.

The default staging deliberately differs from the draft *Shocking Stat Reveal* skill, which starts the context line at 85%. On a 6 s scene that leaves 0.9 s, below the read time for any context line (≥ 1.3 s for one word). The `director-skills` spec has to fix that skill. Req 2.6 now catches it automatically.

### Pure helpers (all unit + property tested)
- `formatFinal(props) → string`: `Intl.NumberFormat(locale, { style, currency, notation, maximumFractionDigits })`.
- `displayValueAt(frame, cfg, phases, props) → string`: before `count` shows the formatted 0, during `count` shows `value × ease(progress)` rounded to `maximumFractionDigits`, after `count` shows `formatFinal(props)` exactly. Compact notation counts using the final unit (e.g. "B") so the suffix doesn't jump between K/M/B mid-count.
- `layoutNumberReveal(format, props) → { number: { fontSize, y }, label?, context? }`: number font size = `min(typeScale.hero, safeWidth / (chars × 0.6))`, where `chars` is the length of the longest string shown (the final value). Label and context: font size from the type scale, wrapped to at most 2 lines using a conservative 0.55 em average glyph width; the stack is centred vertically inside the safe area.
- `minDurationForContext(props, phases) → seconds`: smallest duration such that the context's visible time ≥ `0.3 s × words + 1 s`.

### Rendering
`SceneFrame` applies background + camera transform (`interpolate` between keyframes with an ease-in-out bezier, clamped). `NumberReveal` reads palette/typography from the style pack passed by `SceneRenderer`. The number uses `font-variant-numeric: tabular-nums` and the `numerals` family. No hex, font names or bezier literals in the component: they come from the pack or `core/easing.ts` constants that are generic (`easeInOut` for camera only).

## Render targets
```ts
interface RenderTarget {
  start(spec: SceneSpec): Promise<{ jobId: string }>;
  progress(jobId: string): Promise<
    | { status: 'rendering'; progress: number }
    | { status: 'done'; url: string; fileName: string }
    | { status: 'failed'; error: string }>;
}
```
- **local:** `selectComposition` + `renderMedia` (codec `h264`, `crf` 18) against the prebuilt bundle; writes to `renders/`; in-memory job map (dev only, single process). The download URL is a dev-only route that streams the file.
- **lambda:** `renderMediaOnLambda({ region: 'eu-central-1', functionName, serveUrl, composition: 'Scene', inputProps: spec, codec: 'h264', privacy: 'private', downloadBehavior: { type: 'download', fileName } })`. The job id is `base64url(renderId:bucketName)`, so it's stateless. `getRenderProgress` maps to the interface; when finished, a presigned URL valid for 1 hour.
- Target chosen by `RENDER_TARGET=local|lambda` (server-only env).
- Function settings: 2048 MB memory, 120 s timeout, default disk, `framesPerLambda` left to Remotion's default. These are tuned against Req 5.7 in a measurement task.

File name (Req 5.6): `${component}_${format}_${sha256(canonicalJson(spec)).slice(0, 8)}.mp4`.

## Environment variables (`apps/web/.env.example`, placeholders only)
`RENDER_TARGET`, `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION=eu-central-1`, `REMOTION_FUNCTION_NAME`, `REMOTION_SERVE_URL`.
The IAM user gets only the policy printed by `npx remotion lambda policies user` (least privilege).

## Error handling
- Invalid spec → 400 with `issues[]` (the same shape the playground shows).
- Render error → job `failed` with Remotion's message (no stack traces, no credentials).
- Lambda progress with `fatalErrorEncountered` → `failed`.

## Testing strategy
| Property (fast-check) | Req |
|---|---|
| `getSceneVideoConfig`: `durationInFrames = max(1, round(d × fps))`; size equals the preset | 1.5, 1.6 |
| Arbitrary phases/keyframes: parse succeeds ⇔ the invariants hold | 1.3, 1.4 |
| For any valid props: `displayValueAt(lastFrame) === formatFinal(props)`, and also at every frame after `count` ends | 2.2 |
| For any valid props: the sequence of displayed numeric values during `count` moves monotonically towards `value` | 2.3 |
| For any format and random label/number/context within schema limits: every laid-out box lies inside the safe area and every font size ≥ the type-scale minimum | 2.5 |
| `parseSceneSpec` rejects exactly the specs where the context visible time < read time | 2.6 |

Plus unit tests (example props parse, file-name stability, the target's progress mapping with a mocked Lambda client), a smoke script that renders stills of the example in all four formats (`pnpm --filter @motionpop/render stills`, also used later by the component quality-check hook), and one local MP4 render in the verification task.

## Licences and notes
- Fonts: Inter Tight, Inter, JetBrains Mono (all SIL OFL 1.1), loaded with `@remotion/google-fonts`. Recorded in `LICENSES-ASSETS.md`.
- Remotion licence (checked in `remotion-dev/remotion/LICENSE.md`, Nov 2026): free, including commercial use, for individuals and for-profit organisations with up to 3 employees. A company licence is needed beyond that. Remotion 5.0 announces licence changes, so re-check before launch. Our MIT licence covers our own code, not Remotion.
- The web renderer sends telemetry. We don't use it in this spec.

## Steering updates on approval
- `structure.md`: `engine → @motionpop/components/catalog` (React-free).
- `component-contract.md`: components declare `phases` with defaults; `direction` = phases + camera + shake.
