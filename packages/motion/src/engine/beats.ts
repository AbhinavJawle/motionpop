import { readTimeMs } from '@motionpop/schemas';

/**
 * Beat scheduling (spec 07 R2.3, R5.1b, R9.1). Pure: cue times come from the spoken words, the
 * read-time rule and the slot length only. No DOM, no randomness.
 *
 * The rules, in priority order:
 * 1. A cue anchored to a spoken word lands on it (principle 13).
 * 2. Text that has landed is never moved or covered during its read time, and stays on screen
 *    for at least that long before the exit (optional cues that can't are dropped).
 * 3. A cue with no word to hit follows the previous landing by a short gap, so a scene builds
 *    with overlap (principle 3) instead of one element at a time.
 * 4. Engine-added juice and the camera are restricted while any read-time window is open
 *    (see juice.ts). Scene content is not: other actors may enter beside text being read.
 */
export interface CueSpec {
  id: string;
  /** Time the entrance takes to land, in ms. Defaults to the look's `enterMs`. */
  leadMs?: number;
  /** Words of text this cue puts on screen (0 = no text). Sets its read time. */
  words?: number;
  /** Optional cues are dropped, never squeezed, when the slot is too short. */
  optional?: boolean;
  /** May move to a more stressed neighbouring word (never for numbers or chart values). */
  snap?: boolean;
  /**
   * The entrance keeps building this long after it lands (text revealed word by word on the
   * voice). Later unanchored cues wait for it, and the read time of its last words counts from
   * its end.
   */
  spanMs?: number;
}

export interface SlotWordTime {
  /** Relative to the slot start. */
  startMs: number;
  endMs: number;
}

export interface BeatInput {
  cues: readonly CueSpec[];
  anchors?: readonly { cue: string; word: number }[];
  words?: readonly SlotWordTime[];
  /** Prosody stress per slot word (0–100). */
  stress?: readonly number[];
  durationMs: number;
  enterMs: number;
  exitMs: number;
  /** Stress lead a neighbour needs before a cue snaps to it (look.personality.snapMargin). */
  snapMargin?: number;
}

export interface ScheduledCue {
  id: string;
  /** When the entrance starts. */
  startMs: number;
  /** When the element has landed. */
  landMs: number;
  /** The slot word it landed on, or null when unanchored. */
  word: number | null;
  /** True when prosody moved it to a neighbouring word. */
  snapped: boolean;
  /** How much later than its word it landed (0 when on time or unanchored). */
  lateMs: number;
}

export interface QuietWindow {
  cue: string;
  startMs: number;
  endMs: number;
}

export interface BeatPlan {
  cues: ScheduledCue[];
  /** Optional cues that did not fit. */
  dropped: string[];
  /** Required cues that had to break their read time or hold because the slot is too short. */
  squeezed: string[];
  /** Read-time windows: only slow, non-covering motion is allowed while one is open. */
  quiet: QuietWindow[];
  exitStartMs: number;
}

/** Shortest entrance we ever compress to. */
export const MIN_LEAD_MS = 120;
/** Gap after a cue lands before the next unanchored cue may start. */
export const MIN_GAP_MS = 150;
/** Hold a cue without text needs before the exit. */
export const MIN_HOLD_MS = 150;
/** Shortest exit, when a late spoken word leaves almost no room. */
export const MIN_EXIT_MS = 60;
export const DEFAULT_SNAP_MARGIN = 15;

/** The word a cue lands on after the prosody snap (± 1 word, only when clearly more stressed). */
export function snapWord(
  word: number,
  count: number,
  stress: readonly number[] | undefined,
  margin: number,
): number {
  if (!stress) return word;
  const own = stress[word];
  if (own === undefined) return word;
  let best = word;
  let bestStress = own + margin;
  for (const j of [word - 1, word + 1]) {
    const s = stress[j];
    if (j >= 0 && j < count && s !== undefined && s >= bestStress && s > (stress[best] ?? 0)) {
      best = j;
      bestStress = s;
    }
  }
  return best;
}

export function scheduleBeats(input: BeatInput): BeatPlan {
  const { cues, durationMs } = input;
  const words = input.words ?? [];
  const margin = input.snapMargin ?? DEFAULT_SNAP_MARGIN;

  // Desired landing time per cue: the (snapped) word start, or null when unanchored.
  const desired = cues.map((cue) => {
    const anchor = input.anchors?.find((a) => a.cue === cue.id);
    if (!anchor || anchor.word < 0 || anchor.word >= words.length) return null;
    const word = cue.snap ? snapWord(anchor.word, words.length, input.stress, margin) : anchor.word;
    return { word, landMs: (words[word] as SlotWordTime).startMs, snapped: word !== anchor.word };
  });

  // A late spoken word shortens the exit rather than losing its landing: voice sync comes first.
  const lastWord = desired.reduce((m, d) => (d ? Math.max(m, d.landMs) : m), 0);
  const exitMs = Math.max(
    Math.min(MIN_EXIT_MS, input.exitMs),
    Math.min(Math.max(0, input.exitMs), durationMs - lastWord - MIN_HOLD_MS),
  );
  const exitStartMs = Math.max(0, durationMs - exitMs);

  const out: ScheduledCue[] = [];
  const dropped: string[] = [];
  const squeezed: string[] = [];
  const quiet: QuietWindow[] = [];
  let minStart = 0; // an unanchored cue follows the previous landing by a short gap
  let prevLand = 0;

  cues.forEach((cue, i) => {
    const lead = Math.max(MIN_LEAD_MS, cue.leadMs ?? input.enterMs);
    const hold = cue.words ? readFor(cue) : MIN_HOLD_MS;
    const latest = exitStartMs - hold;
    const want = desired[i];
    let landMs: number;
    if (want) {
      landMs = want.landMs;
    } else {
      // Unanchored: spread evenly up to the next anchored cue, or follow as soon as allowed.
      let k = i;
      while (k < cues.length && !desired[k]) k++;
      const next = desired[k];
      landMs = next
        ? prevLand + (next.landMs - prevLand) / (k - i + 1)
        : out.length === 0
          ? lead
          : minStart + lead;
    }
    // Anchored: land on the word, waiting only for cue order. Unanchored: follow the previous
    // landing by a short gap. Entrances compress to fit.
    let startMs = want ? Math.max(0, landMs - lead) : Math.max(minStart, landMs - lead);
    if (want) landMs = Math.max(landMs, prevLand);
    landMs = Math.max(landMs, startMs + MIN_LEAD_MS);
    if (landMs - startMs > lead) startMs = landMs - lead;
    landMs = Math.round(landMs);
    startMs = Math.round(startMs);

    if (landMs > latest) {
      if (cue.optional) {
        dropped.push(cue.id);
        return;
      }
      // A required cue in a slot that is too short: land as late as still leaves a short hold.
      squeezed.push(cue.id);
      landMs = Math.max(MIN_LEAD_MS, Math.min(landMs, exitStartMs - MIN_HOLD_MS));
      landMs = Math.max(landMs, prevLand);
      startMs = Math.max(0, Math.min(startMs, landMs - MIN_LEAD_MS));
    }

    out.push({
      id: cue.id,
      startMs,
      landMs,
      word: want ? want.word : null,
      snapped: want ? want.snapped : false,
      lateMs: want ? Math.max(0, landMs - want.landMs) : 0,
    });
    prevLand = landMs;
    if (cue.words) {
      const endMs = Math.min(exitStartMs, landMs + readFor(cue));
      if (endMs > landMs) quiet.push({ cue: cue.id, startMs: landMs, endMs });
    }
    minStart = Math.max(minStart, landMs + (cue.spanMs ?? 0) + MIN_GAP_MS);
  });

  return { cues: out, dropped, squeezed, quiet, exitStartMs };
}

/**
 * How long a cue's text needs, from its landing. Text revealed word by word is read as it
 * arrives, so after the last word only the last few words still need reading.
 */
function readFor(cue: CueSpec): number {
  const words = cue.words ?? 0;
  const span = Math.max(0, cue.spanMs ?? 0);
  return Math.max(readTimeMs(words), span > 0 ? span + readTimeMs(Math.min(words, 3)) : 0);
}

/** True when `[startMs, endMs]` overlaps any quiet window. */
export function inQuiet(quiet: readonly QuietWindow[], startMs: number, endMs: number): boolean {
  return quiet.some((q) => startMs < q.endMs && endMs > q.startMs);
}
