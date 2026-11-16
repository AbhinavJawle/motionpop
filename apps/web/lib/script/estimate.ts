import { tagSpans, ttsMinutes, type SlotWord } from '@motionpop/ai';

/**
 * `/start/script` helpers (spec 11 task 18, design §7): words with estimated timings so the
 * moment tagger can run before any audio exists, the length estimate and the speed choices.
 * The price comes from `ttsMinutes`, the same function the charge uses, so the chip and the
 * spend always agree (property 7).
 */
export { SCRIPT_MAX_CHARS } from '@motionpop/schemas';

export const SPEEDS = [
  { id: 'relaxed', label: 'Relaxed', speed: 0.9 },
  { id: 'natural', label: 'Natural', speed: 1 },
  { id: 'brisk', label: 'Brisk', speed: 1.1 },
] as const;
export type SpeedId = (typeof SPEEDS)[number]['id'];

/** Words a minute at speed 1 (D-065: to be checked against one real generation). */
export const BASE_WPM = 150;

export function scriptWords(text: string, speed = 1): SlotWord[] {
  const msPerWord = 60_000 / (BASE_WPM * speed);
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({
      text: t,
      startMs: Math.round(i * msPerWord),
      endMs: Math.round((i + 0.85) * msPerWord),
      filler: false,
    }));
}

export function estimateMs(text: string, speed = 1): number {
  const n = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((n * 60_000) / (BASE_WPM * speed));
}

export const minutesFor = ttsMinutes;

export interface ScriptMoment {
  kind: string;
  text: string;
}

/** What Pip will likely put on screen: numbers, places, years, names, lists. */
export function scriptMoments(text: string): ScriptMoment[] {
  const words = scriptWords(text);
  const seen = new Set<string>();
  const out: ScriptMoment[] = [];
  // Comparisons ("grew", "more than") shape a graphic but aren't one, so they get no chip.
  for (const s of tagSpans(words).filter((x) => x.kind !== 'comparison')) {
    const said = words
      .slice(s.wordStart, s.wordEnd + 1)
      .map((w) => w.text.replace(/[.,;:!?"“”()]+$/g, ''))
      .join(' ');
    const key = `${s.kind}:${said.toLowerCase()}`;
    if (!said || seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: s.kind, text: said });
  }
  return out.slice(0, 8);
}

export function formatLength(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `~${s}s` : `~${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
