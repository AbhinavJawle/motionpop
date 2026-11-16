import type { RuntimeProject } from '../compiler/types';
import { PAPER_SWEEP_MS, planSeams } from './seams';

/**
 * The lens: what sits over the graphics, under the captions.
 *
 * - Paper sweeps: at a `paper` seam a torn sheet in the look's highlight colour crosses the
 *   frame and covers the cut (the graphics swap while it is fully over them).
 * - Boil: on stepped looks the paper and grain textures jump to a new offset on every step
 *   (12 fps), the hand-made shimmer of stop-motion collage. Other looks drift them slowly.
 *
 * Pure function of time, like everything in the composition.
 */
export interface Lens {
  seek(tMs: number): void;
}

function unit(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A torn vertical edge as a clip-path polygon (percent units), deterministic per seed. */
function tornClip(seed: number): string {
  const left: string[] = [];
  const right: string[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * 100;
    left.push(`${(2 + unit(seed + i) * 5).toFixed(2)}% ${y.toFixed(2)}%`);
    right.push(`${(93 + unit(seed * 3 + i) * 5).toFixed(2)}% ${(100 - y).toFixed(2)}%`);
  }
  return `polygon(${[...left, ...right].join(',')})`;
}

export function mountLens(host: HTMLElement, project: RuntimeProject): Lens {
  const doc = host.ownerDocument;
  const { width: w, height: h, style } = project;
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
  const stepFps = 'personality' in style ? style.personality?.stepFps : undefined;
  const step = stepFps ? 1000 / stepFps : 0;

  const plan = planSeams(
    project.slots.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      energy: s.energy ?? undefined,
    })),
    'transitions' in style ? style.transitions : undefined,
  );
  // Each paper seam's cut time: the start of the slot it brings in.
  const cuts = project.slots
    .filter((s) => plan.get(s.id)?.enter.kind === 'paper')
    .map((s) => s.startMs)
    .sort((a, b) => a - b);

  const sheet = doc.createElement('div');
  const sw = w * 1.35;
  sheet.style.cssText = `position:absolute;top:${-h * 0.05}px;left:0;width:${sw}px;height:${h * 1.1}px;background:${style.colors.highlight};clip-path:${tornClip(3)};filter:drop-shadow(0 ${h * 0.01}px ${h * 0.02}px rgba(0,0,0,0.28));opacity:0;will-change:transform;`;
  // A strip of the accent rides the sheet's leading edge, like a second torn layer.
  const strip = doc.createElement('div');
  strip.style.cssText = `position:absolute;top:0;right:${sw * 0.02}px;width:${sw * 0.09}px;height:100%;background:${style.colors.accent};clip-path:${tornClip(11)};`;
  sheet.append(strip);
  if (cuts.length) host.append(sheet);

  const textures = [...doc.querySelectorAll<HTMLElement>('.mp-grain, .mp-paper')];

  return {
    seek(raw) {
      const t = step > 0 ? Math.floor(raw / step) * step : raw;
      if (cuts.length) {
        let shown = false;
        for (const c of cuts) {
          const local = t - (c - PAPER_SWEEP_MS / 2);
          if (local < 0 || local > PAPER_SWEEP_MS) continue;
          // In fast, a beat over the cut, out fast: the sheet is fully across at the cut.
          const p = local / PAPER_SWEEP_MS;
          const e = p < 0.5 ? 0.5 * (1 - (1 - p * 2) ** 3) : 0.5 + 0.5 * ((p - 0.5) * 2) ** 3;
          const x = -sw + e * (w + sw);
          sheet.style.opacity = '1';
          sheet.style.transform = `translate(${x.toFixed(1)}px,0) rotate(-2deg)`;
          shown = true;
          break;
        }
        if (!shown) sheet.style.opacity = '0';
      }
      if (textures.length) {
        const k = step > 0 ? Math.floor(raw / step) : raw / 180;
        const ox = step > 0 ? Math.round(unit(k) * 200) : (k * 0.6) % 200;
        const oy = step > 0 ? Math.round(unit(k + 7) * 200) : (k * 0.35) % 200;
        for (const el of textures) el.style.backgroundPosition = `${ox}px ${oy}px`;
      }
    },
  };
}
