import { readTimeMs } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { beatInputArb, deepFreeze } from './beat-arbitraries';
import {
  DEFAULT_SNAP_MARGIN,
  MIN_EXIT_MS,
  MIN_GAP_MS,
  MIN_LEAD_MS,
  scheduleBeats,
  snapWord,
  type BeatInput,
} from './beats';

const RUNS = { numRuns: 500 };

const firstAnchor = (input: BeatInput, id: string) => input.anchors?.find((a) => a.cue === id);

describe('scheduleBeats properties', () => {
  it('keeps cue order and splits the cues into scheduled and dropped, dropping only optional ones', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        const all = input.cues.map((c) => c.id);
        const scheduled = plan.cues.map((c) => c.id);
        // Same relative order as the input.
        expect(scheduled).toEqual(all.filter((id) => scheduled.includes(id)));
        expect(new Set(scheduled).size).toBe(scheduled.length);
        // dropped ∪ scheduled = all, disjoint.
        expect(scheduled.filter((id) => plan.dropped.includes(id))).toEqual([]);
        expect([...scheduled, ...plan.dropped].sort()).toEqual([...all].sort());
        for (const id of plan.dropped)
          expect(input.cues.find((c) => c.id === id)?.optional).toBe(true);
        for (const id of plan.squeezed) expect(scheduled).toContain(id);
      }),
      RUNS,
    );
  });

  it('gives every cue integer times with 0 ≤ start < land and a lead of at least MIN_LEAD_MS', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        for (const c of plan.cues) {
          expect(Number.isInteger(c.startMs) && Number.isInteger(c.landMs)).toBe(true);
          expect(c.startMs).toBeGreaterThanOrEqual(0);
          expect(c.startMs).toBeLessThan(c.landMs);
          expect(c.landMs - c.startMs).toBeGreaterThanOrEqual(MIN_LEAD_MS);
          expect(c.lateMs).toBeGreaterThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });

  it('never lands a cue after the exit starts, and lands cues in non-decreasing order', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        // The exit is the look's length, shortened (never below MIN_EXIT_MS) only to let a late
        // spoken word land (changed by Claude Code after motion:check showed late key words
        // fading out before they landed).
        expect(plan.exitStartMs).toBeGreaterThanOrEqual(
          Math.max(0, input.durationMs - input.exitMs),
        );
        expect(plan.exitStartMs).toBeLessThanOrEqual(
          Math.max(0, input.durationMs - Math.min(MIN_EXIT_MS, input.exitMs)),
        );
        let prev = 0;
        for (const c of plan.cues) {
          expect(c.landMs).toBeLessThanOrEqual(plan.exitStartMs);
          expect(c.landMs).toBeGreaterThanOrEqual(prev);
          prev = c.landMs;
        }
      }),
      RUNS,
    );
  });

  it('keeps read time: quiet windows are [land, land + read time] clipped to the exit, and an unanchored cue follows the previous landing by the gap', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        const expected = plan.cues.flatMap((c) => {
          const words = input.cues.find((s) => s.id === c.id)?.words ?? 0;
          if (!words) return [];
          const endMs = Math.min(plan.exitStartMs, c.landMs + readTimeMs(words));
          return endMs > c.landMs ? [{ cue: c.id, startMs: c.landMs, endMs }] : [];
        });
        expect(plan.quiet).toEqual(expected);
        plan.cues.forEach((c, i) => {
          // A cue with no word to hit follows the previous landing by a short gap (changed by
          // Claude Code: waiting out the whole read time dropped labels at the ideal length and
          // made scenes build one element at a time). Text stillness is asserted at stage level.
          if (plan.squeezed.includes(c.id) || c.word !== null || i === 0) return;
          expect(c.startMs).toBeGreaterThanOrEqual(plan.cues[i - 1]!.landMs + MIN_GAP_MS);
        });
      }),
      RUNS,
    );
  });

  it('lands anchored, unsqueezed cues exactly on their (snapped) word unless pushed late, and within ±80 ms when nothing forces them late', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        const words = input.words ?? [];
        let minStart = 0; // earliest start the previous cues allow (mirrors the read-time rule)
        for (const c of plan.cues) {
          const spec = input.cues.find((s) => s.id === c.id)!;
          const lead = Math.max(MIN_LEAD_MS, spec.leadMs ?? input.enterMs);
          if (c.word !== null && !plan.squeezed.includes(c.id)) {
            const wordStart = words[c.word]!.startMs;
            expect(c.landMs - wordStart).toBe(c.lateMs);
            if (c.lateMs === 0) expect(c.landMs).toBe(wordStart);
            if (wordStart - lead >= minStart)
              expect(Math.abs(c.landMs - wordStart)).toBeLessThanOrEqual(80);
          }
          minStart = spec.words
            ? Math.max(minStart, Math.min(plan.exitStartMs, c.landMs + readTimeMs(spec.words)))
            : Math.max(minStart, c.landMs + MIN_GAP_MS);
        }
      }),
      RUNS,
    );
  });

  it('first cue with its word start at least one lead into the slot lands within ±80 ms of the word', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        const first = plan.cues[0];
        if (!first || first.id !== input.cues[0]!.id || first.word === null) return;
        if (plan.squeezed.includes(first.id)) return;
        const lead = Math.max(MIN_LEAD_MS, input.cues[0]!.leadMs ?? input.enterMs);
        const wordStart = input.words![first.word]!.startMs;
        if (wordStart >= lead) expect(Math.abs(first.landMs - wordStart)).toBeLessThanOrEqual(80);
      }),
      RUNS,
    );
  });

  it('snaps at most one word, never without snap or stress, and only to a word clearly more stressed', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const plan = scheduleBeats(input);
        const margin = input.snapMargin ?? DEFAULT_SNAP_MARGIN;
        for (const c of plan.cues) {
          const anchor = firstAnchor(input, c.id);
          const inRange = !!anchor && anchor.word >= 0 && anchor.word < (input.words?.length ?? 0);
          if (!anchor || !inRange) {
            expect(c.word).toBeNull();
            expect(c.snapped).toBe(false);
            continue;
          }
          const spec = input.cues.find((s) => s.id === c.id)!;
          expect(c.word).not.toBeNull();
          expect(Math.abs(c.word! - anchor.word)).toBeLessThanOrEqual(1);
          expect(c.snapped).toBe(c.word !== anchor.word);
          if (!spec.snap || !input.stress) expect(c.word).toBe(anchor.word);
          if (c.snapped) {
            expect(input.stress![c.word!]).toBeGreaterThanOrEqual(
              input.stress![anchor.word]! + margin,
            );
          }
        }
      }),
      RUNS,
    );
  });

  it('is deterministic and does not mutate its (frozen) input', () => {
    fc.assert(
      fc.property(beatInputArb, (input) => {
        const copy = structuredClone(input);
        deepFreeze(input);
        const a = scheduleBeats(input);
        const b = scheduleBeats(input);
        expect(a).toEqual(b);
        expect(input).toEqual(copy);
      }),
      RUNS,
    );
  });
});

describe('snapWord properties', () => {
  it('moves at most one word, stays in range, and only to a word with stress ≥ own + margin', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 14 }),
        fc.nat(20),
        fc.integer({ min: 0, max: 50 }),
        (stress, rawWord, margin) => {
          const word = rawWord % stress.length;
          const out = snapWord(word, stress.length, stress, margin);
          expect(Math.abs(out - word)).toBeLessThanOrEqual(1);
          expect(out).toBeGreaterThanOrEqual(0);
          expect(out).toBeLessThan(stress.length);
          if (out !== word) expect(stress[out]).toBeGreaterThanOrEqual(stress[word]! + margin);
          // Without stress nothing moves.
          expect(snapWord(word, stress.length, undefined, margin)).toBe(word);
        },
      ),
      RUNS,
    );
  });
});
