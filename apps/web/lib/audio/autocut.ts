/**
 * The automatic edit of a raw talking-head recording (spec 28): dead air, retakes, false starts,
 * asides and fillers become labelled cuts on the source clock. Pure; integer milliseconds.
 *
 * 1. Word timings are pulled onto the measured speech (`tightenWords`).
 * 2. Pauses are cut where the audio is silent, keeping a short breath on each side.
 * 3. Retakes (`findRetakes`) are cut together with the pause around them.
 * 4. Cuts never touch a kept word; overlapping cuts are resolved retake > filler > silence.
 */
import type { VideoCutKind, Word } from '@motionpop/schemas';
import { findRetakes, phrasesOf, type WordCut } from './retakes';
import { complement, tightenWords, type Range, type SpeechMap } from './speech';

export interface AutoCut extends Range {
  kind: Extract<VideoCutKind, 'silence' | 'filler' | 'retake' | 'ramble'>;
  reason: string;
}

export interface AutoCutOptions {
  /** A silence longer than this is shortened. */
  pauseMs: number;
  /** Silence kept after the last word before a cut (the end of a breath). */
  tailMs: number;
  /** Silence kept before the first word after a cut. */
  leadMs: number;
  /** Silence kept before the very first word and after the very last. */
  edgeMs: number;
  /** Cuts shorter than this are dropped (they would only make a click). */
  minCutMs: number;
  /**
   * Retake cuts that would remove more than this share of the spoken words are not applied (a
   * guard against a broken rule or review). A whole script said twice is about half.
   */
  maxRetakeShare: number;
}

/** Reel pacing: snappy, with a natural breath at every join. */
export const REEL_AUTOCUT: AutoCutOptions = {
  pauseMs: 380,
  tailMs: 150,
  leadMs: 90,
  edgeMs: 120,
  minCutMs: 60,
  maxRetakeShare: 0.6,
};

export interface AutoCutPlan {
  cuts: AutoCut[];
  /** The words with timings tightened onto the speech (source clock). */
  words: Word[];
  stats: {
    pauses: number;
    pauseMs: number;
    retakes: number;
    retakeMs: number;
    fillers: number;
    /** True when the speech meter was trusted; false means word gaps were used instead. */
    measured: boolean;
    /** Retakes were found but left in: cutting them would remove too much of the speech. */
    retakesSkipped: boolean;
  };
}

/**
 * The spoken words the retake ranges index into: timings tightened onto the speech when the
 * meter is trusted, fillers left out.
 */
export function spokenWords(words: readonly Word[], speech?: SpeechMap | null): Word[] {
  const tight = speech && speech.reliable ? tightenWords(words, speech) : [...words];
  return tight.filter((w) => !w.filler);
}

const PRIORITY: Record<AutoCut['kind'], number> = { retake: 3, ramble: 3, filler: 2, silence: 1 };

export function planAutoCuts(input: {
  words: readonly Word[];
  durationMs: number;
  speech?: SpeechMap | null;
  opts?: Partial<AutoCutOptions>;
  /**
   * Retake cuts as word ranges over `spokenWords(words, speech)`; by default the rules decide
   * (`findRetakes`). The pipeline passes the reviewed list (spec 28 R3).
   */
  retakes?: readonly WordCut[];
}): AutoCutPlan {
  const o = { ...REEL_AUTOCUT, ...input.opts };
  const durationMs = Math.max(0, Math.round(input.durationMs));
  const map = input.speech && input.speech.reliable ? input.speech : null;
  const words = map ? tightenWords(input.words, map) : input.words.map((w) => ({ ...w }));
  const speech = words.filter((w) => !w.filler);
  const empty: AutoCutPlan = {
    cuts: [],
    words,
    stats: {
      pauses: 0,
      pauseMs: 0,
      retakes: 0,
      retakeMs: 0,
      fillers: 0,
      measured: Boolean(map),
      retakesSkipped: false,
    },
  };
  if (speech.length === 0 || durationMs <= 0) return empty;

  // --- Retakes (on the spoken words, fillers aside) ---------------------------------------
  let wordCuts: WordCut[] = input.retakes ? [...input.retakes] : findRetakes(speech);
  // Both sides in word time (the gaps inside a cut don't count), so the share is honest.
  const inCut = new Uint8Array(speech.length);
  for (const c of wordCuts) for (let k = c.from; k <= c.to; k++) inCut[k] = 1;
  const wordMs = (w: Word) => w.endMs - w.startMs;
  const retakeWordMs = speech.reduce((s, w, k) => s + (inCut[k] ? wordMs(w) : 0), 0);
  const spokenMs = speech.reduce((s, w) => s + wordMs(w), 0);
  const retakesSkipped =
    wordCuts.length > 0 && spokenMs > 0 && retakeWordMs > o.maxRetakeShare * spokenMs;
  if (retakesSkipped) wordCuts = [];
  const cutWord = new Uint8Array(speech.length);
  for (const c of wordCuts) for (let k = c.from; k <= c.to; k++) cutWord[k] = 1;

  const raw: AutoCut[] = [];
  for (const c of wordCuts) {
    const prev = lastKeptBefore(speech, cutWord, c.from);
    const next = firstKeptAfter(speech, cutWord, c.to);
    const first = speech[c.from]!;
    // From just after the previous kept word (its breath) to just before the next kept one.
    const startMs = prev ? Math.min(first.startMs, prev.endMs + o.tailMs) : 0;
    const endMs = next ? Math.max(speech[c.to]!.endMs, next.startMs - o.leadMs) : durationMs;
    raw.push({ startMs, endMs, kind: c.kind, reason: c.reason });
  }

  // --- Untranscribed speech that duplicates the next line (a take Whisper dropped) ----------
  // Only right before a line of about the same length: a dropped take is re-said at once. A
  // wordless run anywhere else may be a real sentence Whisper missed, so it stays.
  if (map) {
    const phrases = phrasesOf(speech);
    for (const r of map.runs) {
      const len = r.endMs - r.startMs;
      if (len < 1200) continue;
      const covered = speech.reduce(
        (s, w) => s + Math.max(0, Math.min(r.endMs, w.endMs) - Math.max(r.startMs, w.startMs)),
        0,
      );
      if (covered > 0.1 * len) continue;
      const next = phrases.find((p) => p.startMs >= r.endMs);
      const twin =
        next !== undefined &&
        next.startMs - r.endMs <= 3000 &&
        Math.abs(next.endMs - next.startMs - len) <= 0.25 * len;
      if (twin) {
        raw.push({
          startMs: r.startMs,
          endMs: r.endMs,
          kind: 'retake',
          reason: 'A repeated take the transcript skipped',
        });
      }
    }
  }

  // --- Fillers ----------------------------------------------------------------------------
  for (const f of words) {
    if (f.filler && f.endMs > f.startMs) {
      raw.push({
        startMs: f.startMs,
        endMs: f.endMs,
        kind: 'filler',
        reason: `Filler “${f.text}”`,
      });
    }
  }

  // --- Pauses -----------------------------------------------------------------------------
  // Sound with no words under it (a breath, a click, an "um" Whisper left out, shuffling before
  // the first line) counts as silence; a long wordless stretch stays (it may be real speech).
  const voiced = map
    ? map.runs.filter(
        (r) =>
          r.endMs - r.startMs >= 1200 ||
          speech.some((w) => w.endMs > r.startMs && w.startMs < r.endMs),
      )
    : null;
  const silences: Range[] = voiced
    ? complement(voiced, durationMs)
    : gapsBetween(speech, durationMs);
  const keptWords = speech.filter((_, k) => !cutWord[k]);
  const firstWord = keptWords[0];
  const lastWord = keptWords[keptWords.length - 1];
  if (firstWord && lastWord) {
    // Before the first kept word and after the last: everything goes but a short breath.
    raw.push({
      startMs: 0,
      endMs: firstWord.startMs - o.edgeMs,
      kind: 'silence',
      reason: 'Dead air',
    });
    raw.push({
      startMs: lastWord.endMs + o.edgeMs,
      endMs: durationMs,
      kind: 'silence',
      reason: 'Dead air',
    });
    for (const s of silences) {
      if (s.endMs <= firstWord.startMs || s.startMs >= lastWord.endMs) continue;
      if (s.endMs - s.startMs <= o.pauseMs) continue;
      raw.push({
        startMs: s.startMs + o.tailMs,
        endMs: s.endMs - o.leadMs,
        kind: 'silence',
        reason: 'Long pause',
      });
    }
  }

  // Kept words are never cut into (a quiet word the meter missed stays).
  const keep: Range[] = speech
    .filter((_, k) => !cutWord[k])
    .map((w) => ({ startMs: w.startMs, endMs: w.endMs }));
  const cuts = resolve(raw, keep, durationMs, o.minCutMs);

  const sum = (k: (c: AutoCut) => boolean) =>
    cuts.filter(k).reduce((s, c) => s + (c.endMs - c.startMs), 0);
  return {
    cuts,
    words,
    stats: {
      pauses: cuts.filter((c) => c.kind === 'silence').length,
      pauseMs: sum((c) => c.kind === 'silence'),
      retakes: wordCuts.length + raw.filter((c) => c.reason.startsWith('A repeated take')).length,
      retakeMs: sum((c) => c.kind === 'retake' || c.kind === 'ramble'),
      fillers: cuts.filter((c) => c.kind === 'filler').length,
      measured: Boolean(map),
      retakesSkipped,
    },
  };
}

function lastKeptBefore(w: readonly Word[], cut: Uint8Array, i: number): Word | undefined {
  for (let k = i - 1; k >= 0; k--) if (!cut[k]) return w[k];
  return undefined;
}
function firstKeptAfter(w: readonly Word[], cut: Uint8Array, i: number): Word | undefined {
  for (let k = i + 1; k < w.length; k++) if (!cut[k]) return w[k];
  return undefined;
}

/** Without a trusted speech meter: the gaps between words. */
function gapsBetween(words: readonly Word[], durationMs: number): Range[] {
  const out: Range[] = [];
  let at = 0;
  for (const w of words) {
    if (w.startMs > at) out.push({ startMs: at, endMs: w.startMs });
    at = Math.max(at, w.endMs);
  }
  if (durationMs > at) out.push({ startMs: at, endMs: durationMs });
  return out;
}

function subtract(r: Range, holes: readonly Range[]): Range[] {
  let parts: Range[] = [{ ...r }];
  for (const h of holes) {
    if (h.endMs <= r.startMs || h.startMs >= r.endMs) continue;
    parts = parts.flatMap((p) => {
      if (h.endMs <= p.startMs || h.startMs >= p.endMs) return [p];
      const out: Range[] = [];
      if (h.startMs > p.startMs) out.push({ startMs: p.startMs, endMs: h.startMs });
      if (h.endMs < p.endMs) out.push({ startMs: h.endMs, endMs: p.endMs });
      return out;
    });
  }
  return parts;
}

/**
 * Non-overlapping, sorted cuts: kept words carved out, higher-priority kinds win overlaps,
 * touching cuts of one kind merged, slivers dropped.
 */
function resolve(raw: AutoCut[], keep: Range[], durationMs: number, minCutMs: number): AutoCut[] {
  const clipped = raw
    .map((c) => ({
      ...c,
      startMs: Math.max(0, Math.round(c.startMs)),
      endMs: Math.min(durationMs, Math.round(c.endMs)),
    }))
    .filter((c) => c.endMs > c.startMs);
  const byPriority = [...clipped].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]);
  const placed: AutoCut[] = [];
  for (const c of byPriority) {
    for (const part of subtract(c, [...keep, ...placed])) placed.push({ ...c, ...part });
  }
  placed.sort((a, b) => a.startMs - b.startMs);
  const merged: AutoCut[] = [];
  for (const c of placed) {
    const last = merged[merged.length - 1];
    if (last && last.kind === c.kind && c.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, c.endMs);
    } else merged.push({ ...c });
  }
  // A sliver touching another cut is folded into it; a lone sliver would only make a click.
  const out: AutoCut[] = [];
  for (const c of merged) {
    const last = out[out.length - 1];
    const short = c.endMs - c.startMs < minCutMs;
    if (last && last.endMs === c.startMs && (short || last.endMs - last.startMs < minCutMs)) {
      // Keep the label of the larger of the two.
      const keepC = c.endMs - c.startMs > last.endMs - last.startMs;
      out[out.length - 1] = { ...(keepC ? c : last), startMs: last.startMs, endMs: c.endMs };
    } else if (!short || touches(c, merged)) out.push({ ...c });
  }
  return out;
}

function touches(c: AutoCut, all: readonly AutoCut[]): boolean {
  return all.some((d) => d !== c && (d.endMs === c.startMs || d.startMs === c.endMs));
}
