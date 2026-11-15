import { ENERGY_INTERVAL_MS, SLOW_JUICE, type Energy, type JuiceId } from '@motionpop/schemas';
import { inQuiet, type BeatPlan, type QuietWindow } from './beats';

/**
 * Juice (spec 07 R5.1, R5.1b, R9.5): engine-added motion that keeps a slot alive between cues.
 * While any read-time window is open only slow, non-covering juice is legal; fast juice runs
 * outside those windows and prefers the speaker's pauses. Pure and deterministic.
 */
export interface JuiceBeat {
  id: JuiceId;
  atMs: number;
  durMs: number;
  slow: boolean;
}

export interface JuicePlan {
  beats: JuiceBeat[];
  /** Longest stretch with no visible change after filling. */
  maxGapMs: number;
  budgetOk: boolean;
}

export interface JuiceOptions {
  energy: Energy;
  /** The look's ordered juice list. */
  juice: readonly JuiceId[];
  seed: number;
  pauses?: readonly { startMs: number; endMs: number }[];
}

export const FAST_JUICE_MS = 420;
/** Camera scale may change by at most this much across one read-time window. */
export const QUIET_CAMERA_MAX = 0.03;
const isSlow = (id: JuiceId) => SLOW_JUICE.includes(id);

type Span = { a: number; b: number };

function gaps(covered: Span[], end: number): Span[] {
  const sorted = [...covered].sort((x, y) => x.a - y.a);
  const out: Span[] = [];
  let at = 0;
  for (const s of sorted) {
    if (s.a > at) out.push({ a: at, b: s.a });
    at = Math.max(at, s.b);
  }
  if (end > at) out.push({ a: at, b: end });
  return out;
}

export function planJuice(plan: BeatPlan, opts: JuiceOptions): JuicePlan {
  const interval = ENERGY_INTERVAL_MS[opts.energy];
  const end = plan.exitStartMs;
  const covered: Span[] = plan.cues.map((c) => ({ a: c.startMs, b: c.landMs }));
  const slowList = opts.juice.filter(isSlow);
  const fastList = opts.juice.filter((j) => !isSlow(j));
  const slowId: JuiceId = slowList[0] ?? 'camera-push';
  const beats: JuiceBeat[] = [];
  let turn = Math.abs(Math.trunc(opts.seed));

  for (const gap of gaps(covered, end)) {
    let at = gap.a;
    while (gap.b - at > interval) {
      let t = at + interval * 0.85;
      const fastFits =
        fastList.length > 0 &&
        !inQuiet(plan.quiet, t, t + FAST_JUICE_MS) &&
        t + FAST_JUICE_MS <= gap.b;
      if (fastFits) {
        // Prefer a pause in the delivery near this moment, if it is still legal.
        const pause = opts.pauses?.find(
          (p) =>
            Math.abs(p.startMs - t) <= 300 &&
            p.startMs > at &&
            p.startMs - at <= interval &&
            p.startMs + FAST_JUICE_MS <= gap.b &&
            !inQuiet(plan.quiet, p.startMs, p.startMs + FAST_JUICE_MS),
        );
        if (pause) t = pause.startMs;
        const id = fastList[turn++ % fastList.length] as JuiceId;
        beats.push({ id, atMs: Math.round(t), durMs: FAST_JUICE_MS, slow: false });
        at = t + FAST_JUICE_MS;
      } else {
        // Slow motion from where the stillness began, for up to one interval.
        const durMs = Math.min(interval, gap.b - at);
        beats.push({ id: slowId, atMs: Math.round(at), durMs: Math.round(durMs), slow: true });
        at += durMs;
      }
    }
  }

  const all = [...covered, ...beats.map((j) => ({ a: j.atMs, b: j.atMs + j.durMs }))];
  const maxGapMs = gaps(all, end).reduce((m, g) => Math.max(m, g.b - g.a), 0);
  return { beats, maxGapMs, budgetOk: maxGapMs <= interval + 1 };
}

export interface CameraOptions {
  /** Slow push range, e.g. [1, 1.06]. */
  push: readonly [number, number];
  /** Extra scale of a snap-zoom. */
  snap: number;
  durationMs: number;
}

/**
 * One camera scale track for a slot: a steady push, slowed so that no read-time window sees
 * more than `QUIET_CAMERA_MAX` of change, plus snap-zooms at `camera-snap` juice beats (which
 * `planJuice` only places outside read-time windows).
 */
export function cameraTrack(
  quiet: readonly QuietWindow[],
  juice: readonly JuiceBeat[],
  opts: CameraOptions,
): (tMs: number) => number {
  const dur = Math.max(1, opts.durationMs);
  const from = Math.min(opts.push[0], opts.push[1]);
  let span = Math.abs(opts.push[1] - opts.push[0]);
  const longest = quiet.reduce((m, q) => Math.max(m, q.endMs - q.startMs), 0);
  if (longest > 0) span = Math.min(span, (QUIET_CAMERA_MAX * 0.95 * dur) / longest);
  const snaps = juice.filter((j) => j.id === 'camera-snap');
  return (tMs) => {
    const t = Math.max(0, Math.min(dur, tMs));
    let scale = from + span * (t / dur);
    for (const s of snaps) {
      const p = (t - s.atMs) / s.durMs;
      if (p <= 0 || p >= 1) continue;
      // Fast in (first 30 %), then ease back out.
      const bump =
        p < 0.3 ? 1 - (1 - p / 0.3) ** 3 : (1 + Math.cos(Math.PI * ((p - 0.3) / 0.7))) / 2;
      scale += opts.snap * bump;
    }
    return scale;
  };
}
