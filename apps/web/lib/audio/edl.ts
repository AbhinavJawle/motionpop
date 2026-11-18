/**
 * Edit decision list for voiceover cleanup (spec 05 R3.1, R3.2, R3.4, R3.6): which ranges to cut
 * (fillers and the dead part of long pauses) and how to re-time the kept words afterwards.
 * Pure functions, integer milliseconds throughout.
 */
import type { Word } from '@motionpop/schemas';

export interface CutRange {
  startMs: number;
  endMs: number;
}

export interface EdlOptions {
  /** A gap longer than this is a pause to shorten. */
  pauseMs: number;
  /** Silence kept inside a shortened pause (half on each side). */
  keepMs: number;
  /** Cuts shorter than this are dropped. */
  minCutMs: number;
  /** If the cuts total more than this share of the audio, cleanup is skipped. */
  maxCutRatio: number;
}

export const DEFAULT_EDL_OPTIONS: EdlOptions = {
  pauseMs: 700,
  keepMs: 300,
  minCutMs: 20,
  maxCutRatio: 0.4,
};

export interface Edl {
  cuts: CutRange[];
  fillersRemoved: number;
  pausesShortened: number;
  skipped?: 'too-much' | 'no-speech';
}

/** A word lies inside a cut. A zero-length word counts only when strictly inside. */
function isInside(w: { startMs: number; endMs: number }, c: CutRange): boolean {
  if (w.endMs > w.startMs) return w.startMs >= c.startMs && w.endMs <= c.endMs;
  return w.startMs > c.startMs && w.startMs < c.endMs;
}

/** Sort, clip to [0, limit] (when given) and merge overlapping or touching ranges. */
function normalize(cuts: ReadonlyArray<CutRange>, limit = Infinity): CutRange[] {
  const sorted = cuts
    .map((c) => ({ startMs: Math.max(0, c.startMs), endMs: Math.min(limit, c.endMs) }))
    .filter((c) => c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const out: CutRange[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.startMs <= last.endMs) last.endMs = Math.max(last.endMs, c.endMs);
    else out.push({ ...c });
  }
  return out;
}

export function buildEdl(
  words: ReadonlyArray<Word>,
  durationMs: number,
  opts: Partial<EdlOptions> = {},
): Edl {
  const o = { ...DEFAULT_EDL_OPTIONS, ...opts };
  const sorted = [...words].sort((a, b) => a.startMs - b.startMs || a.i - b.i);
  const speech = sorted.filter((w) => !w.filler);
  const fillers = sorted.filter((w) => w.filler);
  if (speech.length === 0 || durationMs <= 0) {
    return { cuts: [], fillersRemoved: 0, pausesShortened: 0, skipped: 'no-speech' };
  }

  const first = speech[0]!;
  const last = speech[speech.length - 1]!;
  const halfKeep = Math.ceil(o.keepMs / 2);
  const keep = Math.ceil(o.keepMs);

  interface Gap {
    a: number;
    b: number;
    pause: CutRange;
  }
  const gaps: Gap[] = [
    { a: 0, b: first.startMs, pause: { startMs: 0, endMs: first.startMs - keep } },
  ];
  for (let k = 0; k + 1 < speech.length; k++) {
    const a = speech[k]!.endMs;
    const b = speech[k + 1]!.startMs;
    gaps.push({ a, b, pause: { startMs: a + halfKeep, endMs: b - halfKeep } });
  }
  gaps.push({
    a: last.endMs,
    b: durationMs,
    pause: { startMs: last.endMs + keep, endMs: durationMs },
  });

  const raw: CutRange[] = [];
  let pausesShortened = 0;
  gaps.forEach((g, gi) => {
    const isLast = gi === gaps.length - 1;
    if (g.b - g.a > o.pauseMs && g.pause.endMs - g.pause.startMs >= o.minCutMs) {
      raw.push(g.pause);
      pausesShortened += 1;
    }
    // Fillers always go: on their own in short gaps, merged into the pause cut in long ones.
    for (const f of fillers) {
      if (f.startMs < g.a || f.startMs > g.b || (f.startMs === g.b && !isLast)) continue;
      const startMs = Math.max(g.a, f.startMs);
      const endMs = Math.min(g.b, f.endMs);
      if (endMs > startMs) raw.push({ startMs, endMs });
    }
  });

  // Merge overlapping or touching cuts, but never across a zero-length speech word sitting on the join.
  const onJoin = (p: number) => speech.some((w) => w.startMs === p && w.endMs === p);
  const merged: CutRange[] = [];
  for (const c of [...raw].sort((a, b) => a.startMs - b.startMs)) {
    const prev = merged[merged.length - 1];
    if (prev && (c.startMs < prev.endMs || (c.startMs === prev.endMs && !onJoin(c.startMs)))) {
      prev.endMs = Math.max(prev.endMs, c.endMs);
    } else {
      merged.push({ ...c });
    }
  }
  const cuts = merged.filter((c) => c.endMs - c.startMs >= o.minCutMs);

  const total = cuts.reduce((s, c) => s + (c.endMs - c.startMs), 0);
  if (total > o.maxCutRatio * durationMs) {
    return { cuts: [], fillersRemoved: 0, pausesShortened: 0, skipped: 'too-much' };
  }
  const fillersRemoved = fillers.filter((f) => cuts.some((c) => isInside(f, c))).length;
  return { cuts, fillersRemoved, pausesShortened };
}

/**
 * Position of a source time in the cleaned audio: `ms` minus the cut time before it.
 * A time inside a cut maps to the cut's start, so the result is monotonic and continuous.
 */
export function mapTime(ms: number, cuts: ReadonlyArray<CutRange>): number {
  let removed = 0;
  for (const c of normalize(cuts)) {
    if (ms >= c.endMs) removed += c.endMs - c.startMs;
    else {
      if (ms > c.startMs) removed += ms - c.startMs;
      break;
    }
  }
  return ms - removed;
}

/** Duration after the cuts are removed. */
export function cleanedDuration(durationMs: number, cuts: ReadonlyArray<CutRange>): number {
  return durationMs - normalize(cuts, durationMs).reduce((s, c) => s + (c.endMs - c.startMs), 0);
}

/**
 * Words after the cuts: words inside a cut are dropped, the rest keep their duration, are moved
 * through `mapTime` and re-indexed 0..n-1.
 */
export function retimeWords(words: ReadonlyArray<Word>, cuts: ReadonlyArray<CutRange>): Word[] {
  const norm = normalize(cuts);
  return words
    .filter((w) => !norm.some((c) => isInside(w, c)))
    .map((w, i) => {
      const startMs = mapTime(w.startMs, norm);
      return { ...w, i, startMs, endMs: startMs + (w.endMs - w.startMs) };
    });
}

/** The cut list as `retimeWords` and `mapTime` use it: sorted, merged (spec 17 bridge). */
export function normalizeCuts(cuts: ReadonlyArray<CutRange>): CutRange[] {
  return normalize(cuts);
}

/** Indexes of the original words `retimeWords` keeps, in order: cleaned word i is original word out[i]. */
export function keptWordIndexes(words: ReadonlyArray<Word>, cuts: ReadonlyArray<CutRange>): number[] {
  const norm = normalize(cuts);
  const out: number[] = [];
  words.forEach((w, i) => {
    if (!norm.some((c) => isInside(w, c))) out.push(i);
  });
  return out;
}

/** Inverse of `mapTime`: a cleaned-time point back to the original recording (spec 17 bridge). */
export function unmapTime(cleanedMs: number, cuts: ReadonlyArray<CutRange>): number {
  let src = cleanedMs;
  for (const c of normalize(cuts)) {
    if (src >= c.startMs) src += c.endMs - c.startMs;
    else break;
  }
  return src;
}
