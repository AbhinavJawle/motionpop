import type { BuildContext, Composition } from '../../contract';
import { formatCount, countAt, type CountFormat } from '../../core/count';
import { eases } from '../../core/ease';
import { progress, tween } from '../../core/interp';
import { insetForCamera, safeArea } from '../../core/safe-area';
import { fitText } from '../../core/fit-text';
import { EXIT_RATIO, OVERLAP_MS } from '../../core/timeline';
import { fontStack } from '../../fonts/font-faces';
import { layoutBigNumber, type TextSlot } from './layout';
import type { BigNumberParams } from './params';

/** Readable hold before the exit (motion-principles.md §5). */
export const HOLD_MS = 800;
/** Floor for a compressed entrance on very short slots. */
const MIN_ENTER_MS = 120;
/** Longest count-up; longer counts would visually finish long before the word lands. */
export const COUNT_MAX_MS = 1400;

export interface BigNumberTimings {
  enter: number;
  exit: number;
  exitStart: number;
  countStart: number;
  countDur: number;
  /** Number entrance: starts a little before the count and always ends by the key moment. */
  numberIn: number;
  numberInDur: number;
  swipe: number;
  labelStart: number;
}

/**
 * Timings from the style pack (`style.motion`), compressed for short slots so the label still
 * holds for HOLD_MS before the exit whenever the slot allows it.
 */
export function bigNumberTimings(
  enterMs: number,
  durationMs: number,
  keyMomentMs: number,
): BigNumberTimings {
  const room = (durationMs - keyMomentMs - OVERLAP_MS - HOLD_MS) / (1 + EXIT_RATIO);
  const enter = Math.floor(Math.max(MIN_ENTER_MS, Math.min(enterMs, durationMs * 0.25, room)));
  const exit = Math.floor(enter * EXIT_RATIO);
  const countDur = Math.round(
    Math.min(COUNT_MAX_MS, Math.max(1, keyMomentMs - Math.min(OVERLAP_MS, keyMomentMs * 0.25))),
  );
  const countStart = Math.max(0, keyMomentMs - countDur);
  const numberIn = Math.max(0, Math.round(countStart - enter * 0.3));
  return {
    enter,
    exit,
    exitStart: durationMs - exit,
    countStart,
    countDur: Math.max(1, keyMomentMs - countStart),
    numberIn,
    numberInDur: Math.max(1, Math.min(enter, keyMomentMs - numberIn)),
    swipe: Math.round(enter * 0.6),
    labelStart: keyMomentMs + OVERLAP_MS,
  };
}

/** The widest string the counter shows: the box is fitted to it once, at build. */
export function widestCount(p: BigNumberParams): string {
  const fmt: CountFormat = { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals };
  const a = formatCount(p.value, fmt);
  const b = formatCount(p.countFrom, fmt);
  return b.length > a.length ? b : a;
}

/**
 * big-number v1: eyebrow context, a number that counts up and lands exactly on the key moment
 * (the spoken word), a highlight swipe behind it, then the label. Transparent root; the runtime
 * owns the background and the camera.
 */
export function buildBigNumber(ctx: BuildContext, p: BigNumberParams): Composition {
  const { root, width: w, height: h, format, style, durationMs, keyMomentMs } = ctx;
  const doc = root.ownerDocument;
  const enterEase = eases[style.motion.enterEase];
  const moveEase = eases[style.motion.moveEase];
  const t = bigNumberTimings(style.motion.enterMs, durationMs, keyMomentMs);

  const safe = insetForCamera(safeArea(format, w, h), w, h, style.motion.camera.pushIn);
  const layout = layoutBigNumber(format, h, safe, Boolean(p.context));
  root.style.cssText = 'position:absolute;inset:0;';

  const text = (
    slot: TextSlot,
    css: string,
    content: string,
    truncatable: boolean,
    what: string,
  ) => {
    const el = doc.createElement('div');
    el.dataset.text = '';
    const { box } = slot;
    // No CSS height: fitText measures the content height against the box.
    el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;text-align:${slot.align};${css}`;
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
    if (fit.truncated) ctx.warn(`${what} truncated to fit`);
    if (fit.overflow) ctx.warn(`${what} overflows its box at the minimum size`);
    return { el, size: fit.size };
  };

  const context = layout.context
    ? text(
        layout.context,
        `font-weight:600;font-family:${fontStack(style.fonts.body)};letter-spacing:0.12em;text-transform:uppercase;color:${style.colors.muted};white-space:nowrap;overflow:hidden;`,
        p.context ?? '',
        true,
        'context',
      )
    : null;

  // Highlight swipe sits behind the number (accent per principle 8, never accent-coloured text).
  const bar = doc.createElement('div');
  root.append(bar);

  const fmt: CountFormat = { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals };
  const num = text(
    layout.number,
    `font-weight:${style.fonts.displayWeight};font-family:${fontStack(style.fonts.display)};font-variant-numeric:lining-nums tabular-nums;color:${style.colors.ink};white-space:nowrap;`,
    widestCount(p),
    false,
    'number',
  );
  num.el.dataset.focal = '';
  num.el.dataset.on = 'highlight';
  // Measure the fitted final string's width for the bar (0 in layout-less test DOMs).
  const probe = doc.createElement('span');
  probe.textContent = formatCount(p.value, fmt);
  num.el.replaceChildren(probe);
  const textW = probe.getBoundingClientRect().width;
  num.el.textContent = '';
  const nb = layout.number.box;
  const padX = Math.round(num.size * 0.06);
  const barW = Math.min(nb.width, Math.round(textW) + 2 * padX);
  const barX =
    layout.number.align === 'left' ? nb.x - padX : Math.round(nb.x + (nb.width - barW) / 2);
  bar.style.cssText = `position:absolute;left:${barX}px;top:${Math.round(nb.y + num.size * 0.52)}px;width:${barW}px;height:${Math.round(num.size * 0.4)}px;background:${style.colors.highlight};border-radius:${style.shape.radius}px;transform-origin:left center;`;

  const label = text(
    layout.label,
    `font-weight:500;font-family:${fontStack(style.fonts.body)};color:${style.colors.ink};overflow:hidden;text-wrap:balance;`,
    p.label,
    true,
    'label',
  );

  const lift = h * 0.02;
  const countDur = t.countDur;

  const seek = (tMs: number) => {
    const out = moveEase(progress(tMs, t.exitStart, t.exit));
    const fade = 1 - out;
    const exitY = -out * lift;

    if (context) {
      const cIn = enterEase(progress(tMs, 0, t.enter));
      context.el.style.opacity = String(cIn * fade);
      context.el.style.transform = `translateY(${(1 - cIn) * lift + exitY}px)`;
    }

    const nIn = enterEase(progress(tMs, t.numberIn, t.numberInDur));
    num.el.textContent = countAt(tMs, t.countStart, countDur, p.countFrom, p.value, fmt, enterEase);
    num.el.style.opacity = String(nIn * fade);
    num.el.style.transform = `translateY(${(1 - nIn) * lift * 1.5 + exitY}px) scale(${tween(tMs, t.countStart, countDur, 0.96, 1, enterEase)})`;
    num.el.style.transformOrigin = layout.number.align === 'left' ? 'left center' : 'center center';

    const swipe = enterEase(progress(tMs, keyMomentMs, t.swipe));
    bar.style.transform = `translateY(${exitY}px) scaleX(${swipe})`;
    bar.style.opacity = String(fade);

    const lIn = enterEase(progress(tMs, t.labelStart, t.enter));
    label.el.style.opacity = String(lIn * fade);
    label.el.style.transform = `translateY(${(1 - lIn) * lift * 1.5 + exitY}px)`;
  };

  seek(0);
  return { durationMs, seek, dispose: () => root.replaceChildren() };
}
