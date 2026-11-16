import { dbToGain, msToSamples } from './dsp';

/**
 * Look-ahead peak limiter (spec 12 R9.2): the output's sample peak never exceeds the ceiling.
 * The gain reaches the needed reduction exactly at each loud sample through a linear ramp over
 * the look-ahead, then recovers with a one-pole release. Pure and deterministic.
 */
export const LIMITER_CEILING_DB = -1;
export const LIMITER_LOOKAHEAD_MS = 5;
export const LIMITER_RELEASE_MS = 50;

export interface LimiterOptions {
  ceilingDb?: number;
  lookaheadMs?: number;
  releaseMs?: number;
}

/** Returns a new limited signal. A small margin under the ceiling absorbs float32 rounding. */
export function limit(
  x: Float32Array,
  sampleRate: number,
  opts: LimiterOptions = {},
): Float32Array {
  const n = x.length;
  const ceiling = dbToGain(opts.ceilingDb ?? LIMITER_CEILING_DB) * 0.999;
  const look = Math.max(1, msToSamples(opts.lookaheadMs ?? LIMITER_LOOKAHEAD_MS, sampleRate));
  const rel =
    1 - Math.exp(-1 / Math.max(1, msToSamples(opts.releaseMs ?? LIMITER_RELEASE_MS, sampleRate)));

  // w[i]: the most reduction any loud sample within the look-ahead asks of sample i, ramped
  // linearly so sample j itself gets exactly its own need r[j] = ceiling / |x[j]|.
  const w = new Float32Array(n).fill(1);
  for (let j = 0; j < n; j++) {
    const a = Math.abs(x[j] ?? 0);
    if (!(a > ceiling)) continue;
    const r = ceiling / a;
    for (let k = 0; k <= look; k++) {
      const i = j - k;
      if (i < 0) break;
      const g = r + ((1 - r) * k) / look;
      if (g < (w[i] ?? 1)) w[i] = g;
    }
  }

  const out = new Float32Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(w[i] ?? 1, g + (1 - g) * rel);
    const y = (x[i] ?? 0) * g;
    out[i] = Math.max(-ceiling, Math.min(ceiling, Number.isFinite(y) ? y : 0));
  }
  return out;
}
