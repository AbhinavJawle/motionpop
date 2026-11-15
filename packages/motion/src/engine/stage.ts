import type {
  DecorId,
  Energy,
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
import { insetForCamera, safeArea, type Box } from '../core/safe-area';
import { fontStack } from '../fonts/font-faces';
import { scheduleBeats, type BeatPlan, type CueSpec, type SlotWordTime } from './beats';
import { buildDecor } from './decor';
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
  on(cue: string, ...actions: Action[]): void;
  compile(): StageComposition;
}

export interface TextOptions {
  role?: TextRole;
  truncatable?: boolean;
  focal?: boolean;
  depth?: 0 | 1 | 2;
}
export interface NumberOptions {
  countFrom?: number;
  focal?: boolean;
}
export interface ShapeOptions {
  /** Colour token from the look. */
  color?: 'accent' | 'accent2' | 'highlight' | 'ink' | 'muted';
  radius?: number;
  depth?: 0 | 1 | 2;
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
  ) => {
    const el = doc.createElement('div');
    el.dataset.text = '';
    el.dataset.actor = id;
    const { box } = slot;
    el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;text-align:${slot.align};transform-origin:${slot.align === 'left' ? 'left center' : 'center center'};${css}`;
    el.textContent = content;
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
  const textRect = (a: Actor): Box => {
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

  const addMark = (a: Actor, decor: DecorId, atMs: number, durMs: number) => {
    const fill = decor === 'highlighter';
    const d = buildDecor(doc, decor, textRect(a), {
      color: fill ? style.colors.highlight : style.colors.accent,
      size: a.size || h * 0.05,
      stroke: style.shape.stroke,
      seed: ctx.seed + a.id.length,
      radius: style.shape.radius,
      frame: { x: 0, y: 0, width: w, height: h },
      // Other text, as it is actually set (a short line leaves room beside it).
      keepClear: actors
        .filter((x) => x !== a && x.kind !== 'shape' && x.el.style.display !== 'none')
        .map(textRect),
    });
    if (d.layer === 'under') a.el.before(d.el);
    else a.el.after(d.el);
    if (fill) a.el.dataset.on = 'highlight';
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
    marks.push(mark);
    return mark;
  };

  const api: Stage = {
    safe,
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
      const { el, size } = place(
        id,
        slot,
        fontFor(opts.role ?? 'body'),
        content,
        opts.truncatable ?? true,
      );
      if (opts.focal) el.dataset.focal = '';
      return add({
        id,
        kind: 'text',
        el,
        box: slot.box,
        size,
        words: countWords(content),
        align: slot.align,
        depth: opts.depth ?? 1,
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
      el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;background:${style.colors[opts.color ?? 'accent']};border-radius:${opts.radius ?? style.shape.radius}px;transform-origin:left center;`;
      root.append(el);
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
        return { ...c, words };
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
      const soundCues: SoundCue[] = [];
      const sound = look?.sound ?? {};
      const q = (t: number, land: number) =>
        stepMs > 0 && t < land ? Math.floor(t / stepMs) * stepMs : t;

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
            addMark(a, look?.marks?.[action.role] ?? 'highlighter', cue.landMs, dur);
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
      const marked = new Set<Actor>();
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
        report: { plan, juice, energy, leads },
        soundCues,
      };
    },
  };
  return api;
}

export type { JuiceBeat };
