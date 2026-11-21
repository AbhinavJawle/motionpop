/**
 * The film critic (spec 07b): looks at one generated beat the way a reviewer would, by seeking
 * it to a handful of moments and measuring what is on screen. Every problem comes back as one
 * line a model can act on: what is wrong, when, by how much, and what to do about it.
 *
 * It measures the real DOM, so it runs where layout exists: inside the composition (the sandboxed
 * preview frame, the render page, the lab's headless browser). It never looks at pixels; the
 * picture check by a vision model is a separate, later pass.
 */
export type CriticRule =
  | 'error'
  | 'blank'
  | 'late-start'
  | 'off-frame'
  | 'tiny-text'
  | 'overlap'
  | 'too-much-text'
  | 'static'
  | 'dead-stretch'
  | 'not-pure'
  | 'not-cleared'
  | 'no-picture'
  | 'low-contrast'
  | 'idle-loop'
  | 'small-hero'
  | 'small-picture'
  | 'picture-off-frame'
  | 'made-up-number'
  | 'caption-collision'
  | 'face-collision'
  | 'banned-pattern';

export interface CriticReport {
  rule: CriticRule;
  /** `fix`: the beat is rejected until it is repaired. `note`: sent back, but never blocks. */
  level: 'fix' | 'note';
  /** Beat time in ms the problem was seen at (0 when it is about the whole beat). */
  atMs: number;
  hint: string;
}

export interface CriticOptions {
  durationMs: number;
  keyMomentMs: number;
  /** Film beats: how long the beat stays after its slot ends. */
  tailMs?: number;
  /** During the tail the beat is in front of the next one, so it has to clear the frame. */
  over?: 'out' | 'in';
  /** The beat is meant to show a picture, not only type. */
  wantsPicture?: boolean;
  /** The beat opens under the previous beat's tail: an empty first moment is fine. */
  headMs?: number;
  width: number;
  height: number;
  /** The look's ground colour, for contrast when nothing else is behind the text. */
  bg: string;
  /** Errors and warnings the runtime recorded for this slot. */
  errors?: readonly string[];
  /** The beat's lead (`number` and `type` beats need a bigger hero). */
  lead?: string;
  /**
   * Figures the beat may show, as plain digits (the narration's and the storyboard's). When
   * given, any other number on screen is reported.
   */
  allowNumbers?: readonly string[];
  /**
   * Transparent beat over live speaker video (spec 19 R3.4): relaxes full-frame coverage minimums
   * and skips fallback contrast checks against the solid look background when no solid box sits
   * behind the text.
   */
  transparent?: boolean;
  /** Reserved vertical pixel band `[top, bottom]` where live captions sit; graphic text must stay clear of it. */
  captionBand?: { top: number; bottom: number };
  /** Coupled video stage mode (`split-top-stage`, `top-card`, `clean`, etc., spec 23). */
  videoStage?: string;
}

export interface CriticSummary {
  reports: CriticReport[];
  /** What was on screen at the key moment, for the storyboard's continuity notes. */
  stats: {
    textWords: number;
    texts: string[];
    shapes: number;
    hasMap: boolean;
    hasPaper: boolean;
    distinctFrames: number;
    samples: number;
  };
}

interface Seen {
  el: Element;
  rect: DOMRect;
  text: string;
  fontPx: number;
  color: string;
}

const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function parseRgb(c: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(c);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) {
    const x = h[1] as string;
    return [
      parseInt(x.slice(0, 2), 16),
      parseInt(x.slice(2, 4), 16),
      parseInt(x.slice(4, 6), 16),
      1,
    ];
  }
  return null;
}
function luminance([r, g, b]: readonly number[]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r as number) + 0.7152 * f(g as number) + 0.0722 * f(b as number);
}
function contrast(a: readonly number[], b: readonly number[]): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/**
 * Inspects one mounted beat. `host` is the slot's element, `seek` draws beat time `t` (ms from
 * the slot's start). Leaves the beat at its key moment.
 */
export function inspectBeat(
  host: Element,
  seek: (tMs: number) => void,
  o: CriticOptions,
): CriticSummary {
  const view = host.ownerDocument.defaultView;
  const reports: CriticReport[] = [];
  const add = (rule: CriticRule, level: CriticReport['level'], atMs: number, hint: string) => {
    if (!reports.some((r) => r.rule === rule && r.hint === hint))
      reports.push({ rule, level, atMs: Math.round(atMs), hint });
  };
  const emptyStats = {
    textWords: 0,
    texts: [],
    shapes: 0,
    hasMap: false,
    hasPaper: false,
    distinctFrames: 0,
    samples: 0,
  };
  for (const e of o.errors ?? []) add('error', 'fix', 0, `the script failed: ${clip(e, 220)}`);
  if (!view || reports.length) return { reports, stats: emptyStats };

  const frame = { left: 0, top: 0, right: o.width, bottom: o.height };
  const hostRect = host.getBoundingClientRect();
  // The slot fills the frame; measure relative to it so a scaled preview reads the same.
  const kx = hostRect.width > 0 ? o.width / hostRect.width : 1;
  const ky = hostRect.height > 0 ? o.height / hostRect.height : 1;
  const local = (r: DOMRect) =>
    ({
      left: (r.left - hostRect.left) * kx,
      top: (r.top - hostRect.top) * ky,
      right: (r.right - hostRect.left) * kx,
      bottom: (r.bottom - hostRect.top) * ky,
      width: r.width * kx,
      height: r.height * ky,
    }) as DOMRect;

  /** Opacity of an element with every ancestor's applied, and whether anything hides it. */
  const shown = (el: Element): number => {
    let a = 1;
    for (let n: Element | null = el; n && n !== host.parentElement; n = n.parentElement) {
      const cs = view.getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      a *= Number(cs.opacity);
      if (a < 0.02) return 0;
    }
    return a;
  };
  const inFrame = (r: DOMRect) =>
    r.width > 0.5 &&
    r.height > 0.5 &&
    r.right > 1 &&
    r.bottom > 1 &&
    r.left < o.width - 1 &&
    r.top < o.height - 1;

  const textNodes = (): Seen[] => {
    const out: Seen[] = [];
    for (const el of Array.from(host.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'style' || tag === 'defs' || tag === 'title') continue;
      // A text leaf: it has text of its own. Words split for a reveal count through their line.
      if (el.hasAttribute('data-mp-word')) continue;
      const own = Array.from(el.childNodes)
        .filter(
          (n) =>
            n.nodeType === 3 || (n.nodeType === 1 && (n as Element).hasAttribute('data-mp-word')),
        )
        .map((n) => (n.nodeType === 3 ? (n.textContent ?? '') : ''))
        .join('');
      const split = Array.from(el.children).filter((c) => c.hasAttribute('data-mp-word'));
      if (!own.trim() && split.length === 0) continue;
      // Words still waiting to be revealed don't count as on screen.
      const visibleWords = split.filter((w) => shown(w) > 0.25);
      const text = (
        own.trim() +
        ' ' +
        visibleWords.map((w) => w.textContent ?? '').join(' ')
      ).trim();
      if (!text) continue;
      if (shown(el) < 0.25) continue;
      const r = local(
        visibleWords.length && !own.trim()
          ? union(visibleWords.map((w) => w.getBoundingClientRect()))
          : el.getBoundingClientRect(),
      );
      if (!inFrame(r)) continue;
      const cs = view.getComputedStyle(el);
      const scale =
        el.getBoundingClientRect().height /
        Math.max(1, (el as HTMLElement).offsetHeight || el.getBoundingClientRect().height);
      out.push({
        el,
        rect: r,
        text,
        fontPx: parseFloat(cs.fontSize) * (Number.isFinite(scale) && scale > 0 ? scale : 1) * ky,
        color: tag === 'text' || tag === 'tspan' ? cs.fill : cs.color,
      });
    }
    return out;
  };
  const shapesNow = (): number => {
    let n = 0;
    for (const el of Array.from(
      host.querySelectorAll(
        'svg path, svg circle, svg rect, svg line, svg polygon, svg polyline, svg ellipse, img, canvas',
      ),
    )) {
      if (shown(el) < 0.15) continue;
      if (inFrame(local(el.getBoundingClientRect()))) n++;
    }
    return n;
  };
  /** Anything at all on screen: text, shapes, or a filled box. */
  const visibleNow = (): boolean => {
    if (textNodes().length > 0 || shapesNow() > 0) return true;
    for (const el of Array.from(host.querySelectorAll('div, span, section, figure'))) {
      const cs = view.getComputedStyle(el);
      const bg = parseRgb(cs.backgroundColor);
      if ((!bg || bg[3] < 0.1) && cs.backgroundImage === 'none') continue;
      if (shown(el) < 0.15) continue;
      const r = local(el.getBoundingClientRect());
      if (inFrame(r) && r.width * r.height > o.width * o.height * 0.002) return true;
    }
    return false;
  };
  /** What the frame looks like as a string: equal strings are equal frames. */
  const signature = (): string => {
    let s = '';
    for (const el of Array.from(host.querySelectorAll('*'))) {
      const style = el.getAttribute('style');
      const tr = el.getAttribute('transform');
      if (style) s += style;
      if (tr) s += tr;
      if (el.childElementCount === 0 && el.textContent && el.tagName.toLowerCase() !== 'style')
        s += el.textContent;
      s += '|';
    }
    return s;
  };

  const dur = o.durationMs;
  const tail = o.tailMs ?? 0;
  const key = Math.min(Math.max(o.keyMomentMs, 0), dur);
  let failed = false;
  const at = (t: number): boolean => {
    try {
      seek(t);
      return true;
    } catch (e) {
      add(
        'error',
        'fix',
        t,
        `seek(${Math.round(t)}) threw: ${clip(String(e instanceof Error ? e.message : e), 200)}`,
      );
      failed = true;
      return false;
    }
  };

  // 1. Purity: the same time gives the same frame whatever was drawn before.
  if (at(key)) {
    const a = signature();
    at(dur * 0.9);
    at(0);
    at(key);
    if (!failed && signature() !== a)
      add(
        'not-pure',
        'fix',
        key,
        'seek(t) gives a different frame after other seeks: set every animated value from t alone and keep no state between calls',
      );
  }
  if (failed) return { reports, stats: emptyStats };

  // 2. Motion: sample the beat and see how the frame changes.
  const step = Math.max(120, Math.min(250, dur / 24));
  const sigs: { t: number; sig: string }[] = [];
  for (let t = 0; t <= dur && !failed; t += step) if (at(t)) sigs.push({ t, sig: signature() });
  if (failed) return { reports, stats: emptyStats };
  const distinct = new Set(sigs.map((s) => s.sig)).size;
  if (distinct < 4)
    add(
      'static',
      'fix',
      0,
      `the beat barely moves (${distinct} different frames in ${secs(dur)}): bring elements in one after another on the spoken words`,
    );
  let run = 0;
  let runStart = 0;
  let worst = { len: 0, from: 0 };
  for (let i = 1; i < sigs.length; i++) {
    if ((sigs[i] as { sig: string }).sig === (sigs[i - 1] as { sig: string }).sig) {
      if (run === 0) runStart = (sigs[i - 1] as { t: number }).t;
      run += step;
      if (run > worst.len) worst = { len: run, from: runStart };
    } else run = 0;
  }
  if (worst.len >= 3200)
    add(
      'dead-stretch',
      'note',
      worst.from,
      `nothing changes for ${secs(worst.len)} from ${secs(worst.from)}: stage a reveal, draw a line or move the camera there`,
    );

  // 3. The opening: something real should be on screen early (unless the last beat is still
  // leaving). A ghosted label or a hairline alone is still an empty frame.
  const openBy = Math.min(dur * 0.35, Math.max(700, (o.headMs ?? 0) + 500));
  at(openBy);
  if (!visibleNow())
    add(
      'late-start',
      'fix',
      openBy,
      `the frame is still empty ${secs(openBy)} in: start the first element within 300 ms`,
    );
  else {
    const rects: DOMRect[] = textNodes().map((t) => t.rect);
    for (const el of Array.from(
      host.querySelectorAll(
        'svg path, svg circle, svg rect, svg polygon, svg ellipse, img, canvas, [data-mp-paper], [data-mp-map], [data-mp-sheet]',
      ),
    )) {
      if (shown(el) < 0.5) continue;
      const r = local(el.getBoundingClientRect());
      if (inFrame(r)) rects.push(r);
    }
    const area = rects.reduce(
      (m, r) => Math.max(m, Math.min(r.width, o.width) * Math.min(r.height, o.height)),
      0,
    );
    if (area < o.width * o.height * 0.02)
      add(
        'late-start',
        'fix',
        openBy,
        `almost nothing is on screen ${secs(openBy)} in: open on the picture itself (the drawing, the map or the hero), then reveal the rest on the words`,
      );
  }

  // 4. The settled frame: after the key moment, before the exit.
  const hold = Math.min(dur - 250, Math.max(key + 500, dur * 0.72));
  at(hold);
  const texts = textNodes();
  const shapes = shapesNow();
  const hasMap = host.querySelector('[data-mp-map]') !== null;
  const hasPaper = host.querySelector('[data-mp-paper]') !== null;
  if (!visibleNow())
    add(
      'blank',
      'fix',
      hold,
      `nothing is on screen at ${secs(hold)}: the beat must hold its picture until its last 300 ms`,
    );
  const minPx = Math.min(o.width, o.height) * 0.024;
  for (const t of texts) {
    const name = `"${clip(t.text)}"`;
    const over = Math.max(
      frame.left - t.rect.left,
      t.rect.right - frame.right,
      frame.top - t.rect.top,
      t.rect.bottom - frame.bottom,
    );
    if (over > Math.min(o.width, o.height) * 0.012)
      add(
        'off-frame',
        'fix',
        hold,
        `${name} runs ${Math.round(over)} px off the frame: make it smaller, wrap it, or move it inside the 8 % margin`,
      );
    if (t.fontPx < minPx)
      add(
        'tiny-text',
        'fix',
        hold,
        `${name} is ${Math.round(t.fontPx)} px tall: nothing readable is under ${Math.round(minPx)} px (2.4 % of the short side)`,
      );
    if (o.captionBand && t.rect.height > 0) {
      const overlapY =
        Math.min(t.rect.bottom, o.captionBand.bottom) - Math.max(t.rect.top, o.captionBand.top);
      if (overlapY / t.rect.height > 0.28) {
        const topPct = Math.round((o.captionBand.top / o.height) * 100);
        const botPct = Math.round((o.captionBand.bottom / o.height) * 100);
        add(
          'caption-collision',
          'fix',
          hold,
          `${name} collides with the live caption band (top ${topPct}%..${botPct}%): move this text cleanly above top ${Math.max(6, topPct - 4)}% or below top ${Math.min(90, botPct + 3)}%`,
        );
      }
    }
    if (o.videoStage === 'top-card' && o.height > o.width) {
      const faceTop = o.height * 0.31;
      const faceBot = o.height * 0.76;
      if (t.rect.bottom > faceTop && t.rect.top < faceBot) {
        add(
          'face-collision',
          'fix',
          hold,
          `${name} intrudes into the speaker face zone on a top-card beat (top 31%..76%): keep all cards and text strictly inside top 6%..29%`,
        );
      }
    }
  }
  // Reject full-frame rectangular viewport borders on transparent video beats (spec 23 R8.2).
  if (o.transparent) {
    for (const el of Array.from(host.querySelectorAll('div, svg rect'))) {
      if (shown(el) < 0.2) continue;
      const r = local(el.getBoundingClientRect());
      if (r.width >= o.width * 0.88 && r.height >= o.height * 0.88) {
        const cs = view.getComputedStyle(el);
        const bw = parseFloat(cs.borderTopWidth || '0') + parseFloat(cs.borderLeftWidth || '0');
        const sw = el.tagName.toLowerCase() === 'rect' ? parseFloat(el.getAttribute('stroke-width') || '0') : 0;
        if (bw >= 1.5 || sw >= 1.5) {
          add(
            'banned-pattern',
            'fix',
            hold,
            'remove the full-frame rectangular border around the viewport; never frame live speaker video with a thin outline box',
          );
          break;
        }
      }
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i] as Seen;
      const b = texts[j] as Seen;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (x <= 2 || y <= 2) continue;
      const small = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
      if ((x * y) / Math.max(1, small) > 0.18)
        add(
          'overlap',
          'fix',
          hold,
          `"${clip(a.text, 32)}" and "${clip(b.text, 32)}" overlap: give each its own place`,
        );
    }
  }
  const words = texts.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
  if (words > 30)
    add(
      'too-much-text',
      'fix',
      hold,
      `${words} words are on screen at once: keep one hero line and one quiet label, and let the picture say the rest`,
    );
  if (o.wantsPicture && o.videoStage !== 'clean' && shapes < 3 && !hasMap)
    add(
      'no-picture',
      'fix',
      hold,
      'the frame is only type: draw the thing the words are about (inline SVG, mp.map, mp.icon, mp.dots) and let the text label it',
    );
  // The hero has to be read from across a room, and the picture has to own the frame.
  const short = Math.min(o.width, o.height);
  const biggest = texts.reduce((m, t) => Math.max(m, t.fontPx), 0);
  const heroMin = short * (o.lead === 'number' || o.lead === 'type' ? 0.085 : 0.05);
  if (texts.length > 0 && biggest < heroMin)
    add(
      'small-hero',
      'fix',
      hold,
      `the biggest text is ${Math.round(biggest)} px tall: the hero should be at least ${Math.round(heroMin)} px (font-size: calc(var(--u) * ${Math.ceil((heroMin / short) * 100 + 1)}))`,
    );
  const sheetOrMap = hasMap || host.querySelector('[data-mp-sheet]') !== null;
  const pictures: { el: Element; rect: DOMRect }[] = [];
  for (const el of Array.from(host.querySelectorAll('svg, img, canvas, [data-mp-paper]'))) {
    if (el.closest('[data-mp-map]') || (el.parentElement?.closest('svg') ?? null) !== null)
      continue;
    if (shown(el) < 0.15) continue;
    // An SVG's own box can be the whole frame while its drawing is small: measure the drawing.
    const kids =
      el.tagName.toLowerCase() === 'svg'
        ? Array.from(
            el.querySelectorAll('path, circle, rect, line, polygon, polyline, ellipse, text'),
          ).filter((k) => shown(k) > 0.15)
        : [];
    const rects = (kids.length ? kids : [el])
      .map((k) => k.getBoundingClientRect())
      .filter((r) => r.width > 0.5 || r.height > 0.5);
    if (rects.length === 0) continue;
    pictures.push({ el, rect: local(union(rects)) });
  }
  for (const p of pictures) {
    const r = p.rect;
    const over = Math.max(-r.left, r.right - o.width, -r.top, r.bottom - o.height);
    const ownSize = Math.max(r.width, r.height);
    if (over > Math.max(short * 0.08, ownSize * 0.2) && !sheetOrMap) {
      const what = (p.el.getAttribute('class') || p.el.tagName.toLowerCase()).split(' ')[0];
      add(
        'picture-off-frame',
        'fix',
        hold,
        `the drawing "${what}" runs ${Math.round(over)} px off the frame (it is ${Math.round(r.width)} × ${Math.round(r.height)} px): size it to fit inside the frame (${o.width} × ${o.height})`,
      );
    }
  }
  if (!sheetOrMap && o.videoStage !== 'clean' && (texts.length || pictures.length)) {
    const all = [...texts.map((t) => t.rect), ...pictures.map((p) => p.rect)].filter(inFrame);
    if (all.length) {
      const u = union(all);
      const w = Math.min(o.width, u.right) - Math.max(0, u.left);
      const h = Math.min(o.height, u.bottom) - Math.max(0, u.top);
      const share = (w * h) / (o.width * o.height);
      const minShare = o.transparent ? 0.1 : 0.3;
      if (share < minShare)
        add(
          'small-picture',
          'fix',
          hold,
          `everything on screen sits inside ${Math.round(share * 100)} % of the frame: make the picture and the hero bigger, so the composition spans at least ${Math.round(minShare * 100)} % of the frame`,
        );
    }
  }
  if (o.allowNumbers) {
    const ok = new Set(o.allowNumbers);
    for (const t of texts) {
      for (const m of t.text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
        const n = String(Number(m[0].replace(/,/g, '').replace(/\.$/, '')));
        const v = Number(n);
        if (ok.has(n) || (Number.isInteger(v) && v >= 0 && v <= 10)) continue;
        add(
          'made-up-number',
          'fix',
          hold,
          `"${clip(t.text, 40)}" shows ${m[0]}, which the narration never says: remove it or use a figure from the narration`,
        );
      }
    }
  }
  // Contrast against what is really behind the text, where that can be read.
  for (const t of texts) {
    const fg = parseRgb(t.color);
    if (!fg) continue;
    const realBehind = backgroundBehind(view, t.el, host);
    // On transparent beats over live video, there is no solid look bg behind floating text.
    const behind = realBehind ?? (o.transparent ? null : parseRgb(o.bg));
    if (!behind) continue;
    const c = contrast(fg, behind);
    if (c < 2.6)
      add(
        'low-contrast',
        'fix',
        hold,
        `"${clip(t.text, 32)}" has ${c.toFixed(1)}:1 contrast with what is behind it: use var(--ink) on light surfaces and var(--bg) on dark or accent ones`,
      );
  }

  // 5. Idle loops: once settled, the same value swinging back and forth is wobble, not motion.
  if (dur > 3000) {
    const a = dur * 0.55;
    const probe = [0, 200, 400, 600, 800].map((d) => (at(a + d), signature()));
    if (
      probe[0] === probe[2] &&
      probe[2] === probe[4] &&
      probe[0] !== probe[1] &&
      probe[1] === probe[3]
    )
      add(
        'idle-loop',
        'note',
        a,
        'something is pulsing back and forth in place: a landed element stays still; move the next thing instead',
      );
  }

  // 6. The handover: a beat in front of the next one has to be gone by the end of its tail.
  if (tail > 0 && o.over !== 'in') {
    at(dur + tail);
    if (visibleNow())
      add(
        'not-cleared',
        'fix',
        dur + tail,
        `the beat is still on screen at the end of its ${tail} ms tail, covering the next beat: move every element off the frame (or to opacity 0) between ${Math.round(dur)} and ${Math.round(dur + tail)} ms`,
      );
  }

  at(key);
  return {
    reports,
    stats: {
      textWords: words,
      texts: texts.map((t) => t.text),
      shapes,
      hasMap,
      hasPaper,
      distinctFrames: distinct,
      samples: sigs.length,
    },
  };
}

function union(rects: readonly DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
  } as DOMRect;
}

/** The first solid colour behind an element: an ancestor's background or a shape under its centre. */
function backgroundBehind(
  view: Window,
  el: Element,
  host: Element,
): [number, number, number, number] | null {
  const doc = el.ownerDocument;
  const r = el.getBoundingClientRect();
  const stack =
    typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      : [];
  const self = stack.findIndex((x) => x === el || el.contains(x));
  // An element that can't be hit (pointer-events: none) isn't in the stack: what is listed there
  // may be in front of it, so only its own ancestors are trusted.
  for (const under of self < 0 ? [] : stack.slice(self + 1)) {
    if (!host.contains(under)) break;
    const cs = view.getComputedStyle(under);
    const isShape = under.namespaceURI === 'http://www.w3.org/2000/svg';
    const c = parseRgb(isShape ? cs.fill : cs.backgroundColor);
    if (c && c[3] > 0.6 && Number(cs.opacity) > 0.6) return c;
  }
  for (let n: Element | null = el.parentElement; n && host.contains(n); n = n.parentElement) {
    const c = parseRgb(view.getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0.6) return c;
  }
  return null;
}

/** The repair message for a beat: every `fix` first, then the notes; null when it passes. */
export function criticText(reports: readonly CriticReport[]): string | null {
  if (!reports.some((r) => r.level === 'fix')) return null;
  const order = [...reports].sort((a, b) => (a.level === b.level ? 0 : a.level === 'fix' ? -1 : 1));
  return order.map((r) => `- ${r.hint}`).join('\n');
}
