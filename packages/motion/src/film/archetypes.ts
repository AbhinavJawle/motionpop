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
  switch (stage) {
    case 'full':
      return vertical
        ? 'VIDEO STAGE = full (speaker fills 100% of the vertical frame). Keep the middle face zone (top 18%..56%) clear. Draw FRAMELESS floating typography, animated SVG arrows/underlines, or crisp bottom/top callouts directly over the video. NO opaque full-frame background, NO boxed modal card. Use bold light text (#FFFFFF or var(--paper)) with crisp text-shadow or subtle dark gradient scrim behind text so it pops over live footage.'
        : 'VIDEO STAGE = full (speaker fills 100% of the frame). Keep the center-top face area clear. Draw FRAMELESS kinetic typography, animated SVG callout arrows (mp.line), glowing accent pills, or lower-third/side highlights directly over the live video. NO opaque full-frame background and NO boxed card frame. Use crisp text-shadow or subtle soft dark gradient scrim behind text so every word reads effortlessly over footage.';
    case 'split-left':
      return vertical
        ? 'VIDEO STAGE = split-left (speaker is framed in the TOP 44% of the vertical frame). Build your motion graphic cleanly inside the BOTTOM 50% (top: 48%; left: 5%; width: 90%; height: 46%) on the open studio canvas — no full-screen sheet covering the top video.'
        : 'VIDEO STAGE = split-left (speaker video smoothly slid into the LEFT 46%: x 0%..47%). Build your entire graphic cleanly inside the RIGHT 50% (left: 49%; width: 47%; top: 8%; height: 84%) on the open look canvas. Never paint an opaque sheet over the left 47% where the speaker lives.';
    case 'split-right':
      return vertical
        ? 'VIDEO STAGE = split-right (speaker is framed in the BOTTOM 44% of the vertical frame). Build your motion graphic cleanly inside the TOP 48% (top: 5%; left: 5%; width: 90%; height: 45%) on the open studio canvas — never cover the bottom video.'
        : 'VIDEO STAGE = split-right (speaker video smoothly slid into the RIGHT 46%: x 53%..100%). Build your entire graphic cleanly inside the LEFT 50% (left: 4%; width: 47%; top: 8%; height: 84%) on the open look canvas. Never paint an opaque sheet over the right 47% where the speaker lives.';
    case 'pip':
      return 'VIDEO STAGE = pip (speaker is docked in a small rounded PiP bubble at bottom-left: left 0%..29%, top 64%..100%). Your graphic owns the full studio canvas — build big, expressive diagrams/charts/visuals across the frame while keeping the bottom-left 29% × 35% corner unobstructed.';
    case 'backdrop':
      return 'VIDEO STAGE = backdrop (speaker video is softly dimmed and blurred full-frame behind you). Leave the root transparent (NO mp.sheet() opaque fill) so the atmospheric dimmed speaker glows through, and use high-contrast bright typography (#FFFFFF, var(--paper), var(--accent), var(--highlight)) and crisp vector visuals centered boldly in the frame.';
    case 'cutaway':
      return 'VIDEO STAGE = cutaway (full-screen motion graphic beat — speaker is hidden behind your frame). Start with const sheet = mp.sheet(); so the look’s studio background cleanly covers the frame and transitions with your seam.';
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
    html: '<div class="scrim"></div><div class="stage"><div class="eyebrow">THE REAL SHIFT</div><div class="headline">Speed beats <span class="pop">perfection</span></div><div class="rule"></div></div>',
    css: [
      '.scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 52%; background: linear-gradient(180deg, rgba(10,10,14,0) 0%, rgba(10,10,14,0.78) 100%); }',
      '.stage { position: absolute; left: 7%; right: 7%; bottom: 11%; }',
      '.eyebrow { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.8); letter-spacing: 0.14em; color: var(--accent); text-transform: uppercase; text-shadow: 0 2px 14px rgba(0,0,0,0.55); }',
      '.headline { margin-top: calc(var(--u) * 1.4); font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 9.5); line-height: 1.02; color: #FFFFFF; text-shadow: 0 6px 28px rgba(0,0,0,0.55); }',
      '.pop { position: relative; color: var(--highlight); }',
      '.rule { margin-top: calc(var(--u) * 2.2); height: calc(var(--u) * 0.7); width: 42%; border-radius: 999px; background: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = mp.said("perfection") ? "perfection" : 220;',
      'tl.from(".scrim", { opacity: 0 }, { at: 0, dur: 280, ease: "out" });',
      'tl.from(".eyebrow", { y: 18, opacity: 0 }, { at: 60, dur: 320, ease: "outStrong" });',
      'tl.words(".headline", { style: "slam", at: 120 });',
      'const mark = mp.mark(root.querySelector(".pop"), "underline", { color: mp.colors.accent });',
      'tl.draw(mark, { on: land, dur: 420 });',
      'tl.from(".rule", { scaleX: 0 }, { on: land, dur: 460, origin: "left center", ease: "outQuart" });',
      'mp.sfx("whoosh", 120);',
      'mp.sfx("impact", land);',
      'tl.to([".stage", ".scrim"], { y: 24, opacity: 0 }, { at: ctx.durationMs - 260, dur: 260, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 550,
  },

  'hero-stat': {
    html: '<div class="zone"><div class="kicker">QUARTERLY GROWTH</div><div class="stat"><span class="num">0</span><span class="unit">%</span></div><div class="caption">Faster <span class="hi">from idea to ship</span></div><div class="meter"><div class="fill"></div></div></div>',
    css: [
      '.zone { position: absolute; left: 50%; top: 14%; width: 44%; }',
      '.kicker { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.8); letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }',
      '.stat { display: flex; align-items: baseline; gap: calc(var(--u) * 1.2); margin-top: calc(var(--u) * 1.8); }',
      '.num { font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 20); line-height: 0.92; color: var(--accent); }',
      '.unit { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 10); color: var(--ink); }',
      '.caption { margin-top: calc(var(--u) * 2.6); font-family: var(--body); font-weight: 700; font-size: calc(var(--u) * 4.4); line-height: 1.18; color: var(--ink); }',
      '.meter { margin-top: calc(var(--u) * 3.2); height: calc(var(--u) * 1.8); width: 100%; border-radius: 999px; background: rgba(128,128,128,0.22); overflow: hidden; }',
      '.fill { height: 100%; width: 78%; border-radius: 999px; background: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = mp.said("42") ? "42" : 260;',
      'const dots = mp.dots(42, { x: "50%", y: "68%", w: "44%", h: "20%", layout: "grid", color: mp.colors.accent2 });',
      'tl.from(".kicker", { y: 20, opacity: 0 }, { at: 40, dur: 300, ease: "out" });',
      'tl.from(".stat", { y: 48, scale: 0.86, opacity: 0, blur: 8 }, { on: land, dur: 460, ease: "back" });',
      'tl.count(".num", { to: 42, decimals: 0, on: land, dur: 900 });',
      'tl.from(".fill", { scaleX: 0 }, { at: mp.at(land), dur: 820, origin: "left center", ease: "outQuart" });',
      'tl.from(dots, { scale: 0, opacity: 0 }, { at: mp.at(land) + 120, each: 12, dur: 220, ease: "back" });',
      'tl.words(".caption", { style: "rise", at: mp.at(land) + 320 });',
      'const hl = mp.mark(root.querySelector(".hi"), "highlight", { color: mp.colors.highlight });',
      'tl.draw(hl, { at: mp.at(land) + 750, dur: 360 });',
      'mp.sfx("pop", land);',
      'tl.to([".zone", dots], { x: mp.W * 0.08, opacity: 0 }, { at: ctx.durationMs - 260, dur: 260, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 500,
  },

  'callout-hud': {
    html: '<div class="pill"><span class="dot"></span><span class="tag">LIVE INSIGHT</span></div><div class="callout"><div class="big">3x Faster</div><div class="sub">Zero manual keyframes</div></div>',
    css: [
      '.pill { position: absolute; right: 6%; top: 10%; display: flex; align-items: center; gap: calc(var(--u) * 1.4); padding: calc(var(--u) * 1.2) calc(var(--u) * 2.4); border-radius: 999px; background: rgba(14,14,20,0.82); border: 2px solid var(--accent); }',
      '.dot { width: calc(var(--u) * 1.6); height: calc(var(--u) * 1.6); border-radius: 50%; background: var(--accent); }',
      '.tag { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.6); letter-spacing: 0.1em; color: #FFFFFF; }',
      '.callout { position: absolute; right: 6%; top: 24%; max-width: 36%; text-align: right; }',
      '.big { font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 8.6); line-height: 1; color: #FFFFFF; text-shadow: 0 6px 26px rgba(0,0,0,0.65); }',
      '.sub { margin-top: calc(var(--u) * 1.4); font-family: var(--body); font-weight: 600; font-size: calc(var(--u) * 3.4); color: var(--highlight); text-shadow: 0 3px 16px rgba(0,0,0,0.65); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 400;',
      'const arrow = mp.line([[mp.W * 0.72, mp.H * 0.44], [mp.W * 0.61, mp.H * 0.49], [mp.W * 0.54, mp.H * 0.42]], { color: mp.colors.accent, width: mp.u * 0.8, arrow: true, curve: true });',
      'tl.from(".pill", { x: 48, opacity: 0 }, { at: 80, dur: 340, ease: "back" });',
      'tl.from(".big", { y: 36, opacity: 0, blur: 6 }, { at: Math.max(120, land - 120), dur: 420, ease: "outStrong" });',
      'tl.from(".sub", { y: 18, opacity: 0 }, { at: land + 160, dur: 340, ease: "out" });',
      'tl.draw(arrow, { at: land + 220, dur: 480 });',
      'mp.sfx("pop", land);',
      'tl.to([".pill", ".callout", arrow], { x: 40, opacity: 0 }, { at: ctx.durationMs - 240, dur: 240, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 420,
  },

  'data-chart': {
    html: '<div class="panel"><div class="title">Revenue Trajectory</div><svg class="chart" viewBox="0 0 640 360"><line class="axis" x1="40" y1="300" x2="600" y2="300"/><rect class="bar b1" x="80" y="210" width="90" height="90" rx="12"/><rect class="bar b2" x="210" y="160" width="90" height="140" rx="12"/><rect class="bar b3" x="340" y="105" width="90" height="195" rx="12"/><rect class="bar peak" x="470" y="40" width="90" height="260" rx="12"/></svg><div class="labels"><span>Q1</span><span>Q2</span><span>Q3</span><span class="hi">Q4</span></div></div>',
    css: [
      '.panel { position: absolute; left: 50%; top: 10%; width: 46%; height: 80%; display: flex; flex-direction: column; justify-content: center; }',
      '.title { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 5.6); color: var(--ink); margin-bottom: calc(var(--u) * 2.5); }',
      '.chart { width: 100%; height: auto; overflow: visible; }',
      '.axis { stroke: var(--muted); stroke-width: 4; stroke-linecap: round; }',
      '.bar { fill: var(--ink); opacity: 0.25; }',
      '.bar.peak { fill: var(--accent); opacity: 1; }',
      '.labels { display: flex; justify-content: space-around; margin-top: calc(var(--u) * 1.6); font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 3.1); color: var(--muted); }',
      '.labels .hi { color: var(--accent); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 500;',
      'tl.words(".title", { style: "rise", at: 40 });',
      'tl.from(".axis", { scaleX: 0 }, { at: 120, dur: 380, origin: "left center", ease: "outQuart" });',
      'tl.from([".b1", ".b2", ".b3"], { scaleY: 0, opacity: 0 }, { at: 240, each: 130, dur: 420, origin: "center bottom", ease: "outQuart" });',
      'tl.from(".peak", { scaleY: 0 }, { at: Math.max(480, land), dur: 520, origin: "center bottom", ease: "back" });',
      'tl.from(".labels span", { y: 14, opacity: 0 }, { at: 360, each: 90, dur: 260, ease: "out" });',
      'mp.sfx("rise", 240);',
      'mp.sfx("impact", Math.max(480, land));',
      'tl.to(".panel", { x: mp.W * 0.08, opacity: 0 }, { at: ctx.durationMs - 260, dur: 260, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 560,
  },

  'diagram-flow': {
    html: '<div class="flow"><div class="heading">How it connects</div><div class="steps"><div class="node n1"><div class="badge">01</div><div class="lbl">Capture</div></div><div class="node n2"><div class="badge">02</div><div class="lbl">Direct</div></div><div class="node n3"><div class="badge">03</div><div class="lbl">Ship</div></div></div></div>',
    css: [
      '.flow { position: absolute; left: 6%; right: 6%; top: 14%; }',
      '.heading { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 6.4); color: var(--ink); }',
      '.steps { margin-top: calc(var(--u) * 6); display: flex; justify-content: space-between; gap: calc(var(--u) * 3); }',
      '.node { flex: 1; padding: calc(var(--u) * 3.2); border-radius: calc(var(--u) * 2.2); background: var(--paper); border: 2px solid rgba(0,0,0,0.12); }',
      '.n3 { border-color: var(--accent); }',
      '.badge { font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 3.4); color: var(--accent); }',
      '.lbl { margin-top: calc(var(--u) * 1.4); font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 4.8); color: var(--ink); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const a1 = mp.line([[mp.W * 0.33, mp.H * 0.44], [mp.W * 0.39, mp.H * 0.44]], { color: mp.colors.accent, width: mp.u * 0.7, arrow: true });',
      'const a2 = mp.line([[mp.W * 0.62, mp.H * 0.44], [mp.W * 0.68, mp.H * 0.44]], { color: mp.colors.accent, width: mp.u * 0.7, arrow: true });',
      'tl.words(".heading", { style: "rise", at: 40 });',
      'tl.from(".n1", { y: 40, opacity: 0 }, { at: 180, dur: 400, ease: "outStrong" });',
      'tl.draw(a1, { at: 460, dur: 320 });',
      'tl.from(".n2", { y: 40, opacity: 0 }, { at: 620, dur: 400, ease: "outStrong" });',
      'tl.draw(a2, { at: 900, dur: 320 });',
      'tl.from(".n3", { y: 40, scale: 0.92, opacity: 0 }, { at: 1060, dur: 440, ease: "back" });',
      'mp.sfx("pop", 180);',
      'mp.sfx("pop", 620);',
      'mp.sfx("impact", 1060);',
      'tl.to([".flow", a1, a2], { y: -24, opacity: 0 }, { at: ctx.durationMs - 260, dur: 260, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 1060,
  },

  'comparison-split': {
    html: '<div class="vs"><div class="col old"><div class="tag">BEFORE</div><div class="val">6 hours</div><div class="desc">Manual timeline cuts</div></div><div class="col win"><div class="tag">NOW</div><div class="val">45 sec</div><div class="desc">AI choreographed</div></div></div>',
    css: [
      '.vs { position: absolute; left: 8%; right: 8%; top: 18%; height: 64%; display: flex; gap: calc(var(--u) * 4); align-items: stretch; }',
      '.col { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: calc(var(--u) * 4.5); border-radius: calc(var(--u) * 2.8); }',
      '.old { background: rgba(20,20,28,0.72); border: 2px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.72); }',
      '.win { background: var(--accent); color: #FFFFFF; }',
      '.tag { font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.8); letter-spacing: 0.14em; }',
      '.val { margin-top: calc(var(--u) * 2); font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 12); line-height: 0.96; }',
      '.desc { margin-top: calc(var(--u) * 2); font-family: var(--body); font-weight: 600; font-size: calc(var(--u) * 3.6); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const land = ctx.keyMomentMs || 650;',
      'tl.from(".old", { x: -70, opacity: 0 }, { at: 80, dur: 420, ease: "outStrong" });',
      'const strike = mp.mark(root.querySelector(".old .val"), "strike", { color: mp.colors.negative });',
      'tl.draw(strike, { at: Math.max(380, land - 180), dur: 320 });',
      'tl.from(".win", { x: 70, scale: 0.9, opacity: 0 }, { at: land, dur: 480, ease: "back" });',
      'mp.sfx("whoosh", 80);',
      'mp.sfx("impact", land);',
      'tl.to(".vs", { scale: 0.95, opacity: 0 }, { at: ctx.durationMs - 260, dur: 260, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 650,
  },

  'map-story': {
    html: '<div class="tag">GLOBAL REACH</div>',
    css: [
      '.tag { position: absolute; left: 6%; top: 8%; padding: calc(var(--u) * 1.4) calc(var(--u) * 2.8); border-radius: calc(var(--u) * 1.4); background: var(--ink); color: var(--bg); font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 3.2); letter-spacing: 0.1em; }',
    ].join('\n'),
    script: [
      'const sheet = mp.sheet();',
      'const tl = mp.timeline();',
      'const map = mp.map({ view: "world" });',
      'map.set("Europe", 3.5);',
      'const route = map.route([[0, 51.5], [13.4, 52.5], [2.35, 48.85]], { color: mp.colors.accent, width: 4 });',
      'const pin = map.pin("Berlin", { label: "Berlin", side: "right" });',
      'tl.from(".tag", { y: -24, opacity: 0 }, { at: 80, dur: 340, ease: "outStrong" });',
      'map.fly(tl, [10.4, 51.1], { zoom: 6, at: 200, dur: 1600 });',
      'tl.draw(route, { at: 450, dur: 900 });',
      'tl.from(pin, { scale: 0, opacity: 0 }, { at: 1100, dur: 340, ease: "back" });',
      'mp.sfx("whoosh", 200);',
      'tl.exit("lift", sheet);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 900,
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
