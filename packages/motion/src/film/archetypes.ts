import type { BeatArchetype, Format, VideoStageMode } from '@motionpop/schemas';

export interface ArchetypeExample {
  html: string;
  css: string;
  script: string;
  keyMomentMs: number;
}

/**
 * Spatial safe-zone contract for every coupled video stage mode (spec 19 R2.1 / R3.3, extended
 * for multi-clip stages in spec 20 R2.3). Both the Director and Builders read this exact geometry
 * so graphics dance around the speaker and secondary B-roll/screen-recording/screenshot cleanly.
 */
export function videoStageZoneGuide(
  stage: VideoStageMode,
  format: Format,
  clipFocus?: { focusX?: number; focusY?: number; clipSummary?: string },
): string {
  const vertical = format === '9:16';
  const fxPct = Math.round((clipFocus?.focusX ?? 0.5) * 100);
  const fyPct = Math.round((clipFocus?.focusY ?? 0.45) * 100);
  const clipNote = clipFocus?.clipSummary ? ` Showing: "${clipFocus.clipSummary}".` : '';
  const universalRules =
    ' HARD VISUAL RULES: PREFER the Reel Kit (mp.stage, mp.card, mp.window, mp.odometer, mp.ring, mp.meter, mp.tile, mp.flowDots, mp.chart, mp.stamp, mp.strike, mp.chapter, mp.image, mp.card3d, mp.globe, mp.mesh3d). Primary visual MUST appear within 140ms (never blank at start). NEVER call mp.icon("user") stick figures. NEVER draw fake camera corner brackets [ ], viewport borders, oval/box PiP frames, or grey circles over faces. NEVER put low-contrast grey text directly over live video.';
  switch (stage) {
    case 'split-top-stage':
      return vertical
        ? `VIDEO STAGE = split-top-stage (EDITORIAL HERO SPLIT: speaker sits cleanly in the arched bottom 45% at top 55%..100%; live captions sit cleanly on the seam at top 46%..54%). Call mp.stage({ tone: "auto", region: "top-half" }) FIRST so your graphic owns a rich warm-cream / studio-light / luminous top stage (top: 0%..55%) with generous breathing room! Compose crisp elevated cards (mp.card), macOS windows (mp.window), real charts (mp.chart), glowing tiles (mp.tile), 3D props (mp.globe / mp.mesh3d / mp.card3d), or cutouts (mp.image) strictly inside top: 5%..45%, left: 6%..94%. NEVER place anything below top: 46%.${universalRules}`
        : `VIDEO STAGE = split-top-stage (speaker sits cleanly on the RIGHT 43%: x 54%..97%). Call mp.stage({ tone: "auto", region: "full" }) or build your elevated cards/windows/charts strictly inside the LEFT 50% (left: 4%..52%, top: 8%..82%). Never cover the right speaker.${universalRules}`;
    case 'top-card':
      return vertical
        ? `VIDEO STAGE = top-card (speaker fills 100% of the vertical frame; face occupies top 30%..76%; live captions sit at bottom 12%..21%). Leave the root transparent (NO mp.stage / NO mp.sheet). Place 1 or 2 crisp elevated floating dark-glass cards (mp.card({ x: "7%", y: "7%", w: "86%", h: "20%", variant: "dark-glass" })) or a bold odometer/meter/prompt card STRICTLY inside TOP 6%..29% above the speaker's head! Keep top 30%..100% 100% clear so the speaker's face is untouched.${universalRules}`
        : `VIDEO STAGE = top-card (speaker fills 100% of the frame). Leave root transparent and float ONE sleek dark-glass KPI/prompt/meter card cleanly in the top-right or top-left corner (top: 6%..28%, width: 34%..42%) without touching the speaker's face.${universalRules}`;
    case 'clean':
      return vertical
        ? `VIDEO STAGE = clean (BREATHING / HUMAN CONNECTION BEAT: speaker fills 100% of the frame with subtle punch-in zoom; live captions sit at bottom 12%..21%). Leave root transparent! Either render ONLY a minimal editorial lower-third chapter stamp via mp.chapter("part 01", "Topic", { y: "62%" }) OR a single quiet italic-serif floating highlight line cleanly at top: 9%..18% — ZERO cards, ZERO charts, ZERO clutter so the human speaker breathes.${universalRules}`
        : `VIDEO STAGE = clean (BREATHING BEAT: full-bleed speaker with smooth punch-in). Leave root transparent and show ONLY a minimal editorial chapter stamp (mp.chapter) or quiet top-corner kicker — zero clutter.${universalRules}`;
    case 'full':
      return vertical
        ? `VIDEO STAGE = full (speaker fills 100% of the vertical frame). Keep the speaker's face (top 18%..56%) AND the live caption band (top 73%..85%) completely clear! Place bold FRAMELESS floating typography, glass/matte callout pills, or animated SVG arrows strictly in the TOP band (top: 6%..18%) OR the LOWER-THIRD above captions (top: 58%..71%) backed by a soft dark scrim. NO opaque full-frame background.${universalRules}`
        : `VIDEO STAGE = full (speaker fills 100% of the frame). Keep the center-top face area AND bottom caption band (bottom 6%..18%) clear. Draw FRAMELESS kinetic typography, animated SVG callout arrows (mp.line), or crisp matte accent pills directly over the live video with strong dark scrim/shadow contrast. NO opaque full-frame background.${universalRules}`;
    case 'split-left':
      return vertical
        ? `VIDEO STAGE = split-left (speaker is framed in the TOP 44%: top 4%..46%; live captions sit on the center seam at top 46%..54%). Build your entire motion graphic cleanly inside the BOTTOM open studio canvas (top: 56%; left: 6%; width: 88%; height: 37%) — centered or balanced across the full width, NEVER shoved into one tiny corner, NEVER overlapping the top 54%.${universalRules}`
        : `VIDEO STAGE = split-left (speaker video smoothly slid into the LEFT 46%: x 0%..47%). Build your entire graphic cleanly inside the RIGHT 50% (left: 49%; width: 47%; top: 8%; height: 78%) above the bottom caption rail. Never paint an opaque sheet over the left 47%.${universalRules}`;
    case 'split-right':
      return vertical
        ? `VIDEO STAGE = split-right (speaker is framed in the BOTTOM 44%: top 54%..96%; live captions sit on the center seam at top 46%..54%). Build your motion graphic cleanly inside the TOP open studio canvas (top: 6%; left: 6%; width: 88%; height: 37%) — never cover the bottom 54%.${universalRules}`
        : `VIDEO STAGE = split-right (speaker video smoothly slid into the RIGHT 46%: x 53%..100%). Build your entire graphic cleanly inside the LEFT 50% (left: 4%; width: 47%; top: 8%; height: 78%) above the bottom caption rail. Never paint an opaque sheet over the right 47%.${universalRules}`;
    case 'pip':
      return vertical
        ? `VIDEO STAGE = pip (speaker is docked in a rounded PiP box at bottom-left: left 3%..36%, top 75%..96%; live captions sit cleanly at top 65%..74%). Build bold, full-width diagrams, comparison splits, or kinetic visuals strictly inside the UPPER studio canvas (top: 7%; left: 6%; width: 88%; height: 55%) so NOTHING collides with captions (65%..74%) or the bottom-left PiP (75%..96%).${universalRules}`
        : `VIDEO STAGE = pip (speaker is docked in a rounded PiP bubble at bottom-left: left 0%..28%, top 66%..100%; captions sit at bottom 7%..16%). Build big, expressive diagrams/charts/visuals across the upper/right studio canvas (top: 7%..76%) while keeping the bottom-left 29% × 35% corner completely empty.${universalRules}`;
    case 'backdrop':
      return vertical
        ? `VIDEO STAGE = backdrop (speaker video is softly dimmed and blurred full-frame behind you; live captions sit at top 71%..82%). Leave the root transparent (NO mp.sheet() opaque fill) so the atmospheric dimmed speaker glows through, and center bold high-contrast bright typography (#FFFFFF, var(--accent), var(--highlight)) cleanly in the upper-middle safe zone (top: 12%..64%) so nothing collides with captions.${universalRules}`
        : `VIDEO STAGE = backdrop (speaker video is softly dimmed and blurred full-frame behind you). Leave the root transparent (NO mp.sheet() opaque fill) so the atmospheric dimmed speaker glows through, and use high-contrast bright typography (#FFFFFF, var(--accent), var(--highlight)) centered cleanly above the bottom 20% caption zone.${universalRules}`;
    case 'cutaway':
      return vertical
        ? `VIDEO STAGE = cutaway (full-screen motion graphic beat — speaker is hidden behind your frame; live captions sit at top 71%..82%). Start with const sheet = mp.sheet(); so the look’s studio background cleanly covers the frame. Compose bold editorial visuals cleanly in top: 8%..65% (NEVER place headlines or text in top: 68%..84% where captions appear). Avoid empty wireframe boxes or crude stick-figure icons.${universalRules}`
        : `VIDEO STAGE = cutaway (full-screen motion graphic beat — speaker is hidden behind your frame). Start with const sheet = mp.sheet(); so the look’s studio background cleanly covers the frame and transitions with your seam. Keep headlines above the bottom 18% caption rail. Avoid empty wireframe boxes or crude stick-figure icons.${universalRules}`;
    case 'split-top-broll':
      return vertical
        ? `VIDEO STAGE = split-top-broll (user B-roll plays in the TOP 48%, speaker plays in the BOTTOM 44%).${clipNote} Leave root transparent (NO opaque sheet). Anchor a crisp frameless kinetic pill, badge, or bold headline cleanly along the middle seam (top: 46%..56%) or top-left edge so both B-roll and speaker shine unobstructed.`
        : `VIDEO STAGE = split-top-broll (speaker is on the LEFT 43%, user B-roll plays on the RIGHT 49%).${clipNote} Leave root transparent (NO opaque sheet). Place crisp floating kinetic callout badges, arrows, or a bold lower-third title over the bottom band without blocking faces or the B-roll subject.`;
    case 'screen-showcase':
      return vertical
        ? `VIDEO STAGE = screen-showcase (3D-tilted product screen recording occupies top 9%..65%, speaker sits in bottom-left PiP).${clipNote} Leave root transparent (NO opaque sheet). Draw a bold concise title in the lower-right safe area (left: 38%..94%, top: 68%..88%) and an animated curved mp.line arrow pointing toward the highlighted UI region around (${fxPct}%, ${Math.round(9 + fyPct * 0.56)}%).`
        : `VIDEO STAGE = screen-showcase (3D-tilted screen recording window occupies x 14%..94%, y 9%..87%, speaker sits in bottom-left PiP).${clipNote} Leave root transparent (NO opaque sheet). Place a clean floating HUD callout pill/badge near top-left or top-right and an animated mp.line arrow pointing toward the UI focal region around (${Math.round(14 + fxPct * 0.8)}%, ${Math.round(9 + fyPct * 0.78)}%).`;
    case 'broll-full':
      return `VIDEO STAGE = broll-full (full-bleed user B-roll plays across 100% of the frame over the voiceover).${clipNote} Leave root transparent (NO mp.sheet()). Use bold high-contrast frameless typography (#FFFFFF + crisp text-shadow or subtle bottom dark gradient scrim) and minimal vector accents so the B-roll footage feels cinematic.`;
    case 'media-card-pop':
      return vertical
        ? `VIDEO STAGE = media-card-pop (user screenshot/photo pops in a floating showcase card at top 12%..54% over softly dimmed speaker).${clipNote} Leave root transparent (NO opaque sheet). Place bold kinetic typography and callout arrows in the bottom band (top: 58%..84%) or pointing toward (${fxPct}%, ${Math.round(12 + fyPct * 0.42)}%) on the screenshot.`
        : `VIDEO STAGE = media-card-pop (speaker on LEFT 45%, user screenshot/photo pops in a showcase card on RIGHT 45% at x 51%..96%, y 14%..86%).${clipNote} Leave root transparent (NO opaque sheet). Draw a floating kicker/badge above the card (top: 4%..12%) or an animated mp.line callout arrow pointing at (${Math.round(51 + fxPct * 0.45)}%, ${Math.round(14 + fyPct * 0.72)}%).`;
  }
}

/**
 * Dynamic archetype few-shot library (spec 19 R2.1): 7 studio-grade, lint-clean `mp` kit examples.
 * Each parallel builder receives ONLY the example matching its beat's archetype so prompts stay
 * lean while visual variety and craft jump dramatically.
 */
export const ARCHETYPE_EXAMPLES: Readonly<Record<BeatArchetype, ArchetypeExample>> = {
  'kinetic-type': {
    html: '<div class="hero-wrap"><div class="kicker">THE REAL SHIFT</div><div class="headline">Speed beats <span class="serif-em">perfection</span></div></div>',
    css: [
      '.hero-wrap { position: absolute; left: 7%; right: 7%; top: 10%; z-index: 4; text-align: center; }',
      '.kicker { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.6); letter-spacing: 0.14em; color: var(--accent); text-transform: uppercase; }',
      '.headline { margin-top: calc(var(--u) * 1.4); font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 7.8); line-height: 1.04; letter-spacing: -0.025em; color: var(--ink); }',
      '.serif-em { font-family: var(--display); font-style: italic; font-weight: 600; color: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = mp.said("perfection") ? "perfection" : 220;',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const chap = mp.chapter("part 01", "the shift", { y: "34%" });',
      'tl.from(".kicker", { y: 14, opacity: 0 }, { at: 0, dur: 260, ease: "out" });',
      'tl.words(".headline", { style: "rise", at: 40 });',
      'const mark = mp.mark(root.querySelector(".serif-em"), "underline", { color: mp.colors.accent });',
      'tl.draw(mark, { on: land, dur: 400 });',
      'tl.from(chap, { y: 16, opacity: 0 }, { at: mp.at(land) + 220, dur: 360, ease: "outStrong" });',
      'mp.sfx("whoosh", 60);',
      'mp.sfx("impact", land);',
      'tl.to([".hero-wrap", chap], { y: -18, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 520,
  },

  'hero-stat': {
    html: '<div class="stat-body"><div class="kicker">FASTER TO SHIP</div><div class="big-num">0%</div></div>',
    css: [
      '.stat-body { display: flex; flex-direction: column; gap: calc(var(--u) * 1.4); }',
      '.kicker { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.4); letter-spacing: 0.14em; opacity: 0.72; }',
      '.big-num { font-family: var(--body); font-weight: 900; font-size: calc(var(--u) * 11); line-height: 0.96; color: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = mp.said("42") ? "42" : 200;',
      'const card = mp.card({ x: "7%", y: "7%", w: "86%", h: "21%", variant: "dark-glass", padding: "3%" });',
      'card.body.append(root.querySelector(".stat-body"));',
      'const odo = mp.odometer(root.querySelector(".big-num"), { from: 0, to: 42, prefix: "+", suffix: "%" });',
      'const bar = mp.meter({ parent: card.body, color: mp.colors.accent, marker: 0.5, markerLabel: "BASELINE" });',
      'tl.from(card.el, { y: -24, scale: 0.94, opacity: 0 }, { at: 0, dur: 340, ease: "outStrong" });',
      'tl.fn((p) => odo.set(p), { on: land, dur: 820, ease: "outQuart" });',
      'tl.fn((p) => bar.set(p * 0.84), { at: mp.at(land) + 120, dur: 760, ease: "outQuart" });',
      'mp.sfx("pop", land);',
      'tl.to(card.el, { y: -20, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 520,
  },

  'callout-hud': {
    html: '<div class="lines"><div class="ln l1">1. Analyze talking-head rhythm</div><div class="ln l2">2. Frame arched split stage</div><div class="ln l3">3. Ship studio visuals in 45s</div></div>',
    css: [
      '.lines { display: flex; flex-direction: column; gap: calc(var(--u) * 1.5); }',
      '.ln { font-family: var(--mono); font-size: calc(var(--u) * 2.6); font-weight: 600; padding: calc(var(--u) * 0.8) calc(var(--u) * 1.4); border-radius: calc(var(--u) * 0.9); }',
      '.l3 { background: rgba(223,107,65,0.16); color: var(--accent); font-weight: 700; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 340;',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const rig = mp.card3d({ x: "7%", y: "7%", w: "86%", h: "36%", rotateX: 5, rotateY: -9 });',
      'const win = mp.window({ parent: rig.body, kind: "doc", title: "workflow.md", badge: "LIVE", x: 0, y: 0, w: "100%", h: "100%" });',
      'win.body.append(root.querySelector(".lines"));',
      'tl.from(rig.el, { y: 22, opacity: 0 }, { at: 0, dur: 340, ease: "outStrong" });',
      'tl.fn((p) => rig.setTilt(5 - p * 3, -9 + p * 14, 1), { at: 80, dur: Math.max(800, ctx.durationMs - 400), ease: "inOut" });',
      'tl.from([".l1", ".l2", ".l3"], { y: 12, opacity: 0 }, { at: 120, each: 180, dur: 320, ease: "out" });',
      'mp.sfx("pop", land);',
      'tl.to(rig.el, { y: -18, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 420,
  },

  'data-chart': {
    html: '<div class="chart-eyebrow">QUARTERLY TRAJECTORY</div>',
    css: '.chart-eyebrow { position: absolute; left: 6%; top: 3%; z-index: 4; font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.4); letter-spacing: 0.14em; color: var(--muted); }',
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 480;',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const chart = mp.chart({ type: "bar", title: "Velocity by Quarter", x: "6%", y: "8%", w: "88%", h: "36%", points: [{ label: "Q1", y: 24 }, { label: "Q2", y: 42 }, { label: "Q3", y: 68 }, { label: "Q4", y: 96, highlight: true }] });',
      'const badge = mp.stamp("4X PEAK", { x: "72%", y: "16%", color: mp.colors.accent, angle: -7 });',
      'tl.from(".chart-eyebrow", { y: 10, opacity: 0 }, { at: 0, dur: 240, ease: "out" });',
      'tl.from(chart.el, { y: 20, opacity: 0 }, { at: 0, dur: 320, ease: "outStrong" });',
      'tl.fn((p) => chart.set(p), { at: 120, dur: 880, ease: "outQuart" });',
      'tl.from(badge, { scale: 1.5, opacity: 0 }, { at: Math.max(460, land), dur: 280, ease: "back" });',
      'mp.sfx("rise", 140);',
      'mp.sfx("impact", Math.max(460, land));',
      'tl.to([".chart-eyebrow", chart.el, badge], { y: -16, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 560,
  },

  'diagram-flow': {
    html: '<div class="flow-heading">How it <span class="em">connects</span></div>',
    css: [
      '.flow-heading { position: absolute; left: 6%; right: 6%; top: 6%; z-index: 4; text-align: center; font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 5.4); color: var(--ink); }',
      '.flow-heading .em { font-family: var(--display); font-style: italic; font-weight: 600; color: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const t1 = mp.tile({ x: "10%", y: "18%", size: "18%", label: "Capture", icon: "mic" });',
      'const t2 = mp.tile({ x: "41%", y: "18%", size: "18%", label: "Direct", icon: "sparkles", color: mp.colors.accent2 });',
      'const t3 = mp.tile({ x: "72%", y: "18%", size: "18%", label: "Ship", icon: "rocket" });',
      'const f1 = mp.flowDots([mp.W * 0.28, mp.H * 0.25], [mp.W * 0.41, mp.H * 0.25], { count: 4 });',
      'const f2 = mp.flowDots([mp.W * 0.59, mp.H * 0.25], [mp.W * 0.72, mp.H * 0.25], { count: 4 });',
      'tl.words(".flow-heading", { style: "rise", at: 0 });',
      'tl.from(t1, { y: 24, scale: 0.88, opacity: 0 }, { at: 40, dur: 340, ease: "outStrong" });',
      'tl.fn((p) => f1.set(p), { at: 200, dur: 900, ease: "linear" });',
      'tl.from(t2, { y: 24, scale: 0.88, opacity: 0 }, { at: 260, dur: 360, ease: "back" });',
      'tl.fn((p) => f2.set(p), { at: 480, dur: 900, ease: "linear" });',
      'tl.from(t3, { y: 24, scale: 0.88, opacity: 0 }, { at: 540, dur: 380, ease: "back" });',
      'mp.sfx("pop", 260);',
      'mp.sfx("impact", 540);',
      'tl.to([".flow-heading", t1, t2, t3, f1.el, f2.el], { y: -18, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 560,
  },

  'comparison-split': {
    html: '<div class="old-copy"><div class="tag">OLD WAY</div><div class="val">6 hrs</div><div class="desc">Manual cuts</div></div><div class="new-copy"><div class="tag">NEW WAY</div><div class="val new-val">0 sec</div><div class="desc">Auto directed</div></div>',
    css: [
      '.old-copy, .new-copy { display: flex; flex-direction: column; justify-content: center; height: 100%; gap: calc(var(--u) * 1.2); }',
      '.tag { font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.4); letter-spacing: 0.14em; opacity: 0.72; }',
      '.val { font-family: var(--body); font-weight: 900; font-size: calc(var(--u) * 9.6); line-height: 0.96; }',
      '.desc { font-family: var(--body); font-weight: 600; font-size: calc(var(--u) * 3.1); opacity: 0.85; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 520;',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const left = mp.card({ x: "6%", y: "8%", w: "42%", h: "34%", variant: "auto" });',
      'const right = mp.card({ x: "52%", y: "8%", w: "42%", h: "34%", variant: "accent-glow" });',
      'left.body.append(root.querySelector(".old-copy"));',
      'right.body.append(root.querySelector(".new-copy"));',
      'const slash = mp.strike(left.el, { color: mp.colors.negative });',
      'const odo = mp.odometer(root.querySelector(".new-val"), { from: 0, to: 45, suffix: " sec" });',
      'tl.from(left.el, { x: -30, opacity: 0 }, { at: 0, dur: 340, ease: "outStrong" });',
      'tl.fn((p) => slash.set(p), { at: Math.max(260, land - 160), dur: 320, ease: "outQuart" });',
      'tl.from(right.el, { x: 30, scale: 0.92, opacity: 0 }, { at: land, dur: 420, ease: "back" });',
      'tl.fn((p) => odo.set(p), { at: land + 80, dur: 650, ease: "outQuart" });',
      'mp.sfx("whoosh", 60);',
      'mp.sfx("impact", land);',
      'tl.to([left.el, right.el], { y: -18, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 520,
  },

  'map-story': {
    html: '<div class="globe-tag">GLOBAL REACH</div>',
    css: [
      '.globe-tag { position: absolute; left: 6%; top: 6%; z-index: 5; padding: calc(var(--u) * 1.1) calc(var(--u) * 2.2); border-radius: 999px; background: var(--ink); color: var(--bg); font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.6); letter-spacing: 0.12em; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'mp.stage({ tone: "auto", region: "top-half" });',
      'const globe = mp.globe({ x: "23%", y: "9%", size: "54%", lon: -24, lat: 22 });',
      'tl.from(".globe-tag", { y: -16, opacity: 0 }, { at: 0, dur: 280, ease: "outStrong" });',
      'tl.from(globe.el, { scale: 0.84, opacity: 0 }, { at: 40, dur: 420, ease: "back" });',
      'tl.fn((p) => globe.set(-24 + p * 54, 22, 1), { at: 80, dur: Math.max(900, ctx.durationMs - 280), ease: "linear" });',
      'mp.sfx("whoosh", 80);',
      'tl.to([".globe-tag", globe.el], { y: -18, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 540,
  },
};

/** Picks the best archetype reference example for a beat (dynamic few-shot injection, spec 19). */
export function archetypeExample(
  archetype?: BeatArchetype,
  lead?: string,
): ArchetypeExample {
  if (archetype && Object.hasOwn(ARCHETYPE_EXAMPLES, archetype)) {
    return ARCHETYPE_EXAMPLES[archetype];
  }
  if (lead === 'map') return ARCHETYPE_EXAMPLES['map-story'];
  if (lead === 'number') return ARCHETYPE_EXAMPLES['hero-stat'];
  if (lead === 'type') return ARCHETYPE_EXAMPLES['kinetic-type'];
  return ARCHETYPE_EXAMPLES['diagram-flow'];
}
