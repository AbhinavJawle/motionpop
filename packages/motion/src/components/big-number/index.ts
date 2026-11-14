import type { BuildContext, Composition, MotionComponent } from '../../contract';
import { countAt } from '../../core/count';
import { outCubic, outExpo } from '../../core/ease';
import { progress, tween } from '../../core/interp';
import { bigNumberParams, type BigNumberParams } from './params';

const ENTER_MS = 500;

/**
 * big-number v0 (16:9 only). Context line enters, the number counts up and lands
 * exactly at the key moment, the label slides in, everything holds, then a fast exit.
 */
function build(ctx: BuildContext, p: BigNumberParams): Composition {
  const { root, width: w, height: h, style, durationMs, keyMomentMs } = ctx;
  const doc = root.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = '') => {
    const node = doc.createElement(tag);
    node.style.cssText = css;
    node.textContent = text;
    return node;
  };

  const margin = Math.round(w * 0.08);
  const numSize = Math.round(h * 0.26); // number ≥ 22 % of frame height
  root.style.cssText = `position:absolute;inset:0;overflow:hidden;background:${style.colors.bg};`;

  const context = el(
    'div',
    `position:absolute;left:${margin}px;top:${Math.round(h * 0.22)}px;font:600 ${Math.round(h * 0.03)}px/1 ${style.fonts.body};letter-spacing:0.12em;text-transform:uppercase;color:${style.colors.muted};`,
    p.context ?? '',
  );
  const num = el(
    'div',
    `position:absolute;left:${margin}px;top:${Math.round(h * 0.3)}px;font:700 ${numSize}px/1 ${style.fonts.display};font-variant-numeric:tabular-nums;color:${style.colors.ink};white-space:nowrap;`,
  );
  const label = el(
    'div',
    `position:absolute;left:${margin}px;top:${Math.round(h * 0.3 + numSize * 1.1)}px;font:500 ${Math.round(h * 0.05)}px/1.2 ${style.fonts.body};color:${style.colors.ink};`,
    p.label,
  );
  root.append(context, num, label);

  const fmt = { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals };
  const countStart = Math.min(ENTER_MS * 0.6, keyMomentMs * 0.3);
  const countDur = Math.max(1, keyMomentMs - countStart);
  const exitDur = Math.round(ENTER_MS * 0.6);
  const exitStart = durationMs - exitDur;

  const seek = (tMs: number) => {
    const exit = outCubic(progress(tMs, exitStart, exitDur));
    const fade = 1 - exit;
    const lift = -exit * h * 0.02;

    const cIn = outExpo(progress(tMs, 0, ENTER_MS));
    context.style.opacity = String(cIn * fade);
    context.style.transform = `translateY(${(1 - cIn) * h * 0.02 + lift}px)`;

    const nIn = outExpo(progress(tMs, countStart * 0.5, ENTER_MS));
    num.textContent = countAt(tMs, countStart, countDur, p.countFrom, p.value, fmt);
    num.style.opacity = String(nIn * fade);
    num.style.transform = `translateY(${(1 - nIn) * h * 0.03 + lift}px) scale(${tween(tMs, countStart, countDur, 0.96, 1, outExpo)})`;
    num.style.transformOrigin = 'left center';
    num.style.color = tMs >= keyMomentMs ? style.colors.accent : style.colors.ink;

    const lIn = outExpo(progress(tMs, keyMomentMs + 150, ENTER_MS));
    label.style.opacity = String(lIn * fade);
    label.style.transform = `translateY(${(1 - lIn) * h * 0.03 + lift}px)`;
  };

  seek(0);
  return { durationMs, seek, dispose: () => root.replaceChildren() };
}

export const bigNumber: MotionComponent<BigNumberParams> = {
  id: 'big-number',
  name: 'Big number',
  category: 'data',
  params: bigNumberParams,
  defaults: {
    value: 40,
    suffix: '%',
    decimals: 0,
    label: 'Revenue growth since 2020',
    countFrom: 0,
  },
  durationMs: { min: 2000, ideal: 3600, max: 8000 },
  formats: ['16:9'],
  keyMomentMs: (_p, durationMs) => Math.round(Math.min(1500, durationMs * 0.45)),
  build,
};

export { bigNumberParams, type BigNumberParams };
