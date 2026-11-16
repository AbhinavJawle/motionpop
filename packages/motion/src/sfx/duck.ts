import { speechSpans } from './level';

/**
 * The ducking envelope (spec 12 design §6, R8.1): how far the music dips under the voice, in dB,
 * one value per 10 ms (100 Hz). 0 = full level, `-depthDb` = fully ducked. Pure; the timeline
 * draws the same array as the AUDIO band's line, and `mixBed` applies it.
 */
export const DUCK_FRAME_MS = 10;
export const DUCK_ATTACK_MS = 80;
export const DUCK_RELEASE_MS = 400;
/** Pauses shorter than this stay ducked (R8.1: the music rises in pauses of 400 ms or more). */
export const DUCK_MIN_GAP_MS = 400;

export interface DuckOptions {
  depthDb: number;
  attackMs?: number;
  releaseMs?: number;
  minGapMs?: number;
}

export function duckEnvelope(
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
  durationMs: number,
  opts: DuckOptions,
): Float32Array {
  const frames = Math.max(0, Math.ceil(durationMs / DUCK_FRAME_MS));
  const env = new Float32Array(frames);
  const depth = Math.max(0, opts.depthDb);
  if (depth === 0 || frames === 0) return env;
  const attack = Math.max(DUCK_FRAME_MS, opts.attackMs ?? DUCK_ATTACK_MS);
  const release = Math.max(DUCK_FRAME_MS, opts.releaseMs ?? DUCK_RELEASE_MS);
  const down = (depth * DUCK_FRAME_MS) / attack;
  const up = (depth * DUCK_FRAME_MS) / release;
  const spans = speechSpans(words, opts.minGapMs ?? DUCK_MIN_GAP_MS);
  let s = 0;
  let v = 0;
  for (let f = 0; f < frames; f++) {
    const t = f * DUCK_FRAME_MS;
    while (s < spans.length && (spans[s]?.endMs ?? 0) <= t) s++;
    const span = spans[s];
    const target = span && span.startMs <= t ? -depth : 0;
    if (target < v) v = Math.max(target, v - down);
    else if (target > v) v = Math.min(target, v + up);
    // Snap rounding residue so a full duck is exactly -depth.
    if (Math.abs(v + depth) < 1e-6) v = -depth;
    if (Math.abs(v) < 1e-6) v = 0;
    env[f] = v;
  }
  return env;
}

/** The envelope at a time in ms, linearly interpolated between frames (0 dB past the ends). */
export function duckDbAt(env: Float32Array, tMs: number): number {
  if (env.length === 0 || !Number.isFinite(tMs) || tMs < 0) return 0;
  const x = tMs / DUCK_FRAME_MS;
  const i = Math.floor(x);
  if (i >= env.length - 1) return env[env.length - 1] ?? 0;
  const a = env[i] ?? 0;
  const b = env[i + 1] ?? 0;
  return a + (b - a) * (x - i);
}
