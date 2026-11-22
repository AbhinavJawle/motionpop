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
