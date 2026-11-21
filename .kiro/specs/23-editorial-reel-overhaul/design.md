# Spec 23 — Editorial Reel Quality Overhaul (Design)

## Architecture Overview

Spec 23 upgrades Motionpop's talking-head video pipeline across 8 pillars organized into 5 incremental phases, keeping 100% compatibility with existing voiceover-only projects, opaque-origin sandboxing (D-021), integer-ms timing, and deterministic `seek(t)` rendering.

### 1. Stage Geometry & Editorial Arched Split (`packages/schemas/src/video.ts`, `preview-player.tsx`, `video-ffmpeg.ts`)
- Add 3 new modes to `VIDEO_STAGE_MODES`:
  - `split-top-stage`:
    - Vertical (`9:16`): Top graphic stage occupies `y: 0..0.52`; speaker sits in the bottom arched frame `x: 0, y: 0.54, w: 1, h: 0.46` (with top-left/top-right corner radius `0.06 * width` — arched top corners, flush bottom edge!).
    - Horizontal (`16:9`): Left graphic stage `x: 0..0.52`, right speaker `x: 0.54..0.97, y: 0.06..0.94`.
  - `top-card`:
    - Speaker stays full-bleed `x: 0, y: 0, w: 1, h: 1` with gentle drift. Graphic is restricted strictly to `top: 6%..29%`.
  - `clean`:
    - Speaker stays full-bleed `x: 0, y: 0, w: 1, h: 1` with smooth punch-in scale drift (`1.0 → 1.09`). No heavy graphic overlay; at most a minimal chapter stamp.
- Add `topRadiusOnly?: boolean` to `VideoStageRect` & `NormalizedStageBox` so `split-top-stage` renders clean rounded **top** corners (`borderRadius: "R R 0 0"`) in CSS preview AND a matching arched top-corner alpha mask in `video-ffmpeg.ts`!
- Upgrade `video-ffmpeg.ts` punch-ins to use smooth time-eased scale/crop ramps (or smooth step windows) and add optional `whip` brief blur transition between major stage shifts.

### 2. Editorial Captions (`packages/schemas/src/project.ts`, `packages/motion/src/captions/chunk.ts`, `packages/motion/src/runtime/captions.ts`)
- Expand `CaptionPresetId` to `'editorial' | 'studio' | 'minimal-pill' | 'pop' | 'clean' | 'boxed'`.
- `editorial` (Ref 2 signature, new default for `editorial-cream` video projects):
  - Chunk limit = **2 words** (punchy 1–2 word editorial beats!).
  - Alternates bold geometric sans (`Geist 800`) and italic editorial serif (`Playfair Display` italic) on emphasized/number words.
  - Adapts ink automatically to background luminance: crisp `#171614` dark ink over warm cream/light `split-top-stage` seam (`top: 46%..53%`), crisp `#FFFFFF` with soft drop-shadow over dark/full-bleed speaker footage!
- `studio` (Ref 1 & Ref 4 signature):
  - Crisp white bold text with subtle dark stroke/shadow on full-bleed video.
  - On `split-top-stage` / `split-left` / `split-right`, automatically docks into a full-width `#0A0A0E` horizontal seam bar cleanly dividing the top graphic and bottom speaker!
- `minimal-pill` (Ref 3 signature):
  - Compact sleek dark translucent pill (`rgba(10,10,16,0.8)`) with subtle accent tint on the active word.

### 3. Editorial Cream Default Look & Luminous Reel Looks (`packages/motion/src/styles/`)
- **`editorial-cream.json`** (new default for uploaded video projects):
  - `bg: "#EDE8DF"`, `ink: "#171614"`, `muted: "#6B655C"`, `accent: "#DF6B41"`, `accent2: "#2563EB"`, `highlight: "#F59E0B"`, `positive: "#16A34A"`, `negative: "#DC2626"`.
  - `fonts: { display: "Playfair Display", body: "Geist", mono: "Geist Mono", hand: "Caveat", displayWeight: 700 }`.
- **`studio-light.json`** (Ref 1 crisp light editorial look):
  - `bg: "#F6F7FA"`, `ink: "#111318"`, `muted: "#64748B"`, `accent: "#FF5A5F"`, `accent2: "#2563EB"`, `positive: "#10B981"`, `negative: "#EF4444"`.
- **`creator-dark.json`** upgrade:
  - Keep dark obsidian base `#0B0A14` with luminous deep-violet ambient stage styling via `mp.stage({ tone: 'glow-violet' })`.
- Default video look in `run.ts`: when uploading a video and the user didn't pick a custom `styleId`, default to `'editorial-cream'` (with `captions: { enabled: true, presetId: 'editorial' }` and subtle ducked ambient music bed enabled!).

### 4. Agency `mp` Motion Graphics, UI & 3D Kit (`packages/motion/src/film/kit.ts`, `doc.ts`)
Extend `filmKit` with deterministic primitives:
- `mp.stage(opts)` — Rich styled canvas (`cream`, `light`, `glow-violet`, `glow-emerald`, `dark-grid`, `split-top` clipped to top 52% of vertical frame).
- `mp.card(opts)` — Elevated rounded card (`light-elevated`, `dark-glass`, `cream-soft`, `accent-glow`) with calibrated shadows and `1px` border.
- `mp.odometer(target, opts)` — Smooth vertical digit-wheel counter (`from → to`) driven purely by `seek(t)`.
- `mp.ring(opts)` & `mp.meter(opts)` — Animated circular SVG progress/countdown ring and horizontal benchmark bar with dashed reference marker.
- `mp.window(opts)` — Authentic macOS window (`mac-code`, `doc`, `terminal`, `browser`, `prompt`) with traffic lights, filename header, syntax/markdown highlight sweeps, and animated blinking typing cursor.
- `mp.tile(opts)` & `mp.flowDots(a, b, opts)` — Glowing iOS-style rounded concept/app tiles with animated glowing signal pulses traveling between them.
- `mp.chart(opts)` — Crisp SVG scatter / line / bar chart with shaded target zones, gridlines, labeled dots, and pill callouts.
- `mp.stamp(text, opts)` & `mp.strike(el, opts)` — Bold angled rubber-stamp slam (`OLD WAY`) and animated diagonal red slash.
- `mp.chapter(num, title, opts)` — Editorial lower-third chapter stamp (`skill no #1` in italic serif + bold sans title, Ref 2 style).
- `mp.image(assetId, opts)` — Renders a pre-inlined image/cutout from `ctx.images[assetId]` with soft shadow, optional Ken Burns drift, and zero external network requests.
- `mp.card3d(opts)` — True CSS 3D perspective stage (`perspective: 1200px`, `rotateX/Y`, `translateZ` parallax layers) for floating mockups & isometric cards.
- `mp.globe(opts)` — Wires our existing WebGL 3D Earth (`createGlobe` from `scenes/map-zoom/globe.ts` or crisp 3D orthographic canvas fallback when textures aren't loaded) for deterministic spinning 3D globe beats.
- `mp.mesh3d(opts)` — Lightweight deterministic 3D procedural canvas/SVG isometric renderer (glowing 3D chip/cube, stacked 3D coin/bar columns, orbiting 3D spheres) driven strictly by `t`.

### 5. Stock B-Roll (Pexels + Wikimedia Commons) & AI Cutouts (`apps/web/app/api/media/stock/route.ts`, `apps/web/lib/video/stock-media.ts`, `apps/web/lib/film/film.ts`)
- `/api/media/stock` route:
  - Query params: `q` (search phrase), `kind` (`video` | `photo`), `orientation` (`portrait` | `landscape` | `square`).
  - Provider 1 (when `process.env.PEXELS_API_KEY` is set): queries Pexels Videos API (`https://api.pexels.com/videos/search`) or Pexels Photos API (`https://api.pexels.com/v1/search`) for HD license-free media.
  - Provider 2 (zero-key fallback, always available!): queries Wikimedia Commons API (`action=query&generator=search&prop=imageinfo`) for high-res public-domain/CC photos and returns clean URLs + attribution.
  - Proxy download endpoint `/api/media/stock?proxy=<encodedUrl>` (restricted strictly to allowlisted hosts `images.pexels.com`, `videos.pexels.com`, `upload.wikimedia.org`) so browser Media Bin & `mp.image` can store blobs locally in IndexedDB with zero CORS issues!
- AI Cutout & Editorial Visuals inside `film.ts`:
  - Up to 2–3 Director beats requesting `imageSubject` (e.g., `"ceramic coffee mug"`, `"glowing neural microchip"`, `"two miniature dinosaurs"`) trigger our existing `generateImageWithFirebase` + chroma-key `key.ts` in parallel with beat building, save into `project.assets`, and bind via `ctx.images` + `mp.image(assetId)`!

### 6. Tone-Aware Director & Executed-Frame Vision QA (`film-direct.v1.ts`, `film-build.v1.ts`, `vision-qa.ts`, `critic.ts`)
- Director classifies `tone` (`personal-story`, `tech-explainer`, `listicle`, `hot-take`) and allocates stage ratios accordingly (`personal-story` keeps ≥40% `clean` breathing beats + tasteful editorial overlays/cutouts/B-roll; `tech-explainer` leads with `split-top-stage` macOS windows, charts, and `top-card` KPIs).
- `sandbox-critic.ts` captures an executed DOM snapshot / serialized SVG+HTML at `keyMomentMs` (after `script` runs!) and passes it to `vision-qa.ts`, which composites it over the real speaker keyframe positioned in its exact `stageBoxForMode` rectangle + the rendered caption band so Gemini Vision QA sees the TRUE final frame!
