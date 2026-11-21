import type { Word } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planAutoCuts, spokenWords } from './autocut';
import { retimeWords } from './edl';
import {
  applyReview,
  findRetakes,
  isRetakePair,
  phrasesOf,
  reviewPhrases,
  similarity,
} from './retakes';
import { speechMap, tightenWords, type Range, type SpeechMap } from './speech';

const SR = 16_000;

/** A recording: low noise, with 180 Hz "speech" in the given ranges (ms). */
function recording(durationMs: number, speech: Range[]): Float32Array {
  const pcm = new Float32Array(Math.round((durationMs * SR) / 1000));
  let seed = 7;
  for (let i = 0; i < pcm.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pcm[i] = ((seed / 0x7fffffff) * 2 - 1) * 0.001;
  }
  for (const r of speech) {
    const a = Math.round((r.startMs * SR) / 1000);
    const b = Math.round((r.endMs * SR) / 1000);
    for (let i = a; i < b && i < pcm.length; i++)
      pcm[i]! += 0.3 * Math.sin((2 * Math.PI * 180 * i) / SR);
  }
  return pcm;
}

/** Words laid out from a script: each "|" is a pause of `gapMs`; words last 260 ms. */
function script(text: string, gapMs = 2000, startMs = 1000): { words: Word[]; speech: Range[] } {
  const words: Word[] = [];
  const speech: Range[] = [];
  let at = startMs;
  for (const line of text.split('|')) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    const lineStart = at;
    for (const t of toks) {
      words.push({
        i: words.length,
        text: t,
        startMs: at,
        endMs: at + 260,
        conf: 0.9,
        filler: false,
      });
      at += 300;
    }
    speech.push({ startMs: lineStart, endMs: at - 40 });
    at += gapMs;
  }
  return { words, speech };
}

const text = (ws: readonly Word[]) => ws.map((w) => w.text).join(' ');

describe('speech map (spec 28 R1)', () => {
  it('finds the speech and the silences of a recording', () => {
    const truth = [
      { startMs: 1000, endMs: 3000 },
      { startMs: 5000, endMs: 5600 },
    ];
    const map = speechMap(recording(8000, truth), SR);
    expect(map.reliable).toBe(true);
    expect(map.runs).toHaveLength(2);
    map.runs.forEach((r, k) => {
      expect(Math.abs(r.startMs - truth[k]!.startMs)).toBeLessThanOrEqual(20);
      expect(Math.abs(r.endMs - truth[k]!.endMs)).toBeLessThanOrEqual(80);
    });
    expect(map.silences[0]).toEqual({ startMs: 0, endMs: map.runs[0]!.startMs });
  });

  it('does not trust a recording with no contrast', () => {
    const flat = new Float32Array(SR * 2).map((_, i) => 0.2 * Math.sin(i / 3));
    expect(speechMap(flat, SR).reliable).toBe(false);
  });

  it('pulls a word that runs on through a pause back onto the speech', () => {
    const map: SpeechMap = {
      runs: [
        { startMs: 1000, endMs: 1800 },
        { startMs: 4000, endMs: 4500 },
      ],
      silences: [],
      durationMs: 5000,
      floorDb: -60,
      peakDb: -15,
      thresholdDb: -45,
      reliable: true,
    };
    const words: Word[] = [
      { i: 0, text: 'team', startMs: 1500, endMs: 3900, conf: 1, filler: false },
      { i: 1, text: 'next', startMs: 4100, endMs: 4400, conf: 1, filler: false },
    ];
    const t = tightenWords(words, map);
    expect(t[0]!.endMs).toBeLessThanOrEqual(1840);
    // The first word of a burst starts with the burst (Whisper starts it late).
    expect(t[1]!.startMs).toBe(4000);
  });

  it('keeps word order and indices for any timings', () => {
    const word = fc.record({
      startMs: fc.integer({ min: 0, max: 20_000 }),
      len: fc.integer({ min: 0, max: 3000 }),
    });
    fc.assert(
      fc.property(fc.array(word, { maxLength: 40 }), (raw) => {
        const words = [...raw]
          .sort((a, b) => a.startMs - b.startMs)
          .map((w, i) => ({
            i,
            text: `w${i}`,
            startMs: w.startMs,
            endMs: w.startMs + w.len,
            conf: 1,
            filler: false,
          }));
        const map = speechMap(recording(24_000, [{ startMs: 2000, endMs: 6000 }]), SR);
        const t = tightenWords(words, map);
        expect(t.map((w) => w.i)).toEqual(words.map((w) => w.i));
        for (let k = 0; k < t.length; k++) {
          expect(t[k]!.endMs).toBeGreaterThanOrEqual(t[k]!.startMs);
          if (k) expect(t[k]!.startMs).toBeGreaterThanOrEqual(t[k - 1]!.startMs);
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('retakes (spec 28 R2)', () => {
  const words = (s: string) => script(s, 1500).words;

  it('keeps the last take of a repeated line, even when the wording changed', () => {
    const w = words(
      'If you want more like this, save and follow. | If you want more like this, save and follow. | If you want more clips like this, save and follow.',
    );
    const cuts = findRetakes(w);
    expect(cuts).toHaveLength(2);
    const kept = w.filter((_, k) => !cuts.some((c) => k >= c.from && k <= c.to));
    expect(text(kept)).toBe('If you want more clips like this, save and follow.');
  });

  it('cuts a false start, a restart inside a sentence and an aside', () => {
    expect(text(cutOut(words('I use the | I use the camera to film the intro.')))).toBe(
      'I use the camera to film the intro.',
    );
    expect(text(cutOut(words('So the best part, the best part is the price.')))).toBe(
      'So the best part is the price.',
    );
    expect(
      text(cutOut(words('This is the hook. | Okay let me do that again. | Here comes the tip.'))),
    ).toBe('This is the hook. Here comes the tip.');
  });

  it('leaves different lines and parallel list lines alone', () => {
    const list = words(
      'I use the camera to film the intro. | I use the notebook to plan the week. | Step one, open the app. | Step two, open the app.',
    );
    expect(findRetakes(list)).toEqual([]);
  });

  // Regression (spec 28 task 7): a clean scripted clip lost its contrast line, and a refrain
  // shared by the intro and the outro was cut as a retake.
  it('leaves contrast lines and refrains alone, but still cuts a corrected line', () => {
    expect(
      findRetakes(
        words("You don't have a motivation problem. | You have a follow-through problem."),
      ),
    ).toEqual([]);
    expect(
      findRetakes(
        words(
          "It's Monday, and this is your tip of the day. | I'm Sam, and this was your tip of the day.",
        ),
      ),
    ).toEqual([]);
    expect(
      text(cutOut(words('This plan is a good idea. | This plan is not a good idea at all.'))),
    ).toBe('This plan is not a good idea at all.');
    // A reworded take with a swapped word still counts when most of the line is the same.
    const cta = 'if you want more like thi save and follow'.split(' ');
    const cta2 = 'if you are more content like thi save and follow'.split(' ');
    expect(isRetakePair(cta, cta2)).toBe(true);
  });

  it('never cuts every take of a line', () => {
    const line = fc.constantFrom(
      'save and follow for more',
      'this is the only tip you need',
      'the price went up again',
    );
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 6 }), (lines) => {
        const w = words(lines.join(' . | '));
        const cuts = findRetakes(w);
        const kept = w.filter((_, k) => !cuts.some((c) => k >= c.from && k <= c.to));
        expect(kept.length).toBeGreaterThan(0);
        // The very last line is always kept whole.
        const last = phrasesOf(w).at(-1)!;
        expect(cuts.some((c) => c.from <= last.from && c.to >= last.to)).toBe(false);
        for (let k = 1; k < cuts.length; k++)
          expect(cuts[k]!.from).toBeGreaterThan(cuts[k - 1]!.to);
      }),
      { numRuns: 60 },
    );
  });

  it('scores similarity on shared words in order', () => {
    expect(similarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(similarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });
});

function cutOut(w: Word[]): Word[] {
  const cuts = findRetakes(w);
  return w.filter((_, k) => !cuts.some((c) => k >= c.from && k <= c.to));
}

describe('the automatic edit (spec 28)', () => {
  // The structure of the founder's raw take (2026-11-21): long pauses between lines, one line said
  // twice, and the call to action said three times (the last with a changed word).
  const RAW =
    'Here are the six tools that replaced my team of five. | I use the recorder to train my assistants in minutes. | ' +
    'I use the editor to write like a pro. | I use the planner to organise my whole business. | ' +
    'I use the painter to get visuals without a design team. | I use the painter to get visuals without a design team. | ' +
    'If you want more like this, save and follow. | If you want more like this, save and follow. | ' +
    'If you want more clips like this, save and follow.';

  it('cuts the dead air and the retakes of a raw take', () => {
    const { words, speech } = script(RAW, 3500);
    const durationMs = speech.at(-1)!.endMs + 4000;
    // Whisper-style timings: the last word of each line runs on through the pause.
    const stretched = words.map((w, k) =>
      words[k + 1] && words[k + 1]!.startMs - w.endMs > 1000
        ? { ...w, endMs: words[k + 1]!.startMs - 200 }
        : w,
    );
    const map = speechMap(recording(durationMs, speech), SR);
    const plan = planAutoCuts({ words: stretched, durationMs, speech: map });
    const kept = retimeWords(plan.words, plan.cuts);
    expect(text(kept)).toBe(
      'Here are the six tools that replaced my team of five. I use the recorder to train my assistants in minutes. ' +
        'I use the editor to write like a pro. I use the planner to organise my whole business. ' +
        'I use the painter to get visuals without a design team. If you want more clips like this, save and follow.',
    );
    expect(plan.stats.retakes).toBe(3);
    // No pause longer than a breath survives anywhere in the edit.
    const keptWords = kept;
    for (let k = 1; k < keptWords.length; k++) {
      expect(keptWords[k]!.startMs - keptWords[k - 1]!.endMs).toBeLessThan(600);
    }
    const removed = plan.cuts.reduce((s, c) => s + c.endMs - c.startMs, 0);
    expect(durationMs - removed).toBeLessThan(0.55 * durationMs);
  });

  it('cuts are sorted, apart, inside the recording and never touch a kept word', () => {
    const lines = fc.array(
      fc.constantFrom(
        'one two three four',
        'five six seven',
        'one two three four',
        'eight nine ten eleven',
      ),
      { minLength: 1, maxLength: 8 },
    );
    fc.assert(
      fc.property(lines, fc.integer({ min: 300, max: 5000 }), (ls, gap) => {
        const { words, speech } = script(ls.join(' . | '), gap);
        const durationMs = speech.at(-1)!.endMs + 1500;
        const map = speechMap(recording(durationMs, speech), SR);
        const plan = planAutoCuts({ words, durationMs, speech: map });
        const spoken = spokenWords(words, map);
        const cutWords = new Set<number>();
        for (const c of findRetakes(spoken)) for (let k = c.from; k <= c.to; k++) cutWords.add(k);
        for (let k = 0; k < plan.cuts.length; k++) {
          const c = plan.cuts[k]!;
          expect(c.startMs).toBeGreaterThanOrEqual(0);
          expect(c.endMs).toBeLessThanOrEqual(durationMs);
          expect(c.endMs).toBeGreaterThan(c.startMs);
          if (k) expect(c.startMs).toBeGreaterThanOrEqual(plan.cuts[k - 1]!.endMs);
        }
        spoken.forEach((w, k) => {
          if (cutWords.has(k)) return;
          for (const c of plan.cuts)
            expect(c.endMs <= w.startMs || c.startMs >= w.endMs).toBe(true);
        });
      }),
      { numRuns: 40 },
    );
  });

  it('falls back to the word gaps when the meter cannot be trusted', () => {
    const { words } = script('one two three | four five six', 3000);
    const plan = planAutoCuts({ words, durationMs: 9000, speech: null });
    expect(plan.stats.measured).toBe(false);
    expect(plan.cuts.some((c) => c.kind === 'silence' && c.endMs - c.startMs > 2000)).toBe(true);
  });
});

describe('the cloud review (spec 28 R3)', () => {
  const { words } = script(
    'Say it once. | Say it once. | A brand new line here about the price of things. | ' +
      'Okay is it recording now | The last line closes the whole story for everyone.',
    1500,
  );
  const phrases = phrasesOf(words);
  const rule = findRetakes(words);

  it('marks the rule cuts in what it sends', () => {
    expect(reviewPhrases(words, phrases, rule).map((p) => p[2])).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('keeps a deliberate repeat and adds an aside the rules missed', () => {
    const out = applyReview(words, phrases, rule, {
      keep: [0],
      cut: [{ phrase: 3, kind: 'ramble', reason: 'talking to the crew' }],
    });
    expect(out.map((c) => [c.from, c.to])).toEqual([[phrases[3]!.from, phrases[3]!.to]]);
  });

  it('ignores a runaway answer and keeps the rules', () => {
    const out = applyReview(words, phrases, rule, {
      keep: [],
      cut: phrases.map((_, phrase) => ({ phrase, kind: 'retake' as const, reason: 'x' })),
    });
    expect(out).toEqual(rule);
  });
});

describe('the cloud review guard (spec 28 R3.2)', () => {
  it('does not let the review keep a full line that is said again word for word', () => {
    const { words } = script(
      'If you want more like this, save and follow. | If you want more like this, save and follow. | ' +
        'If you want more clips like this, save and follow.',
      1500,
    );
    const phrases = phrasesOf(words);
    const rule = findRetakes(words);
    const out = applyReview(words, phrases, rule, { keep: [0, 1], cut: [] });
    expect(out).toEqual(rule);
  });
});
