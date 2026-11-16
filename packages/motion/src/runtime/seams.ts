/**
 * Seams between graphics. Each boundary gets one technique, and both sides of it use the same
 * one with matched direction and speed, so the eye carries the motion across the cut:
 *
 * - `slide` (cut the curve): the outgoing graphic accelerates sideways and fades by a third of
 *   its travel; the incoming one arrives mid-motion from the other side and settles. Mirrored
 *   power-4 eases, 12 % partial travel.
 * - `zoom` (zoom-through): everything grows. Out 1 → 1.2 with blur, in 0.75 → 1.
 * - `pull` (inverse zoom-through, for payoffs): everything shrinks. Out 1 → 0.8, in 1.25 → 1.
 * - `whip`: a fast, long slide with heavy blur; the energetic one.
 * - `paper`: a torn sheet sweeps across the frame and covers the cut (drawn by the lens layer);
 *   the graphics themselves cut under it.
 *
 * Arrivals decelerate, exits accelerate; exits are shorter than entrances. A film uses several
 * kinds, a payoff (the hype slot) is entered with `pull`, and no kind repeats twice in a row
 * when the look offers more than one. Everything is a pure function of time.
 */
export type SeamKind = 'slide' | 'zoom' | 'pull' | 'whip' | 'paper' | 'cut';

export interface SeamSide {
  kind: SeamKind;
  /** Travel direction for slides and whips: +1 leftward (content moves left), -1 rightward. */
  dir: 1 | -1;
}

export interface SlotSeams {
  enter: SeamSide;
  exit: SeamSide;
}

export interface SeamState {
  x: number;
  scale: number;
  opacity: number;
  blur: number;
}

export const ENTER_MS: Record<SeamKind, number> = {
  slide: 320,
  zoom: 420,
  pull: 520,
  whip: 260,
  paper: 0,
  cut: 0,
};
export const EXIT_MS: Record<SeamKind, number> = {
  slide: 300,
  zoom: 200,
  pull: 220,
  whip: 200,
  paper: 0,
  cut: 0,
};
export const PAPER_SWEEP_MS = 560;

/** Look transition names → seam kinds. Unknown names are ignored. */
const NAMES: Record<string, SeamKind> = {
  push: 'slide',
  slide: 'slide',
  'cut-the-curve': 'slide',
  zoom: 'zoom',
  'zoom-through': 'zoom',
  pull: 'pull',
  whip: 'whip',
  'paper-wipe': 'paper',
  paper: 'paper',
  cut: 'cut',
};
const DEFAULT_KINDS: readonly SeamKind[] = ['slide', 'zoom', 'slide', 'whip'];

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const outQuart = (p: number) => 1 - (1 - p) ** 4;
const inQuart = (p: number) => p ** 4;
const outExpo = (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const inCubic = (p: number) => p ** 3;

/** Small deterministic hash of a string to [0, 1). */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Pick a seam for every boundary. Slots further apart than `gapMs` meet the backdrop instead of
 * each other, but still use the boundary's kind for their own halves (an entrance needs no partner).
 */
export function planSeams(
  slots: readonly { id: string; startMs: number; endMs: number; energy?: string | undefined }[],
  transitions: readonly string[] | undefined,
): Map<string, SlotSeams> {
  const kinds = (transitions ?? []).map((t) => NAMES[t]).filter((k): k is SeamKind => !!k);
  const pool = kinds.length ? kinds : DEFAULT_KINDS;
  const sorted = [...slots].sort((a, b) => a.startMs - b.startMs);
  const out = new Map<string, SlotSeams>();
  let prev: SeamKind | null = null;
  const boundary: SeamSide[] = [];
  for (let i = 0; i <= sorted.length; i++) {
    const next = sorted[i];
    let kind: SeamKind;
    if (next?.energy === 'hype' && pool.some((k) => k !== 'paper')) kind = 'pull';
    else {
      const seed = unit(`${next?.id ?? 'end'}:${i}`);
      const last: SeamKind | null = prev;
      const choices: readonly SeamKind[] =
        pool.length > 1 && last ? pool.filter((k) => k !== last) : pool;
      kind = choices[Math.floor(seed * choices.length)] ?? 'slide';
    }
    // The last boundary (into nothing) is a plain exit of the same family.
    boundary.push({ kind, dir: i % 2 === 0 ? 1 : -1 });
    prev = kind;
  }
  sorted.forEach((s, i) => {
    out.set(s.id, { enter: boundary[i]!, exit: boundary[i + 1]! });
  });
  return out;
}

/**
 * The wrapper's state at slot time `local`. `width` scales slide travel; `stepMs` quantises the
 * seam for stepped looks (stop-motion seams); `holds` drops the exit half (the slot cuts).
 */
export function seamState(
  seams: SlotSeams,
  local: number,
  durationMs: number,
  width: number,
  holds: boolean,
  stepMs = 0,
): SeamState {
  const t = stepMs > 0 ? Math.floor(local / stepMs) * stepMs : local;
  const rest: SeamState = { x: 0, scale: 1, opacity: 1, blur: 0 };
  const inMs = ENTER_MS[seams.enter.kind];
  if (inMs > 0 && t < inMs) {
    const p = clamp(t / inMs);
    const { kind, dir } = seams.enter;
    if (kind === 'slide' || kind === 'whip') {
      const travel = width * (kind === 'whip' ? 0.3 : 0.12);
      const e = kind === 'whip' ? outExpo(p) : outQuart(p);
      return {
        x: dir * travel * (1 - e),
        scale: 1,
        opacity: 0.35 + 0.65 * clamp(p * 2.2),
        blur: (kind === 'whip' ? 18 : 8) * (1 - e),
      };
    }
    const e = outExpo(p);
    const from = kind === 'zoom' ? 0.75 : 1.25;
    return { x: 0, scale: from + (1 - from) * e, opacity: 0.15 + 0.85 * e, blur: 10 * (1 - e) };
  }
  const outMs = EXIT_MS[seams.exit.kind];
  const left = durationMs - t;
  if (!holds && outMs > 0 && left < outMs) {
    const p = clamp(1 - left / outMs);
    const { kind, dir } = seams.exit;
    if (kind === 'slide' || kind === 'whip') {
      const travel = width * (kind === 'whip' ? 0.3 : 0.12);
      const e = kind === 'whip' ? inCubic(p) : inQuart(p);
      return {
        x: -dir * travel * e,
        scale: 1,
        opacity: Math.max(0, 1 - p / 0.3),
        blur: (kind === 'whip' ? 18 : 8) * e,
      };
    }
    const e = inCubic(p);
    const to = kind === 'zoom' ? 1.2 : 0.8;
    // Opacity is linear (an eased fade holds near 1 too long).
    return { x: 0, scale: 1 + (to - 1) * e, opacity: Math.max(0, 1 - p * 0.85), blur: 10 * e };
  }
  return rest;
}

/**
 * A seam never touches the key moment: an entrance still in motion at the key, or an exit that
 * starts before the key has settled (key + 400 ms), becomes a cut on that side.
 */
export function guardSeams(seams: SlotSeams, keyMs: number, durationMs: number): SlotSeams {
  const enter =
    keyMs < ENTER_MS[seams.enter.kind] + 80
      ? { ...seams.enter, kind: 'cut' as const }
      : seams.enter;
  const exit =
    keyMs + 400 > durationMs - EXIT_MS[seams.exit.kind]
      ? { ...seams.exit, kind: 'cut' as const }
      : seams.exit;
  return { enter, exit };
}

export const NO_SEAMS: SlotSeams = {
  enter: { kind: 'cut', dir: 1 },
  exit: { kind: 'cut', dir: 1 },
};
