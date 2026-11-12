# Product Spec: Motionpop *(working name)*

> **One-liner:** AI can animate. It can't direct. Motionpop gives every scene a director, and every clip your style.
>
> **What it is:** a web app where anyone, from a YouTube explainer creator to a small business owner to a professional motion designer, describes a scene in plain words and gets a **cinematically directed, polished, on-brand motion-graphics clip** in seconds. Then they refine it precisely, save it to a personal library, and export it in any format they need.
>
> *Name candidates: Motionpop, Muybridge Motion, Persistence Motion. Check domains and trademarks before committing. Replace "Motionpop" throughout once decided.*

---

## Table of contents
1. [Vision & problem](#1-vision--problem)
2. [USP & positioning](#2-usp--positioning)
3. [Who it's for](#3-who-its-for)
4. [Product principles](#4-product-principles)
5. [Core concepts (glossary)](#5-core-concepts-glossary)
6. [Key user journeys](#6-key-user-journeys)
7. [Feature specification](#7-feature-specification)
8. [Director skills (the USP) in depth](#8-director-skills-the-usp-in-depth)
9. [AI system design](#9-ai-system-design)
10. [Technical architecture](#10-technical-architecture)
11. [UX & interface](#11-ux--interface)
12. [Business model & pricing](#12-business-model--pricing)
13. [Competitive landscape](#13-competitive-landscape)
14. [Metrics](#14-metrics)
15. [Legal, IP, privacy & trust](#15-legal-ip-privacy--trust)
16. [Roadmap & phasing](#16-roadmap--phasing)
17. [Hackathon (Kiroween 2026) plan](#17-hackathon-kiroween-2026-plan)
18. [Risks & open questions](#18-risks--open-questions)
19. [Appendices](#19-appendices)

---

## 1. Vision & problem

### The problem
- **Motion graphics are everywhere** (YouTube explainers, Reels, product launches, ads, presentations) but **slow and expensive** to make. A single polished 10-second chart animation can take a skilled designer an hour or more in After Effects. Freelancers charge per clip. Most creators and small businesses either overpay, go without, or use static images.
- **AI motion tools exist, but the output looks generic.** They animate. They don't **direct**. Everything moves the same way: same fades, same timing, no tension, no emphasis, no story. Viewers subconsciously feel "template".
- **Re-rolling is painful.** Most AI tools make you re-prompt and hope. Fixing one detail often breaks everything else.
- **Consistency is hard.** Clip 7 rarely matches clip 1 in style, pacing and brand.
- **Real workflows aren't respected.** Creators and editors work in Premiere, DaVinci or CapCut. They need **individual clips with transparent backgrounds, in the right format**, not a locked, finished video.

### The vision
Become the **default tool for directed, on-brand motion graphics**: the place where creators, businesses and designers go when they want clips that look like a real motion director made them, in minutes, in their own style, getting better the more they use it (their library grows).

### Why now
- Frontier models (Claude Opus/Sonnet 5.5 class) can reliably plan structured, multi-step creative decisions.
- Code-based video (Remotion/React) makes animation **deterministic, editable and renderable in the cloud**, unlike pixel-generating video models.
- Short-form and explainer content demand keeps exploding, and every business now needs video.

---

## 2. USP & positioning

### The USP: director skills
Readable **markdown "director skills"** that cinematically direct each scene: pacing, camera movement, reveal order, emphasis, holds, transitions, sound cues. This is the difference between generic AI motion and professional motion design. Users can pick skills, let the AI choose, edit them, or write their own.

### Supporting differentiators
1. **Handcrafted component library:** the AI never freestyles animation code. It selects and configures premium, hand-built components, so the quality ceiling is set by craft, not by AI luck.
2. **Style packs:** one click restyles everything consistently (editorial explainer, elegant dark math, money documentary…).
3. **A personal library that learns your taste:** save any result as a reference. Future scenes follow your saved pacing and look.
4. **Brand kit:** your logo, colours and fonts everywhere, automatically.
5. **Edit, don't re-roll:** precise refinement by chat or controls without breaking the rest.
6. **Every format:** YouTube, Shorts/Reels/TikTok, square, product demo, presentation, with transparent-background exports for editors.
7. **No lock-in (Pro):** download the scene as code (Remotion/React) or as an alpha clip.

### Positioning statement
For **creators, marketers and designers** who need motion graphics that look professionally directed, **Motionpop** is an AI motion studio that **directs every scene with cinematic skills and keeps everything on-brand**. Unlike generic AI motion generators, it gives you **editable, consistent, director-quality clips** that drop straight into your edit.

### Taglines (pick one)
- *AI can animate. It can't direct. We do.*
- *Every scene gets a director.*
- *Motion graphics with taste.*

---

## 3. Who it's for

### Primary personas

**1. The Explainer Creator** ("Abhinav")
- Runs a finance/tech/education YouTube channel in a How Money Works / Vox / 3Blue1Brown-like style.
- Needs: charts, maps, globes, number reveals, timelines, all consistent with the channel brand, fast.
- Pain: After Effects is slow, freelancers are expensive, AI tools look generic.
- Success: makes the 20–40 graphics for a video in an evening instead of a week.

**2. The Video Editor / Freelancer**
- Edits for creators or clients in Premiere/DaVinci.
- Needs: precise timing control, transparent exports, 4K/60fps, consistent looks per client (multiple brand kits).
- Pain: repetitive motion work eats billable hours.
- Success: delivers more videos per week with better graphics.

**3. The Small Business Owner / Founder**
- Not a designer. Wants a product launch video, a growth chart for LinkedIn, a promo Reel, a "how it works" explainer.
- Needs: zero jargon, goal-based templates, their brand applied automatically, social-ready formats.
- Pain: agencies are expensive, Canva animations look cheap.
- Success: a professional launch clip in 15 minutes.

**4. The Professional Motion Designer**
- Skilled in After Effects; sceptical of AI.
- Needs: real control (easing, timing, camera), the ability to encode their own taste (write skills), exportable code or alpha clips, no "AI look".
- Pain: clients want more for less; repetitive data-viz work.
- Success: uses the tool for 70% of routine shots, saves time for hero work. Possibly **sells their own skills and style packs** later.

### Secondary personas
- **Marketing teams and agencies:** multiple brands, review and approval, volume.
- **Educators and course creators:** concept animations, diagrams, processes.
- **Startup DevRel / product teams:** feature announcements, changelog clips, demo videos.

### Jobs to be done
- "When I need to show a number or trend in my video, I want it to **land with impact**, so viewers remember it."
- "When I launch a product, I want a **polished announcement clip in my brand**, without hiring an agency."
- "When I edit, I want graphics that **drop into my timeline** with no extra work."
- "When I find a look I love, I want to **reuse it forever** without rebuilding it."

---

## 4. Product principles
1. **Scene-first.** The unit of work is one scene/clip. Projects group scenes, but nothing forces a full-video workflow.
2. **AI directs, it doesn't freestyle.** The AI chooses components, styles and skills and outputs **validated JSON props**. It never writes raw animation code at runtime.
3. **Taste over quantity.** Fewer, better components and skills. Every default must look premium.
4. **Edit, don't re-roll.** Every change is targeted. Nothing unrelated changes.
5. **Time-to-wow under 60 seconds.** A new user's first clip must impress.
6. **Consistency by default.** Projects remember brand, style and pacing.
7. **Respect real workflows.** Alpha exports, correct formats, frame-accurate timing, editor-friendly naming.
8. **Transparent and controllable.** Skills are readable markdown. Users can see *why* a scene was directed a certain way.
9. **Simple surface, deep power.** Business owners see goals and buttons. Pros can open advanced controls and edit skills.
10. **Cheap to run.** Small JSON outputs, model routing, caching, so it stays affordable for users and for us.

---

## 5. Core concepts (glossary)

| Concept | Definition |
|---|---|
| **Workspace** | A user's or team's account space: brand kits, library, projects, settings, billing. |
| **Brand Kit** | Logo(s), colours, fonts, logo animation, watermark/safe-zone settings. A workspace can have several (agencies). |
| **Project** | A collection of scenes for one video or campaign. Holds a default brand kit, style pack, format and pacing. |
| **Scene** | One clip. Made of a component, a style pack, a director skill, content (text/data/assets) and props. |
| **Component** | A handcrafted animated building block (bar chart, globe, number reveal…) with a strict props schema. |
| **Style Pack** | A visual language applied to all components: palette roles, typography, textures, easing curves, transitions, backgrounds. |
| **Director Skill** | A markdown file that directs a scene cinematically: shot sequence, timing, camera, emphasis, holds, transitions, sound cues, rules. |
| **Library** | The user's saved scenes, references, custom skills, custom style packs and assets, reusable across projects. |
| **Reference** | A saved scene marked "use as reference" that guides future generations (pacing, look, energy). |
| **Format Preset** | Output size, aspect ratio, fps and safe zones (YouTube 16:9, Reels 9:16, etc.). |
| **Sequence** | Optional: several scenes stitched with transitions for preview or combined export. |
| **Variant** | An alternative direction of the same scene (e.g. three different skills applied to the same content). |

---

## 6. Key user journeys

### 6.1 First-time onboarding (goal: first wow in under 60 seconds)
1. Sign up (Google/email).
2. "What are you making?" → *YouTube videos · Social clips · Product launch · Presentations · Client work*. This sets default formats, templates and style suggestions.
3. **Brand in 10 seconds:** paste your website URL (we extract logo, colours and fonts) **or** upload a logo (we extract colours), **or** skip.
4. A pre-filled example prompt matching their goal ("Show our revenue growing from €10k to €120k in 2026, make the jump feel huge"). One click: **Generate**.
5. A directed, on-brand clip plays within seconds. A tooltip says: *"Directed with the 'Shocking Stat Reveal' skill. Try another →"*.
6. Prompt to **save it to your library** and **export**.

### 6.2 Explainer creator, building graphics for a video
1. Create project "Why Nvidia is worth $5T" with brand kit "The AI Impact", style "Money Documentary", format YouTube 16:9 4K.
2. Scene by scene: describe → AI suggests component + skill → generate → refine ("hold 2024 longer", "use the red accent") → **Save to library** → next.
3. The storyboard view shows all scenes in order, with a sequence preview to check flow.
4. Export each scene as **ProRes 4444 with alpha** (or MP4) with sensible filenames (`03_nvidia-revenue-chart.mov`), or batch-export all.
5. Drop them into Premiere.

### 6.3 Business owner, product launch clip
1. Choose the "Product launch" goal → pick a template ("Announce a new feature").
2. Upload 2–3 product screenshots, type the feature name and one sentence.
3. The AI builds a 15-second sequence: logo sting → device mockup with screenshot → zoom to the key feature → benefit text → call-to-action with URL.
4. Switch the format to **Reels 9:16** and the layout auto-adapts. Export both 16:9 and 9:16.

### 6.4 Professional motion designer, encoding their taste
1. Opens a generated scene in **Advanced mode**: element tracks, easing per element, camera path, exact frame timings.
2. Tweaks it until perfect, then **"Save as Skill"**: the app drafts a director-skill markdown from their edits, which they polish.
3. Creates a **custom style pack** from their client's brand guidelines.
4. Next time, any generation for that client uses their skill and style. Pro tier: **download the scene as Remotion code** for full control.

### 6.5 Returning user, reusing the library
1. "Make a chart like the one I did for the Tesla video, but with Apple's numbers."
2. The AI finds the saved reference, reuses its component, skill, style and timing, and swaps the data.

---

## 7. Feature specification

> Priority tags: **[MVP]** = hackathon build (by Dec 3, 2026), **[V1]** = public launch, **[V2]** = after traction, **[Later]** = ideas for the future.

### 7.1 Scene creation
- **[MVP] Prompt box** with smart placeholder examples based on the user's goal.
- **[MVP] AI interpretation:** extracts intent (what to show, the key message, the emotion), picks a component, suggests a director skill and applies the project's style. Shows *"Here's my plan"* chips (component · skill · style · duration) that the user can change before or after generating.
- **[MVP] Data input:** paste numbers in the prompt, paste a table, or upload CSV. Auto-detects units, currency and dates.
- **[V1] Asset input:** upload images, screenshots, logos, icons, or pick from an icon library.
- **[V1] Minimal clarifying questions:** only when essential ("Which year should be highlighted?"), offered as quick-reply chips, never long forms.
- **[V1] Variants:** "Show me 3 directions" generates the same content with three different skills or styles side by side.
- **[V2] Reference image or clip:** "Make it feel like this" (upload a screenshot or short clip). The AI matches pacing and palette using only its own components, never copying the reference.
- **[V2] Script helper (optional):** paste a paragraph and get *suggested* scenes you can accept one by one. A helper, not the main flow.

### 7.2 Component library
All components are handcrafted, support every style pack, are responsive across formats, and have strict props schemas.

**MVP set (6–8, made beautifully):**
1. **Number Reveal:** big counter with prefix/suffix, comparison delta, context line.
2. **Bar Chart:** vertical/horizontal, highlight bar, annotation, sequential reveal. *(V1: bar chart race.)*
3. **Line Chart:** draw-on line, highlighted segment, event markers, area fill.
4. **Comparison Split:** A vs B (two numbers, two logos, two products), with a winner emphasis.
5. **Timeline:** horizontal or vertical milestones, camera travels along it.
6. **Map / Globe:** 3D globe spin to a country, country highlight, route arcs between cities, zoom into a region.
7. **Kinetic Text:** headline or keyword reveals, emphasis words, quote card.
8. **Logo / Title Sting:** brand intro or outro, lower third, call-to-action end card.

**V1 additions:**
- Pie/donut, stacked bars, scatter/bubble.
- List / countdown / ranking.
- Process flow / diagram (A → B → C with icons).
- **Device mockup / UI showcase** (phone, laptop, browser, with screenshot, zoom and highlight). *Critical for product launches.*
- Icon grid / stat grid.
- Callout and annotation overlays (arrows, circles, highlights) for use over footage, exported with alpha.
- Transition pack (wipes, morphs, zooms) as standalone clips for editors.

**V2+:** org charts, Sankey/money-flow diagrams ("who pays whom"), 3D isometric scenes, character/mascot puppets (user-uploaded), social-post mockups (tweet/LinkedIn card reveals).

### 7.3 Style packs
- **[MVP] 3 style packs**, with descriptive names only (no brand names):
  - *Editorial Explainer:* clean, bold, newsy, textured paper backgrounds, punchy cuts.
  - *Math Elegance:* dark background, precise thin lines, smooth continuous camera, calm.
  - *Money Documentary:* dark navy/green, dramatic lighting, heavy number emphasis, cinematic pushes.
- **[V1] 6–10 packs**, adding *Minimal Tech*, *Playful Social*, *Corporate Clean*, *Retro Broadcast*, *Neon Launch*.
- Each pack defines tokens:
  - palette **roles** (background, surface, primary, accent, positive, negative, text, muted)
  - typography (display, body, numerals), sizes per format
  - easing curves (enter, exit, emphasis), default durations
  - transitions, background treatments (texture, grain, gradient, grid), shadow and glow style
  - camera behaviour defaults (static, drift, push)
- **[MVP] Brand override:** the brand kit maps onto palette roles and fonts automatically.
- **[V1] Fork & edit:** duplicate any pack and customise it with live preview on sample scenes.
- **[V2] Create a pack from brand guidelines:** upload a brand PDF or website and the AI drafts a style pack.

### 7.4 Director skills
*See [Section 8](#8-director-skills-the-usp-in-depth) for full depth.*
- **[MVP] 8 built-in skills**, auto-selected by the AI or picked manually.
- **[MVP] "Why this direction?"** shows a short explanation of the skill used.
- **[V1] Skill editor:** edit markdown with live preview on the current scene.
- **[V1] Save as Skill:** turn a scene you tweaked into a reusable skill (AI drafts the markdown).
- **[V2] Skill packs and marketplace:** share or sell skills and style packs.

### 7.5 Editing & refinement
- **[MVP] Chat refine:** "slower build", "hold 2024 longer", "make it more dramatic", "use my red". The AI returns a **targeted props patch**, and nothing else changes.
- **[MVP] Inline text editing** on the canvas (click text, type).
- **[MVP] Quick controls panel:** duration, speed/energy slider, colour-role picker, swap component / style / skill while keeping the content.
- **[MVP] Undo/redo + version history** per scene (restore any earlier version).
- **[V1] Lock elements:** "don't change this" protects an element from AI edits.
- **[V1] Advanced mode (for pros):**
  - element tracks with start/end times (mini timeline)
  - easing presets plus a custom bezier editor per element
  - camera path (keyframes: position, zoom, rotation), parallax depth
  - motion blur toggle, frame-accurate scrubbing, keyboard shortcuts (J/K/L, I/O, space)
- **[V2] Multi-select edits** across scenes ("make all charts in this project use the slow-build skill").

### 7.6 Brand kit
- **[MVP]** Upload a logo → auto-extract a palette → choose fonts (Google Fonts or upload) → preview on sample scenes.
- **[V1] From website URL:** extract logo, colours and fonts automatically.
- **[V1]** Logo animation style (sting), watermark/bug position, safe-zone margins, default end card with CTA/URL/handles.
- **[V1]** Multiple brand kits per workspace (agencies and freelancers).
- **[V2]** Brand rules ("never put red on green", "logo min size 120px"), enforced by the quality check.

### 7.7 Personal library (gets better with use)
- **[MVP] "Save to library"** after every generation: name, tags (auto-suggested), and the option **"Use as reference"**.
- **[MVP]** Library browser with search, tags and filters (component, style, skill, project).
- **[V1] Reference-guided generation:** the AI looks at your references (component, skill, timing, style choices) and follows them for similar requests. "Make it like my Tesla chart" works.
- **[V1]** Save custom skills, custom style packs and assets (logos, icons, images, data sets).
- **[V1]** Collections ("Channel intro pack", "Client X").
- **[V1] Feedback learning:** 👍/👎 per scene plus an optional reason. The workspace builds a **taste profile** (e.g. "prefers slower holds, minimal colour") that biases future generations. It's visible and editable in settings, so it's not a black box.
- **[V2]** Team-shared libraries.

### 7.8 Formats & export
**Format presets [MVP: first 4]:**
| Preset | Aspect | Default size | Notes |
|---|---|---|---|
| YouTube video | 16:9 | 1920×1080 (4K option) | Title-safe margins |
| Shorts / Reels / TikTok | 9:16 | 1080×1920 | **Platform UI safe zones** overlay (captions, buttons) |
| Square feed | 1:1 | 1080×1080 | |
| Product demo / website hero | 16:9 or 16:10 | 1920×1080 | Loopable option |
| Feed portrait | 4:5 | 1080×1350 | **[V1]** |
| LinkedIn / presentation slide | 16:9 | 1920×1080 | Clean, slower pacing defaults **[V1]** |
| Custom | any | any | **[V1]** |

- **[MVP] Auto-reframe:** components are responsive, so switching format re-lays out the scene (not just a crop) and adjusts text sizes for readability.
- **[MVP] Export:** MP4 (H.264), 1080p, 30fps.
- **[V1] Export:** 4K, 24/30/60fps; **transparent background** (ProRes 4444 `.mov`, WebM VP9 alpha); PNG sequence; GIF; **multi-format export in one click** (16:9 + 9:16 + 1:1).
- **[V1] Batch export** of a project with consistent filenames (`01_intro.mov`, `02_revenue-chart.mov`).
- **[V2]** Lottie/JSON export for web and apps where supported; **Pro: download Remotion/React source** of a scene.
- **[V2]** Premiere/DaVinci-friendly packaging (XML/EDL of a sequence with clips).

### 7.9 Audio & timing
- **[V1] SFX library + auto sound design:** subtle whooshes, pops, ticks and impacts placed automatically on key motion moments (a director skill can specify sound cues). Export with or without audio, or audio stems. *Sound design is a big part of why pro motion graphics feel premium.*
- **[V1] Voiceover sync:** upload the voiceover clip for that scene, Amazon Transcribe returns word timestamps, and the key reveal syncs to the stressed word ("…grew to **one trillion**").
- **[V2] Music beat sync:** detect beats in a music track and snap cuts and reveals to them.
- **[MVP]** Duration control (e.g. 3–15s) with skills adapting their timing proportionally.

### 7.10 Data handling
- **[MVP]** Paste numbers or a table, or upload CSV. Auto-detect types, units and currency.
- **[MVP]** **Locale-aware formatting:** €1.234,56 vs $1,234.56, "Mrd." vs "B", date formats.
- **[MVP]** Deterministic checks: displayed numbers always match the input data (code-verified, not AI-verified).
- **[V1]** Optional on-screen **source line** ("Source: Company 10-K, 2025"), editable and styled.
- **[V2]** Live data connectors (Google Sheets, public company financials, World Bank-type datasets) with the source auto-attached.

### 7.11 Projects, storyboard & consistency
- **[MVP]** Projects with default brand kit, style pack, format and pacing ("energy level").
- **[MVP]** Storyboard view: scene cards in order, drag to reorder.
- **[V1]** **Sequence preview:** play all scenes back to back with transitions to judge flow. Optional combined export.
- **[V1]** **"Match previous scene":** carry pacing, colour emphasis and camera energy forward.
- **[V1]** Project-wide changes: switch style pack or brand for all scenes at once.

### 7.12 Templates & gallery
- **[MVP] Starter templates by goal** (for non-designers): *Show growth · Compare two things · Big number · Timeline of events · Where in the world · Announce a feature · Quote/testimonial · Intro/outro*.
- **[V1] Public gallery** of great example scenes → **"Remix with my content"**. Also an SEO and growth engine (public pages: "Animated bar chart example", "Product launch animation template").
- **[V1]** Free-tier exports carry a subtle "Made with Motionpop" end tag, which drives viral growth.

### 7.13 Collaboration & review **[V2]**
- Share link with a view-only player and **timestamped comments** (client review).
- Approve / request changes.
- Roles: owner, editor, viewer. Team seats.

### 7.14 Integrations
- **[V1]** Google Fonts, an icon library (open-licence), stock flags and country shapes (public domain/open data).
- **[V2]** Google Sheets, Figma frame import (screens/assets), Notion/Docs embed, Canva/CapCut handoff, **public API** for agencies and SaaS companies (e.g. auto-generate weekly metrics clips).
- **[Later]** Premiere/DaVinci panel plugin: generate scenes from inside the editor.

### 7.15 Localisation
- **[V1]** UI in English and German first.
- **[V1]** **Translate a scene:** text in the scene gets translated, layout adjusts for longer words (German!), and number formats switch locale. Great for creators doing multi-language audio tracks.
- **[V2]** Right-to-left language support.

### 7.16 Quality & accessibility checks (automatic)
- **[MVP]** Deterministic checks: text overflow/clipping, minimum font size per format, element collisions (bounding boxes), safe-zone violations, data-number match.
- **[V1]** Visual check on keyframes (vision model): visual clutter, contrast issues, awkward composition. Shows suggestions with one-click fixes.
- **[V1]** **Photosensitivity safety:** flag rapid flashing (seizure risk) per WCAG flash thresholds.
- **[V1]** Contrast check against WCAG AA for text.

### 7.17 Account, credits & settings
- **[MVP]** Auth (email/Google via Cognito), workspace settings, **BYOK field** (bring your own Anthropic API key, encrypted, deletable).
- **[V1]** Credits dashboard (generations, renders, storage), usage history, invoices (Stripe), plan management.
- **[V1]** Render queue with status and notifications (email/in-app when long exports finish).

---

## 8. Director skills (the USP) in depth

### 8.1 What a skill is
A markdown file that tells the AI **how a professional motion director would stage this kind of moment**: shot sequence, timing ratios, camera, emphasis, holds, transitions, sound cues, rules and anti-patterns. The AI turns it into exact component props and camera keyframes.

### 8.2 Skill anatomy (standard format)
```md
---
name: Shocking Stat Reveal
id: shocking-stat-reveal
version: 1.2
use_when: A beat hinges on one surprising number.
works_with: [number-reveal, bar-chart, comparison-split]
energy: high
default_duration: 6s
---

## Intent
Make one number feel heavy and unforgettable.

## Shot sequence (timing as % of duration)
1. 0–10%: Muted context frame or darkness. Build anticipation.
2. 10–30%: Slow push-in toward the centre (ease-in-out).
3. 30–55%: Number counts up fast, decelerating over the last 20% (feels heavy).
4. 55%: Hard stop + micro camera shake (2 frames) + impact SFX.
5. 55–85%: HOLD. Nothing else moves. Viewer reads.
6. 85–100%: Context line fades in at 60% opacity below.

## Camera
Single slow push (scale 1.0 → 1.08). No rotation.

## Emphasis
Accent colour only on the final number. Everything else muted.

## Sound cues
Rising tension under the count-up (optional), impact on the stop.

## Rules
- One number per frame.
- Never cut away before the hold completes.
- No competing motion during the hold.

## Anti-patterns
- Bouncy easing on the number.
- Multiple accent colours.
- Text appearing during the count-up.

## Voice sync (if voiceover present)
Align the hard stop with the stressed word.
```

### 8.3 MVP built-in skills (8)
1. **Shocking Stat Reveal:** one number, maximum impact.
2. **Slow-Build Trend:** line or bars draw gradually, tension rises, the final point is emphasised.
3. **Contrast Split:** A vs B, a pause, then the winner is revealed with a visual weight shift.
4. **Journey Along a Timeline:** the camera travels, each milestone gets a beat, ending on "today".
5. **Zoom From World to Place:** globe spin → country highlight → city or region zoom.
6. **Countdown / Ranking:** builds from #N to #1, with the top spot staged specially.
7. **Calm Explanation:** steady pacing, sequential reveals, minimal camera (for teaching).
8. **Brand Sting:** logo intro or outro with an energy level matching the style pack.

**V1 additions:** *The Reversal* (expectation → twist), *Domino Effect* (cause → chain of consequences), *Feature Spotlight* (UI zoom + benefit callout), *Before/After Wipe*, *Data Punchline* (numbers build to a joke or insight), *Breathing Room* (minimal, elegant, luxury pacing).

### 8.4 How skills are chosen
- The AI classifies the scene's intent (impact? comparison? journey? explanation?) and suggests the top skill **plus two alternatives** as chips.
- Users can pin a default skill per project or per component type.
- Library references override defaults ("use the timing from my saved chart").

### 8.5 Custom skills
- **[V1]** Write or edit a skill in a markdown editor with **live preview**.
- **[V1] Save as Skill:** after tweaking a scene in Advanced mode, the AI drafts a skill from the edits (timings, camera, emphasis), and the user names and polishes it.
- **[V1] Skill validation:** the app checks skill structure and warns about conflicts (e.g. "hold duration exceeds scene length").
- **[V2] Marketplace:** creators publish or sell skills and style packs, with revenue share. Ratings and previews.

### 8.6 Why this is defensible
- It encodes **taste**, which is hard to copy and improves with every skill.
- User-created skills plus a marketplace create **network effects**.
- Readable markdown builds **trust** with pros ("I can see and change how it thinks").

---

## 9. AI system design

### 9.1 Golden rule
**The runtime AI outputs only validated JSON** (component choice + props + skill application + camera keyframes). It never writes animation code. All animation is executed by handcrafted components.

### 9.2 Generation pipeline
1. **Intent parsing:** prompt + attachments → structured intent (message, data, emotion, entities). *Model: Sonnet-class.*
2. **Planning:** choose component, skill and style (respecting project defaults, references and taste profile) → "Here's my plan" chips. *Model: Sonnet-class with the cached catalog (components, schemas, skills, style tokens).*
3. **Props generation:** apply the skill to produce full props + camera + timing + SFX cues. *Model: Sonnet-class; Opus-class only for retries or "Pro quality" mode.*
4. **Validation:** zod schema validation + deterministic checks (data match, text fit, safe zones, durations). If it fails, errors go back to the model automatically (max 2 retries), then fall back to safe defaults.
5. **Live preview:** Remotion Player renders instantly in the browser (no AI, no server render).
6. **Refinement:** user edit → **JSON patch** from a fast model (Haiku-class) → validate → update preview in about a second.
7. **Visual QA [V1]:** keyframe stills → vision-capable model → suggestions with one-click fixes.
8. **Export:** Remotion Lambda renders in parallel → S3 → CloudFront download link.

### 9.3 Model routing & cost control
| Task | Model tier | Why |
|---|---|---|
| Intent + planning + props | Sonnet 5.5-class | Judgement at a moderate cost |
| Edits/patches, tagging, naming | Haiku 5.5-class | Fast and very cheap |
| Visual QA first pass | Haiku-class (vision) | Cheap; escalate only if uncertain |
| Retries after 2 failures / "Pro quality" | Opus 5.5-class | Only when needed |

- **Prompt caching** for the catalog, skills and style tokens (static, large, reused).
- **Small outputs** (JSON only), so output-token cost stays tiny.
- **No full regenerations** for edits.
- **Deterministic work in code** (layout math, number checks, timing).
- Target AI cost: **about €0.02–0.05 per scene** on default routing (estimate; validate with real usage).

### 9.4 Bring your own key (BYOK)
- **Provider abstraction layer** (e.g. Vercel AI SDK) supporting the Anthropic API, Amazon Bedrock, and optionally OpenAI/OpenRouter.
- Users can add their own **Anthropic API key**, which unlocks unlimited generations on cheaper plans (they pay their own AI costs).
- Keys are encrypted (AWS KMS), used only server-side, never logged, validated with a test call, and deletable anytime.

### 9.5 Reference & taste learning
- References are stored as structured summaries (component, skill, timing ratios, camera, colour emphasis) plus a thumbnail. Retrieved by similarity for new prompts.
- The taste profile is a small, visible, editable settings object (e.g. `pacing: slower`, `accent_usage: minimal`, `camera: subtle`) updated from 👍/👎 and edits.

### 9.6 Guardrails
- Content policy: no hateful, sexual or violent content, no impersonation of real brands or people in deceptive ways, no misleading financial claims presented as fact (the source line encourages honesty).
- Brand-name style requests ("make it in Vox style") get mapped to descriptive styles with a gentle note. No copying of protected logos or characters.
- Rate limits per user, abuse detection, login required for generation.

---

## 10. Technical architecture

### 10.1 Stack
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, Framer Motion for UI.
- **Animation engine:** Remotion (components), **Remotion Player** (live preview), **Remotion Lambda** (cloud rendering).
- **Validation:** zod schemas per component; a shared types package.
- **AI:** Amazon Bedrock (Claude models) + Anthropic API; provider abstraction; prompt caching.
- **Audio:** Amazon Transcribe (word timestamps), SFX library (licensed/royalty-free).
- **Storage & delivery:** Amazon S3 (assets, renders), CloudFront (CDN).
- **Auth:** Amazon Cognito.
- **Database:** DynamoDB (workspaces, projects, scenes, versions, library, skills, styles).
- **Hosting:** AWS Amplify Hosting (Next.js) or CloudFront + Lambda.
- **Payments:** Stripe (subscriptions + credits).
- **Monitoring:** CloudWatch, error tracking (e.g. Sentry), product analytics (e.g. PostHog, EU-hosted).
- **Region:** EU (Frankfurt) by default for GDPR; models via the nearest Bedrock region where available.

### 10.2 Repo structure (monorepo)
```
/apps/web                 Next.js app
/packages/components      Remotion scene components (+ stories, tests)
/packages/schemas         zod schemas & shared types
/packages/styles          style pack token files
/packages/skills          built-in director skills (.md)
/packages/engine          planning, validation, patching, model routing
/packages/render          Remotion Lambda render orchestration
/infra                    IaC (AWS CDK or SST)
/.kiro                    steering, specs, hooks (development only)
```

### 10.3 Data model (simplified)
- `Workspace { id, name, plan, credits, byokKeyRef?, tasteProfile }`
- `BrandKit { id, workspaceId, logos[], palette, fonts, sting, safeZones, endCard }`
- `Project { id, workspaceId, name, brandKitId, stylePackId, formatPreset, pacing }`
- `Scene { id, projectId, order, componentId, stylePackId, skillId, props(JSON), duration, format, versionIds[] }`
- `SceneVersion { id, sceneId, props(JSON), createdBy(ai|user), message }`
- `LibraryItem { id, workspaceId, type(scene|skill|style|asset|data), refSceneId?, tags[], isReference }`
- `Skill { id, ownerId?, markdown, version, builtIn }`
- `StylePack { id, ownerId?, tokens(JSON), builtIn, forkedFrom? }`
- `RenderJob { id, sceneId|sequenceId, format, codec, status, outputUrl }`

### 10.4 Performance targets
- Plan + first preview: **under 6 seconds** (p50).
- Edit patch → preview update: **under 1.5 seconds** (p50).
- 10-second 1080p export: **under 60 seconds**.
- Preview at a smooth 30fps in the browser on a mid-range laptop.

### 10.5 Security
- Least-privilege IAM, encrypted S3 buckets, signed URLs for private assets, KMS for BYOK keys, secrets never in the repo (`.env` + `.kiroignore`), OWASP basics, rate limiting.

---

## 11. UX & interface

### 11.1 Layout (desktop-first)
```
┌──────────────┬───────────────────────────────┬──────────────────┐
│ LEFT          │ CENTER                        │ RIGHT            │
│ Projects      │ Canvas preview (player)       │ Inspector        │
│ Storyboard    │ format switcher · safe zones  │ Component        │
│ Library       │ play/scrub · versions         │ Style pack       │
│ Templates     │                               │ Director skill   │
│               │                               │ Quick controls   │
│               │                               │ (Advanced ▸)     │
├──────────────┴───────────────────────────────┴──────────────────┤
│ BOTTOM: Prompt / chat bar  ·  "Here's my plan" chips  ·  mini timeline │
└──────────────────────────────────────────────────────────────────────┘
```

### 11.2 UX rules
- **Two modes:** *Simple* (default: prompt, chips, quick controls) and *Advanced* (tracks, easing, camera). Remember the user's preference.
- **Always show the plan** (component · skill · style · duration) as editable chips. Users learn the system by seeing it.
- **One primary action per screen:** Generate → Save → Export.
- **Never lose work:** autosave and version history.
- **Speak human:** "Make it more dramatic", not "increase easing coefficient". Pro terms only in Advanced mode.
- **Empty states teach:** example prompts, template cards, short looping previews.
- **Keyboard shortcuts** for pros (space play, J/K/L, ⌘Z, ⌘S save to library, ⌘E export).
- **Mobile:** view, review and approve on phone; creation optimised for desktop.

### 11.3 App design language
The app itself must look like a premium creative tool: dark, calm UI that lets the colourful content shine; smooth micro-interactions; no clutter. (The product is about taste, so the app must have taste.)

---

## 12. Business model & pricing
*(Initial hypothesis; validate with users.)*

| Plan | Price (hypothesis) | Includes |
|---|---|---|
| **Free** | €0 | ~10 scenes/month, 720p, watermark end tag, 2 style packs, built-in skills |
| **Creator** | ~€15–19/mo | ~150 scenes/month, 1080p, no watermark, all style packs, 1 brand kit, library, MP4 + alpha |
| **Pro** | ~€39–49/mo | ~500 scenes, 4K/60fps, custom skills & styles, 3 brand kits, Advanced mode, code export, priority render |
| **Team / Agency** | ~€99+/mo | Seats, shared libraries, unlimited brand kits, review links, API |
| **BYOK discount** | e.g. –30% | Unlimited generations with own key; renders still metered |

- **Credits** for renders above plan limits (4K/60fps costs more).
- **[V2] Marketplace** revenue share on skills and style packs (e.g. 70/30 creator/platform).
- **Growth loops:** watermark end tag on free exports, public gallery SEO pages, remixable shared scenes, referral credits, creator affiliate programme, and your own YouTube channel as distribution.

---

## 13. Competitive landscape

| Competitor | What they do | Our difference |
|---|---|---|
| **Hera** | AI motion designer, prompt → editable motion graphics; expanding into a creative canvas | Director skills (cinematic direction), personal library and references, editor-first exports, scene consistency |
| **Higgsfield Vibe Motion** | Prompt → Remotion code, strong for data/typography | Handcrafted components (no freestyle code), skills, brand kits, edit-don't-re-roll |
| **Jitter** | Collaborative motion design tool with AI agents and MCP | Faster for non-designers; AI-directed defaults; skills encode taste |
| **Adobe After Effects (+ AI Assistant)** | Industry standard, powerful, steep learning curve | Minutes vs hours, no learning curve, on-brand automatically |
| **HeyGen / OpusClip motion features** | Motion graphics inside broader video platforms | Specialised depth, director quality, pro controls and alpha exports |
| **Canva** | Easy templated animations | Premium, directed motion; data-aware components; pro-grade exports |
| **Remotion starter kits** | Developer templates | Complete product for non-developers |

**Positioning in one line:** *others give you animations; we give you direction.*

---

## 14. Metrics

### North star
**Exported scenes per active workspace per week**: scenes good enough to actually use.

### Activation & quality
- Time to first generated scene (target < 60s)
- % of new users who export within the first session
- **Edit-vs-regenerate ratio** (more edits and fewer full re-rolls = a better product)
- 👍 rate per scene, by skill and by component
- Save-to-library rate (signals "this is good enough to reuse")

### Retention & business
- Week-1 / week-4 retention
- Free → paid conversion
- Average scenes per project (are people building whole videos?)
- AI + render cost per exported scene vs revenue per scene (gross margin)

---

## 15. Legal, IP, privacy & trust
- **No brand-name presets.** Styles are named descriptively. Never use other creators' logos, fonts, characters or trademarks. Users asking for "X style" get a descriptive equivalent.
- **Users own their outputs** (scenes, exports, custom skills). Clear terms.
- **Asset licensing:** only open-licence or properly licensed fonts, icons, SFX, map data (e.g. Natural Earth, public domain), flags.
- **GDPR:** EU hosting by default, data processing agreement, delete-account and export-data options, minimal analytics, cookie consent.
- **AI transparency:** disclose AI use where required (EU AI Act transparency obligations); no training on user content without explicit opt-in.
- **BYOK security:** encrypted, server-side only, deletable, never logged.
- **Founder/company admin (Germany):** check employment contract (side-business approval) and residence-permit rules before commercial operation; register the business properly before charging money.

---

## 16. Roadmap & phasing

### Phase 0: Hackathon MVP (Nov 11 – Dec 3, 2026)
- 6–8 components (Number Reveal, Bar, Line, Comparison, Timeline, Map/Globe, Kinetic Text, Logo Sting)
- 3 style packs, 8 director skills, auto-suggestion + "why this direction"
- Brand kit (logo upload → palette, fonts)
- Formats: YouTube 16:9, Reels 9:16, Square, Product demo; auto-reframe
- Prompt → plan chips → generate → chat refine + quick controls + inline text edit + version history
- Save to library + "use as reference" (basic)
- Deterministic quality checks (overflow, collisions, safe zones, data match)
- Export MP4 1080p (stretch goal: alpha WebM)
- BYOK field, Cognito login, AWS budget alerts
- Landing page on the product domain
- Demo: graphics for one real segment of an AI Impact video

### Phase 1: Public V1 (Q1 2027)
- Advanced mode, skill editor, Save as Skill, fork style packs
- Alpha exports (ProRes 4444/WebM), 4K/60fps, multi-format and batch export
- SFX auto sound design, voiceover sync
- Device mockup / UI showcase, list/ranking, process flow, pie/donut components
- Website-URL brand extraction, multiple brand kits
- Reference-guided generation, taste profile, collections
- Public gallery + remix, templates by goal, watermark growth loop
- Stripe billing, credits, render queue notifications
- Visual QA, photosensitivity and contrast checks
- English + German UI, scene translation

### Phase 2: Growth (2027)
- Review links and comments, team seats, shared libraries
- Marketplace for skills and style packs
- Script helper (suggested scenes), reference image/clip matching
- Live data connectors, Google Sheets, Figma import
- Public API, code export, Premiere/DaVinci packaging
- Music beat sync, Sankey/money-flow diagrams, 3D isometric scenes

### Later / ideas
- Editor plugins (Premiere/DaVinci panel), mascot/character puppets, interactive embeddable scenes for websites, "talk-back" interactive explainers.

---

## 17. Hackathon (Kiroween 2026) plan
- **Category:** Frankenstein (LLM direction + handcrafted deterministic animation + brand/style systems + audio/cloud rendering stitched together). Bonus targets: Best Startup Project, Best Demo, Best Student Project (solo student entry).
- **Kiro (development only):**
  - **Steering:** product, tech (golden rule: AI outputs JSON only), structure, design system, skill format, component rules
  - **Specs:** one per feature (render pipeline → component library → planning engine → editor → library → export), plus Bugfix specs for issues
  - **Hooks:** (1) new-component scaffolder (schema + registry + test + story + catalog), (2) component quality check on save (schema, property tests, test-frame render, overlap/safe-zone checks), (3) skill validator on `.md` save, (4) task-complete typecheck + tests, (5) docs/catalog sync
  - **MCP:** Remotion docs, AWS docs; optionally our own component-catalog MCP for development
  - **Property-based tests:** durations, schema invariants, data-match invariants
  - Keep a `KIRO_LOG.md` with screenshots, which feeds the write-up and a dev.to post
- **Demo video (<3 min):** problem (generic AI motion) → the same scene generic vs directed (wow) → style pack switch → brand kit → format switch to Reels → save to library → real AI Impact segment cut together → "AI can animate. It can't direct."
- **Submission checklist:** public repo + OSI licence, `/.kiro` at root, working URL + test login, YouTube demo under 3 min, LinkedIn + startup website for Best Startup, credits requested before Dec 1 (21:00 CET), submit by Dec 3.

---

## 18. Risks & open questions

| Risk | Mitigation |
|---|---|
| Crowded market (Hera, Higgsfield, Jitter, Adobe) | Lead with director skills + library + editor-first exports; niche down first on explainer creators |
| Output still looks generic | Invest most time in component craft and skill quality; test with real creators; 👍/👎 data |
| Remotion rendering complexity and cost | Build the export pipeline first; Lambda concurrency limits; cache renders |
| AI cost spikes | Model routing, caching, BYOK, per-user limits, AWS Budgets alerts |
| Scope creep (3 weeks, solo) | Strict MVP list; anything not in the demo waits |
| Licensing of fonts/icons/SFX/maps | Only open or licensed assets, tracked in a licence file |
| IP issues with "style of X" | Descriptive names, no copied assets, guardrail mapping |
| Founder admin (contract/visa) | Check before charging money; build on own time and devices |

**Open questions to validate with 5–10 creators/editors:**
1. Do they prefer individual clips (alpha) or full sequences?
2. Which 5 components do they use most?
3. Would they write or edit director skills, or only pick them?
4. What would they pay, and is BYOK attractive?
5. Which export formats and codecs are must-haves?

---

## 19. Appendices

### A. Example scene JSON (what the AI outputs)
```json
{
  "component": "bar-chart",
  "stylePack": "money-documentary",
  "skill": "slow-build-trend",
  "format": "youtube-16x9",
  "duration": 7,
  "props": {
    "title": "Revenue by year",
    "unit": "USD",
    "locale": "en-US",
    "data": [
      { "label": "2022", "value": 27 },
      { "label": "2023", "value": 61 },
      { "label": "2024", "value": 130 }
    ],
    "highlight": "2024",
    "annotation": { "target": "2024", "text": "+113%" },
    "source": "Company annual reports"
  },
  "direction": {
    "camera": [{ "t": 0, "scale": 1.0 }, { "t": 0.8, "scale": 1.06 }],
    "reveal": "sequential",
    "holdAt": 0.7,
    "sfx": [{ "t": 0.68, "cue": "impact-soft" }]
  }
}
```
*(Numbers are illustrative.)*

### B. Example style pack tokens
```json
{
  "id": "money-documentary",
  "palette": {
    "background": "#0B1220", "surface": "#121B2E",
    "primary": "#E8EDF5", "accent": "#2FD27A",
    "negative": "#FF5A5F", "muted": "#6B7A93"
  },
  "typography": { "display": "Inter Tight", "numerals": "JetBrains Mono", "body": "Inter" },
  "easing": { "enter": [0.16, 1, 0.3, 1], "exit": [0.7, 0, 0.84, 0], "emphasis": [0.34, 1.2, 0.64, 1] },
  "durations": { "enter": 0.6, "exit": 0.4, "hold": 1.5 },
  "background": { "type": "gradient-grain", "grain": 0.04 },
  "camera": { "default": "slow-push" }
}
```

### C. Component contract checklist (every component must…)
- Have a zod props schema with sensible defaults
- Support all style-pack tokens (no hardcoded colours or fonts)
- Be responsive across all format presets (re-layout, not crop)
- Respect safe zones and minimum text sizes per format
- Expose skill hooks (reveal order, holds, emphasis targets, camera targets, SFX cue points)
- Render deterministically (same props → same frames)
- Include a preview story, property tests and a catalog entry with an example prompt

### D. Definition of "premium" (quality bar)
- Nothing moves without a reason; motion guides the eye to the message
- Clear hierarchy: one hero element per moment
- Holds long enough to read (rule of thumb: ~0.3s per word plus 1s)
- Easing feels physical (no linear motion, no cheap bounce unless intended)
- Consistent spacing grid and type scale
- Colour used for meaning (accent = emphasis), not decoration
- Sound supports motion subtly
- Looks intentional in every format, not cropped or squeezed
