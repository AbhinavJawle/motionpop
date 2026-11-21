# Spec 23 — Editorial Reel Quality Overhaul (Requirements)

## Goal
Overhaul Motionpop's talking-head video reel quality across staging, captions, looks, motion/3D primitives, external & AI media sourcing, tone-aware directing, audio design, and executed-frame Vision QA so default outputs match top-tier editorial creator reels (warm cream arched split-screen, luminous dark tech motion, and studio light split-screen).

## Requirements (EARS)

### R1 — Viral Vertical Stage Grammar & Smooth FFmpeg Parity (Pillar 1)
- **R1.1:** The `VideoStageModeSchema` shall support `split-top-stage`, `top-card`, and `clean` in addition to existing stage modes (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`, `split-top-broll`, `screen-showcase`, `broll-full`, `media-card-pop`).
- **R1.2:** When a vertical (`9:16`) beat uses `split-top-stage`, the compositor shall frame the motion-graphics canvas across the upper ~48–54% and the speaker video cleanly across the lower ~44–48% with rounded upper-arch corners (`border-radius: 36px 36px 0 0` in Editorial Cream, or crisp 50/50 split with optional seam bar in Studio Light / Creator Dark).
- **R1.3:** When a beat uses `top-card`, the speaker video shall remain full-bleed (with subtle drift/punch-in) while graphics are constrained strictly to `top: 6%..29%` above the speaker's face.
- **R1.4:** When a beat uses `clean`, the speaker video shall remain full-bleed with smooth camera punch-in drift and zero distracting graphic clutter (allowing at most a minimal chapter stamp or clean breathing frame).
- **R1.5:** When exporting a video project with `buildVideoCompositeArgs`, FFmpeg shall render `split-top-stage` (including arched top-corner speaker masks for editorial looks and crisp seam bar support), `top-card`, `clean`, and smooth eased punch-in ramps / whip-blur transitions matching preview geometry.

### R2 — Modern Editorial Captions (Pillar 2)
- **R2.1:** `CaptionsSetting` shall support three new modern presets — `editorial`, `studio`, and `minimal-pill` — alongside `pop`, `clean`, and `boxed`.
- **R2.2:** When a video project is created with the default `editorial-cream` look, captions shall default to `editorial` (1–2 word crisp bold geometric sans + italic serif emphasis, high-contrast dark ink on light/cream split seams and crisp white with subtle shadow over full-bleed speaker).
- **R2.3:** When `studio` preset is active during a `split-top-stage` beat, captions shall automatically dock into a sleek full-width black seam bar cleanly separating the top visual stage and bottom speaker.
- **R2.4:** When `minimal-pill` is active, captions shall render in a compact translucent dark pill with subtle active-word highlight and no oversized orange box.

### R3 — Editorial Cream Default Look & Luminous Reel Looks (Pillar 3)
- **R3.1:** Motionpop shall ship **`editorial-cream`** (warm `#EDE8DF` cream ground, `#171614` ink, `#DF6B41` coral-terracotta accent, Playfair Display / Geist / Geist Mono typography, arched bottom speaker framing) as the default look for new video uploads.
- **R3.2:** Motionpop shall ship **`studio-light`** (`#F7F8FA` crisp studio light ground, pure white elevated cards, semantic coral/emerald accents) and upgrade **`creator-dark`** (luminous deep indigo/obsidian radial depth instead of flat void).
- **R3.3:** Video reel builder prompts shall use dedicated `REEL_CRAFT_RULES` permitting calibrated multi-layer drop shadows, luminous radial stage backdrops, glass hairlines, and editorial serif+sans contrast while explicitly banning wireframe stick-figure busts, fake camera viewfinder brackets, full-frame viewport borders, and random floating shapes over faces.

### R4 — Agency `mp` Motion Graphics & UI Component Kit (Pillar 4)
- **R4.1:** `filmKit` (`mp`) shall expose deterministic studio-grade UI & motion primitives: `mp.stage`, `mp.card`, `mp.odometer`, `mp.ring`, `mp.meter`, `mp.window`, `mp.tile`, `mp.flowDots`, `mp.chart`, `mp.stamp`, `mp.strike`, and `mp.chapter`.
- **R4.2:** Every new `mp.*` primitive shall be a pure deterministic function of time `t`, work identically in browser preview and headless Chromium export, and be documented in `KIT_DOC` (`packages/motion/src/film/doc.ts`).

### R5 — 3D Graphics, Perspective Rigs & WebGL Globe (Pillar 5)
- **R5.1:** `filmKit` (`mp`) shall expose **`mp.globe(opts)`** wired directly to Motionpop's existing WebGL 3D Earth renderer (`globe.ts` with satellite/night/terrain/paper styles) and **`mp.card3d(opts)`** for deterministic CSS 3D perspective device/card rigs with layered depth (`translateZ`, `rotateX`, `rotateY`).
- **R5.2:** `filmKit` (`mp`) shall expose **`mp.mesh3d(opts)`** for deterministic lightweight 3D geometric props (glowing isometric chip/cube, stacked 3D coin/bar columns, orbiting 3D nodes) driven strictly by `seek(t)`.

### R6 — External Stock B-Roll (Pexels + Wikimedia Commons) & AI Cutouts (Pillar 6)
- **R6.1:** A server endpoint `/api/media/stock` shall search **Pexels** (HD vertical stock videos & photos when `PEXELS_API_KEY` is configured) and **Wikimedia Commons** (zero-key public-domain/CC photography fallback) and proxy/return vetted media metadata and bytes cleanly.
- **R6.2:** `filmKit` (`mp`) shall expose **`mp.image(assetId, opts)`** reading ONLY pre-inlined `ctx.images` (preserving the opaque-origin zero-network security boundary D-021) so custom film beats can display AI-generated chroma-keyed cutouts, editorial illustrations, and stock photos.
- **R6.3:** During video film generation, the orchestrator shall resolve up to 2–3 Director-requested visual media beats (`brollQuery` → stock B-roll video/photo into Media Bin; `imageSubject` → AI-generated cutout/illustration via existing `generateImageWithFirebase` + `key.ts`) in parallel with beat building.

### R7 — Tone-Aware AI Director, Hybrid Scenes & Audio Polish (Pillar 7)
- **R7.1:** `StoryboardSchema` shall support optional `tone` (`personal-story` | `tech-explainer` | `listicle` | `hot-take`), optional beat `brollQuery` / `imageSubject` / `imageKeyed`, and optional `sceneId` (allowing the Director to pick proven motion scenes alongside custom Reel Kit beats).
- **R7.2:** When `tone === 'personal-story'`, the Director shall allocate 35–50% `clean` breathing beats (pure speaker + smooth punch-ins) and avoid sterile fake UI dashboards. When `tone === 'tech-explainer'` or `listicle`, the Director shall lead with `split-top-stage`, `top-card`, macOS windows, charts, and chapter stamps.
- **R7.3:** New talking-head video projects shall automatically include subtle voice-ducked ambient music bed defaults (toggleable by the creator) and micro-SFX cues (`tick`, `pop`, `whoosh`, `impact`, `rise`).

### R8 — Real Executed-Frame Vision QA & Hard DOM Guardrails (Pillar 8)
- **R8.1:** `vision-qa.ts` shall capture each beat's contact-sheet tile from the **executed sandboxed beat at `keyMomentMs`** (after `script` and `mp.*` kit calls have rendered), composited over the actual speaker keyframe in its real stage rectangle (`split-top-stage`, `top-card`, etc.) plus the live caption band.
- **R8.2:** `critic.ts` shall deterministically flag face-zone intrusion on `top-card` beats, caption-band collisions, full-frame viewport border boxes, `mp.icon("user")` stick-figure silhouettes on video reels, and blank openings (`> 300ms`).
