import type {
  DecorId,
  Energy,
  SurfaceKind,
  EnterBehaviour,
  JuiceId,
  Look,
  MarkRole,
  ScoreBeat,
} from '@motionpop/schemas';
import type { BuildContext, Composition } from '../contract';
import { countAt, formatCount, type CountFormat } from '../core/count';
import { eases } from '../core/ease';
import { fitText } from '../core/fit-text';
import { progress } from '../core/interp';
import { contains, insetForCamera, safeArea, type Box } from '../core/safe-area';
import { contrastRatio, readTimeMs } from '@motionpop/schemas';
import { fontStack } from '../fonts/font-faces';
import { scheduleBeats, type BeatPlan, type CueSpec, type SlotWordTime } from './beats';
import { buildDecor } from './decor';
import { buildSurface, mix } from './materials';
import { cameraTrack, planJuice, type JuiceBeat, type JuicePlan } from './juice';

/**
 * The stage (spec 07 design, "Stage engine"). A scene puts actors in boxes and attaches
 * behaviours to cues; the stage decides every time, ease and amount from the look, the spoken
 * words and the delivery. `compile()` returns a composition whose `seek` is a pure function of
 * time.
 */
export interface SceneContext extends BuildContext {
  /** The look. Falls back to `style`, so a plain style pack works. */
  look?: Look;
  /** The slot's words, times relative to the slot start. */
  words?: readonly SlotWordTime[];
  /** Prosody stress per slot word (0–100). */
  stress?: readonly number[];
  /** Pauses in the delivery, relative to the slot start. */
  pauses?: readonly { startMs: number; endMs: number }[];
  energy?: Energy;
}

export interface TextSlot {
  box: Box;
  max: number;
  min: number;
  lineHeight: number;
  maxLines: number;
  align: 'left' | 'center';
}

export type ActorKind = 'text' | 'number' | 'shape';
export type TextRole = 'display' | 'body' | 'eyebrow' | 'label';

interface Props {
  opacity: number;
  tx: number;
  ty: number;
  scale: number;
  scaleX: number;
  rot: number;
  /** Share clipped from the right / bottom (mask and wipe reveals). */
  clipR: number;
  clipB: number;
  /** Share of a hand-drawn mark's stroke that is drawn (1 = complete). */
  draw: number;
  text: string | null;
}
type Effect = (tMs: number, p: Props) => void;

export interface Actor {
  id: string;
  kind: ActorKind;
  el: HTMLElement;
  box: Box;
  /** Fitted font size in px (0 for shapes). */
  size: number;
  /** Words of text on screen, for read time. */
  words: number;
  align: 'left' | 'center';
  /** Depth layer: 0 back, 1 mid, 2 front. */
  depth: 0 | 1 | 2;
  effects: Effect[];
  /** Cue ids that bring this actor on. */
  enteredBy: string[];
  /** Number actors: how the final value is formatted. */
  count?: { from: number; to: number; fmt: CountFormat };
  /** Word-by-word text: one span per word, revealed on the voice. */
  parts?: HTMLElement[];
  /** Indexes into `parts` of the emphasised words (marks go around these). */
  focusIdx?: number[];
  /** Runs after the actor's props are written on each seek (styles the word spans). */
  post?: (tMs: number) => void;
  /** Set when a tilted surface carries the actor: its marks turn with it about (cx, cy). */
  carry?: { rot: number; cx: number; cy: number };
}

const overlapsBox = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The fixed offset that turns an element about (cx, cy) when it rotates by `rot` degrees about
 * its own transform origin (ox, oy): R(o - c) + c - o.
 */
function turnAbout(ox: number, oy: number, c: { rot: number; cx: number; cy: number }) {
  const th = (c.rot * Math.PI) / 180;
  const dx = ox - c.cx;
  const dy = oy - c.cy;
  return {
    tx: dx * Math.cos(th) - dy * Math.sin(th) + c.cx - ox,
    ty: dx * Math.sin(th) + dy * Math.cos(th) + c.cy - oy,
  };
}

export type Action =
  | { type: 'enter'; actor: Actor; kind?: EnterBehaviour }
  | { type: 'mark'; actor: Actor; role: MarkRole };

export const enter = (actor: Actor, kind?: EnterBehaviour): Action => ({
  type: 'enter',
  actor,
  ...(kind ? { kind } : {}),
});
export const mark = (actor: Actor, role: MarkRole = 'emphasis'): Action => ({
  type: 'mark',
  actor,
  role,
});

export interface StageReport {
  plan: BeatPlan;
  juice: JuicePlan;
  energy: Energy;
  /** Entrance length used for each cue id. */
  leads: Record<string, number>;
  /** Actor ids each cue brings on (empty for cues the scene left unused). */
  cast: Record<string, string[]>;
}

export interface SoundCue {
  atMs: number;
  kind: 'enter' | 'focal' | 'mark' | 'snap' | 'exit';
  sound: string;
}

export interface StageComposition extends Composition {
  /** Camera scale at `tMs` (the runtime applies it to the slot's camera wrapper). */
  camera: (tMs: number) => number;
  report: StageReport;
  soundCues: SoundCue[];
}

export interface Stage {
  /** Safe area inset for the largest camera scale this look can reach. */
  readonly safe: Box;
  text(id: string, content: string, slot: TextSlot, opts?: TextOptions): Actor;
  number(id: string, value: number, fmt: CountFormat, slot: TextSlot, opts?: NumberOptions): Actor;
  shape(id: string, box: Box, opts?: ShapeOptions): Actor;
  /**
   * A semantic surface (card, photo, label, strip) behind some actors, built from the look's
   * materials; null when the look leaves that surface plain (R3.3).
   */
  surface(
    id: string,
    kind: SurfaceKind,
    around: Actor | readonly Actor[],
    opts?: SurfaceOpts,
  ): Actor | null;
  /**
   * Re-stack text actors top to bottom by the height their text actually set (fitText often
   * needs fewer lines than a box reserves), keeping the gaps between their boxes, and put the
   * block at `bias` of `area`'s free height (0.45 is the optical centre). Call it after the
   * texts and before surfaces, marks and shapes that follow them. Without layout (no measured
   * height, as in happy-dom) nothing moves.
   */
  restack(actors: readonly (Actor | null)[], area: Box, bias?: number): void;
  /**
   * Move a placed actor down by `dy` px (up when negative). Layout only: call it after
   * measuring and before surfaces, marks and shapes that follow the actor.
   */
  nudge(actor: Actor, dy: number): void;
  on(cue: string, ...actions: Action[]): void;
  compile(): StageComposition;
}

export interface TextOptions {
  role?: TextRole;
  truncatable?: boolean;
  focal?: boolean;
  depth?: 0 | 1 | 2;
  /** Reveal the text word by word, each word on its spoken word. */
  byWord?: boolean;
  /** Words of the text to emphasise (accent colour; `mark` goes around them). */
  emphasis?: string;
  /**
   * Balance the lines (CSS `text-wrap: balance`): even line lengths, so a headline never
   * leaves one word alone on its last line (motion principle 11).
   */
  balance?: boolean;
}
export interface NumberOptions {
  countFrom?: number;
  focal?: boolean;
}
export interface SurfaceOpts {
  /** Padding around the actors, as a share of frame height (default: from the text size). */
  pad?: { x: number; y: number };
  /**
   * A fixed box for the surface instead of one measured around the actors (a tile or a photo
   * frame that holds a glyph). The actors still decide what the tilt must keep clear.
   */
  box?: Box;
}
export type ShapeColor = 'accent' | 'accent2' | 'highlight' | 'ink' | 'muted';
export interface ShapeOptions {
  /** Colour token from the look. */
  color?: ShapeColor;
  radius?: number;
  depth?: 0 | 1 | 2;
  /** Transform origin for scale entrances: the left edge (default, bars grow) or the centre. */
  origin?: 'left' | 'center';
  /** Put the shape behind this actor instead of on top of everything placed so far. */
  behind?: Actor;
  /**
   * The `behind` text sits on the shape: it takes ink or bg, whichever reads better on the
   * shape's colour, and the contrast check measures it there (`data-on`).
   */
  carries?: boolean;
}

const DEFAULT_JUICE: readonly JuiceId[] = ['camera-push', 'camera-snap'];
const PRESET_ENTER: Record<string, Record<ActorKind, EnterBehaviour>> = {
  calm: { text: 'rise', number: 'count', shape: 'draw' },
  smooth: { text: 'mask', number: 'count', shape: 'draw' },
  snappy: { text: 'mask', number: 'count', shape: 'draw' },
  stepped: { text: 'pop', number: 'count', shape: 'pop' },
};

/** Ease that overshoots by roughly `s` and lands exactly at 1. */
const back = (x: number, s: number): number => {
  const p = Math.max(0, Math.min(1, x)) - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
};
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}%$€£]+/gu, '');

/** Pace of word-by-word text when no spoken word gives the time (about 3.5 words a second). */
export const WORD_PACE_MS = 280;
const MIN_WORD_GAP_MS = 90;
const WORD_IN_MS = 180;

/** Where `phrase` sits in `words` (normalised), as indexes, or [] when it is not there. */
export function findPhrase(words: readonly string[], phrase: string): number[] {
  const want = phrase.split(/\s+/).map(norm).filter(Boolean);
  if (want.length === 0) return [];
  const have = words.map(norm);
  for (let i = 0; i + want.length <= have.length; i++) {
    if (want.every((x, j) => have[i + j] === x)) return want.map((_, j) => i + j);
  }
  return [];
}

/**
 * Reveal time of each word of a word-by-word line: the first on `landMs`, then each on its
 * spoken word (from `first`), or at a steady pace past the transcript. Never closer than a
 * short gap, and compressed so the last word arrives by `limitMs`.
 */
export function revealTimes(
  words: readonly SlotWordTime[] | undefined,
  first: number | null,
  landMs: number,
  n: number,
  limitMs = Infinity,
): number[] {
  const t: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k === 0) {
      t.push(landMs);
      continue;
    }
    const prev = t[k - 1] as number;
    const spoken = first === null ? undefined : words?.[first + k];
    t.push(Math.max(spoken ? spoken.startMs : prev + WORD_PACE_MS, prev + MIN_WORD_GAP_MS));
  }
  const last = t[n - 1] ?? landMs;
  if (last > limitMs) {
    const k = limitMs > landMs ? (limitMs - landMs) / (last - landMs) : 0;
    return t.map((x) => Math.round(landMs + (x - landMs) * k));
  }
  return t.map(Math.round);
}

export function stage(
  ctx: SceneContext,
  spec: { cues: readonly CueSpec[]; anchors?: readonly ScoreBeat[] },
): Stage {
  const { root, width: w, height: h, format, style, durationMs } = ctx;
  const look = ctx.look;
  const doc = root.ownerDocument;
  const person = look?.personality;
  const cam = look?.camera ?? {
    push: [1, style.motion.camera.pushIn] as [number, number],
    snap: 0,
    whip: false,
    parallax: 0,
  };
  const maxScale = Math.max(cam.push[0], cam.push[1]) + cam.snap;
  const safe = insetForCamera(safeArea(format, w, h), w, h, Math.max(1, maxScale));
  const enterEase = eases[style.motion.enterEase];
  const moveEase = eases[style.motion.moveEase];
  const enterMs = style.motion.enterMs;
  const exitMs = Math.round(enterMs * (person?.exitRatio ?? 0.6));
  const stepMs = person?.stepFps ? 1000 / person.stepFps : 0;
  const lift = h * 0.02;
  root.style.cssText = 'position:absolute;inset:0;';

  const actors: Actor[] = [];
  const cueActions = new Map<string, Action[]>();
  const marks: { el: HTMLElement | SVGSVGElement; effects: Effect[]; reveal: 'draw' | 'grow' }[] =
    [];

  const fontFor = (role: TextRole): string => {
    const f = style.fonts;
    if (role === 'display')
      return `font-weight:${f.displayWeight};font-family:${fontStack(f.display)};color:${style.colors.ink};`;
    if (role === 'eyebrow')
      return `font-weight:600;font-family:${fontStack(f.body)};letter-spacing:0.12em;text-transform:uppercase;color:${style.colors.muted};white-space:nowrap;overflow:hidden;`;
    if (role === 'label' && look?.fonts.hand)
      return `font-weight:500;font-family:${fontStack(look.fonts.hand)};color:${style.colors.ink};overflow:hidden;`;
    return `font-weight:500;font-family:${fontStack(f.body)};color:${style.colors.ink};overflow:hidden;`;
  };

  const place = (
    id: string,
    slot: TextSlot,
    css: string,
    content: string,
    truncatable: boolean,
    fill?: (el: HTMLElement) => void,
  ) => {
    const el = doc.createElement('div');
    el.dataset.text = '';
    el.dataset.actor = id;
    const { box } = slot;
    el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;text-align:${slot.align};transform-origin:${slot.align === 'left' ? 'left center' : 'center center'};${css}`;
    el.textContent = content;
    fill?.(el);
    root.append(el);
    const fit = fitText(
      el,
      { width: box.width, height: box.height },
      {
        max: slot.max,
        min: slot.min,
        lineHeight: slot.lineHeight,
        maxLines: slot.maxLines,
        truncatable,
      },
    );
    if (fit.truncated) ctx.warn(`${id} truncated to fit`);
    if (fit.overflow) ctx.warn(`${id} overflows its box at the minimum size`);
    return { el, size: fit.size };
  };

  const add = (a: Omit<Actor, 'effects' | 'enteredBy'>): Actor => {
    const actor: Actor = { ...a, effects: [], enteredBy: [] };
    actors.push(actor);
    return actor;
  };

  /** Rectangle of an actor's final text, in frame px (width is 0 in layout-less test DOMs). */
  const textRect = (a: Actor, focus = false): Box => {
    if (a.parts) {
      // Measure the words as set: a mark goes under one line of them, the widest.
      const spans = focus && a.focusIdx?.length ? a.focusIdx.map((i) => a.parts![i]!) : a.parts;
      const r = widestLine(spans, root, w);
      if (r) {
        const size = a.size || h * 0.05;
        return { x: r.x, y: r.y + size * 0.08, width: r.width, height: size * 1.02 };
      }
      return { x: a.box.x, y: a.box.y, width: a.box.width, height: a.box.height };
    }
    const probe = doc.createElement('span');
    probe.textContent = a.count ? formatCount(a.count.to, a.count.fmt) : a.el.textContent;
    const keep = a.el.textContent;
    a.el.replaceChildren(probe);
    const tw = Math.min(a.box.width, probe.getBoundingClientRect().width);
    a.el.textContent = keep;
    const size = a.size || h * 0.05;
    const x = a.align === 'left' ? a.box.x : a.box.x + (a.box.width - tw) / 2;
    return { x, y: a.box.y + size * 0.08, width: tw, height: size * 1.02 };
  };

  /** An element's box in frame px (the root may be scaled in the preview). */
  const frameRect = (el: Element): Box => {
    const r0 = root.getBoundingClientRect();
    const k = r0.width > 0 ? w / r0.width : 1;
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - r0.left) * k,
      y: (r.top - r0.top) * k,
      width: r.width * k,
      height: r.height * k,
    };
  };

  /** Ink or bg, whichever reads better on `fill` (text laid on a colour strip or cut piece). */
  const readableOn = (fill: string) =>
    contrastRatio(style.colors.ink, fill) >= contrastRatio(style.colors.bg, fill)
      ? style.colors.ink
      : style.colors.bg;

  const addMark = (a: Actor, decor: DecorId, atMs: number, durMs: number, focus = false) => {
    const cut = decor === 'cutout';
    const fill = decor === 'highlighter' || cut;
    // Cut paper behind each emphasised word, else one piece behind the whole text.
    const words =
      cut && focus && a.parts
        ? (a.focusIdx ?? []).map((i) => frameRect(a.parts![i]!)).filter((b) => b.width > 0)
        : [];
    const d = buildDecor(doc, decor, textRect(a, focus), {
      color: cut ? style.colors.accent : fill ? style.colors.highlight : style.colors.accent,
      // Cut pieces alternate the accent and a darker kraft (paper on paper would vanish).
      ...(cut ? { alt: mix(style.colors.bg, style.colors.ink, 0.12) } : {}),
      ...(words.length ? { words } : {}),
      size: a.size || h * 0.05,
      stroke: style.shape.stroke,
      seed: ctx.seed + a.id.length,
      radius: style.shape.radius,
      frame: { x: 0, y: 0, width: w, height: h },
      // Other text, as it is actually set (a short line leaves room beside it).
      keepClear: [
        ...actors
          .filter((x) => x !== a && x.kind !== 'shape' && x.el.style.display !== 'none')
          .map((x) => textRect(x)),
        // A mark around some words of a line must not cut through its other lines.
        ...(focus && a.parts
          ? a.parts
              .filter((_, i) => !a.focusIdx?.includes(i))
              .map((el) => {
                const r0 = root.getBoundingClientRect();
                const k = r0.width > 0 ? w / r0.width : 1;
                const r = el.getBoundingClientRect();
                return {
                  x: (r.left - r0.left) * k,
                  y: (r.top - r0.top) * k,
                  width: r.width * k,
                  height: r.height * k,
                };
              })
              .filter((b) => b.width > 0)
          : []),
      ],
    });
    if (d.layer === 'under') a.el.before(d.el);
    else a.el.after(d.el);
    if (fill && !focus) a.el.dataset.on = cut ? 'accent' : 'highlight';
    // A whole text on one cut piece (the accent) takes the colour that reads on it.
    if (cut && !focus) a.el.style.color = readableOn(style.colors.accent);
    // Highlighted words keep the ink colour: accent on the highlight colour reads poorly. Cut
    // pieces alternate the accent and the highlight, so their words take what reads on both.
    if (fill && focus)
      for (const i of a.focusIdx ?? [])
        a.parts![i]!.style.color = cut ? readableOn(style.colors.accent) : style.colors.ink;
    const mark = {
      el: d.el,
      reveal: d.reveal,
      effects: [
        (tMs: number, p: Props) => {
          const e = enterEase(
            progress(
              stepMs > 0 && tMs < atMs + durMs ? Math.floor(tMs / stepMs) * stepMs : tMs,
              atMs,
              durMs,
            ),
          );
          if (d.reveal === 'draw') p.draw *= e;
          else p.scaleX *= e;
        },
      ] as Effect[],
    };
    if (a.carry) {
      // The mark turns with its tilted text. Its origin: the decor's own, else the frame centre
      // (decor SVGs cover the whole frame).
      const m = /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(d.el.style.transformOrigin);
      const { tx, ty } = turnAbout(m ? Number(m[1]) : w / 2, m ? Number(m[2]) : h / 2, a.carry);
      const rot = a.carry.rot;
      mark.effects.push((_t: number, p: Props) => {
        p.rot += rot;
        p.tx += tx;
        p.ty += ty;
      });
    }
    marks.push(mark);
    return mark;
  };

  const api: Stage = {
    safe,
    restack(list, area, bias = 0.45) {
      const items = list.filter((a): a is Actor => a !== null && a.el.style.display !== 'none');
      const heights = items.map((a) => a.el.offsetHeight);
      if (items.length === 0 || heights.some((h) => !(h > 0))) return;
      const sorted = items
        .map((a, i) => ({ a, h: heights[i] as number }))
        .sort((x, y) => x.a.box.y - y.a.box.y);
      const gaps = sorted.slice(1).map((x, i) => {
        const prev = sorted[i] as { a: Actor };
        return Math.max(0, x.a.box.y - (prev.a.box.y + prev.a.box.height));
      });
      const total = sorted.reduce((n, x) => n + x.h, 0) + gaps.reduce((n, g) => n + g, 0);
      let y = area.y + Math.floor(Math.max(0, area.height - total) * bias);
      sorted.forEach((x, i) => {
        x.a.box = { ...x.a.box, y, height: Math.min(x.a.box.height, x.h) };
        x.a.el.style.top = `${y}px`;
        y += x.h + (gaps[i] ?? 0);
      });
    },
    nudge(a, dy) {
      if (!dy) return;
      a.box = { ...a.box, y: a.box.y + dy };
      a.el.style.top = `${a.box.y}px`;
    },
    text(id, content, slot, opts = {}) {
      if (opts.role === 'label' && look?.fonts.hand) {
        // Handwriting faces have small letters for their em size.
        slot = {
          ...slot,
          max: Math.round(slot.max * 1.3),
          min: Math.round(slot.min * 1.3),
          lineHeight: 1,
        };
      }
      const parts: HTMLElement[] = [];
      const tokens = content.trim().split(/\s+/).filter(Boolean);
      const focusIdx = opts.emphasis ? findPhrase(tokens, opts.emphasis) : [];
      const truncatable = opts.byWord ? false : (opts.truncatable ?? true);
      const placed = place(
        id,
        slot,
        fontFor(opts.role ?? 'body') + (opts.balance ? 'text-wrap:balance;' : ''),
        content,
        // Word-by-word text is never truncated: every word has a spoken time.
        truncatable,
        opts.byWord || focusIdx.length
          ? (box) => {
              box.replaceChildren();
              tokens.forEach((t, i) => {
                if (i > 0) box.append(doc.createTextNode(' '));
                const span = doc.createElement('span');
                span.textContent = t;
                span.style.display = 'inline-block';
                if (focusIdx.includes(i)) {
                  span.dataset.emphasis = '';
                  span.style.color = style.colors.accent;
                }
                box.append(span);
                parts.push(span);
              });
            }
          : undefined,
      );
      const el = placed.el;
      let size = placed.size;
      if (opts.balance && parts.length >= 3) {
        size = deOrphan(el, parts, slot, truncatable) ?? size;
        if (el.dataset.orphan === 'unavoidable')
          ctx.warn(`${id} leaves one word on its last line: the last two words don't fit together`);
      }
      if (opts.focal) el.dataset.focal = '';
      if (opts.byWord) el.dataset.byWord = '';
      if (opts.balance) el.dataset.balance = '';
      return add({
        id,
        kind: 'text',
        el,
        box: slot.box,
        size,
        words: countWords(content),
        align: slot.align,
        depth: opts.depth ?? 1,
        ...(opts.byWord ? { parts } : {}),
        ...(focusIdx.length ? { parts, focusIdx } : {}),
      });
    },
    number(id, value, fmt, slot, opts = {}) {
      const from = opts.countFrom ?? 0;
      const a = formatCount(value, fmt);
      const b = formatCount(from, fmt);
      const css = `font-weight:${style.fonts.displayWeight};font-family:${fontStack(style.fonts.display)};font-variant-numeric:tabular-nums;color:${style.colors.ink};white-space:nowrap;`;
      // Fit the box to the widest string the counter will show, once.
      const { el, size } = place(id, slot, css, b.length > a.length ? b : a, false);
      if (opts.focal ?? true) el.dataset.focal = '';
      return add({
        id,
        kind: 'number',
        el,
        box: slot.box,
        size,
        words: 1,
        align: slot.align,
        depth: 1,
        count: { from, to: value, fmt },
      });
    },
    shape(id, box, opts = {}) {
      const el = doc.createElement('div');
      el.dataset.actor = id;
      const color = style.colors[opts.color ?? 'accent'];
      el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;background:${color};border-radius:${opts.radius ?? style.shape.radius}px;transform-origin:${opts.origin === 'center' ? 'center center' : 'left center'};`;
      if (opts.behind) opts.behind.el.before(el);
      else root.append(el);
      if (opts.behind && opts.carries) {
        const c = readableOn(color);
        opts.behind.el.style.color = c;
        opts.behind.el.dataset.on = opts.color ?? 'accent';
        for (const part of opts.behind.parts ?? []) part.style.color = c;
      }
      return add({
        id,
        kind: 'shape',
        el,
        box,
        size: 0,
        words: 0,
        align: 'left',
        depth: opts.depth ?? 1,
      });
    },
    surface(id, kind, around, opts = {}) {
      const list = Array.isArray(around) ? around : [around as Actor];
      if (list.length === 0) return null;
      const r0 = root.getBoundingClientRect();
      const k = r0.width > 0 ? w / r0.width : 1;
      // The text as set: word spans when there are any, else the element (box width × lines).
      const rectOf = (a: Actor): Box => {
        // Plain text: the line boxes of its content (a Range), not the full-width element.
        const range = !a.parts?.length && doc.createRange ? doc.createRange() : null;
        range?.selectNodeContents(a.el);
        const lineRects = range?.getClientRects ? Array.from(range.getClientRects()) : [];
        const els = a.parts?.length ? a.parts : [a.el];
        const rs = (
          lineRects.length ? lineRects : els.map((e) => e.getBoundingClientRect())
        ).filter((r) => r.width > 0);
        if (r0.width <= 0 || rs.length === 0) return a.box;
        const x0 = Math.min(...rs.map((r) => r.left));
        const y0 = Math.min(...rs.map((r) => r.top));
        const x1 = Math.max(...rs.map((r) => r.right));
        const y1 = Math.max(...rs.map((r) => r.bottom));
        return {
          x: (x0 - r0.left) * k,
          y: (y0 - r0.top) * k,
          width: (x1 - x0) * k,
          height: (y1 - y0) * k,
        };
      };
      const rs = list.map(rectOf);
      const size = Math.max(...list.map((a) => a.size || h * 0.05));
      const px = (opts.pad?.x ?? (size * 0.4) / h) * h;
      const py = (opts.pad?.y ?? (size * 0.22) / h) * h;
      // Never closer to the frame edge than half the safe margin.
      const mx = safe.x * 0.5;
      const my = safe.y * 0.5;
      const x0 = Math.max(mx, Math.min(...rs.map((r) => r.x)) - px);
      const y0 = Math.max(my, Math.min(...rs.map((r) => r.y)) - py);
      const x1 = Math.min(w - mx, Math.max(...rs.map((r) => r.x + r.width)) + px);
      const y1 = Math.min(h - my, Math.max(...rs.map((r) => r.y + r.height)) + py);
      const box = opts.box
        ? {
            x: Math.round(opts.box.x),
            y: Math.round(opts.box.y),
            width: Math.round(opts.box.width),
            height: Math.round(opts.box.height),
          }
        : {
            x: Math.round(x0),
            y: Math.round(y0),
            width: Math.round(x1 - x0),
            height: Math.round(y1 - y0),
          };
      const sf = buildSurface(doc, look?.surfaces?.[kind], box, {
        kind,
        colors: style.colors,
        seed: ctx.seed + id.length * 17,
        frameH: h,
      });
      if (!sf) return null;
      sf.el.dataset.actor = id;
      // Behind every actor it carries.
      const first = list.reduce((m, a) => (m.el.compareDocumentPosition(a.el) & 2 ? a : m));
      first.el.before(sf.el);
      // Depth 1, with its text: back-layer parallax would slide the text off its surface.
      const actor = add({
        id,
        kind: 'shape',
        el: sf.el,
        box,
        size: 0,
        words: 0,
        align: 'left',
        depth: 1,
      });
      // A colour strip (the accent, no paper): the text it carries takes the colour that reads
      // on it, emphasised words included, and the contrast check measures it on the accent.
      if (sf.fill === style.colors.accent) {
        const c = readableOn(sf.fill);
        for (const a of list) {
          a.el.style.color = c;
          a.el.dataset.on = 'accent';
          for (const part of a.parts ?? []) part.style.color = c;
        }
      }
      // The look's tilt, as much of it as keeps the turned text inside the safe area and clear
      // of other text (a wide line in 9:16 has no room to turn).
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const others = actors
        .filter(
          (o) =>
            !list.includes(o) &&
            (o.kind === 'text' || o.kind === 'number') &&
            o.el.style.display !== 'none',
        )
        .map(rectOf);
      const turned = (r: Box, deg: number): Box => {
        const th = (deg * Math.PI) / 180;
        const corners = [
          [r.x, r.y],
          [r.x + r.width, r.y],
          [r.x, r.y + r.height],
          [r.x + r.width, r.y + r.height],
        ].map(([x, y]) => [
          ((x as number) - cx) * Math.cos(th) - ((y as number) - cy) * Math.sin(th) + cx,
          ((x as number) - cx) * Math.sin(th) + ((y as number) - cy) * Math.cos(th) + cy,
        ]);
        const xs = corners.map((c) => c[0] as number);
        const ys = corners.map((c) => c[1] as number);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
      };
      const fits = (deg: number) =>
        rs.every((r) => {
          const b = turned(r, deg);
          return contains(safe, b, 0) && others.every((o) => !overlapsBox(b, o));
        });
      const tilt = sf.tilt ? ([1, 0.6, 0.3].map((k) => sf.tilt * k).find(fits) ?? 0) : 0;
      if (tilt) {
        actor.effects.push((_t, p) => (p.rot += tilt));
        // The text turns with its paper, about the surface's centre (a fixed offset, not
        // motion), and so do the marks drawn on it later (see addMark).
        const carry = { rot: tilt, cx, cy };
        for (const a of list) {
          // Its transform origin: the element as set (no fixed height), left or centre.
          const eh = a.el.offsetHeight > 0 ? a.el.offsetHeight : a.box.height;
          const ox = a.align === 'left' ? a.box.x : a.box.x + a.box.width / 2;
          const { tx, ty } = turnAbout(ox, a.box.y + eh / 2, carry);
          a.carry = carry;
          // Texts on one tilted surface turn together, so their spacing is the untilted layout's.
          a.el.dataset.carriedBy = id;
          a.effects.push((_t: number, p: Props) => {
            p.rot += carry.rot;
            p.tx += tx;
            p.ty += ty;
          });
        }
      }
      return actor;
    },
    on(cue, ...actions) {
      if (!spec.cues.some((c) => c.id === cue)) throw new Error(`stage: unknown cue "${cue}"`);
      cueActions.set(cue, [...(cueActions.get(cue) ?? []), ...actions]);
      for (const a of actions) if (a.type === 'enter') a.actor.enteredBy.push(cue);
    },
    compile() {
      // Read time per cue: the words its entering text actors put on screen, unless the scene said.
      const cues = spec.cues.map((c) => {
        const entering = (cueActions.get(c.id) ?? []).flatMap((a) =>
          a.type === 'enter' ? [a.actor] : [],
        );
        const words = c.words ?? entering.reduce((n, a) => n + a.words, 0);
        // Word-by-word text keeps arriving after the cue lands: estimate how long from the
        // spoken words (the final times are set after scheduling).
        const byWord = entering.filter((a) => a.parts && !a.count && isByWord(a));
        if (byWord.length === 0) return { ...c, words };
        const anchor = spec.anchors?.find((b) => b.cue === c.id);
        const first = anchor && ctx.words?.[anchor.word] ? anchor.word : null;
        const land = first === null ? 0 : (ctx.words?.[first]?.startMs ?? 0);
        const spanMs = Math.max(
          ...byWord.map((a) => {
            const t = revealTimes(ctx.words, first, land, a.parts!.length);
            return (t[t.length - 1] ?? land) - land;
          }),
        );
        return { ...c, words, spanMs };
      });
      const plan = scheduleBeats({
        cues,
        ...(spec.anchors ? { anchors: spec.anchors } : {}),
        ...(ctx.words ? { words: ctx.words } : {}),
        ...(ctx.stress ? { stress: ctx.stress } : {}),
        durationMs,
        enterMs,
        exitMs,
        ...(person ? { snapMargin: person.snapMargin } : {}),
      });
      const exitStart = plan.exitStartMs;
      const leads: Record<string, number> = {};
      const markedByCue = new Set<Actor>();
      const soundCues: SoundCue[] = [];
      const sound = look?.sound ?? {};
      const q = (t: number, land: number) =>
        stepMs > 0 && t < land ? Math.floor(t / stepMs) * stepMs : t;
      /** Stop-motion wobble for stepped looks: a seeded turn in [-1, 1) per actor and step. */
      const wobble = (a: Actor, step: number) => {
        let x =
          (ctx.seed ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(a.id.length + 7, 0x85ebca6b)) >>>
          0;
        x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
        x = (x ^ (x >>> 13)) >>> 0;
        return (x % 2000) / 1000 - 1;
      };

      for (const cue of plan.cues) {
        const lead = Math.max(1, cue.landMs - cue.startMs);
        leads[cue.id] = lead;
        // Delivery sets how hard the landing hits (0 = soft, 1 = punched).
        const stress = cue.word === null ? undefined : ctx.stress?.[cue.word];
        const hit = stress === undefined ? 0.3 : Math.max(0, Math.min(1, (stress - 50) / 50));
        const overshoot = Math.min(
          3,
          ((person?.overshoot ?? 0) + (person?.popMax ?? 0) * hit) * 25,
        );
        for (const action of cueActions.get(cue.id) ?? []) {
          const a = action.actor;
          if (action.type === 'enter') {
            const preset = PRESET_ENTER[person?.preset ?? 'calm'] as Record<
              ActorKind,
              EnterBehaviour
            >;
            const kind =
              action.kind ??
              person?.enter?.[a.kind === 'number' ? 'number' : a.kind] ??
              preset[a.kind];
            const seedTilt = (((ctx.seed + a.id.length * 31) % 7) - 3) * 0.6;
            if (isByWord(a)) {
              // The line appears with its first word; each word pops in on its spoken word.
              const parts = a.parts!;
              const n = parts.length;
              const times = revealTimes(
                ctx.words,
                cue.word,
                cue.landMs,
                n,
                exitStart - readTimeMs(Math.min(n, 3)),
              );
              a.effects.push((tMs, p) => {
                const t = q(tMs, cue.landMs);
                p.opacity *= t >= cue.startMs ? 1 : 0;
                // The line settles as its first word lands (the words carry the rest).
                p.ty += (1 - enterEase(progress(t, cue.startMs, lead))) * lift * 0.3;
              });
              a.post = (tMs) => {
                parts.forEach((span, k) => {
                  const land = times[k] as number;
                  const from = k === 0 ? cue.startMs : Math.max(0, land - WORD_IN_MS);
                  const e = enterEase(progress(q(tMs, land), from, Math.max(1, land - from)));
                  const wordStress = cue.word === null ? undefined : ctx.stress?.[cue.word + k];
                  const punch =
                    wordStress === undefined
                      ? overshoot
                      : Math.min(3, overshoot + Math.max(0, (wordStress - 60) / 40));
                  const b = back(e, punch);
                  const emph = a.focusIdx?.includes(k) ?? false;
                  span.style.opacity = String(Math.min(1, e * 1.6));
                  span.style.transform = `translateY(${(1 - b) * lift * 0.5}px) scale(${emph ? 0.7 + 0.3 * b : 1})`;
                });
              };
              const name = sound.enter;
              if (name) soundCues.push({ atMs: cue.startMs, kind: 'enter', sound: name });
              continue;
            }
            a.effects.push((tMs, p) => {
              const t = q(tMs, cue.landMs);
              const x = progress(t, cue.startMs, lead);
              const e = enterEase(x);
              const b = back(e, overshoot);
              const shown = x > 0 ? 1 : 0;
              switch (kind) {
                case 'mask':
                  p.opacity *= shown;
                  p.clipB = Math.max(p.clipB, 1 - e);
                  p.ty += (1 - e) * lift * 0.6;
                  break;
                case 'wipe':
                  p.opacity *= shown;
                  p.clipR = Math.max(p.clipR, 1 - e);
                  break;
                case 'type': {
                  const n = Math.max(1, a.el.textContent.length);
                  p.opacity *= shown;
                  p.clipR = Math.max(p.clipR, 1 - Math.floor(e * n) / n);
                  break;
                }
                case 'pop':
                  p.opacity *= Math.min(1, e * 2);
                  p.scale *= 0.6 + 0.4 * b;
                  break;
                case 'slam':
                  p.opacity *= Math.min(1, e * 2.5);
                  p.scale *= 1.3 - 0.3 * b;
                  p.rot += (1 - e) * seedTilt;
                  break;
                case 'stamp':
                  p.opacity *= Math.min(1, e * 3);
                  p.scale *= 1.6 - 0.6 * b;
                  p.rot += (1 - e) * seedTilt * 2;
                  break;
                case 'draw':
                  p.opacity *= shown;
                  p.scaleX *= e;
                  break;
                default: // rise, count
                  p.opacity *= e;
                  p.ty += (1 - b) * lift * 1.5;
                  if (a.kind === 'number') p.scale *= 0.96 + 0.04 * b;
              }
              // Stepped looks: paper pieces arrive with a seeded wobble per step, gone on landing.
              if (stepMs > 0 && x > 0 && tMs < cue.landMs)
                p.rot += wobble(a, Math.floor(tMs / stepMs)) * 1.6 * (1 - e);
              if (a.count) {
                p.text = countAt(
                  t,
                  cue.startMs,
                  lead,
                  a.count.from,
                  a.count.to,
                  a.count.fmt,
                  enterEase,
                );
              }
            });
            const focal = a.el.dataset.focal !== undefined;
            const name = focal ? sound.focal : sound.enter;
            if (name)
              soundCues.push({
                atMs: focal ? cue.landMs : cue.startMs,
                kind: focal ? 'focal' : 'enter',
                sound: name,
              });
          } else {
            // A mark is part of the landing: it draws behind or around the text, never over it.
            const dur = Math.max(1, Math.round(enterMs * 0.6));
            addMark(
              a,
              look?.marks?.[action.role] ?? 'highlighter',
              cue.landMs,
              dur,
              Boolean(a.focusIdx?.length),
            );
            markedByCue.add(a);
            if (sound.mark) soundCues.push({ atMs: cue.landMs, kind: 'mark', sound: sound.mark });
          }
        }
      }

      // Actors whose cue was dropped never appear.
      const droppedSet = new Set(plan.dropped);
      for (const a of actors) {
        if (a.enteredBy.length > 0 && a.enteredBy.every((c) => droppedSet.has(c)))
          a.el.style.display = 'none';
      }

      // Juice: only what this stage can actually show.
      const canSnap = cam.snap > 0;
      const canDecor = actors.some((a) => a.kind === 'text' && a.words > 1);
      const wanted = look?.juice ?? DEFAULT_JUICE;
      const able = wanted.filter(
        (j) =>
          j === 'camera-push' ||
          (j === 'camera-snap' && canSnap) ||
          (j === 'decor-draw' && canDecor) ||
          (j === 'parallax-shift' &&
            cam.parallax > 0 &&
            actors.some((a) => a.kind === 'shape' && a.depth === 0)),
      );
      const energy: Energy = ctx.energy ?? look?.energy ?? 'steady';
      const juice = planJuice(plan, {
        energy,
        juice: able.length > 0 ? able : ['camera-push'],
        seed: ctx.seed,
        ...(ctx.pauses ? { pauses: ctx.pauses } : {}),
      });
      const camera = cameraTrack(plan.quiet, juice.beats, {
        push: cam.push,
        snap: cam.snap,
        durationMs,
      });
      for (const j of juice.beats) {
        if (j.id === 'camera-snap' && sound.snap)
          soundCues.push({ atMs: j.atMs, kind: 'snap', sound: sound.snap });
      }
      // decor-draw: after a line has been read, the look underlines it by hand.
      // A line that already carries a mark is not underlined again.
      const marked = new Set<Actor>(markedByCue);
      for (const j of juice.beats.filter((b) => b.id === 'decor-draw')) {
        const target = [...plan.cues]
          .reverse()
          .filter((c) => c.landMs < j.atMs)
          .flatMap((c) =>
            (cueActions.get(c.id) ?? []).flatMap((x) => (x.type === 'enter' ? [x.actor] : [])),
          )
          .find(
            (a) =>
              a.kind === 'text' && a.words > 1 && !marked.has(a) && a.el.style.display !== 'none',
          );
        if (!target) continue;
        marked.add(target);
        addMark(
          target,
          look?.marks?.emphasis === 'marker-circle' ? 'marker-underline' : 'underline',
          j.atMs,
          j.durMs,
        );
        if (sound.mark) soundCues.push({ atMs: j.atMs, kind: 'mark', sound: sound.mark });
      }
      const drifters = actors.filter((a) => a.kind === 'shape' && a.depth === 0);
      if (cam.parallax > 0) {
        const px = (cam.parallax * h) / 1080;
        for (const a of drifters)
          a.effects.push((tMs, p) => (p.tx += px * (tMs / Math.max(1, durationMs) - 0.5)));
      }
      if (sound.exit) soundCues.push({ atMs: exitStart, kind: 'exit', sound: sound.exit });
      soundCues.sort((x, y) => x.atMs - y.atMs);

      const write = (el: HTMLElement | SVGSVGElement, p: Props) => {
        el.style.opacity = String(p.opacity);
        el.style.transform = `translate(${p.tx}px,${p.ty}px) rotate(${p.rot}deg) scale(${p.scale * p.scaleX},${p.scale})`;
        el.style.clipPath =
          p.clipR > 0 || p.clipB > 0 ? `inset(0 ${p.clipR * 100}% ${p.clipB * 100}% 0)` : 'none';
      };
      const seek = (tMs: number) => {
        const out = moveEase(
          progress(q(tMs, durationMs), exitStart, Math.max(1, durationMs - exitStart)),
        );
        const fresh = (): Props => ({
          opacity: 1 - out,
          tx: 0,
          ty: -out * lift,
          scale: 1,
          scaleX: 1,
          rot: 0,
          clipR: 0,
          clipB: 0,
          draw: 1,
          text: null,
        });
        for (const a of actors) {
          const p = fresh();
          for (const fx of a.effects) fx(tMs, p);
          if (p.text !== null) a.el.textContent = p.text;
          write(a.el, p);
          a.post?.(tMs);
        }
        for (const m of marks) {
          const p = fresh();
          for (const fx of m.effects) fx(tMs, p);
          write(m.el, p);
          if (m.reveal === 'draw') {
            for (const path of Array.from(m.el.children))
              (path as SVGElement).style.strokeDashoffset = String(1 - p.draw);
          }
        }
      };
      seek(0);
      return {
        durationMs,
        seek,
        dispose: () => root.replaceChildren(),
        camera,
        report: {
          plan,
          juice,
          energy,
          leads,
          cast: Object.fromEntries(
            spec.cues.map((c) => [
              c.id,
              (cueActions.get(c.id) ?? []).flatMap((x) => (x.type === 'enter' ? [x.actor.id] : [])),
            ]),
          ),
        },
        soundCues,
      };
    },
  };
  return api;
}

/**
 * The widest visual line of some word spans, in frame px (null without layout, as in tests).
 * Spans are grouped into lines by their top edge.
 */
function widestLine(spans: readonly HTMLElement[], root: HTMLElement, frameW: number): Box | null {
  const r0 = root.getBoundingClientRect();
  if (r0.width <= 0) return null;
  const k = frameW / r0.width;
  const lines: { top: number; x0: number; x1: number }[] = [];
  for (const el of spans) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0) continue;
    const line = lines.find((l) => Math.abs(l.top - r.top) < r.height * 0.5);
    if (line) {
      line.x0 = Math.min(line.x0, r.left);
      line.x1 = Math.max(line.x1, r.right);
    } else lines.push({ top: r.top, x0: r.left, x1: r.right });
  }
  const best = lines.reduce<(typeof lines)[number] | null>(
    (m, l) => (!m || l.x1 - l.x0 > m.x1 - m.x0 ? l : m),
    null,
  );
  if (!best) return null;
  return {
    x: (best.x0 - r0.left) * k,
    y: (best.top - r0.top) * k,
    width: (best.x1 - best.x0) * k,
    height: 0,
  };
}

/** Text revealed word by word (not just emphasised). */
function isByWord(a: Actor): boolean {
  return a.parts !== undefined && a.el.dataset.byWord !== undefined;
}

export type { JuiceBeat };

/** Rounded line tops of word spans; one entry per span. */
const lineTops = (parts: readonly HTMLElement[]) => parts.map((p) => Math.round(p.offsetTop));

/** True when the last of 2+ lines holds a single word. */
export function hasOrphan(parts: readonly HTMLElement[]): boolean {
  const tops = lineTops(parts);
  if (tops.length < 3 || new Set(tops).size < 2) return false;
  const last = Math.max(...tops);
  return tops.filter((t) => t === last).length === 1;
}

/**
 * Balanced text can still leave one word alone on its last line (a long word, a 3-word line on
 * 2 lines). Then the last two words are glued in a `nowrap` span and the text is fitted again;
 * if the pair can't fit, the glue comes off. Returns the new font size, or null when nothing
 * changed. Build time only (it reads layout); without layout it does nothing.
 */
function deOrphan(
  el: HTMLElement,
  parts: readonly HTMLElement[],
  slot: TextSlot,
  truncatable: boolean,
): number | null {
  if (!hasOrphan(parts)) return null;
  const a = parts[parts.length - 2] as HTMLElement;
  const b = parts[parts.length - 1] as HTMLElement;
  const space = a.nextSibling;
  const glue = el.ownerDocument.createElement('span');
  glue.dataset.glue = '';
  glue.style.whiteSpace = 'nowrap';
  a.before(glue);
  glue.append(a, ...(space && space !== b ? [space] : []), b);
  const refit = () =>
    fitText(
      el,
      { width: slot.box.width, height: slot.box.height },
      {
        max: slot.max,
        min: slot.min,
        lineHeight: slot.lineHeight,
        maxLines: slot.maxLines,
        truncatable,
      },
    );
  const fit = refit();
  if (!fit.overflow && !fit.truncated) return fit.size;
  // The pair doesn't fit on one line even at the minimum size (a very long word): take the glue
  // off, fit as before, and say so, so the check reports it as a warning, not a failure.
  glue.replaceWith(...Array.from(glue.childNodes));
  el.dataset.orphan = 'unavoidable';
  return refit().size;
}
