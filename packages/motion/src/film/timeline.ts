import { eases as coreEases } from '../core/ease';

/**
 * The film kit's timeline (spec 07b): tweens declared once at setup, drawn by `seek(t)` as a pure
 * function of time. Our own code and API (no GSAP): every property of every element is computed
 * from the tween list on every seek, so seeking in any order gives the same frame.
 *
 * Before its first tween an element shows that tween's start value, so `from()` hides things
 * until their moment without any CSS. Between tweens it holds the last end value.
 */
export type EaseFn = (x: number) => number;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outBack: EaseFn = (x) => {
  const c = 1.70158;
  const p = clamp01(x) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};
const spring: EaseFn = (x) => {
  const p = clamp01(x);
  return 1 - Math.cos(p * Math.PI * 2.5) * Math.exp(-p * 6);
};
export const KIT_EASES: Readonly<Record<string, EaseFn>> = Object.freeze({
  linear: coreEases.linear,
  out: coreEases.outCubic,
  outQuart: coreEases.outQuart,
  outStrong: coreEases.outExpo,
  in: (x: number) => clamp01(x) ** 3,
  inStrong: (x: number) => clamp01(x) ** 4,
  inOut: coreEases.inOutCubic,
  inOutSine: coreEases.inOutSine,
  back: outBack,
  spring,
});
export type KitEase = keyof typeof KIT_EASES | EaseFn;
const easeOf = (e: KitEase | undefined, fallback: EaseFn): EaseFn =>
  typeof e === 'function' ? e : ((e ? KIT_EASES[e] : undefined) ?? fallback);

type Val = { n: number; unit: string } | { rgb: [number, number, number] };
export type PropValue = number | string;
export type Props = Record<string, PropValue | [PropValue, PropValue]>;
export interface TweenOpts {
  /** Start time in ms, or a spoken word: the tween then starts on that word. */
  at?: number | string;
  /** A spoken word (or its index) to LAND on: the tween is timed so it arrives as the word starts. */
  on?: number | string;
  dur?: number;
  ease?: KitEase;
  /** Stagger between targets in ms. */
  each?: number;
  /** CSS transform-origin for this target, e.g. "left center". */
  origin?: string;
}
export type Target =
  Element | readonly Element[] | ArrayLike<Element> | string | { el: Element } | null | undefined;

interface Tween {
  at: number;
  dur: number;
  from: Val | undefined;
  to: Val;
  ease: EaseFn;
  order: number;
}

const TRANSFORM = new Set(['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate']);
const UNITLESS = new Set(['opacity', 'scale', 'scaleX', 'scaleY', 'draw', 'wipe', 'zIndex']);
const COLOR = new Set(['color', 'background', 'backgroundColor', 'fill', 'stroke', 'borderColor']);

function parseColor(s: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (m) {
    const h = m[1] as string;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(s.trim());
  if (short) {
    const h = short[1] as string;
    return [0, 1, 2].map((i) => parseInt(`${h[i]}${h[i]}`, 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s.trim());
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function parseVal(prop: string, v: PropValue): Val {
  if (typeof v === 'number') {
    const unit = UNITLESS.has(prop) ? '' : prop === 'rotate' ? 'deg' : 'px';
    return { n: Number.isFinite(v) ? v : 0, unit };
  }
  if (COLOR.has(prop)) {
    const rgb = parseColor(v);
    if (rgb) return { rgb };
  }
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return { n: 0, unit: '' };
  const unit = m[2] || (UNITLESS.has(prop) ? '' : prop === 'rotate' ? 'deg' : 'px');
  return { n: Number(m[1]), unit };
}

const mixVal = (a: Val, b: Val, p: number): Val => {
  if ('rgb' in a && 'rgb' in b)
    return {
      rgb: a.rgb.map((x, i) => x + ((b.rgb[i] as number) - x) * p) as [number, number, number],
    };
  if ('rgb' in b) return b;
  const an = 'rgb' in a ? b.n : a.n;
  return { n: an + (b.n - an) * p, unit: b.unit };
};
const css = (v: Val): string =>
  'rgb' in v
    ? `rgb(${v.rgb.map((x) => Math.round(x)).join(',')})`
    : `${Math.round(v.n * 1000) / 1000}${v.unit}`;
const num = (v: Val | undefined, fallback: number): number => (v && 'n' in v ? v.n : fallback);

export interface Timeline {
  from(target: Target, props: Props, opts?: TweenOpts): Timeline;
  to(target: Target, props: Props, opts?: TweenOpts): Timeline;
  fromTo(target: Target, from: Props, to: Props, opts?: TweenOpts): Timeline;
  /** Sets values from `at` on (a tween of no length). */
  set(target: Target, props: Props, opts?: Pick<TweenOpts, 'at' | 'on'>): Timeline;
  /** Draws strokes on: SVG paths, lines and shapes, or a mark from `mp.mark` / `mp.line`. */
  draw(target: Target, opts?: TweenOpts & { reverse?: boolean }): Timeline;
  /** Reveals by wiping a clip open from one side. */
  wipe(
    target: Target,
    opts?: TweenOpts & { from?: 'left' | 'right' | 'top' | 'bottom' | 'center'; out?: boolean },
  ): Timeline;
  /** Counts the element's text from `from` to `to`. */
  count(
    target: Target,
    opts: TweenOpts & {
      to: number;
      from?: number;
      decimals?: number;
      prefix?: string;
      suffix?: string;
    },
  ): Timeline;
  /** Reveals the element's text word by word; on the voice when the words are spoken. */
  words(
    target: Target,
    opts?: TweenOpts & { style?: 'rise' | 'blur' | 'fade' | 'slam' | 'ink'; sync?: boolean },
  ): Timeline;
  /** Calls `fn(p)` with eased progress 0→1 between `at` and `at + dur` (0 before, 1 after). */
  fn(fn: (p: number, t: number) => void, opts?: TweenOpts): Timeline;
  /** Calls `fn(t)` on every seek. */
  each(fn: (t: number) => void): Timeline;
  /** The time a spoken word starts (see `mp.at`). */
  at(word: number | string, nth?: number): number;
  seek(t: number): void;
  /** End of the last tween. */
  readonly endMs: number;
}

export interface TimelineHost {
  root: Element;
  durationMs: number;
  /** Time a spoken word starts, or null when it isn't spoken. */
  wordMs: (word: number | string, nth?: number) => number | null;
  /** Spoken start times for the words of a text, where it can be matched to the voice. */
  spokenTimes: (words: readonly string[]) => (number | null)[];
  warn: (message: string) => void;
}

export function createTimeline(host: TimelineHost): Timeline {
  const tracks = new Map<Element, Map<string, Tween[]>>();
  const origins = new Map<Element, string>();
  const fns: { at: number; dur: number; ease: EaseFn; fn: (p: number, t: number) => void }[] = [];
  const always: ((t: number) => void)[] = [];
  let order = 0;
  let dirty = true;
  let endMs = 0;

  const list = (target: Target): Element[] => {
    if (!target) return [];
    if (typeof target === 'string') return Array.from(host.root.querySelectorAll(target));
    if (typeof (target as { el?: unknown }).el === 'object' && (target as { el: Element }).el)
      return [(target as { el: Element }).el];
    if (typeof (target as ArrayLike<Element>).length === 'number' && !('nodeType' in target))
      return Array.from(target as ArrayLike<Element>).flatMap((x) => list(x as Target));
    return [target as Element];
  };

  const startOf = (o: TweenOpts | undefined, dur: number): number => {
    if (o?.on !== undefined) {
      const w = host.wordMs(o.on);
      if (w !== null) return Math.max(0, w - Math.min(dur * 0.4, 260));
      host.warn(`"${String(o.on)}" is not spoken in this beat; timed at the key moment instead`);
      return Math.max(0, host.durationMs * 0.4);
    }
    if (typeof o?.at === 'string') {
      const w = host.wordMs(o.at);
      if (w !== null) return w;
      host.warn(`"${o.at}" is not spoken in this beat; timed at the key moment instead`);
      return Math.max(0, host.durationMs * 0.4);
    }
    const at = Number(o?.at ?? 0);
    return Number.isFinite(at) ? Math.max(0, at) : 0;
  };

  const add = (
    el: Element,
    prop: string,
    from: PropValue | undefined,
    to: PropValue,
    at: number,
    dur: number,
    ease: EaseFn,
  ) => {
    let byProp = tracks.get(el);
    if (!byProp) tracks.set(el, (byProp = new Map()));
    let tw = byProp.get(prop);
    if (!tw) byProp.set(prop, (tw = []));
    tw.push({
      at,
      dur: Math.max(0, dur),
      from: from === undefined ? undefined : parseVal(prop, from),
      to: parseVal(prop, to),
      ease,
      order: order++,
    });
    endMs = Math.max(endMs, at + Math.max(0, dur));
    dirty = true;
  };

  const tween = (
    kind: 'from' | 'to' | 'fromTo',
    target: Target,
    a: Props,
    b: Props | undefined,
    o: TweenOpts | undefined,
  ) => {
    const els = list(target);
    const dur = Number.isFinite(o?.dur) ? Number(o?.dur) : 600;
    const ease = easeOf(o?.ease, KIT_EASES['outStrong'] as EaseFn);
    const start = startOf(o, dur);
    const each = Number.isFinite(o?.each) ? Number(o?.each) : 0;
    els.forEach((el, i) => {
      if (o?.origin) origins.set(el, o.origin);
      const at = start + i * each;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) {
        const av = a[key];
        const bv = b?.[key];
        if (kind === 'fromTo') {
          if (av === undefined || bv === undefined || Array.isArray(av) || Array.isArray(bv))
            continue;
          add(el, key, av, bv, at, dur, ease);
        } else if (Array.isArray(av)) {
          add(el, key, av[0], av[1], at, dur, ease);
        } else if (av !== undefined && kind === 'from') {
          add(el, key, av, restOf(key), at, dur, ease);
        } else if (av !== undefined) {
          add(el, key, undefined, av, at, dur, ease);
        }
      }
    });
  };

  /** The value a property rests at when nothing tweens it. */
  const restOf = (prop: string): PropValue =>
    prop === 'opacity' ||
    prop === 'scale' ||
    prop === 'scaleX' ||
    prop === 'scaleY' ||
    prop === 'draw' ||
    prop === 'wipe'
      ? 1
      : 0;

  const baseOf = (el: Element, prop: string): Val => {
    if (TRANSFORM.has(prop) || prop === 'blur' || prop === 'draw' || prop === 'wipe')
      return parseVal(prop, restOf(prop));
    const view = el.ownerDocument.defaultView;
    const style = view ? view.getComputedStyle(el) : null;
    const raw = style ? (style as unknown as Record<string, string>)[prop] : undefined;
    if (raw) return parseVal(prop, raw);
    return parseVal(prop, restOf(prop));
  };

  const resolve = () => {
    for (const [el, byProp] of tracks) {
      for (const [prop, tw] of byProp) {
        tw.sort((x, y) => x.at - y.at || x.order - y.order);
        tw.forEach((t, i) => {
          if (t.from === undefined) t.from = i > 0 ? (tw[i - 1] as Tween).to : baseOf(el, prop);
        });
      }
    }
    dirty = false;
  };

  const valueAt = (tw: readonly Tween[], t: number): Val => {
    let cur: Tween | null = null;
    for (const x of tw) {
      if (x.at <= t) cur = x;
      else break;
    }
    if (!cur) return (tw[0] as Tween).from as Val;
    const p = cur.dur <= 0 ? 1 : clamp01((t - cur.at) / cur.dur);
    return mixVal(cur.from as Val, cur.to, cur.ease(p));
  };

  const prepDraw = (el: Element) => {
    if (el.getAttribute('data-mp-draw')) return;
    el.setAttribute('data-mp-draw', '1');
    el.setAttribute('pathLength', '1');
    (el as SVGElement).style.strokeDasharray = '1 1';
  };

  const api: Timeline = {
    from: (t, p, o) => (tween('from', t, p, undefined, o), api),
    to: (t, p, o) => (tween('to', t, p, undefined, o), api),
    fromTo: (t, a, b, o) => (tween('fromTo', t, a, b, o), api),
    set: (t, p, o) => (tween('to', t, p, undefined, { ...o, dur: 0 }), api),
    draw(target, o) {
      const dur = Number.isFinite(o?.dur) ? Number(o?.dur) : 700;
      const ease = easeOf(o?.ease, KIT_EASES['inOut'] as EaseFn);
      const start = startOf(o, dur);
      const each = Number.isFinite(o?.each) ? Number(o?.each) : 0;
      const [a, b] = o?.reverse ? [1, 0] : [0, 1];
      let i = 0;
      for (const el of list(target)) {
        const reveal = (el as HTMLElement).dataset?.['reveal'];
        if (reveal === 'grow') {
          // A filled mark (highlighter, cut paper) grows from its left edge.
          add(el, 'scaleX', a, b, start + i * each, dur, ease);
          i++;
          continue;
        }
        const strokes =
          el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'g'
            ? Array.from(el.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect'))
            : [el];
        for (const s of strokes) {
          prepDraw(s);
          add(s, 'draw', a, b, start + i * each, dur, ease);
        }
        i++;
      }
      return api;
    },
    wipe(target, o) {
      const dur = Number.isFinite(o?.dur) ? Number(o?.dur) : 600;
      const ease = easeOf(o?.ease, KIT_EASES['inOut'] as EaseFn);
      const start = startOf(o, dur);
      const each = Number.isFinite(o?.each) ? Number(o?.each) : 0;
      list(target).forEach((el, i) => {
        el.setAttribute('data-mp-wipe', o?.from ?? 'left');
        add(el, 'wipe', o?.out ? 1 : 0, o?.out ? 0 : 1, start + i * each, dur, ease);
      });
      return api;
    },
    count(target, o) {
      const dur = Number.isFinite(o.dur) ? Number(o.dur) : 900;
      const ease = easeOf(o.ease, KIT_EASES['outStrong'] as EaseFn);
      const start = startOf(o, dur);
      const decimals = Math.max(0, Math.min(4, Math.trunc(o.decimals ?? 0)));
      const from = Number.isFinite(o.from) ? Number(o.from) : 0;
      const to = Number.isFinite(o.to) ? o.to : 0;
      const els = list(target);
      const text = (v: number) =>
        `${o.prefix ?? ''}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${o.suffix ?? ''}`;
      // Lay the element out at its final width, so the line doesn't jump as digits arrive.
      for (const el of els) {
        el.textContent = text(to);
        (el as HTMLElement).style.fontVariantNumeric = 'tabular-nums lining-nums';
      }
      fns.push({
        at: start,
        dur,
        ease,
        fn: (p) => {
          for (const el of els) el.textContent = text(from + (to - from) * p);
        },
      });
      endMs = Math.max(endMs, start + dur);
      return api;
    },
    words(target, o) {
      const style = o?.style ?? 'rise';
      const dur = Number.isFinite(o?.dur) ? Number(o?.dur) : style === 'slam' ? 260 : 420;
      const each = Number.isFinite(o?.each) ? Number(o?.each) : 80;
      const ease = easeOf(o?.ease, KIT_EASES['outStrong'] as EaseFn);
      for (const el of list(target)) {
        const spans = splitWords(el);
        if (spans.length === 0) continue;
        const explicit = o?.at !== undefined || o?.on !== undefined;
        const spoken =
          o?.sync === false
            ? spans.map(() => null)
            : host.spokenTimes(spans.map((s) => s.textContent ?? ''));
        const matched = spoken.filter((x) => x !== null).length;
        // Follow the voice when most of the line is spoken; otherwise a steady cascade.
        const follow = o?.sync !== false && matched >= Math.max(1, Math.ceil(spans.length * 0.6));
        let t = explicit
          ? startOf(o, dur)
          : follow
            ? ((spoken.find((x) => x !== null) as number) ?? 0)
            : 0;
        if (explicit && follow && o?.sync !== true) {
          // An explicit start with spoken words: keep the voice's rhythm from that start.
          const first = spoken.find((x) => x !== null) as number;
          const shift = t - first;
          for (let i = 0; i < spoken.length; i++)
            if (spoken[i] !== null) spoken[i] = (spoken[i] as number) + shift;
        }
        spans.forEach((s, i) => {
          const sp = follow ? spoken[i] : null;
          const at =
            i === 0
              ? follow && sp != null
                ? sp
                : t
              : sp != null
                ? Math.max(sp, t + 40)
                : t + each;
          t = at;
          const start = Math.max(0, at - Math.min(dur * 0.35, 140));
          if (style === 'rise') {
            add(s, 'y', '0.45em', '0em', start, dur, ease);
            add(s, 'opacity', 0, 1, start, dur * 0.7, ease);
          } else if (style === 'blur') {
            add(s, 'blur', 8, 0, start, dur, ease);
            add(s, 'opacity', 0, 1, start, dur * 0.7, ease);
          } else if (style === 'slam') {
            add(s, 'scale', 1.35, 1, start, dur, ease);
            add(s, 'opacity', 0, 1, start, Math.min(120, dur), ease);
          } else if (style === 'ink') {
            add(s, 'opacity', 0.22, 1, start, dur, ease);
          } else {
            add(s, 'opacity', 0, 1, start, dur, ease);
          }
        });
      }
      return api;
    },
    fn(fn, o) {
      const dur = Number.isFinite(o?.dur) ? Number(o?.dur) : 600;
      const start = startOf(o, dur);
      fns.push({ at: start, dur, ease: easeOf(o?.ease, KIT_EASES['linear'] as EaseFn), fn });
      endMs = Math.max(endMs, start + dur);
      return api;
    },
    each(fn) {
      always.push(fn);
      return api;
    },
    at: (word, nth) => host.wordMs(word, nth) ?? Math.round(host.durationMs * 0.4),
    seek(t) {
      if (dirty) resolve();
      for (const f of always) f(t);
      for (const f of fns) {
        const p = f.dur <= 0 ? (t >= f.at ? 1 : 0) : clamp01((t - f.at) / f.dur);
        f.fn(f.ease(p), t);
      }
      for (const [el, byProp] of tracks) {
        const style = (el as HTMLElement).style;
        let hasTransform = false;
        for (const [prop, tw] of byProp) {
          const v = valueAt(tw, t);
          if (TRANSFORM.has(prop)) {
            hasTransform = true;
            continue;
          }
          if (prop === 'blur') {
            const b = num(v, 0);
            style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : '';
          } else if (prop === 'draw') {
            const d = clamp01(num(v, 1));
            style.strokeDashoffset = String(1 - d);
            // A stroke with round caps shows a dot at zero length: hide it until it starts.
            style.visibility = d <= 0.0005 ? 'hidden' : '';
          } else if (prop === 'wipe') {
            const w = 100 * (1 - clamp01(num(v, 1)));
            const side = el.getAttribute('data-mp-wipe') ?? 'left';
            const f = w.toFixed(2);
            style.clipPath =
              w <= 0.01
                ? ''
                : side === 'right'
                  ? `inset(0 0 0 ${f}%)`
                  : side === 'top'
                    ? `inset(0 0 ${f}% 0)`
                    : side === 'bottom'
                      ? `inset(${f}% 0 0 0)`
                      : side === 'center'
                        ? `inset(0 ${(w / 2).toFixed(2)}% 0 ${(w / 2).toFixed(2)}%)`
                        : `inset(0 ${f}% 0 0)`;
          } else {
            (style as unknown as Record<string, string>)[prop] = css(v);
          }
        }
        if (hasTransform) {
          const g = (p: string) => {
            const tw = byProp.get(p);
            return tw ? valueAt(tw, t) : undefined;
          };
          const x = g('x');
          const y = g('y');
          const s = num(g('scale'), 1);
          const sx = num(g('scaleX'), 1) * s;
          const sy = num(g('scaleY'), 1) * s;
          const r = num(g('rotate'), 0);
          const parts: string[] = [];
          if (x || y) parts.push(`translate(${x ? css(x) : '0px'}, ${y ? css(y) : '0px'})`);
          if (r) parts.push(`rotate(${Math.round(r * 1000) / 1000}deg)`);
          if (sx !== 1 || sy !== 1)
            parts.push(`scale(${Math.round(sx * 1e4) / 1e4}, ${Math.round(sy * 1e4) / 1e4})`);
          style.transform = parts.join(' ') || 'none';
          const origin = origins.get(el);
          if (origin) style.transformOrigin = origin;
          else if (isSvgShape(el) && !style.transformOrigin) {
            style.transformBox = 'fill-box';
            style.transformOrigin = 'center';
          }
        }
      }
    },
    get endMs() {
      return endMs;
    },
  };
  return api;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const isSvgShape = (el: Element) =>
  el.namespaceURI === SVG_NS && el.tagName.toLowerCase() !== 'svg';

/** Wraps every word of an element's text in an inline-block span, keeping inline markup. */
export function splitWords(el: Element): HTMLElement[] {
  const done = Array.from(el.querySelectorAll<HTMLElement>('[data-mp-word]'));
  if (done.length) return done;
  const doc = el.ownerDocument;
  const out: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = child.textContent ?? '';
        if (!text.trim()) continue;
        const frag = doc.createDocumentFragment();
        for (const piece of text.split(/(\s+)/)) {
          if (!piece) continue;
          if (/^\s+$/.test(piece)) {
            frag.append(doc.createTextNode(' '));
            continue;
          }
          const span = doc.createElement('span');
          span.setAttribute('data-mp-word', '');
          span.style.display = 'inline-block';
          span.style.whiteSpace = 'pre';
          span.textContent = piece;
          frag.append(span);
          out.push(span);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && (child as Element).namespaceURI !== SVG_NS) {
        walk(child);
      }
    }
  };
  walk(el);
  return out;
}
