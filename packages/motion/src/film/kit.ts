import type { MaterialId } from '@motionpop/schemas';
import rough from 'roughjs';
import { safeArea } from '../core/safe-area';
import { buildDecor, seedOf } from '../engine/decor';
import { buildSurface, mix, paperOf, tornPolygon } from '../engine/materials';
import type { Format, ImageRef } from '../contract';
import { customHelpers } from '../components/custom/helpers';
import { KIT_ICONS, KIT_ICON_NAMES } from './icons.generated';
import { createMap, type KitMap, type Where } from './map';
import { createReelKit } from './reel-kit';
import { createTimeline, KIT_EASES, splitWords, type Target, type Timeline } from './timeline';

export type SeamName = 'push' | 'lift' | 'cover' | 'zoom' | 'match' | 'whip' | 'hold';
export interface FilmTimeline extends Timeline {
  /** The entering half of a seam, on these elements (default: everything in the graphic). */
  enter(kind: SeamName, targets?: Target, opts?: { origin?: string; dur?: number }): FilmTimeline;
  /** The leaving half of a seam. */
  exit(kind: SeamName, targets?: Target, opts?: { origin?: string; dur?: number }): FilmTimeline;
}

/**
 * The film kit (spec 07b): what generated code gets as `mp`. It is the old helper set plus the
 * engine's own craft: a timeline, word-synced timing, torn paper, hand-drawn marks, a map with a
 * camera, icons and dot fields. Everything here is deterministic: the same seed and the same
 * time give the same frame. The model supplies the idea; these supply the finish.
 */
export interface KitWord {
  text: string;
  startMs: number;
  endMs: number;
}
export interface KitContext {
  width: number;
  height: number;
  /** Full frame short side in px so `mp.u` stays consistent inside clipped stages (spec 24). */
  frameShortSide?: number;
  /** Coupled video stage mode (`split-top-stage`, `top-card`, `clean`, etc.). */
  videoStage?: string;
  format: Format;
  durationMs: number;
  keyMomentMs: number;
  seed: number;
  colors: {
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    accent2: string;
    highlight: string;
    positive: string;
    negative: string;
    chart: readonly string[];
  };
  fonts: { display: string; body: string; mono?: string };
  words: readonly KitWord[];
  radius: number;
  stroke: number;
  /** The look's stack of materials for a card, when it has one. */
  card?: readonly MaterialId[];
  /** Film-level shared drawings by id: SVG markup. */
  props?: Readonly<Record<string, string>>;
  /** Pre-inlined project images/cutouts by asset id (`mp.image`, spec 23). */
  images?: Readonly<Record<string, ImageRef>>;
  /** Film beats: how long this beat stays on after its slot ends. */
  tailMs?: number;
  /** Film beats: how long the previous beat is still on screen at this beat's start. */
  headMs?: number;
  warn: (message: string) => void;
}

export const wordKey = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9%$.]+/g, '')
    .replace(/^\.+|\.+$/g, '');

const SVG_NS = 'http://www.w3.org/2000/svg';
type Len = number | string;

export function filmKit(root: HTMLElement, ctx: KitContext) {
  const doc = root.ownerDocument;
  const base = customHelpers(root);
  const W = ctx.width;
  const H = ctx.height;
  const u = (ctx.frameShortSide ?? Math.min(W, H)) / 100;
  const sa = safeArea(ctx.format, W, H);
  const safe = Object.freeze({ x: sa.x, y: sa.y, w: sa.width, h: sa.height });
  const keys = ctx.words.map((w) => wordKey(w.text));
  let salt = 0;
  const nextSeed = () => ctx.seed + 101 * ++salt;
  /** Where the kit puts what it makes: the graphic's root, or the sheet once there is one. */
  let home: Element = root;

  /** px from a number, "12%" of `total`, or "3u" (1u = 1 % of the short side). */
  const px = (v: Len | undefined, total: number, fallback: number): number => {
    if (v === undefined) return fallback;
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    const m = /^(-?[\d.]+)\s*(%|u|px)?$/.exec(v.trim());
    if (!m) return fallback;
    const n = Number(m[1]);
    return m[2] === '%' ? (n / 100) * total : m[2] === 'u' ? n * u : n;
  };

  /** Index of a spoken word: a number is the index itself, text matches the first (or nth) word. */
  const wordIndex = (word: number | string, nth = 0): number => {
    if (typeof word === 'number') return word >= 0 && word < keys.length ? Math.trunc(word) : -1;
    const parts = word.trim().split(/\s+/).map(wordKey).filter(Boolean);
    if (parts.length === 0) return -1;
    let seen = 0;
    for (let i = 0; i + parts.length <= keys.length; i++) {
      if (parts.every((p, j) => keys[i + j] === p)) {
        if (seen === nth) return i;
        seen++;
      }
    }
    // A looser match for one word: "billion" finds "billion," and "9.6" finds "$9.6".
    if (parts.length === 1) {
      const p = parts[0] as string;
      const i = keys.findIndex((k) => k.replace(/[%$]/g, '') === p.replace(/[%$]/g, ''));
      if (i >= 0) return i;
      const j = keys.findIndex(
        (k) => k.length > 3 && p.length > 3 && (k.startsWith(p) || p.startsWith(k)),
      );
      if (j >= 0) return j;
    }
    return -1;
  };
  const wordMs = (word: number | string, nth = 0): number | null => {
    const i = wordIndex(word, nth);
    return i < 0 ? null : (ctx.words[i] as KitWord).startMs;
  };
  /** Spoken times for the words of a line, in order; null where a word isn't spoken. */
  const spokenTimes = (words: readonly string[]): (number | null)[] => {
    const want = words.map(wordKey);
    let best: (number | null)[] = want.map(() => null);
    let bestHits = 0;
    for (let start = 0; start < keys.length; start++) {
      if (keys[start] !== want[0] && bestHits > 0) continue;
      const out: (number | null)[] = [];
      let at = start;
      let hits = 0;
      for (const w of want) {
        let found = -1;
        for (let j = at; j < Math.min(keys.length, at + 4); j++) {
          if (keys[j] === w) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          out.push((ctx.words[found] as KitWord).startMs);
          at = found + 1;
          hits++;
        } else out.push(null);
      }
      if (hits > bestHits) {
        best = out;
        bestHits = hits;
      }
    }
    return best;
  };

  const host = { root, durationMs: ctx.durationMs, wordMs, spokenTimes, warn: ctx.warn };
  const D = ctx.durationMs;
  const tailMs = ctx.tailMs ?? 0;
  const headMs = ctx.headMs ?? 0;
  const targetsOf = (t: Target | undefined): Element[] => {
    if (t === undefined || t === null)
      return Array.from(root.children).filter((c) => c.tagName.toLowerCase() !== 'style');
    if (typeof t === 'string') return Array.from(root.querySelectorAll(t));
    if ('nodeType' in (t as object)) return [t as Element];
    if (typeof (t as { el?: unknown }).el === 'object') return [(t as { el: Element }).el];
    return Array.from(t as ArrayLike<Element | string>).flatMap((x) => targetsOf(x as Target));
  };

  /**
   * A timeline with the film's seams built in. `enter` and `exit` are the two halves of each
   * seam with fixed distances, times and eases, so two beats written apart still meet at the cut
   * with the same direction and speed.
   */
  const timeline = (): FilmTimeline => {
    const tl = createTimeline(host) as FilmTimeline;
    tl.enter = (kind, targets, o = {}) => {
      const els = targetsOf(targets);
      if (kind === 'push') {
        // The second half of one power-4 move: already moving at the cut, settling after it.
        tl.fromTo(els, { x: W * 0.14 }, { x: 0 }, { at: 0, dur: 460, ease: 'outQuart', each: 45 });
        tl.fromTo(
          els,
          { opacity: 0.3 },
          { opacity: 1 },
          { at: 0, dur: 200, ease: 'linear', each: 45 },
        );
        tl.fromTo(els, { blur: 8 }, { blur: 0 }, { at: 0, dur: 320, ease: 'out', each: 45 });
      } else if (kind === 'zoom') {
        // Growing on both sides of the cut: out 1 → 1.25, in 0.8 → 1.
        const origin = o.origin ?? '50% 50%';
        tl.fromTo(
          els,
          { scale: 0.8 },
          { scale: 1 },
          { at: 0, dur: 480, ease: 'outStrong', origin },
        );
        tl.fromTo(els, { opacity: 0.15 }, { opacity: 1 }, { at: 0, dur: 300, ease: 'out' });
        tl.fromTo(els, { blur: 12 }, { blur: 0 }, { at: 0, dur: 420, ease: 'out' });
      } else if (kind === 'cover') {
        // A new page slides in over the last beat, which holds still under it.
        const dur = Math.max(300, o.dur ?? (headMs || 500));
        tl.fromTo(els, { x: W * 1.06 }, { x: 0 }, { at: 0, dur, ease: 'inOut' });
        tl.fromTo(els, { rotate: 2.5 }, { rotate: 0 }, { at: 0, dur, ease: 'inOut' });
      } else if (kind === 'whip') {
        // Fast directional whip-pan arrival with crisp motion blur + kinetic skew (spec 21 R3.2).
        const dur = Math.max(180, o.dur ?? 280);
        tl.fromTo(els, { x: W * 0.42 }, { x: 0 }, { at: 0, dur, ease: 'outStrong', each: 24 });
        tl.fromTo(els, { skewX: -8 }, { skewX: 0 }, { at: 0, dur, ease: 'outQuart', each: 24 });
        tl.fromTo(
          els,
          { blur: 14 },
          { blur: 0 },
          { at: 0, dur: Math.round(dur * 0.8), ease: 'out', each: 24 },
        );
        tl.fromTo(
          els,
          { opacity: 0.2 },
          { opacity: 1 },
          { at: 0, dur: 140, ease: 'linear', each: 24 },
        );
      }
      // "lift" and "match": the opening frame is already composed; nothing to do.
      return tl;
    };
    tl.exit = (kind, targets, o = {}) => {
      const els = targetsOf(targets);
      if (kind === 'push') {
        // The first half of the same power-4 move; gone by a third of the way.
        tl.to(els, { x: -W * 0.14 }, { at: D - 300, dur: 300, ease: 'inStrong', each: 18 });
        tl.to(els, { opacity: 0 }, { at: D - 300, dur: 230, ease: 'linear', each: 18 });
        tl.to(els, { blur: 8 }, { at: D - 300, dur: 300, ease: 'in', each: 18 });
      } else if (kind === 'zoom') {
        const origin = o.origin ?? '50% 50%';
        tl.to(els, { scale: 1.25 }, { at: D - 350, dur: 350, ease: 'in', origin });
        tl.to(els, { opacity: 0 }, { at: D - 300, dur: 300, ease: 'linear' });
        tl.to(els, { blur: 12 }, { at: D - 350, dur: 350, ease: 'in' });
      } else if (kind === 'lift') {
        // The page is pulled up and away during the tail, over the next beat.
        const dur = Math.max(300, o.dur ?? (tailMs || 500));
        tl.to(els, { y: -H * 1.12 }, { at: D, dur, ease: 'in' });
        tl.to(els, { rotate: -5 }, { at: D, dur, ease: 'in' });
      } else if (kind === 'whip') {
        const dur = Math.max(160, o.dur ?? 240);
        tl.to(els, { x: -W * 0.42 }, { at: D - dur, dur, ease: 'inStrong', each: 14 });
        tl.to(els, { skewX: 8 }, { at: D - dur, dur, ease: 'in', each: 14 });
        tl.to(els, { blur: 14 }, { at: D - dur, dur, ease: 'in', each: 14 });
        tl.to(
          els,
          { opacity: 0 },
          { at: D - dur, dur: Math.round(dur * 0.85), ease: 'linear', each: 14 },
        );
      }
      // "cover", "match" and "hold": the last frame stays; nothing to do.
      return tl;
    };
    return tl;
  };

  /**
   * A full-frame sheet in the ground colour: the page a beat sits on when a seam pulls the page
   * away ("lift") or brings a new one in ("cover"). Put the beat's content inside it.
   */
  const sheet = (o: { color?: string } = {}): HTMLElement => {
    const node = doc.createElement('div');
    node.dataset['mpSheet'] = '';
    node.style.cssText = `position:absolute;left:-3%;top:-3%;width:106%;height:106%;background:${o.color ?? ctx.colors.bg};box-shadow:0 0 ${Math.round(u * 5)}px rgba(20,16,10,0.28);`;
    const inner = doc.createElement('div');
    // Inside, the frame's own box: content laid out in it sits exactly where it would without the sheet.
    inner.style.cssText = `position:absolute;left:${(3 / 106) * 100}%;top:${(3 / 106) * 100}%;width:${(100 / 106) * 100}%;height:${(100 / 106) * 100}%;`;
    node.append(inner);
    (node as unknown as { body: HTMLElement }).body = inner;
    // The sheet takes everything already in the graphic, and everything the kit makes from now
    // on, so a beat on a sheet is written exactly like a beat without one.
    const existing = Array.from(root.children).filter((c) => c.tagName.toLowerCase() !== 'style');
    root.append(node);
    for (const c of existing) inner.append(c);
    home = inner;
    return node;
  };

  const svgEl = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number> = {},
  ): SVGElementTagNameMap[K] => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  /** A full-frame SVG overlay for free drawing, in frame pixels. */
  let overlaySvg: SVGSVGElement | null = null;
  const overlay = (): SVGSVGElement => {
    if (!overlaySvg || !overlaySvg.isConnected) {
      overlaySvg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
      overlaySvg.style.cssText =
        'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;';
      home.append(overlaySvg);
    }
    return overlaySvg;
  };

  /** Box of an HTML element in its positioned parent's own (untransformed) layout pixels. */
  const layoutBox = (node: HTMLElement) => ({
    x: node.offsetLeft,
    y: node.offsetTop,
    width: node.offsetWidth,
    height: node.offsetHeight,
  });

  /**
   * A torn-paper card. Returns the card element; put content in `card.body`. Position and size
   * take px, "%" of the frame or "u". `tilt` in degrees, `tape` adds a strip of tape.
   */
  const paper = (
    o: {
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      tilt?: number;
      tape?: boolean;
      torn?: boolean;
      color?: string;
      pad?: Len;
      parent?: Element;
    } = {},
  ): HTMLElement & { body: HTMLElement } => {
    const box = {
      x: px(o.x, W, safe.x),
      y: px(o.y, H, safe.y),
      width: Math.max(8, px(o.w, W, safe.w * 0.6)),
      height: Math.max(8, px(o.h, H, safe.h * 0.5)),
    };
    const stack: MaterialId[] = ['paper', 'shadow-soft'];
    if (o.torn !== false) stack.push('torn-edge');
    if (o.tape) stack.push('tape');
    const seed = nextSeed();
    const surface = buildSurface(doc, stack, box, {
      kind: 'card',
      colors: ctx.colors as never,
      seed,
      frameH: Math.min(W, H),
    });
    const card = (surface?.el ?? doc.createElement('div')) as HTMLElement & { body: HTMLElement };
    if (!surface)
      card.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;`;
    const inner = card.firstElementChild as HTMLElement | null;
    if (o.color && inner) inner.style.background = o.color;
    const body = doc.createElement('div');
    const pad = px(o.pad, Math.min(W, H), u * 4);
    body.style.cssText = `position:absolute;inset:0;padding:${pad}px;box-sizing:border-box;isolation:isolate;color:${ctx.colors.ink};`;
    card.append(body);
    card.body = body;
    if (o.tilt) card.style.rotate = `${o.tilt}deg`;
    card.dataset['mpPaper'] = '';
    (o.parent ?? home).append(card);
    return card;
  };

  /**
   * A hand-made mark on a piece of text: "highlight" (felt-tip behind the words), "underline",
   * "circle" (marker ring), "box", "strike". Returns the mark; reveal it with `tl.draw(mark)`.
   */
  const mark = (
    target: Element | null,
    kind: 'highlight' | 'underline' | 'circle' | 'box' | 'strike' = 'highlight',
    o: { color?: string; width?: number } = {},
  ): Element => {
    const t = target as HTMLElement | null;
    const parent = (t?.offsetParent as HTMLElement | null) ?? root;
    if (!t || typeof t.offsetWidth !== 'number') {
      ctx.warn('mark: the target must be an HTML element inside the graphic');
      const empty = svgEl('svg');
      root.append(empty);
      return empty;
    }
    const box = layoutBox(t);
    const size =
      parseFloat(doc.defaultView?.getComputedStyle(t).fontSize ?? '') || box.height || u * 6;
    const frame = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };
    const color = o.color ?? (kind === 'highlight' ? ctx.colors.highlight : ctx.colors.accent);
    const seed = nextSeed();
    let made: Element;
    let under = false;
    if (kind === 'box' || kind === 'strike') {
      const svg = svgEl('svg');
      svg.setAttribute(
        'style',
        'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;',
      );
      const gen = rough.generator();
      const w = o.width ?? Math.max(3, ctx.stroke, size * 0.05);
      const pad = size * 0.14;
      const shape =
        kind === 'box'
          ? gen.rectangle(
              box.x - pad,
              box.y - pad * 0.4,
              box.width + pad * 2,
              box.height + pad * 0.8,
              {
                seed: seedOf(seed, 5),
                roughness: 1.2,
                bowing: 1.2,
                strokeWidth: w,
                stroke: color,
              },
            )
          : gen.line(
              box.x - pad,
              box.y + box.height * 0.56,
              box.x + box.width + pad,
              box.y + box.height * 0.5,
              {
                seed: seedOf(seed, 6),
                roughness: 1.4,
                bowing: 1.8,
                strokeWidth: w,
                stroke: color,
              },
            );
      for (const p of gen.toPaths(shape)) {
        svg.append(
          svgEl('path', {
            d: p.d,
            fill: 'none',
            stroke: color,
            'stroke-width': w,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
      }
      made = svg;
    } else {
      const decor = buildDecor(
        doc,
        kind === 'highlight'
          ? 'highlighter'
          : kind === 'circle'
            ? 'marker-circle'
            : 'marker-underline',
        box,
        {
          color,
          size,
          stroke: o.width ?? ctx.stroke,
          seed,
          radius: ctx.radius,
          frame,
          keepClear: [],
        },
      );
      made = decor.el;
      under = decor.layer === 'under';
    }
    if (under) {
      // Behind the text but above the surface it sits on.
      if (!parent.style.isolation) parent.style.isolation = 'isolate';
      (made as HTMLElement | SVGElement).style.zIndex = '-1';
      parent.prepend(made);
    } else parent.append(made);
    return made;
  };

  /**
   * A hand-drawn line through points in frame pixels. `arrow` adds a head at the end. Reveal it
   * with `tl.draw(line)`. `rough: false` gives a clean line.
   */
  const line = (
    points: readonly (readonly [number, number])[],
    o: {
      color?: string;
      width?: number;
      arrow?: boolean;
      rough?: boolean;
      parent?: Element;
      curve?: boolean;
    } = {},
  ): SVGGElement => {
    const g = svgEl('g');
    const color = o.color ?? ctx.colors.ink;
    const w = o.width ?? Math.max(3, ctx.stroke, u * 0.45);
    const pts = points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number]);
    const attrs = {
      fill: 'none',
      stroke: color,
      'stroke-width': w,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    if (pts.length >= 2) {
      if (o.rough === false) {
        g.append(svgEl('path', { ...attrs, d: `M${pts.map((p) => p.join(' ')).join(' L')}` }));
      } else {
        const gen = rough.generator();
        const shape = o.curve
          ? gen.curve(pts, {
              seed: seedOf(nextSeed(), 7),
              roughness: 0.9,
              strokeWidth: w,
              stroke: color,
            })
          : gen.linearPath(pts, {
              seed: seedOf(nextSeed(), 7),
              roughness: 1.1,
              bowing: 1.4,
              strokeWidth: w,
              stroke: color,
            });
        // roughjs draws each stroke twice for a sketchy look; one pass reads cleaner when drawn on.
        const paths = gen.toPaths(shape);
        const first = paths[0];
        if (first) g.append(svgEl('path', { ...attrs, d: first.d }));
      }
      if (o.arrow) {
        const [ax, ay] = pts[pts.length - 2] as [number, number];
        const [bx, by] = pts[pts.length - 1] as [number, number];
        const a = Math.atan2(by - ay, bx - ax);
        const s = w * 4.5;
        const wing = (da: number) => [bx - s * Math.cos(a + da), by - s * Math.sin(a + da)];
        const [l, r] = [wing(0.45), wing(-0.45)];
        g.append(svgEl('path', { ...attrs, d: `M${l[0]} ${l[1]} L${bx} ${by} L${r[0]} ${r[1]}` }));
      }
    }
    (o.parent ?? overlay()).append(g);
    return g;
  };

  /** An icon by name (see `mp.icons`) as an SVG element of `size` px. */
  const icon = (
    name: string,
    o: { size?: Len; color?: string; stroke?: number; parent?: Element } = {},
  ): SVGSVGElement => {
    const shapes = KIT_ICONS[name] ?? KIT_ICONS[name.toLowerCase()] ?? [];
    if (shapes.length === 0) ctx.warn(`icon: no icon called "${name}"`);
    const size = px(o.size, parentWidth(o.parent) ?? Math.min(W, H), u * 10);
    const svg = svgEl('svg', {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: o.color ?? ctx.colors.ink,
      'stroke-width': o.stroke ?? 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    svg.style.overflow = 'visible';
    for (const [tag, attrs] of shapes) svg.append(svgEl(tag as keyof SVGElementTagNameMap, attrs));
    (o.parent ?? home).append(svg);
    return svg;
  };

  /**
   * A field of `n` dots inside a box (frame px, "%" or "u"), laid out as a grid or a loose
   * cluster. Returns the dots in reading order, for `tl.from(dots, …, { each })`.
   */
  const dots = (
    n: number,
    o: {
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      r?: number;
      color?: string;
      layout?: 'grid' | 'cluster';
      cols?: number;
      parent?: Element;
    } = {},
  ): SVGCircleElement[] => {
    const count = Math.max(0, Math.min(3000, Math.trunc(n)));
    const bx = px(o.x, W, safe.x);
    const by = px(o.y, H, safe.y);
    const bw = Math.max(1, px(o.w, W, safe.w));
    const bh = Math.max(1, px(o.h, H, safe.h));
    const cols = Math.max(1, o.cols ?? Math.ceil(Math.sqrt((count * bw) / bh)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const step = Math.min(bw / cols, bh / rows);
    const r = o.r ?? Math.max(1.5, step * 0.32);
    const g = svgEl('g');
    const rnd = base.rng(nextSeed());
    const out: SVGCircleElement[] = [];
    for (let i = 0; i < count; i++) {
      let cx: number;
      let cy: number;
      if (o.layout === 'cluster') {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd());
        cx = bx + bw / 2 + Math.cos(a) * d * (bw / 2 - r);
        cy = by + bh / 2 + Math.sin(a) * d * (bh / 2 - r);
      } else {
        cx = bx + (i % cols) * step + step / 2 + (bw - cols * step) / 2;
        cy = by + Math.floor(i / cols) * step + step / 2;
      }
      const c = svgEl('circle', {
        cx: cx.toFixed(2),
        cy: cy.toFixed(2),
        r,
        fill: o.color ?? ctx.colors.ink,
      });
      g.append(c);
      out.push(c);
    }
    (o.parent ?? overlay()).append(g);
    return out;
  };

  /** A flat world map with a camera (see the `map` section of the kit reference). */
  const map = (
    o: { x?: Len; y?: Len; w?: Len; h?: Len; view?: Where; zoom?: number; parent?: Element } = {},
  ): KitMap =>
    createMap(
      {
        doc,
        root,
        width: W,
        height: H,
        colours: ctx.colors,
        fontBody: ctx.fonts.body,
        fontDisplay: ctx.fonts.display,
        seed: ctx.seed,
        wordMs,
        durationMs: ctx.durationMs,
        warn: ctx.warn,
      },
      {
        x: px(o.x, W, 0),
        y: px(o.y, H, 0),
        w: px(o.w, W, W),
        h: px(o.h, H, H),
        ...(o.view !== undefined ? { view: o.view } : {}),
        ...(o.zoom !== undefined ? { zoom: o.zoom } : {}),
        parent: o.parent ?? home,
      },
    );

  function parentWidth(parent: Element | undefined): number | null {
    const w = (parent as HTMLElement | undefined)?.clientWidth;
    return typeof w === 'number' && w > 0 ? w : null;
  }

  /** A film-level shared drawing by id, as a new SVG element `w` px wide. */
  const prop = (id: string, o: { w?: Len; parent?: Element } = {}): SVGSVGElement => {
    const markup = ctx.props?.[id];
    const holder = doc.createElement('div');
    if (markup) holder.innerHTML = markup;
    else ctx.warn(`prop: the film has no drawing called "${id}"`);
    // A missing drawing is an empty box of the same shape, so a script that moves it still runs.
    const svg = holder.querySelector('svg') ?? svgEl('svg', { viewBox: '0 0 100 40' });
    const vb = (svg.getAttribute('viewBox') ?? '0 0 100 100').split(/[\s,]+/).map(Number);
    // "60%" is of the parent's width when the drawing goes inside something, else of the frame.
    const w = px(o.w, parentWidth(o.parent) ?? W, W * 0.4);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String((w * (vb[3] ?? 100)) / Math.max(1, vb[2] ?? 100)));
    svg.style.overflow = 'visible';
    svg.style.display = 'block';
    (o.parent ?? home).append(svg);
    return svg as SVGSVGElement;
  };

  /** Shrinks an element's font until it fits a width (and height, when given). Call once at setup. */
  const fit = (node: HTMLElement, maxWidth: Len, maxHeight?: Len, minPx = 14) => {
    const mw = px(maxWidth, W, W);
    const mh = maxHeight === undefined ? Infinity : px(maxHeight, H, H);
    let size = parseFloat(doc.defaultView?.getComputedStyle(node).fontSize ?? '') || 48;
    for (
      let i = 0;
      i < 60 &&
      size > minPx &&
      (node.scrollWidth > mw + 0.5 || node.offsetWidth > mw + 0.5 || node.offsetHeight > mh + 0.5);
      i++
    ) {
      size *= 0.95;
      node.style.fontSize = `${size.toFixed(2)}px`;
    }
  };

  const cues: { kind: string; atMs: number }[] = [];
  /** A sound effect at a time or on a spoken word: "whoosh" | "pop" | "tick" | "rise" | "impact". */
  const sfx = (kind: string, at: number | string) => {
    const ms = typeof at === 'string' ? wordMs(at) : at;
    if (ms !== null && Number.isFinite(ms)) cues.push({ kind, atMs: Math.max(0, Math.round(ms)) });
  };

  const reelKit = createReelKit({
    doc,
    W,
    H,
    u,
    ...(ctx.videoStage ? { videoStage: ctx.videoStage } : {}),
    colors: { ...ctx.colors, paper: paperOf(ctx.colors) },
    fonts: {
      display: ctx.fonts.display,
      body: ctx.fonts.body,
      mono: ctx.fonts.mono ?? 'ui-monospace, monospace',
    },
    ...(ctx.images ? { images: ctx.images } : {}),
    px,
    getHome: () => home,
    setHome: (el) => {
      home = el;
    },
    warn: ctx.warn,
  });

  const kit = {
    ...base,
    ...reelKit,
    W,
    H,
    u,
    safe,
    ease: Object.freeze({ ...base.ease, ...KIT_EASES }),
    /** The time (ms) a spoken word starts: text ("billion") or index. Falls back to the key moment. */
    at: (word: number | string, nth = 0): number => wordMs(word, nth) ?? ctx.keyMomentMs,
    /** True when the word is spoken in this beat. */
    said: (word: number | string): boolean => wordMs(word) !== null,
    timeline,
    sheet,
    paper,
    mark,
    line,
    icon,
    icons: KIT_ICON_NAMES,
    dots,
    map,
    prop,
    fit,
    sfx,
    /** Splits an element's text into word spans (for your own staggered moves). */
    split: (node: Element) => splitWords(node),
    mix,
    /** A colour with alpha: mp.alpha("#E8472F", 0.2). */
    alpha: (hex: string, a: number) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const h = m[1] as string;
      return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${Math.max(0, Math.min(1, a))})`;
    },
    /** A torn outline as a CSS clip-path polygon, for your own paper shapes. */
    torn: (w: number, h: number, amp = u * 0.7) => tornPolygon(w, h, nextSeed(), amp),
    colors: Object.freeze({
      ...ctx.colors,
      paper: paperOf(ctx.colors),
    }),
  };
  return { kit: Object.freeze(kit), cues };
}
export type FilmKit = ReturnType<typeof filmKit>['kit'];
