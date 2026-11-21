// Reel engine (spec 27): the motion that ties scenes together, as pure functions of time.
// - Transitions: how one scene hands over to the next (R1.1).
// - Punch-ins: the speaker framing alternates on every jump cut so cuts read as edits (R1.2).
// - Face keys: where the face is over time, so crops follow the speaker (R2.2).
import type { ReelScene } from '@motionpop/schemas';

export type TransKind = 'push' | 'morph' | 'reveal' | 'overlay' | 'none';

/** How long a scene hand-over takes (ms); a layout morph takes a little longer. */
export const TRANS_MS = 340;
export const MORPH_MS = 440;

/**
 * The hand-over between two neighbouring scenes:
 * - `push`: the same graphic region (the old graphic rises out, the new one settles in),
 * - `morph`: the speaker's box changes shape (split ↔ speaker ↔ card),
 * - `reveal`: to or from a full-frame graphic (the video fades under or over it),
 * - `overlay`: speaker to speaker (only the overlay text changes),
 * - `none`: a carried graphic continuing in place.
 */
export function transKind(prev: ReelScene, next: ReelScene, carriedInPlace: boolean): TransKind {
  if (carriedInPlace) return 'none';
  const a = prev.layout;
  const b = next.layout;
  if (a === 'speaker' && b === 'speaker') return 'overlay';
  if (a === 'full' || b === 'full') return a === b ? 'push' : 'reveal';
  if (a === b) return 'push';
  return 'morph';
}

export function transLength(kind: TransKind): number {
  return kind === 'morph' ? MORPH_MS : kind === 'none' ? 0 : TRANS_MS;
}

/** Reel-time joins between kept source segments (each one is a jump cut). */
export function cutsFromSegments(
  segments: readonly { srcStartMs: number; srcEndMs: number }[],
): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    if (i > 0) out.push(Math.round(at));
    at += Math.max(0, s.srcEndMs - s.srcStartMs);
  }
  return out;
}

/** The cuts that change the framing: sorted, and at least `minGapMs` after the previous change. */
export function punchChanges(cuts: readonly number[], minGapMs = 700): number[] {
  const sorted = [...cuts].filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => a - b);
  const out: number[] = [];
  let last = 0;
  for (const c of sorted) {
    if (c - last < minGapMs) continue;
    out.push(c);
    last = c;
  }
  return out;
}

/** Where sentences start (the word after one ending in . ? or !), on the reel clock. */
export function sentenceStarts(words: readonly { text: string; startMs: number }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < words.length; i++)
    if (/[.?!]["')\]]?$/.test(words[i - 1]!.text.trim())) out.push(words[i]!.startMs);
  return out;
}

/**
 * Every framing change (spec 27 R1.2): each jump cut (≥ 700 ms apart), plus sentence starts
 * that sit at least `sentenceGapMs` from any other change, so a clean read still gets the
 * rhythm of an edit.
 */
export function framingChanges(
  cuts: readonly number[],
  sentences: readonly number[],
  sentenceGapMs = 2500,
): number[] {
  const base = punchChanges(cuts, 700);
  const all = [...base];
  for (const t of [...sentences].sort((a, b) => a - b)) {
    if (t <= sentenceGapMs) continue;
    if (all.every((c) => Math.abs(c - t) >= sentenceGapMs)) all.push(t);
  }
  return all.sort((a, b) => a - b);
}

/** 0 or 1: the framing level at `t` (it flips on every change). */
export function punchLevelAt(changes: readonly number[], t: number): 0 | 1 {
  let n = 0;
  for (const c of changes) {
    if (c > t) break;
    n++;
  }
  return (n % 2) as 0 | 1;
}

export interface FocusKey {
  atMs: number;
  x: number;
  y: number;
}

/**
 * The face position at `t`: linear between keys, held before the first and after the last,
 * eased so a move between two keys never snaps. Always inside [0, 1].
 */
export function focusAt(
  keys: readonly FocusKey[],
  t: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (keys.length === 0) return fallback;
  const first = keys[0]!;
  if (t <= first.atMs || keys.length === 1) return clampXY(first);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t <= b.atMs) {
      const a = keys[i - 1]!;
      const span = Math.max(1, b.atMs - a.atMs);
      const u = (t - a.atMs) / span;
      const e = u * u * (3 - 2 * u);
      return clampXY({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
    }
  }
  return clampXY(keys[keys.length - 1]!);
}

const clampXY = (p: { x: number; y: number }) => ({
  x: Math.min(1, Math.max(0, p.x)),
  y: Math.min(1, Math.max(0, p.y)),
});
