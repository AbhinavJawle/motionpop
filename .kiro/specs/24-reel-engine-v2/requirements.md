# Requirements — Spec 24: Talking-Head Reel Engine v2

## Introduction
MotionPop's talking-head video Reel pipeline previously layered creator-Reel helpers on top of the legacy Vox-style faceless documentary film engine (`film.direct`, `film.props`, `film.build` on `gemini-3.5-flash-lite`). That architecture suffered from silent schema lockouts, weak Lite code generation, speaker decapitation from unclipped top-half overlays, cartoon clipart prop repetition, contradictory prompt rules, and blind 6-beat Vision QA.

Spec 24 cleanly separates Talking-Head Reels into a dedicated, frontier-powered, container-clipped, asset-first Reel Engine v2 while keeping legacy voiceover-only documentaries intact.

## Requirements (EARS)

### R1 — Dedicated Talking-Head Reel Engine & Frontier Models
- **R1.1:** WHEN a project has live video (`hasVideo: true`), THE system SHALL route film generation through dedicated Reel tasks (`reel.direct` and `reel.build`) with zero Vox-documentary prompt contradictions and SHALL NOT invoke `film.props` cartoon SVG prop generation.
- **R1.2:** THE default `modelFilmBuild` in `APP_CONFIG_DEFAULTS` SHALL be `gemini-4-neon` (frontier model), and THE web film orchestrator SHALL pass the selected Pip frontier model to both Director and Builders (including Vision QA repairs and single-beat rebuilds).
- **R1.3:** THE `reel.direct` JSON schema SHALL expose `tone`, `brollQuery`, `imageSubject`, `imageKeyed`, and the locked modern Reel `videoStage` enum (`split-top-stage`, `clean`, `top-card`, `cutaway`, `split-top-broll`, `broll-full`, `media-card-pop`, plus `screen-showcase` when Media Bin clips exist).
- **R1.4:** WHEN `hasVideo: true`, `storyboardIssues` SHALL allow type-led and clean breathing beats without the legacy 25% cap, allow consistent multi-beat runs of `split-top-stage` / `clean` / `top-card`, allow 1.2s minimum beat durations for crisp explainer pacing, and accept `brollQuery` as fulfilling a media stage before stock resolution.

### R2 — Locked Visual Grammar & Hard Structural Stage Clipping
- **R2.1:** ON 9:16 vertical `split-top-stage` beats, THE video stage geometry SHALL use a crisp 50/50 split (speaker bottom 50%: `y: 0.50, h: 0.50`; graphic stage top 50%: `top: 0, height: 50%`), and THE compiler/runtime SHALL physically clip the graphic slot container to the top 50% (`overflow: hidden`) with a deterministic subtle-grid look surface (`data-mp-stage-bg`) so graphics can never cover the speaker's head.
- **R2.2:** ON 9:16 vertical `top-card` beats, THE compiler/runtime SHALL physically clip the graphic slot container to the top 28% (`height: 28%, overflow: hidden`) so floating cards can never intrude on the speaker's face.
- **R2.3:** WHEN `videoStage` is `clean` and the beat has no on-screen text, `makeFilm` SHALL skip the AI builder call and emit a clean zero-clutter pass-through beat so the human speaker breathes naturally with smooth punch-in framing.
- **R2.4:** `mp.stage()` SHALL refuse to paint an opaque curtain on `full`, `backdrop`, `top-card`, and `clean` video stages, and SHALL always emit an explicit `background-color` + `data-mp-stage-bg` for contrast inspection.

### R3 — Keyframe-Aware Frontier Builder & Clean Swiss/Editorial Craft
- **R3.1:** `reel.build` SHALL receive the beat's exact clipped stage dimensions (`stageWidth`, `stageHeight`), `tone`, `imageAsset` (preserved through Zod schema), and the nearest sampled speaker keyframe JPEG (`media`) so the builder designs with awareness of the real footage.
- **R3.2:** THE Reel Builder prompt and reference examples SHALL teach clean HTML/CSS Flexbox & Grid layouts, sharp 2px geometric SVG micro-diagrams (inspectors, checklists, wireframes, code windows, editorial statements), tight clause-synced timing, and crisp micro-SFX — with zero Vox paper/carrier/clutter rules and zero cross-stage `mp.stage` leakage.

### R4 — Accurate DOM Guardrails & Full-Reel Vision QA
- **R4.1:** `critic.ts` SHALL resolve ancestor stage background colors via `data-mp-stage-bg` as well as `backgroundColor` so low-contrast text (e.g., white on cream/white) is always caught.
- **R4.2:** `critic.ts` SHALL flag large solid cards/boxes (`>= 120×120px`) containing zero visible text or graphics as a blocking `empty-box` error, and SHALL relax the legacy `shapes >= 3` requirement in Reel mode (`reelMode: true`) when clean structured UI/typography cards are present.
- **R4.3:** `film.vision-critic` SHALL run on `cfg.modelStrong` (`gemini-4-neon`), and `vision-qa.ts` SHALL inspect **all** built visual beats in parallel batches of up to 6 beats at high legibility, compositing real face-centered speaker framing, clipped stage geometry, and live seam captions.

### R5 — Preview/FFmpeg Face-Centering Parity & Studio Defaults
- **R5.1:** BOTH `preview-player.tsx` and `video-ffmpeg.ts` SHALL clamp vertical speaker `focusY` into the head/face band (`[0.18, 0.50]`, default `0.33`) and apply mathematically identical cover-crop centering so the speaker's face is always centered in the bottom 50% split (never cropping to microphone/chest).
- **R5.2:** NEW video uploads SHALL default to `studio-light` look (pure crisp studio canvas + subtle architectural grid), `studio` seam-docked crisp black caption ribbon (centered cleanly on the 50% split seam), and clean voice + `autoSfx: true` with `musicId: 'none'` (no droning synth pad by default).
