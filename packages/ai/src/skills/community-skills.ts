import { UserSkillSchema, type UserSkill } from '@motionpop/schemas';

/**
 * Curated open-source community director skills distilled from top motion-design & video-editing
 * repositories. Bundled as instant zero-latency defaults AND seeded into Firestore
 * `community_skills/{id}` so every creator can pick them like a visual style, with visible
 * repository attribution and open-source preview thumbnails.
 */

const SEED_TS = 1764000000000;

const RAW_COMMUNITY_SKILLS: readonly UserSkill[] = [
  {
    id: 'vox-paper-collage',
    name: 'Vox Paper Collage',
    blurb:
      'Torn paper posters, halftone dots, masking tape, photographic cutouts & stepped documentary rhythm.',
    target: 'both',
    baseRecipeId: 'documentary-explainer',
    look: 'cream',
    lookId: 'paper-collage',
    accent: '#D96648',
    captionStyle: 'editorial',
    hookStyle: 'headline',
    music: 'lofi',
    repoSlug: 'charlie947/motion-graphics-skills',
    sourceUrl:
      'https://github.com/charlie947/motion-graphics-skills/blob/main/skills/vox-explainer/SKILL.md',
    thumbnailUrl: '/skills/vox-paper-collage.jpg',
    category: 'editorial',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Vox Paper Collage
repo: charlie947/motion-graphics-skills
---
# Vox Paper Collage Director

## Visual Grammar & Materials
- Build every scene as a tactile layered editorial collage poster inside \`.mp-backdrop\`: warm paper stock (#F1E6D0 / #DFCDB7), torn paper cards with soft contact shadows, graph-paper patches (22px grid), halftone stipple clusters, and angled masking tape strips.
- Palette discipline: editorial red (#B8312A / #D96648), warm cream (#F1E6D0), archival navy (#14213D), and highlighter yellow (#F2C230).
- Feature keyed photographic or illustrated cutouts (\`mp.image("m0", { shadow: true })\`) as the unmistakable focal anchor (35–55% of frame), never sterile bullet slides or thin lonely lines.
- Use bold condensed display headlines, archival uppercase \`var(--mono)\` date/location stamps, hand-drawn highlighter sweeps (\`mp.mark\`), and curved leader arrows (\`mp.line\`) pointing directly into the cutout.

## Pacing, Cadence & Motion
- Open with the big "why" question or surprise hook legible within 3 seconds.
- Alternate wide establishing collage frames with tighter detail cut-ins every 3–5 seconds; never let a single static shot drag past 6 seconds.
- Favor crisp, tactile stepped / snapped entrances (\`ease: "back"\` / \`"outQuart"\`), gentle continuous camera creep (1.0 → 1.032), and layered parallax depth. Never use typewriter reveals on headlines or corporate smooth fades.

## Honesty & Craft Guardrails
- Every name, date, and number on screen must trace directly to the user's prompt or transcript. Never invent statistics or fake evidence.`,
  },
  {
    id: 'apple-launch-film',
    name: 'Apple Keynote Launch',
    blurb:
      'Thin macOS menu bar, springing black notch widgets, vivid gradient wallpapers & focused captions.',
    target: 'both',
    baseRecipeId: 'product-launch',
    look: 'mono',
    lookId: 'apple-keynote',
    accent: '#38BDF8',
    captionStyle: 'clean',
    hookStyle: 'visual',
    music: 'minimal-tech',
    repoSlug: 'charlie947/motion-graphics-skills',
    sourceUrl:
      'https://github.com/charlie947/motion-graphics-skills/blob/main/skills/apple-launch-film/SKILL.md',
    thumbnailUrl: '/skills/apple-launch-film.jpg',
    category: 'product',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Apple Keynote Launch
repo: charlie947/motion-graphics-skills
---
# Apple-Style Keynote Launch Film

## Visual Grammar & Staging
- Treat the frame like a pristine Apple hardware/macOS keynote screen: thin translucent menu bar (≤5 short items), black top-center notch that smoothly springs open into refined frosted widgets, and rich full-screen multi-stop gradient wallpapers inside \`.mp-backdrop\`.
- Pair each product widget with ONE short centred caption underneath, tinting the final 1–2 words in a luminous lighter shade of the wallpaper accent.
- Typography: ultra-clean grotesk sans (\`var(--display)\`), tight tracking (-0.03em), generous breathing room, and tabular monospace figures for real specs.

## Motion Physics
- Spring-driven width and height curves: open soft and decisive (\`outQuart\` / gentle spring ζ ≈ 0.78), close cleanly with zero cartoon bounce.
- One hero transformation per beat (2.2–3.5 s per scene). Secondary micro-elements (meters, live waveforms, badges) lag 100–180 ms behind the container.
- Continuous subtle 2.5% camera push-in keeps every hold alive without ever distracting from the UI.

## Strict Guardrails
- Never draw a generic cartoon laptop when the screen itself is the stage.
- Zero invented specs, fake percentages, or cluttering placeholder paragraphs — use crisp minimal bars or verified facts only.`,
  },
  {
    id: 'kinetic-reel',
    name: 'Kinetic Typography Reel',
    blurb:
      'Rotating obsidian/lime/cream grounds, HUD brackets, condensed slams & beat-locked mechanisms.',
    target: 'both',
    baseRecipeId: 'kinetic-promo',
    look: 'mono',
    lookId: 'kinetic-lime',
    accent: '#DDF53D',
    captionStyle: 'boxed',
    hookStyle: 'headline',
    music: 'upbeat',
    repoSlug: 'tuzhechen2005/opus-video-skills',
    sourceUrl:
      'https://github.com/tuzhechen2005/opus-video-skills/tree/main/skills/kinetic-reel',
    thumbnailUrl: '/skills/kinetic-reel.jpg',
    category: 'kinetic',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Kinetic Typography Reel
repo: tuzhechen2005/opus-video-skills
---
# Kinetic Typography Reel

## Palette & Ground Rotation
- Core tokens: obsidian ink (#0E0F0E), warm cream (#F1EEE6), electric lime (#DDF53D — the hero accent & OK state), cobalt blue (#2F3CFF — secondary slam ground), alert red (#E8412F — warnings & headline full stops).
- Rotate grounds intentionally across cuts (ink → lime → cream → ink → cobalt) so every chapter turn hits like a physical cut.

## Type & HUD System
- Type is the hero: massive bold display headlines with outlined ghost echoes, crisp italic emphasis for a single "voice" phrase, and uppercase \`var(--mono)\` corner HUD micro-type + segmented chapter trace bar at the bottom edge.
- Every shot pairs a punchy 2–4 word headline with a real visual mechanism (routing grid, matrix scan, state machine, live odometer counter, or diagonal scrolling ticker tape with ✳ / ↗ separators).

## Rhythm & Honesty
- Beat-locked cuts (1.0–2.4 s per beat): fast expo-out entrances, clean readable holds, abrupt zero-fat exits.
- Label illustrative/schematic diagrams transparently (\`SCHEMATIC\`). Never stack two large metrics in the same horizontal band.`,
  },
  {
    id: 'saas-launch-film',
    name: 'SaaS Liquid-Glass Launch',
    blurb:
      '7-beat SaaS launch arc with frosted liquid-glass UI, live typed prompts & real proof cards.',
    target: 'both',
    baseRecipeId: 'product-launch',
    look: 'mono',
    lookId: 'studio-light',
    accent: '#6366F1',
    captionStyle: 'pop',
    hookStyle: 'visual',
    music: 'minimal-tech',
    repoSlug: 'charlie947/motion-graphics-skills',
    sourceUrl:
      'https://github.com/charlie947/motion-graphics-skills/blob/main/skills/launch-video/SKILL.md',
    thumbnailUrl: '/skills/saas-launch-film.jpg',
    category: 'product',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: SaaS Liquid-Glass Launch
repo: charlie947/motion-graphics-skills
---
# SaaS Liquid-Glass Launch Film

## 7-Beat Launch Story Arc
1. Hook (0–4s): First crisp 3–5 words of the core promise on a clean high-contrast canvas.
2. Proof: Real screens, logos, or verified outcomes with crisp elevation shadows.
3. Product Working: Frosted liquid-glass UI panel where a live prompt types inside a real input bar and output materializes cleanly.
4. Verification Beat: A check, badge, or metric passes and ticks green.
5. How It Works: One evolving pipeline or unified flow — never N identical repeated feature cards.
6. Hero Metric: The single verified number counted up with tabular figures.
7. CTA Finale: Product name + exact call to action held still for ≥2 seconds.

## Liquid-Glass Craft Rules
- Frosted translucent glass panels over subtle luminous rim backdrops, crisp 1px specular borders, and grounded drop shadows.
- Typing belongs STRICTLY inside the product's input box — NEVER apply typewriter reveals to display headlines.
- No two adjacent beats may share the same layout skeleton. Zero fake testimonials or invented prices.`,
  },
  {
    id: 'anti-ppt-motion',
    name: 'Anti-PPT Motion Opener',
    blurb:
      'Strict anti-slideshow law: ≤5 words/shot, layered moving grounds, breathing cam & asymmetric cuts.',
    target: 'both',
    baseRecipeId: 'kinetic-promo',
    look: 'mono',
    lookId: 'creator-dark',
    accent: '#FF6A3D',
    captionStyle: 'seam',
    hookStyle: 'headline',
    music: 'upbeat',
    repoSlug: 'bangtutorial/bang-motion',
    sourceUrl: 'https://github.com/bangtutorial/bang-motion/blob/main/references/anti-ppt.md',
    thumbnailUrl: '/skills/anti-ppt-motion.jpg',
    category: 'kinetic',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Anti-PPT Motion Opener
repo: bangtutorial/bang-motion
---
# Anti-PPT Motion Design Laws

## Structural Anti-Slideshow Rules
- **One shot = one punch (≤5 words).** Never build a kicker + 2-line headline + 2-line paragraph + 4 pill chips in a left/right deck layout. If an idea needs >6 words, split it into two visual beats or turn it into an object/metric.
- **Attention order:** Core phrase lands first → hero visual object follows → single supporting detail last. Never reverse this hierarchy.
- **No dead flat single-color slides:** Every \`.mp-backdrop\` must layer at least two subtle atmospheric surfaces (e.g. directional horizon glow, duotone wash, subtle geometric grid, or fine grain) that breathe continuously.

## Camera & Motion Craft
- **Continuous breathing camera rig:** Every scene moves smoothly (1.0 → 1.035 push-in, deliberate close-up to wide reveal, or parallax layer shift) so cuts feel like one continuous film world rather than PowerPoint slides.
- **Asymmetric timing:** Decisive ease-out entrances (\`outQuart\`, 420–720 ms) paired with crisp exits half as long (220–340 ms).
- **Save spectacle for 1–2 hero beats:** Avoid repeating identical spin/whip/light-leak presets on every cut.`,
  },
  {
    id: 'financial-data-story',
    name: 'Bloomberg Data Story',
    blurb:
      'Question-first charts, zero-baseline bars, dim-the-rest focus & tabular financial precision.',
    target: 'both',
    baseRecipeId: 'finance-business',
    look: 'cream',
    lookId: 'newsprint',
    accent: '#B91C1C',
    captionStyle: 'editorial',
    hookStyle: 'stat',
    music: 'dramatic',
    repoSlug: 'alchaincyf/huashu-motion',
    sourceUrl:
      'https://github.com/alchaincyf/huashu-motion/blob/main/skills/huashu-motion/references/library/languages/data-story.md',
    thumbnailUrl: '/skills/financial-data-story.jpg',
    category: 'data',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Bloomberg Data Story
repo: alchaincyf/huashu-motion
---
# Financial & Editorial Data Storytelling

## Narrative & Staging
- **Question first, chart second:** Frame the concrete turning point in a crisp serif/grotesk headline, then animate the chart to prove it.
- **Highlight by subtraction:** Dim non-hero bars/series to 20–30% ink opacity and reserve editorial crimson (#B91C1C) or emerald (#15803D) strictly for the winning series or inflection point — never clutter the chart with five arrows.
- **Editorial print structure:** Warm archival newsprint paper (#F6F3EC) with crisp 3px top rule, 1px baseline hairlines, subtle 12% gridlines, and tabular-nums monospace labels (≥28px readable on mobile).

## Data Honesty & Motion
- Bars always grow cleanly from a zero baseline (\`scaleY: 0 → 1\`) with steady 120–160 ms staggers; numbers roll smoothly to exact verified figures.
- Axes, title, and scale never shift mid-beat. Hold the completed chart still for ≥2 seconds so viewers can read the takeaway.
- Always show unit/source context; never invent figures or fake tickers.`,
  },
  {
    id: 'kurzgesagt-flat-world',
    name: 'Kurzgesagt Flat Vector',
    blurb:
      'Jewel-tone cosmic palettes, layered geometric vector worlds & awe-inspiring scale reveals.',
    target: 'both',
    baseRecipeId: 'documentary-explainer',
    look: 'mono',
    lookId: 'creator-dark',
    accent: '#22D3EE',
    captionStyle: 'pop',
    hookStyle: 'visual',
    music: 'lofi',
    repoSlug: 'alchaincyf/huashu-art-motion',
    sourceUrl: 'https://github.com/alchaincyf/huashu-art-motion',
    thumbnailUrl: '/skills/kurzgesagt-flat-world.jpg',
    category: 'explainer',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Kurzgesagt Flat Vector
repo: alchaincyf/huashu-art-motion
---
# Kurzgesagt Science & Flat-Vector Explainer

## Visual World & Color
- Rich, saturated jewel-tone flat-vector storytelling set on deep cosmic midnight indigo (#0D132B) or warm sunlit sky gradients inside \`.mp-backdrop\`.
- Crisp geometric silhouettes with clean 2-tone inner shading (highlight rim + deep shadow crescent), orbital rings, concentric scale indicators, and luminous cyan (#22D3EE), coral (#FB7185), and solar gold (#F59E0B) focal accents.
- Pair clean vector cutaway diagrams and keyed flat-vector cutout illustrations (\`mp.image("m0")\`) with bold, friendly rounded grotesk display typography.

## Motion & Pacing
- Ideal for "What is inside X?", systems, biology, space, and massive scale comparisons.
- Smooth, calm, authoritative motion: layered parallax orbits, concentric ring expansions, clean scale reveals, and gentle floating idle loops with offset phases so nothing feels mechanical or chaotic.`,
  },
  {
    id: '3b1b-visual-math',
    name: '3Blue1Brown Mechanism',
    blurb:
      'Deep chalkboard slate, glowing vector curves, continuous geometric morphs & 1-beat clarity.',
    target: 'both',
    baseRecipeId: 'tech-explainer',
    look: 'mono',
    lookId: 'blueprint-schematic',
    accent: '#38BDF8',
    captionStyle: 'clean',
    hookStyle: 'visual',
    music: 'minimal-tech',
    repoSlug: 'alchaincyf/huashu-art-motion',
    sourceUrl: 'https://github.com/alchaincyf/huashu-art-motion',
    thumbnailUrl: '/skills/3b1b-visual-math.jpg',
    category: 'explainer',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: 3Blue1Brown Mechanism
repo: alchaincyf/huashu-art-motion
---
# 3Blue1Brown Visual Mechanism

## Visual Grammar
- Deep matte slate/navy board (#0C1322) with delicate coordinate axes, glowing cyan (#38BDF8), amber gold (#FBBF24), and soft coral (#FB7185) vector strokes, and ultra-legible white mathematical/system annotations.
- **One sentence = one animated mechanism:** Show algorithms, embeddings, pipelines, or cause-and-effect by drawing vector paths (\`tl.draw\`), lighting active nodes, and smoothly transforming one visual state into the next.
- Zero decorative cards, zero stock clipart, zero cluttered dashboards — the diagram itself fills 65%+ of the canvas.

## Pacing & Focus
- Unhurried, deeply intuitive pacing (2.5–4.5 s per beat). Let each vector trace finish drawing before the takeaway label lands.
- Dim completed steps softly so the viewer's eye locks effortlessly onto the active transformation.`,
  },
  {
    id: 'cinematic-3d-opener',
    name: 'Cinematic Dark Opener',
    blurb:
      'Moody lit stage, specular depth, steady camera dolly & lower-left condensed film titles.',
    target: 'both',
    baseRecipeId: 'product-launch',
    look: 'mono',
    lookId: 'creator-dark',
    accent: '#F59E0B',
    captionStyle: 'clean',
    hookStyle: 'headline',
    music: 'dramatic',
    repoSlug: 'charlie947/motion-graphics-skills',
    sourceUrl:
      'https://github.com/charlie947/motion-graphics-skills/blob/main/skills/title-sequence-3d/SKILL.md',
    thumbnailUrl: '/skills/cinematic-3d-opener.jpg',
    category: 'cinematic',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Cinematic Dark Opener
repo: charlie947/motion-graphics-skills
---
# Cinematic Dark Title Sequence & Directed Look

## Lighting & Composition
- Build a true dark-stage atmosphere inside \`.mp-backdrop\`: deep hue-tinted charcoal/obsidian (#090B10, never flat lifeless #000), a single motivated warm/amber or cool-cyan spotlight pool, subtle reflective floor gradient, and crisp card/object depth.
- Place the hook question or title in bold condensed display type in the lower-left or strong asymmetric anchor, tinting 1–2 key words in the hero accent (#F59E0B) over clean dark ground so contrast stays ≥7:1 on phones.
- Every shot uses grounded cards, real logos/images filling their frames, or physical depth layers — never lonely thin lines or cheap drifting purple orbs.

## Camera & Restraint
- One slow, steady dolly forward and slightly up (1.0 → 1.045) — zero camera shake, zero chaotic spins.
- Ban generic AI defaults: no identical repeated card grids, no rainbow gradients on text, no noisy particle storms behind readable type.`,
  },
  {
    id: 'retro-terminal-brutalist',
    name: 'Retro Terminal & CRT',
    blurb:
      'Phosphor monospace CLI, scanline texture, hard brutalist borders & 3-frame beat glitches.',
    target: 'both',
    baseRecipeId: 'kinetic-promo',
    look: 'mono',
    lookId: 'creator-dark',
    accent: '#22C55E',
    captionStyle: 'clean',
    hookStyle: 'visual',
    music: 'upbeat',
    repoSlug: 'alchaincyf/huashu-motion',
    sourceUrl:
      'https://github.com/alchaincyf/huashu-motion/blob/main/skills/huashu-motion/references/library/languages/retro-digital.md',
    thumbnailUrl: '/skills/retro-terminal-brutalist.jpg',
    category: 'kinetic',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Retro Terminal & CRT
repo: alchaincyf/huashu-motion
---
# Retro Digital, Terminal & CRT Brutalism

## Visual Grammar
- Deep phosphor black-green (#08100B) or charcoal CRT ground inside \`.mp-backdrop\` with delicate horizontal scanlines (4–6% opacity), hard 2px pixel borders, and limited high-contrast palettes (phosphor emerald #22C55E + amber #FACC15 on obsidian).
- Typography: crisp \`var(--mono)\` command headers, bracketed status tags (\`[OK]\`, \`[RUN]\`, \`[PASS]\`), real CLI commands/logs, and sharp brutalist display blocks with zero soft blur shadows.

## Motion & Restraint
- Crisp stepped entrances, live terminal line-by-line execution, blinking block cursors, and restrained 2–4 frame slice shifts ONLY on hard chapter cuts (never constant glitch noise that hurts readability).
- Ideal for developer tools, AI agents, CLI launches, systems benchmarks, and internet-native creators.`,
  },
  {
    id: 'risograph-editorial-zine',
    name: 'Risograph Print Zine',
    blurb:
      '2-ink coral & cobalt overprint, halftone grain, misregistration shadows & tactile 12 fps pop.',
    target: 'both',
    baseRecipeId: 'documentary-explainer',
    look: 'cream',
    lookId: 'risograph-zine',
    accent: '#E11D48',
    captionStyle: 'boxed',
    hookStyle: 'headline',
    music: 'lofi',
    repoSlug: 'talsiach/take-one',
    sourceUrl: 'https://github.com/talsiach/take-one',
    thumbnailUrl: '/skills/risograph-editorial-zine.jpg',
    category: 'editorial',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Risograph Print Zine
repo: talsiach/take-one
---
# Risograph Print & Zine Editorial

## 2-Ink Print System
- Warm uncoated print paper stock (#F5EDE0) inside \`.mp-backdrop\` printed strictly in two bold spot inks: fluorescent riso coral (#E11D48) and deep cobalt/navy ink (#1D4ED8 / #182138), with warm yellow (#FDE68A) reserved for tiny stamp accents.
- Subtle 3–5px offset ink-misregistration drop shadows, bold halftone dot fills, rubber stamp badges, and cut-out photographic/illustrated subjects (\`mp.image("m0", { shadow: true })\`).

## Tactile Motion
- Punchy, hand-printed rhythm: brisk overshoot entrances (\`ease: "back"\`), slight editorial card tilts (-2° to +2°), and high-contrast poster framing where every pause looks like a frameable riso print.`,
  },
  {
    id: 'minimal-geist-explainer',
    name: 'Minimal Geist Editorial',
    blurb:
      'Quiet 3-color paper & ink clarity, weight-only hierarchy, clean flows & fact/inference tags.',
    target: 'both',
    baseRecipeId: 'tech-explainer',
    look: 'mono',
    lookId: 'studio-light',
    accent: '#21201C',
    captionStyle: 'clean',
    hookStyle: 'headline',
    music: 'lofi',
    repoSlug: 'rossark0/rossark-minimal-visual-explainer',
    sourceUrl: 'https://github.com/rossark0/rossark-minimal-visual-explainer/blob/main/SKILL.md',
    thumbnailUrl: '/skills/minimal-geist-explainer.jpg',
    category: 'editorial',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Minimal Geist Editorial
repo: rossark0/rossark-minimal-visual-explainer
---
# Minimal Geist Visual Explainer

## Quiet Clarity System
- Ultra-clean 3-color editorial palette: warm off-white paper (#FDFDFC), deep charcoal ink (#21201C), muted stone body (#63635E), and whisper-light surface fills (#F4F4F2, hairlines #E9E9E6).
- Hierarchy comes purely from typographic weight, generous whitespace, and alignment — ZERO heavy drop shadows, ZERO gradients, ZERO glowing neon, ZERO emoji clutter.
- Lead with the single conclusion at top; show 3–4 crisp flow steps, clean proportional horizontal bars, or side-by-side comparison tables with \`FACT\` / \`INFERENCE\` precision tags.

## Calm Motion
- Measured, critically damped \`outQuart\` reveals with subtle 10–18 px travel and generous hold times so complex breakdowns feel effortless to skim.`,
  },
  {
    id: 'director-cut-video-edit',
    name: 'Director Cut & Pacing Edit',
    blurb:
      'Pro video editing rules: word-tight jump cuts, reading-time math, 3s hook & audio-synced hits.',
    target: 'reel',
    baseRecipeId: 'tech-explainer',
    look: 'mono',
    lookId: 'studio-light',
    accent: '#FF5A1F',
    captionStyle: 'seam',
    hookStyle: 'headline',
    music: 'minimal-tech',
    repoSlug: 'win4r/video-director',
    sourceUrl: 'https://github.com/win4r/video-director/blob/main/video-director/references/craft.md',
    thumbnailUrl: '/skills/director-cut-video-edit.jpg',
    category: 'editing',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Director Cut & Pacing Edit
repo: win4r/video-director
---
# Precision Video Editing & Directorial Pacing

## Editing Rhythm & Retention Rules
- **3-Second Hook Law:** The core promise or visual proof must be 100% legible within 3 seconds (≥84px hook scale, ≥7:1 contrast, works muted).
- **Avoid Slideshow & Screensaver traps:** Deliver new visual information every 2–4 seconds; never leave a dead static screen >1.5 s outside an intentional hold, and never run 6 distracting infinite loops at once.
- **Intentional Breaths:** Alternate fast visual proof beats with clean full-bleed speaker breathing moments (especially right before the twist or key takeaway) so the viewer absorbs the message.

## Reading Time & Word-Sync Precision
- Hold on-screen headlines for \`max(1.5s, 1.0s + 0.3s × words)\` after arrival.
- Anchor visual changes directly to spoken trigger words (logos on brand names, counters landing on the exact spoken number, SFX hits 1 frame after visual contact).
- Final CTA / takeaway holds completely still for ≥1.5 seconds.`,
  },
  {
    id: 'product-demo-camera',
    name: 'SaaS Demo Follow-Cam',
    blurb:
      'Close-up UI storytelling, follow-zoom into real clicks/inputs & crisp browser showcase frames.',
    target: 'both',
    baseRecipeId: 'product-launch',
    look: 'mono',
    lookId: 'keynote-clean',
    accent: '#3B82F6',
    captionStyle: 'seam',
    hookStyle: 'visual',
    music: 'minimal-tech',
    repoSlug: 'shreyaskarnik/argo',
    sourceUrl: 'https://github.com/shreyaskarnik/argo/blob/main/skills/argo-guide/SKILL.md',
    thumbnailUrl: '/skills/product-demo-camera.webp',
    category: 'product',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: SaaS Demo Follow-Cam
repo: shreyaskarnik/argo
---
# Interactive Product Demo & Follow-Cam Choreography

## Camera Language for Software
- Never show an entire crowded app screen statically from far away. Frame ONE active panel, command palette, button, or workflow step close enough to read effortlessly on a phone.
- Follow the interaction: glide cleanly into the active control (smooth 1.25–1.55× focus zoom with \`inOutCubic\`), highlight the action/click state with a subtle accent ring, then pull back smoothly to reveal the resulting output.
- Pair crisp browser/window chrome with compact, high-contrast lower-left or top-left action labels (≤4 words) so the UI tells the story visually.

## Clean Continuity
- Transition smoothly from setup → action → live result using consistent window geometry and grounded contact shadows.`,
  },
  {
    id: 'blueprint-architectural',
    name: 'Blueprint & Schematic Plate',
    blurb:
      'Drafting navy plates, millimeter grids, crisp white vector hairlines & dimension callouts.',
    target: 'both',
    baseRecipeId: 'tech-explainer',
    look: 'mono',
    lookId: 'blueprint-schematic',
    accent: '#38BDF8',
    captionStyle: 'seam',
    hookStyle: 'stat',
    music: 'minimal-tech',
    repoSlug: 'lemomo-ai/lemo-opuscar',
    sourceUrl: 'https://github.com/lemomo-ai/lemo-opuscar',
    thumbnailUrl: '/skills/blueprint-architectural.webp',
    category: 'explainer',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Blueprint & Schematic Plate
repo: lemomo-ai/lemo-opuscar
---
# Architectural Blueprint & Engineering Schematic

## Visual System
- Deep architectural drafting navy (#0C1B33) inside \`.mp-backdrop\` with crisp cyan millimeter grid hairlines, corner registration crosshairs, and figure index numbers (\`FIG. 01\`, \`SEC. A-A\`).
- Draw technical systems with crisp 1.5px white and sky-cyan (#38BDF8) vector linework, amber (#FBBF24) highlights reserved strictly for the single active node or bottleneck, and precise \`mp.line\` dimension/leader arrows.

## Disciplined Motion
- Mechanical, zero-fluff precision: draw schematic traces with \`tl.draw\`, cascade specification blocks with crisp \`outQuart\` staggers (80–120 ms), and apply subtle 2% drafting-table camera push-in.`,
  },
  {
    id: 'whiteboard-hand-drawn',
    name: 'Hand-Drawn Whiteboard',
    blurb:
      'Progressive ink & marker sketching on warm paper, cause-effect arrows & calm organic motion.',
    target: 'both',
    baseRecipeId: 'podcast-story',
    look: 'cream',
    lookId: 'field-notes',
    accent: '#EA580C',
    captionStyle: 'editorial',
    hookStyle: 'headline',
    music: 'lofi',
    repoSlug: 'rossark0/rossark-motion-skill',
    sourceUrl: 'https://github.com/rossark0/rossark-motion-skill/blob/main/SKILL.md',
    thumbnailUrl: '/skills/whiteboard-hand-drawn.jpg',
    category: 'explainer',
    community: true,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    markdown: `---
name: Hand-Drawn Whiteboard
repo: rossark0/rossark-motion-skill
---
# Hand-Drawn Whiteboard & Calm Organic Motion

## Visual & Storytelling Craft
- Warm textured sketchbook paper (#FAF6EE) inside \`.mp-backdrop\` with charcoal ink illustrations, hand-drawn marker underlines/circles (\`mp.mark\`), burnt-orange (#EA580C) focal accents, and step-by-step cause-and-effect arrows (\`mp.line\`) that assemble the whole mental model live on screen.
- Every concept stays on the canvas long enough to connect to the next step — ending on a clear, memorable visual diagram.

## Calm, Believable Motion Physics
- **Never teleport:** Interpolate every element smoothly around natural pivots with gentle follow-through.
- **One main action + quiet idle life:** Drive one clear reveal per beat, supported by whisper-subtle breathing/sway (1–2° max, out of phase so nothing twins mechanically).`,
  },
];

/** Validated built-in open-source community skill catalogue (mirrored in Firestore `community_skills`). */
export const COMMUNITY_SKILLS: readonly UserSkill[] = RAW_COMMUNITY_SKILLS.map((s) =>
  UserSkillSchema.parse(s),
);

const COMMUNITY_BY_ID = new Map<string, UserSkill>(COMMUNITY_SKILLS.map((s) => [s.id, s]));

export function getCommunitySkillById(id: string | undefined): UserSkill | undefined {
  return id ? COMMUNITY_BY_ID.get(id) : undefined;
}
