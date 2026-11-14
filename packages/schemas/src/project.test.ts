import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EditorProjectSchema, timelineIssues } from './project';

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
