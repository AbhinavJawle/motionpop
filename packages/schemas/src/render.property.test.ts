// Property tests for the spec 08 pure logic (design §19): P4 state machine, P6 cost, P7 paths
// and names, and the day doc written by either path (review F1).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_CREDITS,
  DailyLimitsSchema,
  RenderDocSchema,
  RenderErrorCodeSchema,
  RenderStatusSchema,
  SAFE_ID,
  canTransition,
  exportCost,
  isActiveStatus,
  isFinalStatus,
  isSafeId,
  nextProgress,
  renderDocIssues,
  renderPaths,
  sanitizeFilename,
  sanitizeFilenameBase,
  type RenderErrorCode,
  type RenderStatus,
  type Resolution,
} from './index';

const RUNS = { numRuns: 300 };
/** The pre-13b prices, so resolution ordering is checked where it is not zero (spec 13b R1). */
const PAID_TABLE = { '720p': 3, '1080p': 5 };
/** True when the string has no lone surrogate (`String.prototype.isWellFormed` needs ES2024 libs). */
const isWellFormed = (s: string): boolean =>
  !/[\ud800-\udfff]/.test(s.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''));

const at = { toMillis: () => 1_700_000_000_000 };
const STATUSES = RenderStatusSchema.options;
const ERROR_CODES = RenderErrorCodeSchema.options;

// ---------------------------------------------------------------------------------------------
// P4: state machine and progress

/** The legal moves of design §6, written out independently of the implementation. */
const LEGAL: ReadonlyArray<readonly [RenderStatus, RenderStatus]> = [
  ['queued', 'rendering'],
  ['rendering', 'encoding'],
  ['encoding', 'done'],
  ['queued', 'error'],
  ['rendering', 'error'],
  ['encoding', 'error'],
];

interface Model {
  status: RenderStatus;
  progress: number;
  outputPath?: string;
  error?: RenderErrorCode;
}

type Event =
  { kind: 'move'; to: RenderStatus; code: RenderErrorCode } | { kind: 'progress'; value: number };

const eventArb: fc.Arbitrary<Event> = fc.oneof(
  fc.record({
    kind: fc.constant('move' as const),
    to: fc.constantFrom(...STATUSES),
    code: fc.constantFrom(...ERROR_CODES),
  }),
  fc.record({
    kind: fc.constant('progress' as const),
    value: fc.oneof(
      fc.integer({ min: -50, max: 150 }),
      fc.double({ min: -50, max: 150, noNaN: true }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    ),
  }),
);

/** Applies one event the way the store will: through `canTransition` and `nextProgress`. */
function step(m: Model, e: Event): Model {
  if (e.kind === 'progress') {
    // Progress updates only make sense while the render runs, and 100 is reserved for done.
    if (!isActiveStatus(m.status) || m.status === 'queued') return m;
    return { ...m, progress: Math.min(99, nextProgress(m.progress, e.value)) };
  }
  if (!canTransition(m.status, e.to)) return m;
  if (e.to === 'done') return { status: 'done', progress: 100, outputPath: 'users/u/video.mp4' };
  if (e.to === 'error') return { ...m, status: 'error', error: e.code };
  return { ...m, status: e.to, progress: e.to === 'queued' ? 0 : m.progress };
}

const asDoc = (m: Model) => ({
  schemaVersion: 1,
  ownerId: 'alice',
  projectId: 'p1',
  requestId: '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b',
  title: 'T',
  format: '16:9',
  resolution: '1080p',
  captions: false,
  music: false,
  durationMs: 1000,
  slotCount: 1,
  costCredits: 5,
  mode: 'cloud',
  inputPath: 'i',
  voicePath: 'v',
  createdAt: at,
  ...m,
});

describe('P4 state machine', () => {
  it('canTransition is exactly the legal table, for every pair of statuses', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const legal = LEGAL.some(([a, b]) => a === from && b === to);
        expect(canTransition(from, to)).toBe(legal);
      }
    }
  });

  it('over random event sequences only legal moves happen and final states absorb', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        let m: Model = { status: 'queued', progress: 0 };
        for (const e of events) {
          const before = m;
          m = step(m, e);
          if (m.status !== before.status) {
            expect(LEGAL.some(([a, b]) => a === before.status && b === m.status)).toBe(true);
          }
          if (isFinalStatus(before.status)) expect(m.status).toBe(before.status);
        }
      }),
      RUNS,
    );
  });

  it('progress never decreases and every state keeps the doc invariants', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        let m: Model = { status: 'queued', progress: 0 };
        for (const e of events) {
          const before = m;
          m = step(m, e);
          expect(m.progress).toBeGreaterThanOrEqual(before.progress);
          expect(Number.isInteger(m.progress)).toBe(true);
          expect(renderDocIssues(m)).toEqual([]);
          expect(RenderDocSchema.safeParse(asDoc(m)).success).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('done implies progress 100 and an output; error implies a code; queued implies 0', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        let m: Model = { status: 'queued', progress: 0 };
        for (const e of events) m = step(m, e);
        if (m.status === 'done') {
          expect(m.progress).toBe(100);
          expect(m.outputPath).toBeTruthy();
        }
        if (m.status === 'error') expect(m.error).toBeTruthy();
        if (m.status === 'queued') expect(m.progress).toBe(0);
      }),
      RUNS,
    );
  });

  it('every active status can reach error, and the path to done exists from queued', () => {
    for (const s of STATUSES.filter(isActiveStatus)) expect(canTransition(s, 'error')).toBe(true);
    const walk = (s: RenderStatus, seen = new Set<RenderStatus>()): boolean =>
      s === 'done' ||
      (!seen.has(s) && STATUSES.some((n) => canTransition(s, n) && walk(n, new Set([...seen, s]))));
    expect(walk('queued')).toBe(true);
  });

  it('nextProgress: the result is the largest clamped-and-rounded candidate seen so far', () => {
    const candidate = fc.oneof(
      fc.double({ min: -500, max: 500, noNaN: true }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    );
    fc.assert(
      fc.property(fc.array(candidate, { maxLength: 40 }), (xs) => {
        let p = 0;
        let best = 0;
        for (const x of xs) {
          const next = nextProgress(p, x);
          expect(next).toBeGreaterThanOrEqual(p);
          expect(next).toBeLessThanOrEqual(100);
          expect(Number.isInteger(next)).toBe(true);
          if (Number.isFinite(x)) best = Math.max(best, Math.min(100, Math.max(0, Math.round(x))));
          p = next;
        }
        expect(p).toBe(best);
      }),
      RUNS,
    );
  });

  it('nextProgress is idempotent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.double({ noNaN: true }), (prev, c) => {
        const once = nextProgress(prev, c);
        expect(nextProgress(once, c)).toBe(once);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// P6: cost

const resolutionArb = fc.constantFrom<Resolution>('720p', '1080p');
const durationArb = fc.integer({ min: 0, max: 12 * 60_000 });
const tableArb = fc
  .tuple(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }))
  .map(([a, b]) => ({ '720p': Math.min(a, b), '1080p': Math.max(a, b) }));

describe('P6 cost function', () => {
  it('is at least the base cost, an integer, and a whole multiple of it', () => {
    fc.assert(
      fc.property(resolutionArb, durationArb, tableArb, (res, ms, table) => {
        const cost = exportCost(res, ms, table);
        expect(Number.isInteger(cost)).toBe(true);
        expect(cost).toBeGreaterThanOrEqual(table[res]);
        expect(cost).toBe(table[res] * Math.max(1, Math.ceil(ms / 60_000)));
      }),
      RUNS,
    );
  });

  it('is monotonic in duration', () => {
    fc.assert(
      fc.property(resolutionArb, durationArb, durationArb, (res, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(exportCost(res, lo)).toBeLessThanOrEqual(exportCost(res, hi));
      }),
      RUNS,
    );
  });

  it('is monotonic in resolution (720p below 1080p with the paid table)', () => {
    fc.assert(
      fc.property(durationArb, (ms) => {
        expect(exportCost('720p', ms, PAID_TABLE)).toBeLessThan(
          exportCost('1080p', ms, PAID_TABLE),
        );
      }),
      RUNS,
    );
    fc.assert(
      fc.property(durationArb, tableArb, (ms, table) => {
        expect(exportCost('720p', ms, table)).toBeLessThanOrEqual(exportCost('1080p', ms, table));
      }),
      RUNS,
    );
  });

  it('is constant within a started minute and steps up just after it', () => {
    fc.assert(
      fc.property(
        resolutionArb,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 59_999 }),
        (res, minute, offset) => {
          const inside = (minute - 1) * 60_000 + 1 + offset; // in ((minute-1) min, minute min]
          expect(exportCost(res, inside)).toBe(DEFAULT_EXPORT_CREDITS[res] * minute);
          expect(exportCost(res, minute * 60_000)).toBe(DEFAULT_EXPORT_CREDITS[res] * minute);
          expect(exportCost(res, minute * 60_000 + 1)).toBe(
            DEFAULT_EXPORT_CREDITS[res] * (minute + 1),
          );
        },
      ),
      RUNS,
    );
  });

  it('equals the table value for any video up to 60 s (free by default; an 18 s 1080p export costs 5 on the paid table, D-014)', () => {
    fc.assert(
      fc.property(resolutionArb, fc.integer({ min: 0, max: 60_000 }), (res, ms) => {
        expect(exportCost(res, ms)).toBe(DEFAULT_EXPORT_CREDITS[res]);
      }),
      RUNS,
    );
    expect(exportCost('1080p', 18_000)).toBe(0);
    expect(exportCost('1080p', 18_000, { '720p': 3, '1080p': 5 })).toBe(5);
  });
});

// ---------------------------------------------------------------------------------------------
// P7: paths and filenames

const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,128}$/);
const badIdArb = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 200 }),
  fc.constantFrom('', '..', '.', 'a/b', '../x', 'a\\b', 'a b', 'a\u0000', 'é', 'x'.repeat(129)),
  fc.tuple(idArb, fc.constantFrom('/', '..', '\n', ' ', '%2f', '.')).map(([a, b]) => a + b),
);

describe('P7 renderPaths', () => {
  it('every path stays under the render folder, with no `..` or `//`', () => {
    fc.assert(
      fc.property(idArb, idArb, idArb, (uid, pid, rid) => {
        const p = renderPaths(uid, pid, rid);
        const root = `users/${uid}/projects/${pid}/renders/${rid}/`;
        expect(p.dir).toBe(root);
        for (const path of [p.inputDir, p.input, p.output, p.thumb]) {
          expect(path.startsWith(root)).toBe(true);
          expect(path).not.toContain('..');
          expect(path).not.toContain('//');
        }
        // The id segments cannot leak into the fixed part of the path.
        expect(p.dir.split('/')).toHaveLength(7);
      }),
      RUNS,
    );
  });

  it('is injective: different ids never share a folder', () => {
    fc.assert(
      fc.property(fc.tuple(idArb, idArb, idArb), fc.tuple(idArb, idArb, idArb), (a, b) => {
        fc.pre(a.join('|') !== b.join('|'));
        expect(renderPaths(...a).dir).not.toBe(renderPaths(...b).dir);
      }),
      RUNS,
    );
  });

  it('throws on any id that fails the id regex, in any position', () => {
    fc.assert(
      fc.property(
        badIdArb.filter((s) => !SAFE_ID.test(s)),
        idArb,
        fc.constantFrom(0, 1, 2),
        (bad, good, where) => {
          const ids: [string, string, string] = [good, good, good];
          ids[where] = bad;
          expect(isSafeId(bad)).toBe(false);
          expect(() => renderPaths(...ids)).toThrow();
        },
      ),
      RUNS,
    );
  });
});

/** Characters that make hostile titles: separators, controls, bidi, joiners, dots, odd Unicode. */
const hostileAtoms = [
  '/',
  '\\',
  '..',
  '.',
  ' ',
  '\t',
  '\n',
  '\r',
  '\u0000',
  '\u001f',
  '\u007f',
  '\u202e',
  '\u2066',
  '\u200b',
  '\u200d',
  '\ufeff',
  '\u2028',
  '\u2029',
  ':',
  '*',
  '?',
  '"',
  '<',
  '>',
  '|',
  'CON',
  'nul',
  'COM1',
  'a',
  'Z',
  '9',
  'é',
  'e\u0301',
  '日本',
  '🎬',
  '👩\u200d💻',
  '\ud83d', // a lone high surrogate
  '\udc00', // a lone low surrogate
  '"; filename="evil.exe',
  '\r\nSet-Cookie: x=1',
];
const titleArb = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 300 }),
  fc.array(fc.constantFrom(...hostileAtoms), { maxLength: 60 }).map((xs) => xs.join('')),
  fc.string({ unit: 'binary', minLength: 150, maxLength: 400 }),
);

describe('P7 sanitizeFilename', () => {
  it('always gives 1 to 80 characters plus the extension, never throws', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        const base = sanitizeFilenameBase(title);
        expect(base.length).toBeGreaterThanOrEqual(1);
        expect(base.length).toBeLessThanOrEqual(80);
        const full = sanitizeFilename(title, 'mp4');
        expect(full).toBe(`${base}.mp4`);
        expect(full.endsWith('.mp4')).toBe(true);
      }),
      RUNS,
    );
  });

  it('has no separators, reserved, control, invisible-format or line-break characters', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        const base = sanitizeFilenameBase(title);
        expect(base).not.toMatch(/[/\\:*?"<>|]/);
        expect(base).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
        // Invisible format characters (bidi overrides, zero width space, BOM) except the joiner.
        expect(base.replace(/\u200d/g, '')).not.toMatch(/\p{Cf}/u);
        // Dots inside a name are harmless once separators are gone; a name that is only dots is
        // trimmed away (see the next property).
        expect(['.', '..']).not.toContain(base);
      }),
      RUNS,
    );
  });

  it('never starts or ends with a space or a dot, and is never a Windows device name', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        const base = sanitizeFilenameBase(title);
        expect(base).not.toMatch(/^[\s.]|[\s.]$/);
        expect(base).not.toMatch(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i);
      }),
      RUNS,
    );
  });

  it('is idempotent, NFC-normalised and well-formed Unicode', () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        const base = sanitizeFilenameBase(title);
        expect(sanitizeFilenameBase(base)).toBe(base);
        expect(base.normalize('NFC')).toBe(base);
        // A lone surrogate would make encodeURIComponent throw when the header is built.
        expect(isWellFormed(base)).toBe(true);
        expect(() => encodeURIComponent(base)).not.toThrow();
      }),
      RUNS,
    );
  });

  it('keeps a clean title as it is', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,60}[A-Za-z0-9]$/), (t) => {
        fc.pre(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(t));
        expect(sanitizeFilenameBase(t)).toBe(t.replace(/\s+/g, ' '));
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Review F1: a day doc written by either path parses

describe('DailyLimitsSchema with either writer (review F1)', () => {
  const counter = fc.integer({ min: 0, max: 1000 });
  const docArb = fc
    .record({
      planCloud: fc.option(counter, { nil: undefined }),
      renders: fc.option(counter, { nil: undefined }),
    })
    .map(({ planCloud, renders }) => ({
      schemaVersion: 1,
      ...(planCloud !== undefined ? { planCloud } : {}),
      ...(renders !== undefined ? { renders } : {}),
      updatedAt: at,
    }));

  it('parses any doc with either counter, both or neither, defaulting the missing one to 0', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const r = DailyLimitsSchema.safeParse(doc);
        expect(r.success).toBe(true);
        if (r.success) {
          expect(r.data.planCloud).toBe('planCloud' in doc ? doc.planCloud : 0);
          expect(r.data.renders).toBe('renders' in doc ? doc.renders : 0);
        }
      }),
      RUNS,
    );
  });

  it('survives any interleaving of the two merge writers and keeps each one’s own count', () => {
    const writes = fc.array(
      fc.oneof(
        fc.record({ who: fc.constant('plan' as const), n: counter }),
        fc.record({ who: fc.constant('export' as const), n: counter }),
      ),
      { minLength: 1, maxLength: 20 },
    );
    fc.assert(
      fc.property(writes, (ws) => {
        // Firestore `set(..., { merge: true })` on a day doc.
        let stored: Record<string, unknown> | undefined;
        let plan = 0;
        let renders = 0;
        for (const w of ws) {
          const patch =
            w.who === 'plan'
              ? { schemaVersion: 1, planCloud: w.n, updatedAt: at }
              : { schemaVersion: 1, renders: w.n, updatedAt: at };
          stored = { ...stored, ...patch };
          if (w.who === 'plan') plan = w.n;
          else renders = w.n;
          // The reader of the other path must parse the doc at every point.
          const r = DailyLimitsSchema.safeParse(stored);
          expect(r.success).toBe(true);
        }
        const final = DailyLimitsSchema.parse(stored);
        expect(final.planCloud).toBe(plan);
        expect(final.renders).toBe(renders);
      }),
      RUNS,
    );
  });

  it('still rejects negative or fractional counters in any combination', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: -1 }), fc.double({ min: 0.01, max: 100, noInteger: true })),
        fc.constantFrom('planCloud', 'renders'),
        (bad, key) => {
          expect(
            DailyLimitsSchema.safeParse({ schemaVersion: 1, [key]: bad, updatedAt: at }).success,
          ).toBe(false);
        },
      ),
      RUNS,
    );
  });
});
