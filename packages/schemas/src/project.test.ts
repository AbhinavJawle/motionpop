import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EditorProjectSchema,
  SlotTimingSchema,
  VERSIONS_PER_SLOT,
  VersionSchema,
  timelineIssues,
} from './project';

const DURATION = 20_000;
const WORDS = 10;

function makeProject(slots: unknown[] = []): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'p1',
    title: 'Demo',
    format: '16:9',
    fps: 30,
    styleId: 'clean',
    durationMs: DURATION,
    voiceover: { src: 'voice.wav', durationMs: DURATION },
    transcript: {
      words: Array.from({ length: WORDS }, (_, i) => ({
        i,
        text: `w${i}`,
        startMs: i * 1000,
        endMs: i * 1000 + 800,
        conf: 0.9,
        filler: false,
      })),
      language: 'en',
      ranOn: 'cloud',
      timingQuality: 'word',
      cleaned: true,
    },
    slots,
    versions: [],
    createdAt: 1,
    updatedAt: 2,
  };
}

function slot(id: string, startMs: number, endMs: number, extra: object = {}): object {
  return {
    id,
    startMs,
    endMs,
    wordStart: 0,
    wordEnd: 1,
    reason: 'You said "w0"',
    componentId: 'big-number',
    skillId: 'stat',
    prompt: '',
    params: {},
    status: 'suggested',
    ...extra,
  };
}

const ok = (slots: unknown[]) => EditorProjectSchema.safeParse(makeProject(slots)).success;

describe('EditorProjectSchema', () => {
  it('parses a valid project and defaults notes to []', () => {
    const r = EditorProjectSchema.safeParse(makeProject([slot('a', 1000, 3000)]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slots[0]?.notes).toEqual([]);
  });

  it('accepts touching slots, in any array order', () => {
    expect(ok([slot('a', 1000, 3000), slot('b', 3000, 5000)])).toBe(true);
    expect(ok([slot('b', 3000, 5000), slot('a', 1000, 3000)])).toBe(true);
  });

  it('rejects overlap', () => {
    expect(ok([slot('a', 1000, 3000), slot('b', 2999, 5000)])).toBe(false);
    expect(ok([slot('b', 2000, 5000), slot('a', 1000, 3000)])).toBe(false);
  });

  it('rejects out-of-bounds slots', () => {
    expect(ok([slot('a', 0, DURATION + 1)])).toBe(false);
    expect(ok([slot('a', -1, 1000)])).toBe(false);
    expect(ok([slot('a', 0, DURATION)])).toBe(true);
  });

  it('rejects non-integer ms', () => {
    expect(ok([slot('a', 1000.5, 3000)])).toBe(false);
    expect(ok([slot('a', 1000, 3000.2)])).toBe(false);
    const p = makeProject();
    p.durationMs = 20_000.5;
    expect(EditorProjectSchema.safeParse(p).success).toBe(false);
  });

  it('rejects end <= start', () => {
    expect(ok([slot('a', 3000, 3000)])).toBe(false);
    expect(ok([slot('a', 3000, 2000)])).toBe(false);
  });

  it('rejects duplicate ids', () => {
    expect(ok([slot('a', 1000, 2000), slot('a', 3000, 4000)])).toBe(false);
  });

  it('rejects bad word indices', () => {
    expect(ok([slot('a', 0, 1000, { wordStart: 3, wordEnd: 2 })])).toBe(false);
    expect(ok([slot('a', 0, 1000, { wordStart: 0, wordEnd: WORDS })])).toBe(false);
    expect(ok([slot('a', 0, 1000, { wordStart: 0, wordEnd: WORDS - 1 })])).toBe(true);
  });

  it('rejects wrong schemaVersion and fps', () => {
    expect(EditorProjectSchema.safeParse({ ...makeProject(), schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(EditorProjectSchema.safeParse({ ...makeProject(), fps: 24 }).success).toBe(false);
  });

  it('does not enforce duration limits (commands do)', () => {
    expect(ok([slot('a', 0, 100)])).toBe(true);
    expect(ok([slot('a', 0, 15_000)])).toBe(true);
  });

  it('timelineIssues lists issues', () => {
    const p = EditorProjectSchema.parse(makeProject([slot('a', 0, 1000)]));
    expect(timelineIssues(p)).toEqual([]);
    expect(timelineIssues({ ...p, slots: [...p.slots, ...p.slots] }).length).toBeGreaterThan(0);
  });
});

describe('voiceover and cleanup (spec 05)', () => {
  it('accepts a cleaned voiceover with the original kept', () => {
    const p = makeProject();
    p.voiceover = {
      src: 'idb:cleaned',
      durationMs: DURATION,
      source: 'upload',
      originalSrc: 'idb:original',
      originalDurationMs: DURATION + 2400,
      cleanup: { fillersRemoved: 7, pausesShortened: 3, enabled: true },
    };
    p.originalTranscript = p.transcript;
    expect(EditorProjectSchema.safeParse(p).success).toBe(true);
  });

  it('still accepts the old minimal voiceover', () => {
    expect(EditorProjectSchema.safeParse(makeProject()).success).toBe(true);
  });

  it('rejects negative cleanup counts and unknown sources', () => {
    const bad = makeProject();
    bad.voiceover = {
      src: 'x',
      durationMs: DURATION,
      cleanup: { fillersRemoved: -1, pausesShortened: 0, enabled: true },
    };
    expect(EditorProjectSchema.safeParse(bad).success).toBe(false);
    const bad2 = makeProject();
    bad2.voiceover = { src: 'x', durationMs: DURATION, source: 'phone' };
    expect(EditorProjectSchema.safeParse(bad2).success).toBe(false);
  });
});

describe('timeline properties', () => {
  // Build non-overlapping slots from positive gaps and lengths.
  const layout = fc
    .array(fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 1500 })), {
      minLength: 1,
      maxLength: 8,
    })
    .map((parts) => {
      let cursor = 0;
      return parts.map(([gap, len], i) => {
        const startMs = cursor + gap;
        const endMs = startMs + len;
        cursor = endMs;
        return slot(`s${i}`, startMs, endMs);
      });
    });

  it('non-overlapping slots always parse, in any order', () => {
    fc.assert(
      fc.property(layout, fc.boolean(), (slots, reverse) => {
        const list = reverse ? [...slots].reverse() : slots;
        expect(ok(list)).toBe(true);
      }),
    );
  });

  it('a pair forced to overlap always fails', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 2, max: 3000 }),
        fc.integer({ min: 1, max: 3000 }),
        fc.integer({ min: 1, max: 2999 }),
        (start, len, len2, offsetRaw) => {
          const offset = Math.min(offsetRaw, len - 1);
          const a = slot('a', start, start + len);
          const b = slot('b', start + offset, start + offset + len2);
          expect(ok([a, b])).toBe(false);
          expect(ok([b, a])).toBe(false);
        },
      ),
    );
  });
});

describe('slot timing, version timing and note fixes (spec 09 task 1)', () => {
  it('parses a slot with timing and a note that names the version that fixed it', () => {
    const r = EditorProjectSchema.safeParse(
      makeProject([
        slot('a', 1000, 3000, {
          timing: { speed: 0.8, ease: 'out', fade: false },
          notes: [
            {
              id: 'n1',
              tMs: 400,
              shape: { kind: 'circle', points: [0.5, 0.5, 0.1, 0.2] },
              text: 'slower',
              status: 'fixed',
              fixedVersionId: 'v-9',
            },
          ],
        }),
      ]),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.slots[0]?.timing).toEqual({ speed: 0.8, ease: 'out', fade: false });
      expect(r.data.slots[0]?.notes[0]?.fixedVersionId).toBe('v-9');
    }
  });

  it('a slot without timing still parses, and note shape limits are not a schema concern (D-049)', () => {
    const odd = { kind: 'path', points: [2, -1, 5] };
    const r = EditorProjectSchema.safeParse(
      makeProject([
        slot('a', 1000, 3000, {
          notes: [{ id: 'n1', tMs: 0, shape: odd, text: '', status: 'open' }],
        }),
      ]),
    );
    expect(r.success).toBe(true);
  });

  it('rejects timing outside its range', () => {
    expect(SlotTimingSchema.safeParse({ speed: 3 }).success).toBe(false);
    expect(SlotTimingSchema.safeParse({ speed: 0.4 }).success).toBe(false);
    expect(SlotTimingSchema.safeParse({ ease: 'bounce' }).success).toBe(false);
  });

  it('random valid timings round-trip through slot and version parsing', () => {
    const timingArb = fc.record(
      {
        speed: fc.double({ min: 0.5, max: 2, noNaN: true }),
        ease: fc.constantFrom('inOut', 'out', 'linear'),
        fade: fc.boolean(),
      },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(timingArb, (timing) => {
        const p = EditorProjectSchema.parse(makeProject([slot('a', 1000, 3000, { timing })]));
        expect(p.slots[0]?.timing).toEqual(timing);
        const v = VersionSchema.parse({
          id: 'v1',
          slotId: 'a',
          componentId: 'big-number',
          params: {},
          source: 'user',
          costCredits: 0,
          createdAt: 1,
          timing,
        });
        expect(v.timing).toEqual(timing);
      }),
    );
  });

  it('keeps 20 versions per slot', () => {
    expect(VERSIONS_PER_SLOT).toBe(20);
  });
});
