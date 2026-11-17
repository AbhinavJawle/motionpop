import {
  FILM_BANNED,
  FILM_LAYOUT_RULES,
  FILM_MOTION_RULES,
  FILM_PICTURE_RULES,
} from './film-craft.v1';

/**
 * `film.build` prompt v1 (spec 07b R2). The Builder writes one beat of a film as markup, CSS and
 * a script on the film kit. It never sees the other builders' code: what makes the beats one
 * film is the storyboard they all read (the world, the shared drawings, and the seam each side
 * of a cut follows), and the kit, which gives every beat the same finish.
 *
 * `kitDoc` is the kit's own reference (packages/motion/src/film/doc.ts), injected by the app.
 */
export function filmBuildSystemV1(kitDoc: string): string {
  return `You build ONE beat of a short motion-graphics film that plays over a voiceover. A director has written the storyboard; other builders are making the other beats at the same time. Your beat must look like part of the same film and hand over cleanly on both sides.
Answer with JSON only: { "title", "html", "css", "script", "keyMomentMs" }.

THE CONTRACT
- html: your elements, inside a root that is position:absolute; inset:0. No <script>, <style>, <iframe>, <link>, <img>, inline event handlers or external URLs. Inline <svg> is how you draw.
- css: plain rules, scoped to your beat for you. No @-rules, no animation or transition properties, no url(). Colours only from the look: var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) var(--paper) var(--positive) var(--negative). Fonts: var(--display) for headlines, var(--body) for labels and numbers, var(--mono). Size everything with calc(var(--u) * N); --u is 1 % of the frame's short side. Never hide, fade or transform an animated element in css: the timeline owns that.
- script: the body of a function called once with (root, ctx, mp). It builds the picture, declares all motion on ONE timeline and ends with: return tl;
  The timeline draws any time t, in any order, from t alone. Never keep state, never read the clock.
  ctx = { width, height, format, durationMs, keyMomentMs, tailMs, headMs, seed, colors, fonts, words: [{ text, startMs, endMs }] } with word times from the start of your beat.
  Not available: Date, performance, Math.random, timers, requestAnimationFrame, fetch, window, document, globalThis, eval, Function, addEventListener, element.animate, GSAP or any library. Find your elements with root.querySelector.
- The ground is the film's own paper, already there: leave your root transparent. Only a map, a sheet (mp.sheet) or a paper card covers it.
- keyMomentMs: when your hero lands. title: 2 to 5 words naming the beat.

${kitDoc}

SEAMS (the director chose yours; follow them exactly, with the kit's own moves so both sides of the cut agree)
Entering, from the previous beat's seam:
- push:  tl.enter("push", [first elements, in reading order]). They arrive from the right, already moving. Nothing else is on screen before them.
- zoom:  wrap the picture in one element and tl.enter("zoom", wrapper, { origin: "x% y%" }) with the origin on the object named in the seam.
- cover: start your script with const sheet = mp.sheet(); then tl.enter("cover", sheet). Your whole beat is on that page, which slides in over the previous beat. Start your own reveals after ctx.headMs.
- lift:  the previous beat is still in front of you for ctx.headMs and is being pulled away. Your main picture (the map, the drawing) is on screen from t = 0 with NO entrance of its own, so the page comes off a finished frame; only labels and numbers arrive later, after ctx.headMs.
- match: open on EXACTLY the frame the seam describes with no entrance for the shared thing. For a map that means map.set(view, zoom) with the seam's own numbers as your opening view, before any fly. New things arrive after 200 ms.
- (first beat): the first frame is the film's thumbnail. The picture itself (the recurring element, big) is on screen from t = 0 or arrives within 300 ms, whatever word names it; the words then reveal the rest.
Leaving, by your own seam:
- push:  tl.exit("push", [everything on screen, in reading order]). Call it LAST, after all other tweens of those elements.
- zoom:  tl.exit("zoom", wrapper, { origin: "x% y%" }) with the origin on the object the next beat opens on.
- lift:  start your script with const sheet = mp.sheet(); and end with tl.exit("lift", sheet). Hold your frame until ctx.durationMs; the page is pulled away during the tail.
- cover: hold your final frame dead still to the end. No exit.
- match: over the last 300 ms remove what is not part of the shared thing (labels, cards) and end on exactly the frame the seam describes. For a map, your last map.fly lands on the seam's own view and zoom at least 300 ms before the end.
- (last beat): everything has landed by 60 % of the beat; then hold still to the end. No exit.
Never fade or move the whole frame yourself outside these.

${FILM_PICTURE_RULES}

${FILM_LAYOUT_RULES}

${FILM_MOTION_RULES}

SIZE (the most common failure is a timid frame)
- The hero number is huge: font-size calc(var(--u) * 16) or more. A hero line of words is calc(var(--u) * 8) or more. Quiet labels are calc(var(--u) * 3) to calc(var(--u) * 3.6). Nothing at all under calc(var(--u) * 2.6): no captions, tick labels, datelines or stamps smaller than that.
- The picture is big: a drawing or shared drawing spans 50 to 85 % of the frame width, or fills its two thirds. Together the hero and the picture span most of the frame. Everything stays fully inside the frame.

DRAWING
- Draw real things simply and correctly: a few confident shapes in var(--ink) with one accent, flat fills, no outlines around everything, no tiny decorative labels.
- Geography always comes from mp.map, never from a hand-drawn outline. Things at a place (dots for ships, a marker) are sized for the zoom they are seen at: with map.scatter give a spread of mp.u * 8 or more, and keep the camera close enough that the cluster spans a fifth of the frame.
- Use the film's shared drawings (mp.prop) where the storyboard names them, so the same thing looks the same in every beat.
- On-screen copy is the storyboard's text, exactly. You may add place names on a map. No other words: no datelines, sources, captions, stamps, tags or report headers. No number that is not in the storyboard's text or the spoken words (a reviewer checks every figure on screen against the narration).
- Keep text inside mp.safe. For 9:16 stack the picture above the text.

${FILM_BANNED}`;
}

export interface FilmBuildPromptInput {
  film: { title: string; thesis: string; world: string; carrier: string };
  props: { id: string; draw: string; width: number; height: number }[];
  beat: {
    index: number;
    count: number;
    lead: string;
    idea: string;
    text: string[];
    staging: string;
    /** The hero's word, as text, and its time in the beat. */
    landsOn: string;
    keyMomentMs: number;
  };
  words: { text: string; startMs: number }[];
  durationMs: number;
  tailMs: number;
  headMs: number;
  /** The seam from the previous beat into this one; null on the first beat. */
  seamIn: { kind: string; note: string; from: string } | null;
  /** The seam from this beat into the next; null on the last beat. */
  seamOut: { kind: string; note: string; to: string } | null;
  format: string;
  look: { name: string; description: string };
  example: { html: string; css: string; script: string };
  /** A repair: the beat as built, and what the critic found. */
  fix?: { html: string; css: string; script: string; problems: string };
}

export function filmBuildPromptV1(i: FilmBuildPromptInput): string {
  const spoken = i.words.map((w, k) => `${k}:${w.text}@${w.startMs}`).join(' ');
  const lines = [
    `FILM: "${i.film.title}". ${i.film.thesis}`,
    `World: ${i.film.world}`,
    `Recurring element: ${i.film.carrier}`,
    i.props.length
      ? `Shared drawings: ${i.props.map((p) => `mp.prop("${p.id}") is ${p.draw} (box ${p.width} × ${p.height})`).join(' · ')}`
      : 'Shared drawings: none.',
    '',
    `YOUR BEAT: ${i.beat.index + 1} of ${i.beat.count}, led by ${i.beat.lead}.`,
    `Picture: ${i.beat.idea}`,
    `On-screen text, exactly: ${i.beat.text.length ? i.beat.text.map((t) => `"${t}"`).join(' / ') : '(none)'}`,
    `Staging: ${i.beat.staging}`,
    `The hero lands on "${i.beat.landsOn}" at ${i.beat.keyMomentMs} ms.`,
    `Spoken words (index:word@ms): ${spoken}`,
    `Duration: ${i.durationMs} ms (ctx.durationMs) · tail ${i.tailMs} ms · head ${i.headMs} ms · Format: ${i.format} · Look: ${i.look.name} (${i.look.description})`,
    '',
    i.seamIn
      ? `ENTER by "${i.seamIn.kind}": ${i.seamIn.note} (The previous beat: ${i.seamIn.from})`
      : 'ENTER: you are the first beat.',
    i.seamOut
      ? `LEAVE by "${i.seamOut.kind}": ${i.seamOut.note} (The next beat: ${i.seamOut.to})`
      : 'LEAVE: you are the last beat. Land everything and hold.',
  ];
  if (i.fix) {
    lines.push(
      '',
      'You built this beat already. A reviewer watched it and found problems. Fix every one and return the whole beat again; keep what works.',
      `Problems:\n${i.fix.problems}`,
      `html: ${i.fix.html}`,
      `css: ${i.fix.css}`,
      `script:\n${i.fix.script}`,
    );
  } else {
    lines.push(
      '',
      'An example of the contract and the kit (a different beat from another film; copy neither its idea nor its layout):',
      `html: ${i.example.html}`,
      `css: ${i.example.css}`,
      `script:\n${i.example.script}`,
    );
  }
  return lines.join('\n');
}

/**
 * `film.props` prompt v1: the film's shared drawings, drawn once so every beat shows the same
 * thing.
 */
export const FILM_PROPS_SYSTEM_V1 = `You draw the shared pictures of a short motion-graphics film as inline SVG. Each is drawn once and reused in several beats, so it has to be simple, correct and good at any size.
Answer with JSON only: { "props": [{ "id", "svg" }] }, one entry for every drawing asked for, same ids.

Each svg:
- One <svg viewBox="0 0 W H"> with the box you were given, no width or height attributes, no <script>, <style>, <image>, <foreignObject>, no external references, no text.
- Flat shapes only: paths, rects, circles, polygons, lines. No gradients, filters, shadows or strokes around everything.
- Colours as style attributes with the look's variables, so the drawing follows the film: style="fill:var(--ink)" for the main mass, var(--accent) for the one part that matters, var(--muted) and var(--paper) for secondary parts, var(--accent2) sparingly. Never a hex colour.
- Draw the real thing with its telling details (a container ship has a long low hull, a bridge tower near the stern, a funnel, and rows of stacked boxes), built from a few confident shapes. Fill the box edge to edge.
- Give the main parts ids (id="hull", id="boxes") so a builder can animate them.
- Under 6,000 characters each.`;

export function filmPropsPromptV1(i: {
  film: { title: string; world: string };
  props: { id: string; draw: string; width: number; height: number }[];
}): string {
  return [
    `Film: "${i.film.title}". World: ${i.film.world}`,
    'Draw:',
    ...i.props.map((p) => `- id "${p.id}", box ${p.width} × ${p.height}: ${p.draw}`),
  ].join('\n');
}
