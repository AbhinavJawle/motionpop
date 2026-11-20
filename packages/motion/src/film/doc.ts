import { KIT_ICON_NAMES } from './icons.generated';

/**
 * The film kit's reference, as the model reads it (spec 07b). It lives next to the code it
 * describes so the two change together; a test checks that every `mp.` name here exists.
 */
export const KIT_DOC = `THE KIT (mp). Use it: it carries the house finish (paper, hand-drawn marks, a real map, voice-synced timing).

Frame and voice
  mp.W, mp.H            frame size in px.  mp.u = 1 % of the short side.  mp.safe = { x, y, w, h } text-safe box.
  ctx.words             [{ text, startMs, endMs }] the spoken words of this beat, times from the beat's start.
  mp.at("billion")      ms when a spoken word starts (text, a phrase, or a word index). mp.said("billion") → boolean.

Timeline (declare everything once; it draws any time t, in any order)
  const tl = mp.timeline();
  tl.from(target, { y: 40, opacity: 0, blur: 8 }, { on: "billion", dur: 600, ease: "outStrong" })
  tl.to(target, { x: -300, opacity: 0 }, { at: 3200, dur: 300, ease: "in" })
  tl.fromTo(target, { scale: 0.6 }, { scale: 1 }, { at: 500 })      tl.set(target, { opacity: 1 }, { at: 900 })
    target: an element, an array of elements, or a selector string (looked up inside the graphic).
    props:  x, y (px, or "50%" of the element), scale, scaleX, scaleY, rotate, rotateX, rotateY, skewX (deg), perspective (px), opacity, blur (px),
            and plain CSS numbers or colours: width, height, left, top, fontSize, color, background, fill, stroke…
            A [from, to] pair works in any call: tl.to(bar, { width: ["0%", "62%"] }, …).
    opts:   at: start time in ms, or a spoken word ("the tween starts on that word");
            on: a spoken word to LAND on (it is timed to arrive as the word is said). Prefer on.
            dur (ms, default 600), each (stagger between targets, ms), origin ("left center"),
            ease: "out" | "outStrong" | "outQuart" | "in" | "inStrong" | "inOut" | "inOutSine" | "back" | "spring" | "linear".
    Before its first tween an element shows that tween's start value, so tl.from() hides things until their moment. Never hide with CSS.
  tl.words(el, { style: "rise" | "blur" | "fade" | "slam" | "ink" })   reveals the element's text word by word. When the text is spoken, each word appears as it is said. Give { at } or { on } to place a line that isn't spoken.
  tl.count(el, { to: 9.6, decimals: 1, prefix: "$", on: "9.6", dur: 900 })   counts a number up.
  tl.draw(target, { on: "canal", dur: 700 })   draws strokes on: SVG path/line/circle…, or a mark, line or route from the kit.
  tl.wipe(el, { from: "left" | "right" | "top" | "bottom" | "center", at, dur })   reveals by opening a clip. { out: true } closes it.
  tl.fn((p) => { … }, { at, dur, ease })   your own drawing from eased progress p (0 before, 1 after).
  tl.enter(kind, targets) / tl.exit(kind, targets, { origin })   the two halves of a film seam ("push" | "zoom" | "cover" | "lift" | "whip"), with fixed distances and eases so both sides of a cut agree.
  return tl;   // or: return { seek(t) { tl.seek(t); … } }

Materials and marks
  const card = mp.paper({ x: "8%", y: "22%", w: "52%", h: "44%", tilt: -1.5, tape: true });   a torn paper card with a soft shadow.
      Put content in card.body (card.body.innerHTML = …, or mp.el(tag, attrs, text, card.body)). Animate card itself.
  const sheet = mp.sheet();   a full-frame page in the ground colour, for seams that move the whole page ("cover", "lift"). Call it FIRST: it takes everything in your html and everything the kit makes afterwards. Never re-parent anything yourself.
  const hl = mp.mark(el, "highlight" | "underline" | "circle" | "box" | "strike", { color });   a hand-made mark on an HTML text element (wrap the key words in a <span>). Reveal: tl.draw(hl, { on: "word" }).
  const ln = mp.line([[x, y], [x, y], …], { color, width, arrow: true, curve: true });   a hand-drawn line or arrow in frame px. Reveal with tl.draw.
  mp.torn(w, h)         a torn-edge clip-path string for your own paper shapes.
  mp.colors             { bg, ink, muted, accent, accent2, highlight, positive, negative, paper, chart[] }.  mp.mix(a, b, t), mp.alpha(hex, a).

Pictures
  mp.icon("ship", { size: "14u", color, parent })   an outline icon. Names: ${KIT_ICON_NAMES.join(' ')}.
  const dots = mp.dots(369, { x, y, w, h, layout: "grid" | "cluster", color });   n dots in a box; tl.from(dots, { scale: 0 }, { at, each: 8, dur: 300 }).
  mp.prop("ship", { w: "60%", parent })   a drawing shared by the whole film (only ids the brief lists). w is px, "%" of the frame width (of the parent's width when you give a parent), or "u". Returns the <svg>: position it with css on a wrapper, animate it like any element.
  mp.el(tag, attrs, text, parent)   creates an element (SVG tags work); or write inline <svg> in html and draw your own picture.

Map (a real world map, flat, with a camera)
  const map = mp.map({ view: "world" });                    full frame, behind your html; { x, y, w, h } for a map in a box. map.el is its element. Views: "world", a country, city or region name, or [lon, lat]. Zoom guide: 1 world, 3 a continent, 6 a country, 12 a region, 25 a city or a canal.
  map.set("Egypt")  /  map.set([32.5, 30.5], 22)            the opening view (zoom 1 = the world across the frame).
  map.fly(tl, [32.35, 30.6], { zoom: 24, on: "canal", dur: 2200 })   moves the camera; several calls chain.
  const r = map.route([[32.3, 31.25], [32.55, 29.95]], { color, width });   a line through places or [lon, lat] points; tl.draw(r, …).
  map.pin("Rotterdam", { label: "Rotterdam", side: "left" })    map.label([18, 35], "Mediterranean Sea", { italic: true })
  map.fill("Egypt", color)      map.scatter([32.3, 31.4], 185, { spread: mp.u * 5 }) → dots around a point
  map.marker([32.35, 30.6], svgNode)   your own drawing held at a place.   map.project([lon, lat]) → [x, y] inside map.layer (an SVG <g> that moves with the map).
  Pins, labels, markers and scattered dots keep their size on screen while the map zooms. Animate them like any element.

Fit and sound
  mp.fit(el, "70%")     shrinks an element's font until it fits a width (px, "%" of the frame, or "u").
  mp.sfx("whoosh" | "pop" | "tick" | "rise" | "impact", "billion")   a sound on a word or at a time; at most 4 a beat.
Also: mp.clamp, mp.lerp, mp.progress(t, start, dur), mp.ease.*, mp.rng(seed), mp.count(value, p, decimals), mp.split(el) → word spans.`;

/**
 * A complete beat written with the kit: the example in the builder prompt and the fixture of the
 * kit's tests. One number made physical: a count, a highlighted phrase and a row of dots.
 */
export function kitExample(): { html: string; css: string; script: string; keyMomentMs: number } {
  return {
    html: '<div class="wrap"><div class="eyebrow">Every single day</div><div class="hero"><span class="num">0</span><span class="unit">cups</span></div><div class="line">drunk <span class="key">before 9 a.m.</span></div></div>',
    css: [
      '.wrap { position: absolute; left: 8%; top: 16%; width: 46%; }',
      '.eyebrow { font-family: var(--body); font-weight: 600; font-size: calc(var(--u) * 3); color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }',
      '.hero { display: flex; align-items: baseline; gap: calc(var(--u) * 2); margin-top: calc(var(--u) * 2); }',
      '.num { font-family: var(--body); font-weight: 800; font-size: calc(var(--u) * 21); line-height: 1; color: var(--accent); }',
      '.unit { font-family: var(--display); font-weight: 800; font-size: calc(var(--u) * 9); color: var(--ink); }',
      '.line { position: relative; font-family: var(--display); font-weight: 700; font-size: calc(var(--u) * 5.4); color: var(--ink); margin-top: calc(var(--u) * 2); }',
    ].join('\n'),
    script: [
      'const tl = mp.timeline();',
      '// The picture: one dot per cup, on the right two thirds, filling as the number counts.',
      'const dots = mp.dots(240, { x: "56%", y: "18%", w: "36%", h: "62%", color: mp.colors.ink });',
      'const land = mp.said("million") ? "million" : 0;',
      'tl.words(".eyebrow", { style: "ink", at: 80 });',
      'tl.from(".hero", { y: 60, opacity: 0, blur: 10 }, { on: land, dur: 520 });',
      'tl.count(".num", { to: 240, on: land, dur: 1100 });',
      'tl.from(dots, { scale: 0, opacity: 0 }, { at: mp.at(land), each: 4, dur: 260, ease: "back" });',
      'tl.words(".line", { style: "rise", at: mp.at(land) + 900 });',
      'const hl = mp.mark(root.querySelector(".key"), "highlight");',
      'tl.draw(hl, { at: mp.at(land) + 1500, dur: 420 });',
      'mp.sfx("tick", land);',
      '// Leave in one direction, accelerating, so the next beat can carry the move on.',
      'tl.to([".wrap", dots], { x: -mp.W * 0.14, opacity: 0, blur: 8 }, { at: ctx.durationMs - 300, dur: 300, ease: "in" });',
      'return tl;',
    ].join('\n'),
    keyMomentMs: 600,
  };
}
