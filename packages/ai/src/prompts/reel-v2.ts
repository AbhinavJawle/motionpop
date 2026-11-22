import { FORMATS, type Format } from '@motionpop/schemas';

/**
 * Talking-Head Reel Engine v2 prompts (spec 24 R1 & R3).
 * Cleanly separated from the legacy Vox-style faceless documentary prompts:
 * zero recurring clipart props, zero torn-paper rules, zero contradictory banned lists.
 */
export const REEL_DIRECT_SYSTEM_V2 = `You are the creative director of a viral, agency-grade short-form talking-head Reel (9:16 / 16:9).
You read the timestamped transcript, look at the speaker keyframes (and any Media Bin clips), and write ONE crisp, cohesive visual plan.
Answer with JSON only, matching the schema.

CORE PHILOSOPHY (WHAT MAKES PRO REELS WORK)
1. ONE COHESIVE VISUAL SYSTEM — NOT A CIRCUS:
   - Never jump randomly between 6 different framing styles. Pick ONE dominant visual grammar matched to the reel's tone and hold it cleanly so the video feels designed by a studio.
   - ZERO cartoon SVG props: ALWAYS return "props": []. Never draw cartoon hand-mirrors, stick figures, lightbulbs, or literal cartoon puns on metaphors (hearing "world" does NOT mean draw a cartoon globe; hearing "mirror" does NOT mean draw a clipart mirror).
2. TONE-CALIBRATED GRAMMAR (set top-level "tone"):
   - "tech-explainer" | "listicle" | "hot-take":
     * Primary stage (60–75% of beats): "split-top-stage" — razor-sharp 50/50 split where crisp Swiss/studio motion-UI graphics own the top 50% grid canvas, the speaker is face-centered in the bottom 50%, and captions lock cleanly on the center seam. Holding "split-top-stage" for 3–6 consecutive beats is ENCOURAGED so visual continuity feels effortless!
     * Media stages: Whenever Media Bin clips (screen recordings, screenshots, B-roll) match a beat, use "split-top-broll", "screen-showcase", or "media-card-pop" with its exact clipId! You may also set "brollQuery" (2–4 concrete photo/video search terms) on 1–2 beats paired with "split-top-broll" or "broll-full".
     * Accent stages: Use "clean" (pure unobstructed human speaker with punch-in — set text: [] for breathing beats, or 1–2 words for a lower-chest CTA card like "COMMENT / ANIMATE") on 15–25% of beats, and "top-card" (one compact high-contrast card strictly above the speaker's head) on 10–15%.
     * "cutaway": MAX 1 in the whole reel (only for a dense full-screen checklist or hero showcase), NEVER two in a row.
     * Pacing: Crisp, tight clause-synced beats (1.5 to 4.5 seconds each) so visuals progress rapidly with every point.
   - "personal-story" (emotional, reflective, motivational, or intimate monologue):
     * Primary stage (55–70% of beats): "clean" — pure unobstructed full-bleed speaker with smooth punch-in zooms so the human connection leads! Set text: [] on pure breathing beats so ZERO graphic clutter appears.
     * Accent stages: Use "top-card" (15–25%, one restrained compact editorial card strictly above the head), "split-top-stage" (at most 2–3 key contrast/takeaway beats with refined editorial typography), or 1–2 atmospheric "split-top-broll" / "broll-full" beats via "brollQuery".
     * NEVER force sterile tech dashboards, empty white boxes, or cartoon clipart onto emotional human speech. Max 0–1 "cutaway".
3. FACE FRAMING (CRITICAL):
   - Inspect the attached speaker keyframes and output exact normalized focusX (usually 0.5) and focusY centered right between the speaker's eyes (typically 0.25 to 0.42 — NEVER above 0.50).
4. BEAT COVERAGE & COPY:
   - Beats tile every word from word 0 to the last word with no gaps or overlaps. Beat duration: 1.4s to 7s (tighter 1.5s–4.5s for tech explainers).
   - Beat 1 MUST open with the speaker visible ("split-top-stage", "top-card", or "clean") and land a scroll-stopping visual/hook within 500ms.
   - "text": exact short on-screen strings (hero first, optional quiet label; <= 14 words total; [] on pure "clean" breathing beats). Every figure on screen must come strictly from the spoken words.
   - "idea": concrete visual design instruction for the builder — specify exact UI/diagram structure (e.g., "Swiss 4-row timing inspector with animated playhead bar and bezier curve", "3-item stacked icon checklist", "side-by-side Original vs Copy wireframe with checkmarks", "macOS code window highlighting 3 lines", "compact dark top pill with 100% stat", or "pure unobstructed speaker breathing beat").
   - "imageSubject" + "imageKeyed: true": use sparingly (0–1 beat max) ONLY when a realistic studio-lit physical object photo genuinely elevates a beat.
   - "seam": keep "push" or "match" clean and subtle; avoid jarring full-page wipes.`;

export interface ReelDirectPromptInput {
  words: { text: string; startMs: number }[];
  durationMs: number;
  format: Format;
  look: { name: string; description: string };
  frameTimesMs?: number[];
  mediaBin?: readonly {
    id: string;
    name: string;
    kind: string;
    durationMs?: number;
    summary: string;
    tags?: readonly string[];
    moments?: readonly {
      startMs: number;
      endMs: number;
      focusX: number;
      focusY: number;
      zoom: number;
      description: string;
    }[];
  }[];
  stressedWords?: readonly number[];
  note?: string;
}

export function reelDirectPromptV2(i: ReelDirectPromptInput): string {
  const spoken = i.words.map((w, k) => `${k}:${w.text}@${(w.startMs / 1000).toFixed(1)}`).join(' ');
  const dims = FORMATS[i.format];
  const hasMedia = Boolean(i.mediaBin && i.mediaBin.length > 0);
  const lines = [
    `Narration (index:word@seconds), ${i.words.length} words, ${(i.durationMs / 1000).toFixed(1)} s:`,
    spoken,
    '',
    `Format: ${i.format} (${dims.width}×${dims.height}) · Look: ${i.look.name} (${i.look.description})`,
    `Mode: TALKING-HEAD REEL ENGINE v2.${
      i.frameTimesMs?.length
        ? ` Speaker keyframes attached at: ${i.frameTimesMs.map((t) => `${(t / 1000).toFixed(1)}s`).join(', ')}. Measure exact eye/face position for focusX/focusY.`
        : ''
    }`,
    'Return props: []. Pick one clear top-level tone and hold a disciplined visual system across the reel.',
  ];
  if (i.stressedWords?.length) {
    lines.push(
      `Vocal stress peaks (prefer landing reveals on these word indices): ${i.stressedWords
        .slice(0, 24)
        .map((idx) => `${idx}:${i.words[idx]?.text ?? ''}`)
        .join(', ')}`,
    );
  }
  if (hasMedia && i.mediaBin) {
    lines.push(
      '',
      `MEDIA BIN (${i.mediaBin.length} uploaded ${i.mediaBin.length === 1 ? 'clip' : 'clips'} — weave these into matching beats first!):`,
    );
    for (const c of i.mediaBin) {
      const dur = c.durationMs ? `${(c.durationMs / 1000).toFixed(1)}s` : 'still';
      const tags = c.tags?.length ? ` [${c.tags.join(', ')}]` : '';
      const moments = c.moments?.length
        ? ` · moments: ${c.moments
            .slice(0, 3)
            .map(
              (m) =>
                `[${m.startMs}..${m.endMs}ms focus=(${m.focusX},${m.focusY}) zoom=${m.zoom}: ${m.description}]`,
            )
            .join('; ')}`
        : '';
      lines.push(`- id="${c.id}" (${c.kind}, ${dur}): ${c.summary}${tags}${moments}`);
    }
  }
  if (i.note) lines.push(`Creator note: ${i.note}`);
  lines.push('', 'Write the Reel storyboard JSON.');
  return lines.join('\n');
}

/**
 * Clean, zero-contradiction Reel v2 Builder system prompt (spec 24 R3.2).
 * Teaches real HTML/CSS Flexbox/Grid + crisp geometric SVG + deterministic `mp.timeline()`.
 */
export function reelBuildSystemV2(kitDoc: string): string {
  return `You are a senior motion graphics engineer building ONE beat of a studio-grade talking-head Reel in deterministic HTML, CSS, and JavaScript.
Answer with JSON only: { "title", "html", "css", "script", "keyMomentMs" }.

THE EXECUTION CONTRACT
- html: clean semantic HTML + crisp inline <svg> inside a container root (position:absolute; inset:0). No <script>, <style>, <iframe>, <link>, <img>, inline handlers, or external URLs.
- css: plain CSS rules (scoped automatically). No @-rules, no CSS animation/transition, no url().
  Use modern Flexbox & CSS Grid freely! Size typography and spacing with calc(var(--u) * N), where --u is 1% of the full frame's short side (e.g. 10.8px on 1080×1920).
  Design tokens available: var(--bg), var(--ink), var(--muted), var(--accent), var(--accent2), var(--highlight), var(--positive), var(--negative), var(--display), var(--body), var(--mono).
  Never hide animated elements in CSS — tl.from() automatically sets their start state.
- script: body of a function called once with (root, ctx, mp). Declares every animation on ONE deterministic timeline and ends with: return tl;
  ctx = { width, height, format, durationMs, keyMomentMs, tailMs, headMs, seed, colors, fonts, words: [{ text, startMs, endMs }] }.
  No Date, performance, Math.random, timers, rAF, fetch, window, document, GSAP, or external libraries.

STAGE CLIPPING & SURFACE RULES (CRITICAL — READ CAREFULLY)
- On "split-top-stage": Your root container IS PHYSICALLY CLIPPED to the exact top 50% (9:16) or left 52% (16:9) studio box (mp.W × mp.H), and the crisp subtle-grid studio surface is ALREADY painted behind you.
  * NEVER call mp.stage() or mp.sheet()!
  * Fill 100% × 100% of your root cleanly with Flexbox/Grid (padding: calc(var(--u) * 5) calc(var(--u) * 6) calc(var(--u) * 7)).
  * Use high-contrast var(--ink) text on the light/grid canvas (NEVER light grey or white text on a light background!).
- On "top-card": Your root container IS PHYSICALLY CLIPPED to the exact top 28% band above the speaker's head over live footage.
  * Leave root background transparent (NEVER call mp.stage() or mp.sheet()).
  * Center ONE compact, crisp, high-contrast card (dark glass rgba(10,10,14,0.92) + #FFFFFF text, OR pure #FFFFFF + #0A0A0E ink with crisp shadow).
- On "clean" | "full" | "broll-full" | "split-top-broll" | "screen-showcase" | "media-card-pop":
  * Leave root transparent (NEVER call mp.stage() or mp.sheet()).
  * Look at the attached speaker keyframe! Keep the speaker's face (top 22%..56%) AND bottom caption zone (bottom 10%..20%) 100% unobstructed.
  * For a CTA or callout card over full-bleed speaker, dock it cleanly in the lower chest (top 62%..78%) with crisp #FFFFFF or #0A0A0E solid backing.
- On "cutaway": Full-screen studio grid surface is ALREADY painted behind you. Keep all content inside top 6%..80% (above bottom captions) with crisp var(--ink) contrast.

AGENCY CRAFT STANDARDS (SWISS / STUDIO MOTION-UI)
1. REAL VISUAL MECHANICS, ZERO CLIPART:
   - Build clean Swiss/Linear/Apple-grade UI micro-diagrams directly in HTML/CSS + sharp 2px geometric SVGs: property/timing inspectors with animated playhead sliders & bezier curves, stacked icon checklists, side-by-side Original vs Copy wireframes with animated checkmarks, crisp macOS code/terminal/doc windows, clean data bars/charts, or razor-sharp editorial typography.
   - NEVER leave ANY card, rectangle, or frame empty! Every visible box must hold crisp real text, UI rows, or meaningful vector geometry.
   - NEVER draw cartoon objects, stick figures, fake viewfinder brackets [ ], viewport borders, or random floating circles.
2. INSTANT READABILITY & SNAPPY MOTION:
   - Primary visual/container MUST be visible within 140 ms (start at: 0, dur: 240–340 ms, ease: "outStrong").
   - Sync reveals tightly to spoken words (mp.at("word") or crisp 140–240 ms staggers).
   - Once landed, text stays rock-still (no wobbling/pulsing). Keep elements crisp and legible (at least calc(var(--u) * 2.5) for labels, calc(var(--u) * 5.6) for headlines).
   - Add 2–3 crisp micro-SFX synced to reveals: mp.sfx("tick" | "pop" | "impact", atMs).
   - Only use figures/copy present in the beat's exact on-screen text or spoken narration. Never invent statistics.

TIMELINE & OPTIONAL KIT REFERENCE (use mp.timeline() + clean HTML/CSS/SVG; reach for optional helpers only when they truly fit)
${kitDoc}`;
}

export interface ReelBuildPromptInput {
  film: { title: string; thesis: string; world: string; tone?: string };
  beat: {
    index: number;
    count: number;
    lead: string;
    archetype?: string;
    videoStage?: string;
    stageGuide?: string;
    stageWidth?: number;
    stageHeight?: number;
    idea: string;
    text: string[];
    staging: string;
    landsOn: string;
    keyMomentMs: number;
    imageAsset?: { id: string; subject: string; keyed: boolean };
  };
  words: { text: string; startMs: number }[];
  durationMs: number;
  tailMs: number;
  headMs: number;
  seamIn: { kind: string; note: string; from: string } | null;
  seamOut: { kind: string; note: string; to: string } | null;
  beats: { lead: string; videoStage?: string; idea: string; text: string[]; landsOn: string }[];
  format: string;
  look: { name: string; description: string };
  beatExample?: { html: string; css: string; script: string };
  fix?: { html: string; css: string; script: string; problems: string };
}

export function reelBuildPromptV2(i: ReelBuildPromptInput): string {
  const spoken = i.words.map((w, k) => `${k}:${w.text}@${w.startMs}`).join(' ');
  const shared = [
    `REEL: "${i.film.title}" (${i.film.tone ?? 'tech-explainer'}). ${i.film.thesis}`,
    `Visual system: ${i.film.world}`,
    `Format: ${i.format} · Look: ${i.look.name} (${i.look.description})`,
    '',
    `FULL REEL OUTLINE (${i.beats.length} beats):`,
    ...i.beats.map(
      (b, k) =>
        `${k + 1}. [${b.videoStage ?? 'split-top-stage'}] ${b.idea} · text: ${b.text.length ? b.text.map((t) => `"${t}"`).join(' / ') : '(none)'}`,
    ),
  ].join('\n');

  const stageDims =
    i.beat.stageWidth && i.beat.stageHeight
      ? `Your clipped root container size: ${i.beat.stageWidth} × ${i.beat.stageHeight} px (100% × 100% fills this exact zone).`
      : '';

  const beatLines = [
    `YOUR BEAT: ${i.beat.index + 1} of ${i.beat.count} · stage="${i.beat.videoStage ?? 'split-top-stage'}" · archetype="${i.beat.archetype ?? 'callout-hud'}"`,
    ...(stageDims ? [stageDims] : []),
    ...(i.beat.stageGuide ? [i.beat.stageGuide] : []),
    ...(i.beat.imageAsset
      ? [
          `ATTACHED PHOTO/CUTOUT ASSET: Call mp.image("${i.beat.imageAsset.id}", { x, y, w, h, shadow: true }) to display "${i.beat.imageAsset.subject}" cleanly inside your layout.`,
        ]
      : []),
    `Visual concept: ${i.beat.idea}`,
    `On-screen text (exact): ${i.beat.text.length ? i.beat.text.map((t) => `"${t}"`).join(' / ') : '(none — keep minimal)'}`,
    `Staging: ${i.beat.staging}`,
    `Hero lands on "${i.beat.landsOn}" at ${i.beat.keyMomentMs} ms · Duration: ${i.durationMs} ms`,
    `Spoken words (index:word@ms): ${spoken}`,
  ];

  if (i.beatExample) {
    beatLines.push(
      '',
      'Stage-matched reference craft (match this level of Swiss/studio cleanliness & layout balance; NEVER copy its topic/wording):',
      `html:\n${i.beatExample.html}`,
      `css:\n${i.beatExample.css}`,
      `script:\n${i.beatExample.script}`,
    );
  }

  if (i.fix) {
    beatLines.push(
      '',
      'REPAIR PASS — A reviewer inspected your rendered beat and found concrete defects. Fix EVERY issue cleanly and return the full updated JSON:',
      `Problems:\n${i.fix.problems}`,
      `Previous html:\n${i.fix.html}`,
      `Previous css:\n${i.fix.css}`,
      `Previous script:\n${i.fix.script}`,
    );
  }

  return `${shared}\n\n===== THIS BEAT =====\n${beatLines.join('\n')}`;
}
