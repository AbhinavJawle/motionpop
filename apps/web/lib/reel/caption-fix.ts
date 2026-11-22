import { findWordRun } from '@motionpop/ai';
import type { Transcript, Word } from '@motionpop/schemas';

/**
 * Caption fixes from a reel note (spec 29 R4.3): the captions are the transcript, so fixing a
 * misheard word ("icachi" → "eye-catching") rewrites those words. Timings never move:
 * - the same number of words: one for one (a word keeps its trailing punctuation);
 * - a different number: the run becomes one word spanning the run ("Acme Soft" → "AcmeSoft").
 * Only words inside `window` (reel ms) are touched, so a fix on one scene never edits another;
 * a match inside `window.core` (the scene itself) wins over one in the margin around it, so a word
 * said again just before the scene is left alone.
 * Indices stay 0..n-1 and prosody stays aligned. Returns null when a fix matches nothing.
 */
export function fixCaptionWords(
  transcript: Pick<Transcript, 'words' | 'prosody'>,
  fixes: readonly { find: string; replace: string }[],
  window: { startMs: number; endMs: number; core?: { startMs: number; endMs: number } },
): Pick<Transcript, 'words' | 'prosody'> | null {
  let words: Word[] = transcript.words.map((w) => ({ ...w }));
  let stress = transcript.prosody ? [...transcript.prosody.stress] : null;
  const runIn = (find: string, span: { startMs: number; endMs: number }) => {
    const from = words.findIndex((w) => w.endMs > span.startMs);
    let to = words.findIndex((w) => w.startMs >= span.endMs);
    if (to < 0) to = words.length;
    if (from < 0 || from >= to) return null;
    return findWordRun(words, find, from, to);
  };
  for (const fix of fixes) {
    const run = (window.core ? runIn(fix.find, window.core) : null) ?? runIn(fix.find, window);
    if (!run) return null;
    const repl = fix.replace.trim().split(/\s+/).filter(Boolean);
    if (repl.length === 0) return null;
    const n = run.end - run.start + 1;
    const tail = (t: string) => /[.,!?;:…"')\]]+$/.exec(t)?.[0] ?? '';
    const withTail = (orig: string, next: string) => (tail(next) ? next : `${next}${tail(orig)}`);
    if (repl.length === n) {
      for (let k = 0; k < n; k++) {
        const w = words[run.start + k]!;
        w.text = withTail(w.text, repl[k]!);
      }
      continue;
    }
    const first = words[run.start]!;
    const last = words[run.end]!;
    const merged: Word = {
      ...first,
      text: withTail(last.text, repl.join(' ')),
      endMs: Math.max(first.endMs, last.endMs),
      conf: 1,
      filler: false,
    };
    words = [...words.slice(0, run.start), merged, ...words.slice(run.end + 1)];
    if (stress) stress = [...stress.slice(0, run.start + 1), ...stress.slice(run.end + 1)];
  }
  words = words.map((w, i) => ({ ...w, i }));
  return {
    words,
    ...(transcript.prosody && stress ? { prosody: { ...transcript.prosody, stress } } : {}),
  };
}
