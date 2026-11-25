import type { BeatArchetype, Format, VideoStageMode } from '@motionpop/schemas';

export interface ArchetypeExample {
  html: string;
  css: string;
  script: string;
  keyMomentMs: number;
}

/**
 * Spatial safe-zone contract for every coupled video stage mode (spec 19 + 20 + 23 + 24).
 * On `split-top-stage` (9:16 top 50%, 16:9 left 52%) and `top-card` (9:16 top 28%), the runtime
 * physically clips the beat's root container to that exact box so graphics can never intrude on
 * the speaker's face or live seam captions.
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
  const reelRules =
    ' HARD CRAFT RULES: Use clean HTML/CSS Flexbox & Grid + crisp 2px geometric SVG diagrams + mp.timeline(). NEVER leave any card/rectangle empty (every box must hold crisp real content). Primary visual MUST appear within 140ms. NEVER draw stick figures, cartoon clipart, fake viewfinder brackets, viewport borders, or shapes over the speaker face.';
  switch (stage) {
    case 'split-top-stage':
      return vertical
        ? `VIDEO STAGE = split-top-stage (CLIPPED 50% TOP STUDIO STAGE: your root container IS the exact top 50% box — 100% width × 50% frame height, subtle studio grid canvas ALREADY painted behind you; the speaker sits cleanly in the bottom 50% below you, captions lock on the 50% seam). DO NOT call mp.stage() or mp.sheet(). Use CSS Flexbox/Grid filling 100% × 100% of your root with comfortable padding (calc(var(--u) * 5) calc(var(--u) * 6) calc(var(--u) * 7)) so your UI diagram, inspector, checklist, comparison, chart, or editorial hero fills the top stage cleanly with crisp high-contrast ink (var(--ink))!${reelRules}`
        : `VIDEO STAGE = split-top-stage (CLIPPED LEFT 52% STUDIO STAGE: your root container IS the exact left 52% box, subtle grid canvas ALREADY painted behind you; the speaker sits cleanly on the right 43%). DO NOT call mp.stage() or mp.sheet(). Use Flexbox/Grid inside 100% × 100% of your root with generous padding.${reelRules}`;
    case 'top-card':
      return vertical
        ? `VIDEO STAGE = top-card (CLIPPED TOP 28% TRANSPARENT BAND ABOVE SPEAKER HEAD: your root container IS the exact top 28% strip above the speaker's head over live full-bleed footage). Leave the root background transparent (NO mp.stage, NO mp.sheet). Center ONE crisp elevated card (dark glass rgba(10,10,14,0.90) with #FFFFFF text, or crisp white card #FFFFFF with #0A0A0E ink and clean shadow) inside your root with comfortable outer padding (calc(var(--u) * 5)).${reelRules}`
        : `VIDEO STAGE = top-card (full-bleed speaker). Leave root transparent (NO mp.stage, NO mp.sheet) and float ONE compact high-contrast card cleanly in top-left or top-right (width 36%, top 6%) clear of the speaker's face.${reelRules}`;
    case 'clean':
      return vertical
        ? `VIDEO STAGE = clean (FULL-BLEED HUMAN BREATHING BEAT: speaker fills 100% of the frame with subtle punch-in zoom; live captions sit at bottom 13%). Leave root transparent (NO mp.stage, NO mp.sheet). Keep the speaker face (top 22%..56%) 100% untouched! Only show ONE crisp minimal typographic statement or compact lower-chest CTA card (top 62%..78%, above bottom captions) — ZERO clutter.${reelRules}`
        : `VIDEO STAGE = clean (BREATHING BEAT: full-bleed speaker with smooth punch-in). Leave root transparent and keep the face 100% untouched — at most one minimal corner editorial label or lower-third stamp.${reelRules}`;
    case 'full':
      return vertical
        ? `VIDEO STAGE = full (full-bleed speaker). Leave root transparent (NO mp.stage, NO mp.sheet). Keep the speaker's face (top 22%..56%) AND bottom caption band (bottom 10%..22%) 100% clear! Place bold high-contrast typography or ONE crisp lower-chest card strictly in top 6%..20% OR lower-chest top 60%..76%.${reelRules}`
        : `VIDEO STAGE = full (full-bleed speaker). Keep face and bottom caption rail clear; use bold frameless typography or one sleek floating badge with crisp shadow contrast.${reelRules}`;
    case 'split-left':
      return vertical
        ? `VIDEO STAGE = split-left (speaker in top 44%; captions on center seam 46%..54%). Compose cleanly inside bottom 56%..93%.${reelRules}`
        : `VIDEO STAGE = split-left (speaker on left 46%). Compose cleanly inside right 49%..96%.${reelRules}`;
    case 'split-right':
      return vertical
        ? `VIDEO STAGE = split-right (speaker in bottom 44%; captions on center seam 46%..54%). Compose cleanly inside top 6%..44%.${reelRules}`
        : `VIDEO STAGE = split-right (speaker on right 46%). Compose cleanly inside left 4%..50%.${reelRules}`;
    case 'pip':
      return vertical
        ? `VIDEO STAGE = pip (speaker PiP bottom-left 75%..96%; captions 65%..74%). Compose cleanly inside top 7%..62%.${reelRules}`
        : `VIDEO STAGE = pip (speaker PiP bottom-left). Compose cleanly across upper/right canvas keeping bottom-left 29% × 35% clear.${reelRules}`;
    case 'backdrop':
      return vertical
        ? `VIDEO STAGE = backdrop (softly dimmed/blurred full-frame speaker; captions at bottom 14%). Leave root transparent (NEVER call mp.stage or mp.sheet!) and place bold #FFFFFF hero typography cleanly in top 18%..62%.${reelRules}`
        : `VIDEO STAGE = backdrop (dimmed full-frame speaker). Leave root transparent (NEVER call mp.stage or mp.sheet!) and place bold #FFFFFF centered typography above bottom 18%.${reelRules}`;
    case 'cutaway':
      return vertical
        ? `VIDEO STAGE = cutaway (full-screen studio graphic — crisp subtle grid surface ALREADY painted behind you; live captions sit at bottom 14%). Compose a crisp, well-balanced full-screen visual cleanly inside top 6%..80% (keep bottom 18% clear for captions) with ZERO empty boxes and crisp var(--ink) contrast.${reelRules}`
        : `VIDEO STAGE = cutaway (full-screen studio graphic — crisp subtle grid surface ALREADY painted behind you). Keep content cleanly above the bottom 16% caption rail with crisp var(--ink) contrast.${reelRules}`;
    case 'split-top-broll':
      return vertical
        ? `VIDEO STAGE = split-top-broll (real B-roll plays in the TOP 47%, speaker plays in the BOTTOM 42%).${clipNote} Leave root transparent (NO mp.stage, NO mp.sheet). Add at most ONE crisp minimal floating top-left pill or badge (top 6%, left 6%) with dark translucent surface (#0A0A0E at 86% opacity, #FFFFFF text) so the B-roll shines unobstructed.`
        : `VIDEO STAGE = split-top-broll (speaker on LEFT 43%, B-roll on RIGHT 49%).${clipNote} Leave root transparent. Place ONE minimal high-contrast floating badge or caption label cleanly without blocking faces or the B-roll subject.`;
    case 'screen-showcase':
      return vertical
        ? `VIDEO STAGE = screen-showcase (3D-tilted product screen recording occupies top 9%..65%, speaker sits in bottom-left PiP).${clipNote} Leave root transparent (NO mp.stage, NO mp.sheet). Place a crisp concise dark-pill callout in lower-right (left 38%..94%, top 68%..84%) and optionally an animated curved mp.line pointer toward (${fxPct}%, ${Math.round(9 + fyPct * 0.56)}%).`
        : `VIDEO STAGE = screen-showcase (3D-tilted screen recording occupies x 14%..94%, y 9%..87%, speaker in bottom-left PiP).${clipNote} Leave root transparent. Place a clean floating badge near top-left/right and optional callout arrow toward (${Math.round(14 + fxPct * 0.8)}%, ${Math.round(9 + fyPct * 0.78)}%).`;
    case 'broll-full':
      return `VIDEO STAGE = broll-full (full-bleed real B-roll plays across 100% of the frame).${clipNote} Leave root transparent (NO mp.stage, NO mp.sheet). Place bold high-contrast #FFFFFF typography with crisp dark pill/scrim backing cleanly above the bottom 18% caption rail so the footage stays cinematic.`;
    case 'media-card-pop':
      return vertical
        ? `VIDEO STAGE = media-card-pop (real screenshot/photo pops at top 12%..54% over softly dimmed speaker).${clipNote} Leave root transparent (NO mp.stage, NO mp.sheet). Place ONE bold concise headline/badge cleanly in top 58%..74% (above bottom captions) or pointing toward (${fxPct}%, ${Math.round(12 + fyPct * 0.42)}%).`
        : `VIDEO STAGE = media-card-pop (speaker on LEFT 45%, screenshot/photo on RIGHT 45%).${clipNote} Leave root transparent. Place a clean kicker/badge above the right card (top 4%..12%) or an arrow pointing at (${Math.round(51 + fxPct * 0.45)}%, ${Math.round(14 + fyPct * 0.72)}%).`;
  }
}

/**
 * Stage-matched Swiss/Studio Reel v2 reference examples (spec 24 R3.2).
 * Built with clean HTML/CSS Flexbox + sharp 2px geometric SVG + `mp.timeline()` inside the
 * runtime's physically clipped stage container — zero `mp.stage` leakage, zero clipart, zero empty boxes.
 */
export const REEL_STAGE_EXAMPLES = {
  /** Layered Vox / Paper-Collage editorial scene: tactile graph-paper & halftone depth, masking tape, cutout hero image, hand-drawn curved arrow, highlighter sweep, and continuous camera push. */
  'vox-collage-editorial': {
    html: `<div class="scene-cam">
  <div class="mp-backdrop">
    <div class="paper-wash"></div>
    <div class="grid-patch"></div>
    <div class="halftone-dot"></div>
    <div class="accent-disc"></div>
    <div class="tape t1"></div>
    <div class="tape t2"></div>
  </div>
  <div class="hero-col">
    <div class="kicker">ARCHITECTURAL BRIEF</div>
    <h1 class="title">Inside the <span class="hl-key">Executive</span> Complex</h1>
    <p class="sub">Six levels spanning 55,000 sq ft of historic rooms.</p>
    <div class="metric-pill">
      <span class="m-num">132</span>
      <span class="m-lbl">ROOMS ACROSS 6 LEVELS</span>
    </div>
  </div>
  <div class="visual-stage">
    <div class="hero-halo"></div>
    <div class="cutout-slot"></div>
    <div class="callout-tag">SOUTH PORTICO · 1792</div>
  </div>
</div>`,
    css: [
      '.scene-cam { position: absolute; inset: 0; overflow: hidden; }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.paper-wash { position: absolute; inset: 0; background: radial-gradient(circle at 22% 24%, rgba(255,250,240,0.65), transparent 62%), radial-gradient(circle at 82% 76%, rgba(217,102,72,0.14), transparent 55%); }',
      '.grid-patch { position: absolute; right: 5%; top: 9%; width: 46%; height: 78%; background-color: rgba(255,252,246,0.72); background-image: linear-gradient(rgba(31,26,23,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,26,23,0.08) 1px, transparent 1px); background-size: 22px 22px; box-shadow: 0 14px 36px rgba(31,26,23,0.12); transform: rotate(1.2deg); }',
      '.halftone-dot { position: absolute; left: 3%; bottom: 6%; width: 28%; height: 34%; background-image: radial-gradient(rgba(31,26,23,0.18) 1.6px, transparent 1.6px); background-size: 9px 9px; opacity: 0.7; }',
      '.accent-disc { position: absolute; right: 10%; top: 18%; width: calc(var(--u) * 44); height: calc(var(--u) * 44); border-radius: 50%; background: var(--accent); opacity: 0.24; }',
      '.tape { position: absolute; width: calc(var(--u) * 14); height: calc(var(--u) * 3.4); background: rgba(196,198,132,0.76); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }',
      '.t1 { right: 44%; top: 7%; transform: rotate(-11deg); }',
      '.t2 { right: 4%; bottom: 10%; transform: rotate(14deg); }',
      '.hero-col { position: absolute; left: 7%; top: 15%; width: 44%; display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }',
      '.kicker { align-self: flex-start; font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.1); letter-spacing: 0.12em; padding: calc(var(--u) * 0.7) calc(var(--u) * 1.6); background: var(--ink); color: var(--bg); }',
      '.title { margin: 0; font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 7.6); line-height: 1.02; letter-spacing: -0.025em; color: var(--ink); }',
      '.sub { margin: 0; font-family: var(--body); font-size: calc(var(--u) * 3.0); line-height: 1.35; color: var(--muted); max-width: 92%; }',
      '.metric-pill { align-self: flex-start; display: inline-flex; align-items: baseline; gap: calc(var(--u) * 2); margin-top: calc(var(--u) * 1.4); padding: calc(var(--u) * 1.6) calc(var(--u) * 2.6); background: var(--paper); border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); transform: rotate(-1deg); }',
      '.m-num { font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 6.8); line-height: 1; color: var(--accent); }',
      '.m-lbl { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.0); letter-spacing: 0.06em; color: var(--ink); }',
      '.visual-stage { position: absolute; right: 6%; top: 12%; width: 44%; height: 76%; display: flex; align-items: center; justify-content: center; }',
      '.hero-halo { position: absolute; width: 78%; height: 78%; border-radius: 50%; background: radial-gradient(circle, rgba(94,127,106,0.28), transparent 72%); }',
      '.cutout-slot { position: relative; width: 92%; height: 84%; }',
      '.callout-tag { position: absolute; right: 4%; bottom: 4%; font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.0); letter-spacing: 0.08em; padding: calc(var(--u) * 0.8) calc(var(--u) * 1.6); background: var(--paper); color: var(--ink); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); transform: rotate(2deg); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'mp.image("m0", { parent: root.querySelector(".cutout-slot"), fit: "contain", shadow: true });',
      'tl.fromTo(".scene-cam", { scale: 1.0 }, { scale: 1.032 }, { at: 0, dur: ctx.durationMs, ease: "linear" });',
      'tl.from(".grid-patch", { y: 36, opacity: 0, rotate: 3 }, { at: 0, dur: 460, ease: "outQuart" });',
      'tl.from(".accent-disc", { scale: 0.3, opacity: 0 }, { at: 80, dur: 520, ease: "back" });',
      'tl.from([".t1", ".t2"], { scaleX: 0, opacity: 0 }, { at: 220, each: 120, dur: 280, ease: "outStrong" });',
      'tl.from(".kicker", { y: -14, opacity: 0 }, { at: 60, dur: 260, ease: "outStrong" });',
      'tl.words(".title", { style: "rise", at: 140 });',
      'const hl = mp.mark(root.querySelector(".hl-key"), "highlight", { color: mp.alpha(mp.colors.accent, 0.34) });',
      'tl.draw(hl, { at: 680, dur: 420, ease: "outQuart" });',
      'tl.from(".sub", { y: 18, opacity: 0 }, { at: 460, dur: 360, ease: "out" });',
      'tl.from(".cutout-slot", { y: 48, scale: 0.88, rotate: -3, opacity: 0 }, { at: 180, dur: 580, ease: "back" });',
      'tl.to(".cutout-slot", { y: -10, rotate: 0.8 }, { at: 760, dur: Math.max(1200, ctx.durationMs - 800), ease: "inOutSine" });',
      'tl.from(".metric-pill", { y: 26, scale: 0.9, opacity: 0 }, { at: 820, dur: 420, ease: "back" });',
      'tl.count(".m-num", { to: 132, at: 860, dur: 820 });',
      'tl.from(".callout-tag", { y: 16, opacity: 0 }, { at: 1120, dur: 320, ease: "outStrong" });',
      'const arrow = mp.line([[mp.W * 0.45, mp.H * 0.68], [mp.W * 0.56, mp.H * 0.56]], { color: mp.colors.ink, width: 3, arrow: true, curve: true });',
      'tl.draw(arrow, { at: 1180, dur: 440, ease: "outQuart" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 1200,
  },

  /** Apple Keynote / Mac Launch Film: thin macOS menu bar, black center notch springing open into a frosted live widget over a rich multi-stop wallpaper, and one crisp centred caption with tinted accent words. */
  'apple-keynote-notch': {
    html: `<div class="ak-scene">
  <div class="mp-backdrop">
    <div class="ak-wall"></div>
    <div class="ak-glow"></div>
  </div>
  <div class="ak-menubar">
    <div class="mb-left"><span class="mb-dot"></span><span>Finder</span><span>File</span><span>Edit</span><span>View</span></div>
    <div class="mb-right"><span>Wi-Fi</span><span>9:41</span></div>
  </div>
  <div class="ak-notch">
    <div class="notch-inner">
      <div class="notch-head">
        <span class="notch-badge">LIVE SYNC</span>
        <span class="notch-stat">0.4s</span>
      </div>
      <div class="notch-bars">
        <span class="nb b1"></span><span class="nb b2"></span><span class="nb b3"></span><span class="nb b4"></span><span class="nb b5"></span>
      </div>
      <div class="notch-foot"><span>Studio Audio Engine</span><span class="ok">READY</span></div>
    </div>
  </div>
  <div class="ak-caption">
    <h1 class="ak-title">Your voice lives <span class="ak-tint">right here.</span></h1>
  </div>
</div>`,
    css: [
      '.ak-scene { position: absolute; inset: 0; overflow: hidden; font-family: var(--body); }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.ak-wall { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 24%, #1e3a8a 0%, #0f172a 55%, #060913 100%); }',
      '.ak-glow { position: absolute; left: 18%; right: 18%; top: 10%; height: 48%; border-radius: 50%; background: radial-gradient(circle, rgba(56,189,248,0.28), transparent 70%); }',
      '.ak-menubar { position: absolute; top: 0; left: 0; right: 0; height: calc(var(--u) * 4.4); display: flex; align-items: center; justify-content: space-between; padding: 0 calc(var(--u) * 3.2); background: rgba(15,23,42,0.52); border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(248,250,252,0.88); font-size: calc(var(--u) * 1.9); font-weight: 600; }',
      '.mb-left, .mb-right { display: flex; align-items: center; gap: calc(var(--u) * 2.4); }',
      '.mb-dot { width: calc(var(--u) * 1.6); height: calc(var(--u) * 1.6); border-radius: 50%; background: #fff; }',
      '.ak-notch { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 52%; min-width: calc(var(--u) * 56); background: #05070b; border: 1px solid rgba(255,255,255,0.14); border-top: none; border-radius: 0 0 calc(var(--u) * 3.8) calc(var(--u) * 3.8); padding: calc(var(--u) * 5.2) calc(var(--u) * 4.2) calc(var(--u) * 3.6); box-shadow: 0 calc(var(--u) * 3) calc(var(--u) * 7) rgba(0,0,0,0.55); box-sizing: border-box; color: #f8fafc; }',
      '.notch-inner { display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }',
      '.notch-head { display: flex; justify-content: space-between; align-items: center; }',
      '.notch-badge { font-family: var(--mono); font-size: calc(var(--u) * 2.0); font-weight: 700; letter-spacing: 0.1em; color: #38bdf8; }',
      '.notch-stat { font-family: var(--mono); font-size: calc(var(--u) * 2.8); font-weight: 800; color: #fff; }',
      '.notch-bars { display: flex; align-items: flex-end; gap: calc(var(--u) * 1.4); height: calc(var(--u) * 9.5); }',
      '.nb { flex: 1; border-radius: 99px; background: linear-gradient(180deg, #38bdf8, #818cf8); }',
      '.b1 { height: 42%; } .b2 { height: 78%; } .b3 { height: 100%; } .b4 { height: 64%; } .b5 { height: 86%; }',
      '.notch-foot { display: flex; justify-content: space-between; font-size: calc(var(--u) * 2.2); color: rgba(248,250,252,0.68); }',
      '.ok { font-family: var(--mono); font-weight: 700; color: #34d399; }',
      '.ak-caption { position: absolute; left: 8%; right: 8%; bottom: 14%; text-align: center; }',
      '.ak-title { margin: 0; font-family: var(--display); font-weight: 700; font-size: calc(var(--u) * 7.2); line-height: 1.08; letter-spacing: -0.03em; color: #f8fafc; }',
      '.ak-tint { color: #7dd3fc; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.fromTo(".ak-scene", { scale: 1.0 }, { scale: 1.028 }, { at: 0, dur: ctx.durationMs, ease: "linear" });',
      'tl.from(".ak-menubar", { y: -24, opacity: 0 }, { at: 0, dur: 280, ease: "outQuart" });',
      'tl.from(".ak-notch", { scaleY: 0.25, scaleX: 0.55, opacity: 0 }, { at: 80, dur: 540, ease: "outQuart" });',
      'tl.from(".notch-inner", { y: -12, opacity: 0 }, { at: 260, dur: 360, ease: "outQuart" });',
      'tl.from([".b1", ".b2", ".b3", ".b4", ".b5"], { scaleY: 0.15, opacity: 0 }, { at: 360, each: 65, dur: 340, ease: "back" });',
      'tl.words(".ak-title", { style: "rise", at: 420 });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 920,
  },

  /** Kinetic Typography Reel (opus-video-skills): obsidian/lime/cobalt high-contrast ground, HUD corner brackets, bold condensed drop-in slam with outlined echo, diagonal ticker tape, and live metric. */
  'kinetic-reel-slam': {
    html: `<div class="kr-stage">
  <div class="mp-backdrop">
    <div class="kr-bg"></div>
    <div class="kr-grid"></div>
  </div>
  <div class="kr-hud">
    <span class="kh tl">01 / MECHANISM</span>
    <span class="kh tr">120 BPM · LIVE</span>
    <span class="kh bl">SCHEMATIC</span>
    <span class="kh br">STATUS · OK</span>
  </div>
  <div class="kr-center">
    <div class="kr-echo" aria-hidden="true">EVERY FRAME</div>
    <h1 class="kr-slam">EVERY <span class="kr-lime">FRAME</span><span class="kr-dot">.</span></h1>
    <div class="kr-row">
      <div class="kr-chip">BEAT-LOCKED</div>
      <div class="kr-chip alt">PURE CODE</div>
      <div class="kr-stat"><span class="kr-num">60</span><span class="kr-unit">FPS</span></div>
    </div>
  </div>
  <div class="kr-tape"><span>KINETIC REEL ✳ ZERO SLIDES ↗ BUILT IN CODE ✳ BEAT-LOCKED ↗</span></div>
  <div class="kr-trace"><span class="seg on"></span><span class="seg on"></span><span class="seg"></span><span class="seg"></span></div>
</div>`,
    css: [
      '.kr-stage { position: absolute; inset: 0; overflow: hidden; color: #f1eee6; }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.kr-bg { position: absolute; inset: 0; background: #0e0f0e; }',
      '.kr-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(241,238,230,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(241,238,230,0.05) 1px, transparent 1px); background-size: 48px 48px; }',
      '.kr-hud .kh { position: absolute; font-family: var(--mono); font-size: calc(var(--u) * 1.9); font-weight: 700; letter-spacing: 0.14em; color: #8b908a; }',
      '.tl { top: 5%; left: 5%; } .tr { top: 5%; right: 5%; } .bl { bottom: 7%; left: 5%; } .br { bottom: 7%; right: 5%; color: #ddf53d; }',
      '.kr-center { position: absolute; inset: 14% 7% 20%; display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * 2.4); }',
      '.kr-echo { font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 10.2); line-height: 0.9; letter-spacing: -0.03em; color: transparent; -webkit-text-stroke: 1.5px rgba(241,238,230,0.18); margin-bottom: calc(var(--u) * -3.8); }',
      '.kr-slam { margin: 0; font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 11.4); line-height: 0.92; letter-spacing: -0.035em; color: #f1eee6; }',
      '.kr-lime { color: #ddf53d; } .kr-dot { color: #e8412f; }',
      '.kr-row { display: flex; align-items: center; flex-wrap: wrap; gap: calc(var(--u) * 2.2); margin-top: calc(var(--u) * 1.2); }',
      '.kr-chip { font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.3); letter-spacing: 0.08em; padding: calc(var(--u) * 0.9) calc(var(--u) * 2.0); background: #ddf53d; color: #0e0f0e; }',
      '.kr-chip.alt { background: #2f3cff; color: #f1eee6; }',
      '.kr-stat { margin-left: auto; display: flex; align-items: baseline; gap: calc(var(--u) * 1.0); }',
      '.kr-num { font-family: var(--display); font-weight: 900; font-size: calc(var(--u) * 8.4); line-height: 1; color: #ddf53d; font-variant-numeric: tabular-nums; }',
      '.kr-unit { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.2); color: #8b908a; }',
      '.kr-tape { position: absolute; left: -6%; right: -6%; bottom: 13%; background: #ddf53d; color: #0e0f0e; font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.1); letter-spacing: 0.1em; padding: calc(var(--u) * 0.8) 0; text-align: center; transform: rotate(-1.5deg); white-space: nowrap; }',
      '.kr-trace { position: absolute; left: 5%; right: 5%; bottom: 3.5%; display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 1.2); height: 4px; }',
      '.seg { background: rgba(241,238,230,0.18); } .seg.on { background: #ddf53d; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.fromTo(".kr-stage", { scale: 1.0 }, { scale: 1.03 }, { at: 0, dur: ctx.durationMs, ease: "linear" });',
      'tl.from(".kr-echo", { y: -28, opacity: 0 }, { at: 0, dur: 280, ease: "outQuart" });',
      'tl.words(".kr-slam", { style: "slam", at: 60 });',
      'tl.from(".kr-chip", { x: -24, opacity: 0 }, { at: 320, each: 110, dur: 260, ease: "outStrong" });',
      'tl.count(".kr-num", { to: 60, at: 380, dur: 640 });',
      'tl.from(".kr-tape", { x: 80, opacity: 0 }, { at: 520, dur: 340, ease: "outQuart" });',
      'tl.to(".kr-tape", { x: -48 }, { at: 860, dur: Math.max(800, ctx.durationMs - 900), ease: "linear" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 720,
  },

  /** Bloomberg / Newsprint Financial Data Story: question-first headline, zero-baseline bars where non-hero series dim to 25%, tabular highlight figure, and crisp archival source footer. */
  'financial-newsprint-chart': {
    html: `<div class="fn-wrap">
  <div class="mp-backdrop">
    <div class="fn-paper"></div>
    <div class="fn-rules"></div>
  </div>
  <div class="fn-head">
    <div class="fn-kicker">MARKET BRIEF · Q1–Q4</div>
    <h1 class="fn-title">Where the margin shift actually happened</h1>
  </div>
  <div class="fn-chart">
    <div class="fn-bar dim"><div class="fill f1"></div><span class="val">$18M</span><span class="lbl">Q1</span></div>
    <div class="fn-bar dim"><div class="fill f2"></div><span class="val">$29M</span><span class="lbl">Q2</span></div>
    <div class="fn-bar dim"><div class="fill f3"></div><span class="val">$44M</span><span class="lbl">Q3</span></div>
    <div class="fn-bar hero"><div class="fill f4"></div><span class="val hero-num">$84M</span><span class="lbl">Q4</span></div>
  </div>
  <div class="fn-foot"><span>ZERO BASELINE · TABULAR FIGURES</span><span class="fn-delta">+366% YoY</span></div>
</div>`,
    css: [
      '.fn-wrap { position: absolute; inset: 0; padding: 7% 8%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; color: #111111; }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.fn-paper { position: absolute; inset: 0; background: #f6f3ec; }',
      '.fn-rules { position: absolute; inset: 6% 8%; border-top: 3px solid #111111; border-bottom: 1.5px solid rgba(17,17,17,0.35); }',
      '.fn-head { position: relative; padding-top: calc(var(--u) * 2.2); }',
      '.fn-kicker { font-family: var(--mono); font-size: calc(var(--u) * 2.0); font-weight: 700; letter-spacing: 0.12em; color: #b91c1c; }',
      '.fn-title { margin: calc(var(--u) * 1.0) 0 0; font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 5.8); line-height: 1.06; letter-spacing: -0.02em; max-width: 88%; }',
      '.fn-chart { position: relative; flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 3.6); align-items: end; padding: calc(var(--u) * 5) 0 calc(var(--u) * 3); border-bottom: 2px solid #111111; }',
      '.fn-bar { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: calc(var(--u) * 1.0); }',
      '.fill { width: 100%; background: #111111; transform-origin: bottom center; }',
      '.fn-bar.dim .fill { opacity: 0.24; } .fn-bar.hero .fill { background: #b91c1c; }',
      '.f1 { height: 22%; } .f2 { height: 35%; } .f3 { height: 52%; } .f4 { height: 92%; }',
      '.val { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.6); font-variant-numeric: tabular-nums; order: -1; }',
      '.fn-bar.dim .val { color: #64615b; } .hero-num { color: #b91c1c; font-size: calc(var(--u) * 3.8); font-weight: 900; }',
      '.lbl { font-family: var(--mono); font-size: calc(var(--u) * 2.1); font-weight: 700; color: #111111; margin-top: calc(var(--u) * 0.6); }',
      '.fn-foot { position: relative; display: flex; justify-content: space-between; align-items: center; padding-top: calc(var(--u) * 1.6); font-family: var(--mono); font-size: calc(var(--u) * 1.9); font-weight: 700; color: #57534e; }',
      '.fn-delta { background: #b91c1c; color: #f6f3ec; padding: calc(var(--u) * 0.5) calc(var(--u) * 1.4); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from(".fn-kicker", { y: -12, opacity: 0 }, { at: 0, dur: 240, ease: "outQuart" });',
      'tl.words(".fn-title", { style: "rise", at: 80 });',
      'tl.from([".f1", ".f2", ".f3", ".f4"], { scaleY: 0 }, { at: 320, each: 150, dur: 460, ease: "outQuart" });',
      'tl.from(".val", { y: 14, opacity: 0 }, { at: 460, each: 150, dur: 260, ease: "outStrong" });',
      'tl.from(".fn-delta", { scale: 0.85, opacity: 0 }, { at: 1020, dur: 300, ease: "back" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 1120,
  },

  /** Dark SaaS Liquid-Glass Launch UI: deep obsidian backdrop with luminous rim, floating frosted product window, live typed prompt bar (only place typing lives), and crisp verification badge. */
  'dark-saas-glass-ui': {
    html: `<div class="ds-wrap">
  <div class="mp-backdrop">
    <div class="ds-bg"></div>
    <div class="ds-rim"></div>
  </div>
  <div class="ds-head">
    <h1 class="ds-title">Ship in one <span class="ds-acc">prompt.</span></h1>
  </div>
  <div class="ds-card">
    <div class="ds-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="ds-path">workspace / launch-cut</span><span class="ds-ok">VERIFIED</span></div>
    <div class="ds-prompt"><span class="ds-chevron">&gt;</span><span class="ds-cmd">Generate 16:9 product showcase with alpha export</span><span class="ds-caret"></span></div>
    <div class="ds-grid">
      <div class="ds-tile t1"><span class="tk">RENDER</span><span class="tv">30 fps · VP9</span></div>
      <div class="ds-tile t2"><span class="tk">AUDIO</span><span class="tv">-14 LUFS</span></div>
      <div class="ds-tile t3"><span class="tk">QA PASS</span><span class="tv">100%</span></div>
    </div>
  </div>
</div>`,
    css: [
      '.ds-wrap { position: absolute; inset: 0; padding: 7% 8%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * 3.6); color: #f8fafc; }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.ds-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #0b0d17 0%, #111827 55%, #090b12 100%); }',
      '.ds-rim { position: absolute; left: 15%; right: 15%; top: 18%; height: 60%; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.26), rgba(34,211,238,0.08) 45%, transparent 72%); }',
      '.ds-head { position: relative; text-align: center; }',
      '.ds-title { margin: 0; font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 7.0); line-height: 1.04; letter-spacing: -0.03em; }',
      '.ds-acc { color: #38bdf8; }',
      '.ds-card { position: relative; background: rgba(17,24,39,0.78); border: 1px solid rgba(255,255,255,0.14); border-radius: calc(var(--u) * 2.4); padding: calc(var(--u) * 3.0); box-shadow: 0 calc(var(--u) * 3) calc(var(--u) * 7) rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }',
      '.ds-bar { display: flex; align-items: center; gap: calc(var(--u) * 1.1); }',
      '.dot { width: calc(var(--u) * 1.4); height: calc(var(--u) * 1.4); border-radius: 50%; } .r { background: #ef4444; } .y { background: #f59e0b; } .g { background: #22c55e; }',
      '.ds-path { margin-left: calc(var(--u) * 1.4); font-family: var(--mono); font-size: calc(var(--u) * 2.0); color: #94a3b8; }',
      '.ds-ok { margin-left: auto; font-family: var(--mono); font-size: calc(var(--u) * 1.8); font-weight: 800; color: #34d399; border: 1px solid rgba(52,211,153,0.4); padding: calc(var(--u) * 0.4) calc(var(--u) * 1.2); border-radius: 99px; }',
      '.ds-prompt { display: flex; align-items: center; gap: calc(var(--u) * 1.6); background: rgba(2,6,23,0.75); border: 1px solid rgba(56,189,248,0.35); border-radius: calc(var(--u) * 1.4); padding: calc(var(--u) * 2.0) calc(var(--u) * 2.4); font-family: var(--mono); font-size: calc(var(--u) * 2.5); }',
      '.ds-chevron { color: #38bdf8; font-weight: 800; } .ds-caret { width: 2px; height: calc(var(--u) * 3.0); background: #38bdf8; }',
      '.ds-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(var(--u) * 2.0); }',
      '.ds-tile { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: calc(var(--u) * 1.4); padding: calc(var(--u) * 2.0); display: flex; flex-direction: column; gap: calc(var(--u) * 0.6); }',
      '.tk { font-family: var(--mono); font-size: calc(var(--u) * 1.8); color: #94a3b8; letter-spacing: 0.08em; }',
      '.tv { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 3.4); color: #f8fafc; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.fromTo(".ds-wrap", { scale: 1.0 }, { scale: 1.028 }, { at: 0, dur: ctx.durationMs, ease: "linear" });',
      'tl.words(".ds-title", { style: "rise", at: 0 });',
      'tl.from(".ds-card", { y: 34, scale: 0.96, opacity: 0 }, { at: 180, dur: 460, ease: "outQuart" });',
      'tl.from(".ds-prompt", { opacity: 0, y: 10 }, { at: 440, dur: 300, ease: "outQuart" });',
      'tl.from([".t1", ".t2", ".t3"], { y: 18, opacity: 0 }, { at: 640, each: 120, dur: 320, ease: "outStrong" });',
      'tl.from(".ds-ok", { scale: 0.8, opacity: 0 }, { at: 1020, dur: 260, ease: "back" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 980,
  },

  /** Blueprint / 3Blue1Brown System Diagram: deep drafting navy with millimeter grid, glowing vector mechanism nodes, animated SVG flow lines, and mono schematic specs. */
  'blueprint-system-diagram': {
    html: `<div class="bp-stage">
  <div class="mp-backdrop">
    <div class="bp-bg"></div>
    <div class="bp-grid"></div>
  </div>
  <div class="bp-top">
    <span class="bp-code">FIG. 02 · ARCHITECTURE</span>
    <h1 class="bp-title">How the pipeline routes every beat</h1>
  </div>
  <div class="bp-nodes">
    <div class="bp-node n1"><span class="nid">01</span><span class="nt">INPUT</span><span class="ns">Audio · Video · Prompt</span></div>
    <div class="bp-node n2"><span class="nid">02</span><span class="nt">DIRECTOR</span><span class="ns">Skill + Style Craft</span></div>
    <div class="bp-node n3"><span class="nid">03</span><span class="nt">RENDER</span><span class="ns">MP4 · Alpha WebM</span></div>
  </div>
</div>`,
    css: [
      '.bp-stage { position: absolute; inset: 0; padding: 7% 7%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; color: #f8fafc; }',
      '.mp-backdrop { position: absolute; inset: 0; pointer-events: none; }',
      '.bp-bg { position: absolute; inset: 0; background: #0c1b33; }',
      '.bp-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(56,189,248,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.12) 1px, transparent 1px); background-size: 28px 28px; }',
      '.bp-top { position: relative; }',
      '.bp-code { font-family: var(--mono); font-size: calc(var(--u) * 2.0); font-weight: 700; letter-spacing: 0.14em; color: #38bdf8; }',
      '.bp-title { margin: calc(var(--u) * 1.2) 0 0; font-family: var(--display); font-weight: 700; font-size: calc(var(--u) * 5.8); line-height: 1.08; letter-spacing: -0.02em; }',
      '.bp-nodes { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(var(--u) * 4.2); margin: auto 0; }',
      '.bp-node { border: 1.5px solid rgba(56,189,248,0.55); background: rgba(12,27,51,0.85); padding: calc(var(--u) * 3.0); display: flex; flex-direction: column; gap: calc(var(--u) * 1.0); box-shadow: 0 0 0 1px rgba(248,250,252,0.08) inset; }',
      '.bp-node.n2 { border-color: #fbbf24; }',
      '.nid { font-family: var(--mono); font-size: calc(var(--u) * 2.0); font-weight: 700; color: #38bdf8; }',
      '.bp-node.n2 .nid { color: #fbbf24; }',
      '.nt { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 3.8); letter-spacing: 0.02em; }',
      '.ns { font-family: var(--mono); font-size: calc(var(--u) * 2.1); color: #93b4d8; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.fromTo(".bp-stage", { scale: 1.0 }, { scale: 1.024 }, { at: 0, dur: ctx.durationMs, ease: "linear" });',
      'tl.from(".bp-code", { y: -12, opacity: 0 }, { at: 0, dur: 240, ease: "outQuart" });',
      'tl.words(".bp-title", { style: "rise", at: 80 });',
      'tl.from([".n1", ".n2", ".n3"], { y: 24, opacity: 0 }, { at: 320, each: 180, dur: 380, ease: "outQuart" });',
      'const l1 = mp.line([[mp.W * 0.34, mp.H * 0.56], [mp.W * 0.39, mp.H * 0.56]], { color: "#38bdf8", width: 2.5, arrow: true });',
      'const l2 = mp.line([[mp.W * 0.63, mp.H * 0.56], [mp.W * 0.68, mp.H * 0.56]], { color: "#fbbf24", width: 2.5, arrow: true });',
      'tl.draw(l1, { at: 620, dur: 320, ease: "outQuart" });',
      'tl.draw(l2, { at: 840, dur: 320, ease: "outQuart" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 960,
  },
  /** Crisp Swiss property/timing inspector with live playhead slider & animated SVG bezier curve. */
  'split-inspector': {
    html: `<div class="stage-pad">
  <div class="eyebrow">every element</div>
  <div class="scrub-track">
    <div class="scrub-rail"></div>
    <div class="scrub-thumb"></div>
  </div>
  <div class="scrub-ends"><span>FROM</span><span>TO</span></div>
  <div class="spec-rows">
    <div class="row r1"><span class="k">START</span><span class="v">0.20s</span><svg class="chk" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="row r2"><span class="k">DURATION</span><span class="v">0.60s</span><svg class="chk" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="row r3"><span class="k">FROM &gt; TO</span><span class="v">x 0 &gt; 740</span><svg class="chk" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="row r4"><span class="k">EASING</span><span class="v">ease-out</span><svg class="curve" viewBox="0 0 36 28"><path class="bez" d="M3 25 C 8 5, 18 3, 33 3"/></svg></div>
  </div>
</div>`,
    css: [
      '.stage-pad { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: calc(var(--u) * 5) calc(var(--u) * 7) calc(var(--u) * 7); box-sizing: border-box; gap: calc(var(--u) * 2.2); }',
      '.eyebrow { text-align: center; font-family: var(--body); font-weight: 500; font-size: calc(var(--u) * 3.4); color: var(--muted); }',
      '.scrub-track { position: relative; height: calc(var(--u) * 5.2); display: flex; align-items: center; }',
      '.scrub-rail { width: 100%; border-top: 2px dashed rgba(10,10,14,0.28); }',
      '.scrub-thumb { position: absolute; left: 0; width: calc(var(--u) * 5.4); height: calc(var(--u) * 5.4); border-radius: calc(var(--u) * 1.1); background: var(--ink); }',
      '.scrub-ends { display: flex; justify-content: space-between; margin-top: calc(var(--u) * -1); }',
      '.scrub-ends span { background: var(--ink); color: var(--bg); font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.2); padding: calc(var(--u) * 0.4) calc(var(--u) * 1.2); border-radius: 4px; letter-spacing: 0.06em; }',
      '.spec-rows { display: flex; flex-direction: column; margin-top: calc(var(--u) * 1.2); }',
      '.row { display: grid; grid-template-columns: 1fr auto calc(var(--u) * 6); align-items: center; gap: calc(var(--u) * 2.4); padding: calc(var(--u) * 1.8) 0; border-bottom: 1px solid rgba(10,10,14,0.12); }',
      '.k { font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 3.4); letter-spacing: 0.02em; color: var(--ink); }',
      '.v { font-family: var(--mono); font-weight: 500; font-size: calc(var(--u) * 3.2); color: var(--muted); }',
      '.chk { width: calc(var(--u) * 3.8); height: calc(var(--u) * 3.8); fill: none; stroke: var(--ink); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; justify-self: end; }',
      '.curve { width: calc(var(--u) * 5.2); height: calc(var(--u) * 4); fill: none; stroke: var(--ink); stroke-width: 2.6; stroke-linecap: round; justify-self: end; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const maxSlide = mp.W * 0.78;',
      'tl.from(".eyebrow", { y: 12, opacity: 0 }, { at: 0, dur: 220, ease: "out" });',
      'tl.fromTo(".scrub-thumb", { x: 0 }, { x: maxSlide }, { at: 120, dur: Math.max(900, ctx.durationMs - 400), ease: "outQuart" });',
      'tl.from([".r1", ".r2", ".r3", ".r4"], { y: 18, opacity: 0 }, { at: 80, each: 240, dur: 300, ease: "outStrong" });',
      'tl.draw(".bez", { at: 780, dur: 520, ease: "outQuart" });',
      'mp.sfx("tick", 80);',
      'mp.sfx("pop", 560);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 780,
  },

  /** Crisp stacked Swiss checklist with sharp 2px geometric SVG icons. */
  'split-checklist': {
    html: `<div class="list-wrap">
  <div class="sub">give it</div>
  <div class="head">ANY FORMAT</div>
  <div class="items">
    <div class="item i1"><svg class="ico" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="3"/><line x1="2" y1="8" x2="30" y2="8"/><circle cx="7" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="5" r="1" fill="currentColor"/></svg><span>LIVE WEBSITE</span></div>
    <div class="item i2"><svg class="ico" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="3"/><circle cx="16" cy="12" r="4" fill="currentColor"/></svg><span>SCREEN RECORDING</span></div>
    <div class="item i3"><svg class="ico" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="3"/><polygon points="13,7 22,12 13,17" fill="currentColor"/></svg><span>MP4 CLIP</span></div>
    <div class="item i4"><svg class="ico" viewBox="0 0 32 24"><rect x="2" y="2" width="28" height="20" rx="3"/><path d="M6 17 C 11 17, 13 7, 26 7"/></svg><span>VECTOR MOTION</span></div>
  </div>
</div>`,
    css: [
      '.list-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: calc(var(--u) * 5) calc(var(--u) * 8) calc(var(--u) * 7); box-sizing: border-box; gap: calc(var(--u) * 1.4); }',
      '.sub { text-align: center; font-family: var(--body); font-weight: 500; font-size: calc(var(--u) * 3.4); color: var(--muted); }',
      '.head { text-align: center; font-family: var(--body); font-weight: 900; font-size: calc(var(--u) * 6.4); letter-spacing: -0.02em; color: var(--ink); margin-bottom: calc(var(--u) * 2.2); }',
      '.items { display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }',
      '.item { display: flex; align-items: center; gap: calc(var(--u) * 3.2); font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 3.6); color: var(--ink); }',
      '.ico { width: calc(var(--u) * 7.2); height: calc(var(--u) * 5.4); flex: 0 0 auto; fill: none; stroke: var(--ink); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from([".sub", ".head"], { y: 16, opacity: 0 }, { at: 0, each: 60, dur: 260, ease: "outStrong" });',
      'tl.from([".i1", ".i2", ".i3", ".i4"], { x: -24, opacity: 0 }, { at: 180, each: 240, dur: 280, ease: "outStrong" });',
      'mp.sfx("tick", 180);',
      'mp.sfx("tick", 420);',
      'mp.sfx("pop", 660);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 680,
  },

  /** Crisp side-by-side comparison wireframe with verification checkmarks. */
  'split-compare': {
    html: `<div class="cmp-wrap">
  <div class="pair">
    <div class="pane p1">
      <div class="badge">ORIGINAL</div>
      <div class="frame"><div class="skel-dot"></div><div class="skel-lines"><span class="l1"></span><span class="l2"></span><span class="l3"></span></div></div>
    </div>
    <div class="pane p2">
      <div class="badge">COPY</div>
      <div class="frame"><div class="skel-dot"></div><div class="skel-lines"><span class="l1"></span><span class="l2"></span><span class="l3"></span></div></div>
    </div>
  </div>
  <div class="checks">
    <div class="crow c1"><span>TIMING</span><svg class="ck" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="crow c2"><span>EASING</span><svg class="ck" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="crow c3"><span>PIXELS</span><svg class="ck" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
  </div>
</div>`,
    css: [
      '.cmp-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: calc(var(--u) * 5) calc(var(--u) * 6) calc(var(--u) * 7); box-sizing: border-box; gap: calc(var(--u) * 4); }',
      '.pair { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 3.6); }',
      '.pane { display: flex; flex-direction: column; gap: calc(var(--u) * 1.2); }',
      '.badge { align-self: flex-start; background: var(--ink); color: var(--bg); font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.2); padding: calc(var(--u) * 0.45) calc(var(--u) * 1.2); border-radius: 4px; letter-spacing: 0.06em; }',
      '.frame { display: flex; align-items: center; gap: calc(var(--u) * 2.2); padding: calc(var(--u) * 3.4); border-radius: calc(var(--u) * 1.6); background: var(--ink); color: var(--bg); }',
      '.skel-dot { width: calc(var(--u) * 7.2); height: calc(var(--u) * 7.2); border-radius: 50%; background: var(--bg); flex: 0 0 auto; }',
      '.skel-lines { flex: 1; display: flex; flex-direction: column; gap: calc(var(--u) * 1.1); }',
      '.skel-lines span { display: block; height: calc(var(--u) * 1.1); border-radius: 99px; background: var(--bg); }',
      '.skel-lines .l2 { width: 78%; opacity: 0.85; }',
      '.skel-lines .l3 { width: 58%; opacity: 0.65; }',
      '.checks { width: 56%; display: flex; flex-direction: column; }',
      '.crow { display: flex; justify-content: space-between; align-items: center; padding: calc(var(--u) * 1.5) 0; border-bottom: 1px solid rgba(10,10,14,0.14); font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 3.2); color: var(--ink); }',
      '.ck { width: calc(var(--u) * 3.6); height: calc(var(--u) * 3.6); fill: none; stroke: var(--ink); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from(".p1", { x: -24, opacity: 0 }, { at: 0, dur: 280, ease: "outStrong" });',
      'tl.from(".p2", { x: 24, opacity: 0 }, { at: 180, dur: 280, ease: "outStrong" });',
      'tl.from([".c1", ".c2", ".c3"], { y: 14, opacity: 0 }, { at: 420, each: 200, dur: 240, ease: "outStrong" });',
      'mp.sfx("pop", 180);',
      'mp.sfx("tick", 420);',
      'mp.sfx("tick", 620);',
      'mp.sfx("impact", 820);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 620,
  },

  /** Clean code/doc macOS window inside clipped top 50% stage. */
  'split-window': {
    html: `<div class="win-stage">
  <div class="win-box">
    <div class="win-bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span><span class="tab active">Scene.tsx</span><span class="tab">spec.md</span></div>
    <div class="code-body">
      <div class="cl c1"><span class="ln">1</span><span class="cm">// Deterministic timeline</span></div>
      <div class="cl c2"><span class="ln">2</span><span>card.<b class="hl">animate</b>({ y: [24, 0], dur: 420 });</span></div>
      <div class="cl c3"><span class="ln">3</span><span>badge.<b class="hl">stagger</b>({ each: 80, ease: "out" });</span></div>
    </div>
    <div class="chips"><span class="chip on">CSS</span><span class="chip">SVG</span><span class="chip">Canvas</span></div>
  </div>
</div>`,
    css: [
      '.win-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: calc(var(--u) * 5) calc(var(--u) * 5.5) calc(var(--u) * 7); box-sizing: border-box; }',
      '.win-box { width: 100%; background: #FFFFFF; border: 1px solid rgba(10,10,14,0.12); border-radius: calc(var(--u) * 2); box-shadow: 0 calc(var(--u) * 1.8) calc(var(--u) * 4.8) rgba(10,10,14,0.09); overflow: hidden; color: #0A0A0E; }',
      '.win-bar { display: flex; align-items: center; gap: calc(var(--u) * 1.1); padding: calc(var(--u) * 1.8) calc(var(--u) * 2.4); background: #F8FAFC; border-bottom: 1px solid rgba(10,10,14,0.08); }',
      '.d { width: calc(var(--u) * 1.4); height: calc(var(--u) * 1.4); border-radius: 50%; }',
      '.r { background: #FF5F56; } .y { background: #FFBD2E; } .g { background: #27C93F; }',
      '.tab { margin-left: calc(var(--u) * 1.6); font-family: var(--mono); font-size: calc(var(--u) * 2.2); font-weight: 600; color: #64748B; }',
      '.tab.active { color: #0A0A0E; border-bottom: 2px solid var(--accent); padding-bottom: 2px; }',
      '.code-body { padding: calc(var(--u) * 3) calc(var(--u) * 2.8); display: flex; flex-direction: column; gap: calc(var(--u) * 1.6); font-family: var(--mono); font-size: calc(var(--u) * 2.55); font-weight: 600; }',
      '.cl { display: flex; gap: calc(var(--u) * 2); align-items: baseline; }',
      '.ln { color: #94A3B8; width: calc(var(--u) * 2.4); text-align: right; }',
      '.cm { color: #64748B; font-weight: 500; }',
      '.hl { color: var(--accent); font-weight: 800; }',
      '.chips { display: flex; gap: calc(var(--u) * 1.4); padding: 0 calc(var(--u) * 2.8) calc(var(--u) * 2.6); }',
      '.chip { font-family: var(--mono); font-size: calc(var(--u) * 2.2); font-weight: 700; padding: calc(var(--u) * 0.6) calc(var(--u) * 1.6); border-radius: 999px; border: 1px solid rgba(10,10,14,0.14); color: #475569; }',
      '.chip.on { background: #0A0A0E; color: #FFFFFF; border-color: #0A0A0E; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from(".win-box", { y: 20, scale: 0.96, opacity: 0 }, { at: 0, dur: 280, ease: "outStrong" });',
      'tl.from([".c1", ".c2", ".c3"], { x: -16, opacity: 0 }, { at: 180, each: 220, dur: 260, ease: "outStrong" });',
      'tl.from(".chip", { scale: 0.85, opacity: 0 }, { at: 720, each: 90, dur: 220, ease: "back" });',
      'mp.sfx("pop", 180);',
      'mp.sfx("tick", 620);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 620,
  },

  /** Compact floating card strictly inside the clipped top 28% band above the speaker's head. */
  'top-card-pill': {
    html: `<div class="top-wrap">
  <div class="pill">
    <div class="eyebrow">ZERO FRICTION</div>
    <div class="main-row"><span class="val">100%</span><span class="label">Open &amp; instant</span></div>
  </div>
</div>`,
    css: [
      '.top-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: calc(var(--u) * 4) calc(var(--u) * 6); box-sizing: border-box; }',
      '.pill { width: 100%; background: rgba(10,10,14,0.92); color: #FFFFFF; border: 1px solid rgba(255,255,255,0.14); border-radius: calc(var(--u) * 2.2); padding: calc(var(--u) * 3) calc(var(--u) * 4); box-shadow: 0 calc(var(--u) * 1.8) calc(var(--u) * 4.4) rgba(0,0,0,0.34); display: flex; flex-direction: column; gap: calc(var(--u) * 0.8); }',
      '.eyebrow { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.4); letter-spacing: 0.12em; color: rgba(255,255,255,0.68); }',
      '.main-row { display: flex; align-items: baseline; gap: calc(var(--u) * 2.4); }',
      '.val { font-family: var(--body); font-weight: 900; font-size: calc(var(--u) * 7.4); line-height: 1; color: var(--accent); }',
      '.label { font-family: var(--body); font-weight: 700; font-size: calc(var(--u) * 4.2); color: #FFFFFF; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from(".pill", { y: -22, scale: 0.95, opacity: 0 }, { at: 0, dur: 280, ease: "outStrong" });',
      'mp.sfx("pop", 60);',
      'tl.to(".pill", { y: -16, opacity: 0 }, { at: ctx.durationMs - 220, dur: 220, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 360,
  },

  /** Minimal lower-chest floating editorial card on a `clean` / `full` beat (zero face overlap). */
  'clean-cta': {
    html: `<div class="cta-card">
  <svg class="chat-ico" viewBox="0 0 36 36"><path d="M6 8h24v16H14l-6 5V8z"/></svg>
  <div class="cta-text"><div class="k">COMMENT</div><div class="v">ANIMATE</div></div>
</div>`,
    css: [
      '.cta-card { position: absolute; left: 9%; right: 9%; top: 64%; background: #FFFFFF; color: #0A0A0E; border-radius: calc(var(--u) * 2.2); padding: calc(var(--u) * 3.4) calc(var(--u) * 4.4); box-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 5) rgba(0,0,0,0.32); display: flex; align-items: center; gap: calc(var(--u) * 3.6); }',
      '.chat-ico { width: calc(var(--u) * 8.4); height: calc(var(--u) * 8.4); fill: none; stroke: #0A0A0E; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto; }',
      '.k { font-family: var(--mono); font-weight: 700; font-size: calc(var(--u) * 2.5); letter-spacing: 0.1em; color: #64748B; }',
      '.v { font-family: var(--body); font-weight: 900; font-size: calc(var(--u) * 6.4); line-height: 1.05; letter-spacing: -0.02em; color: #0A0A0E; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'tl.from(".cta-card", { y: 24, scale: 0.94, opacity: 0 }, { at: 0, dur: 300, ease: "outStrong" });',
      'mp.sfx("pop", 80);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 360,
  },
} as const satisfies Record<string, ArchetypeExample>;

/**
 * Selects the strongest flagship Film Kit reference archetype for a given visual style, skill,
 * prompt, or layout so `reel.compose` matches the exact craft language (Apple Keynote, Kinetic
 * Lime, Vox Paper Collage, Financial Newsprint, Dark SaaS Glass, Blueprint Schematic, etc.).
 */
export function pickStageArchetype(opts: {
  styleDirection?: string;
  styleId?: string;
  prompt?: string;
  layout?: string;
}): ArchetypeExample {
  if (opts.layout === 'speaker') return REEL_STAGE_EXAMPLES['clean-cta'];
  const s = `${opts.styleId ?? ''} ${opts.styleDirection ?? ''} ${opts.prompt ?? ''}`.toLowerCase();
  if (/\b(apple|keynote|notch|macos|iphone|macbook|launch-film)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['apple-keynote-notch'];
  }
  if (/\b(kinetic|lime|opus-video|anti-ppt|colorblock|slam|brutalist|retro-terminal|crt)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['kinetic-reel-slam'];
  }
  if (/\b(newsprint|bloomberg|financial|economist|wsj|nyt|chart|revenue|margin|earnings|data-story)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['financial-newsprint-chart'];
  }
  if (/\b(blueprint|schematic|3b1b|3blue1brown|architecture|mechanism|system-diagram|pipeline|kurzgesagt)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['blueprint-system-diagram'];
  }
  if (/\b(liquid-glass|saas|launch-video|creator-dark|midnight-neon|dark-studio|3d-opener|glass|demo)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['dark-saas-glass-ui'];
  }
  if (/\b(vox|collage|paper|risograph|riso|zine|cutout|scrapbook|editorial|warm|cream|whiteboard|sketch)\b/.test(s)) {
    return REEL_STAGE_EXAMPLES['vox-collage-editorial'];
  }
  return REEL_STAGE_EXAMPLES['split-inspector'];
}

/**
 * Picks a stage-matched Swiss/Studio Reel v2 reference example so builders NEVER receive an
 * example from the wrong stage (e.g. never a top-half curtain on a full/clean beat, spec 24 R3.2).
 */
export function reelExampleFor(
  stage?: VideoStageMode,
  archetype?: BeatArchetype,
  lead?: string,
): ArchetypeExample {
  if (stage === 'top-card') return REEL_STAGE_EXAMPLES['top-card-pill'];
  if (
    stage === 'clean' ||
    stage === 'full' ||
    stage === 'broll-full' ||
    stage === 'split-top-broll'
  ) {
    return REEL_STAGE_EXAMPLES['clean-cta'];
  }
  switch (archetype) {
    case 'callout-hud':
      return REEL_STAGE_EXAMPLES['split-window'];
    case 'comparison-split':
      return REEL_STAGE_EXAMPLES['split-compare'];
    case 'diagram-flow':
      return REEL_STAGE_EXAMPLES['split-checklist'];
    case 'data-chart':
    case 'hero-stat':
      return REEL_STAGE_EXAMPLES['split-inspector'];
    case 'kinetic-type':
    case 'map-story':
    default:
      return lead === 'type'
        ? REEL_STAGE_EXAMPLES['split-checklist']
        : REEL_STAGE_EXAMPLES['split-inspector'];
  }
}

/**
 * Legacy archetype few-shot library (spec 19, refreshed in spec 24 with zero opaque `mp.stage`
 * leakage so voiceover-only films and legacy tests stay clean and lint-valid).
 */
export const ARCHETYPE_EXAMPLES: Readonly<Record<BeatArchetype, ArchetypeExample>> = {
  'kinetic-type': REEL_STAGE_EXAMPLES['split-checklist'],
  'hero-stat': REEL_STAGE_EXAMPLES['top-card-pill'],
  'callout-hud': REEL_STAGE_EXAMPLES['split-window'],
  'data-chart': REEL_STAGE_EXAMPLES['split-inspector'],
  'diagram-flow': REEL_STAGE_EXAMPLES['split-checklist'],
  'comparison-split': REEL_STAGE_EXAMPLES['split-compare'],
  'map-story': {
    html: '<div class="map-wrap"><div class="globe-tag">GLOBAL REACH</div></div>',
    css: [
      '.map-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: calc(var(--u) * 5); box-sizing: border-box; }',
      '.globe-tag { align-self: flex-start; padding: calc(var(--u) * 1) calc(var(--u) * 2.2); border-radius: 999px; background: var(--ink); color: var(--bg); font-family: var(--mono); font-weight: 800; font-size: calc(var(--u) * 2.4); letter-spacing: 0.1em; }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      'const globe = mp.globe({ x: "23%", y: "16%", size: "54%", lon: -24, lat: 22 });',
      'tl.from(".globe-tag", { y: -14, opacity: 0 }, { at: 0, dur: 260, ease: "outStrong" });',
      'tl.from(globe.el, { scale: 0.88, opacity: 0 }, { at: 40, dur: 380, ease: "outStrong" });',
      'tl.fn((p) => globe.set(-24 + p * 54, 22, 1), { at: 80, dur: Math.max(900, ctx.durationMs - 240), ease: "linear" });',
      'mp.sfx("whoosh", 80);',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 540,
  },
};

/** Picks the best archetype reference example for a beat (spec 19). */
export function archetypeExample(archetype?: BeatArchetype, lead?: string): ArchetypeExample {
  if (archetype && Object.hasOwn(ARCHETYPE_EXAMPLES, archetype)) {
    return ARCHETYPE_EXAMPLES[archetype];
  }
  if (lead === 'map') return ARCHETYPE_EXAMPLES['map-story'];
  if (lead === 'number') return ARCHETYPE_EXAMPLES['hero-stat'];
  if (lead === 'type') return ARCHETYPE_EXAMPLES['kinetic-type'];
  return ARCHETYPE_EXAMPLES['diagram-flow'];
}
