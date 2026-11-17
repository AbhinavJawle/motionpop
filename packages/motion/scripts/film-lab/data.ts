// Film lab: the voiceover fixture and its fixed beats (docs/research/experiments/film-mode).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
export const FIXTURES = join(pkgDir, '../../docs/research/experiments/film-mode');

export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}
export interface Voiceover {
  id: string;
  title: string;
  durationMs: number;
  audio: string;
  words: Word[];
}
export interface FixedBeat {
  id: string;
  wordStart: number;
  wordEnd: number;
  brief: string;
  startMs: number;
  endMs: number;
  /** The beat's words, times relative to its start. */
  words: Word[];
}

export function loadVoiceover(id = 'suez'): Voiceover {
  return JSON.parse(readFileSync(join(FIXTURES, `${id}-voiceover.json`), 'utf8')) as Voiceover;
}

/** Beats tile the voiceover: each starts on its first word (the first at 0) and ends where the next starts. */
export function tile<T extends { wordStart: number; wordEnd: number }>(
  vo: Voiceover,
  beats: readonly T[],
): (T & { startMs: number; endMs: number; words: Word[] })[] {
  // A beat starts a little before its first word, so its opening move is under way as the
  // sentence begins; never before the previous beat's last word has ended.
  const starts = beats.map((b, i) => {
    if (i === 0) return 0;
    const first = (vo.words[b.wordStart] as Word).startMs;
    const prevEnd = (vo.words[(beats[i - 1] as T).wordEnd] as Word).endMs;
    return Math.round(Math.max(prevEnd, first - 250));
  });
  return beats.map((b, i) => {
    const startMs = starts[i] as number;
    const endMs = i + 1 < beats.length ? (starts[i + 1] as number) : vo.durationMs;
    const words = vo.words.slice(b.wordStart, b.wordEnd + 1).map((w) => ({
      text: w.text,
      startMs: Math.max(0, w.startMs - startMs),
      endMs: Math.max(0, w.endMs - startMs),
    }));
    return { ...b, startMs, endMs, words };
  });
}

export function loadBeats(vo: Voiceover, id = 'suez'): FixedBeat[] {
  const raw = JSON.parse(readFileSync(join(FIXTURES, `${id}-beats.json`), 'utf8')) as {
    beats: { id: string; wordStart: number; wordEnd: number; brief: string }[];
  };
  return tile(vo, raw.beats);
}
