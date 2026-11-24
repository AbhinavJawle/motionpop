import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_CREDITS,
  RENDER_API_ERROR_STATUS,
  RenderApiErrorCodeSchema,
  RenderApiErrorSchema,
  RenderDocSchema,
  RenderErrorCodeSchema,
  RenderOptionsSchema,
  RenderRequestSchema,
  RenderStatusResponseSchema,
  ShareDocSchema,
  canTransition,
  exportAvailability,
  exportCost,
  isActiveStatus,
  isFinalStatus,
  isImageSlot,
  isSafeId,
  nextProgress,
  outputResolutionFor,
  renderDocIssues,
  renderPaths,
  sanitizeFilename,
  sanitizeFilenameBase,
  toRenderStatus,
  voicePathFor,
  RenderStatusSchema,
  type Format,
  type RenderDoc,
  type Slot,
} from './index';

/** True when the string has no lone surrogate (`String.prototype.isWellFormed` needs ES2024 libs). */
const isWellFormed = (s: string): boolean =>
  !/[\ud800-\udfff]/.test(s.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''));

const at = { toMillis: () => 1_700_000_000_000 };
const REQUEST_ID = '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b';

function project() {
  return {
    schemaVersion: 1,
    id: 'p1',
    title: 'Demo',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs: 18_000,
    voiceover: { src: 'voice.wav', durationMs: 18_000 },
    transcript: {
      words: [{ i: 0, text: 'hello', startMs: 0, endMs: 500, conf: 0.9, filler: false }],
      language: 'en',
      ranOn: 'cloud',
      timingQuality: 'word',
      cleaned: true,
    },
    slots: [],
    versions: [],
    createdAt: 1,
    updatedAt: 2,
  };
}

function doc(extra: Partial<RenderDoc> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ownerId: 'alice',
    projectId: 'p1',
    requestId: REQUEST_ID,
    title: 'Demo',
    format: '16:9',
    resolution: '1080p',
    captions: false,
    music: false,
    durationMs: 18_000,
    slotCount: 2,
    status: 'queued',
    progress: 0,
    costCredits: 5,
    mode: 'cloud',
    inputPath: 'users/alice/projects/p1/renders/rabc/input/project.json',
    voicePath: 'users/alice/audio/p1/voice-0123456789abcdef.wav',
    createdAt: at,
    ...extra,
  };
}

function slot(id: string, extra: Partial<Slot> = {}): Slot {
  return {
    id,
    startMs: 0,
    endMs: 1000,
    wordStart: 0,
    wordEnd: 0,
    reason: '',
    componentId: 'big-number',
    skillId: 'stat',
    prompt: '',
    params: {},
    status: 'ready',
    notes: [],
    ...extra,
  };
}

describe('RenderOptionsSchema', () => {
  const good = { format: '9:16', resolution: '720p', captions: false, music: false };

  it('accepts every format and the two offered resolutions', () => {
    for (const format of ['16:9', '9:16', '1:1']) {
      for (const resolution of ['720p', '1080p']) {
        expect(RenderOptionsSchema.safeParse({ ...good, format, resolution }).success).toBe(true);
      }
    }
  });

  it('accepts optional transparent boolean (spec 47) and rejects 4K and unknown keys', () => {
    expect(RenderOptionsSchema.safeParse({ ...good, transparent: true }).success).toBe(true);
    expect(RenderOptionsSchema.safeParse({ ...good, transparent: false }).success).toBe(true);
    expect(RenderOptionsSchema.safeParse({ ...good, resolution: '4k' }).success).toBe(false);
    expect(RenderOptionsSchema.safeParse({ ...good, extraFlag: true }).success).toBe(false);
    expect(RenderOptionsSchema.safeParse({ ...good, format: '4:3' }).success).toBe(false);
  });
});

describe('RenderRequestSchema', () => {
  const good = {
    requestId: REQUEST_ID,
    options: { format: '16:9', resolution: '1080p', captions: false, music: false },
    expectedCost: 5,
    project: project(),
    voicePath: 'users/alice/audio/p1/voice-0123456789abcdef.wav',
  };

  it('parses a valid request and re-validates the project snapshot', () => {
    expect(RenderRequestSchema.safeParse(good).success).toBe(true);
    const bad = { ...good, project: { ...project(), durationMs: -1 } };
    expect(RenderRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a bad request id, a negative or fractional cost and extra keys', () => {
    expect(RenderRequestSchema.safeParse({ ...good, requestId: 'abc' }).success).toBe(false);
    expect(RenderRequestSchema.safeParse({ ...good, expectedCost: -1 }).success).toBe(false);
    expect(RenderRequestSchema.safeParse({ ...good, expectedCost: 2.5 }).success).toBe(false);
    expect(RenderRequestSchema.safeParse({ ...good, html: '<script/>' }).success).toBe(false);
  });
});

describe('RenderDocSchema invariants', () => {
  it('accepts a doc in each status', () => {
    const cases: Record<string, unknown>[] = [
      doc(),
      doc({ status: 'rendering', progress: 40 }),
      doc({ status: 'encoding', progress: 90 }),
      doc({ status: 'done', progress: 100, outputPath: 'users/alice/x/video.mp4' }),
      doc({ status: 'error', progress: 12, error: 'render-failed' }),
    ];
    for (const d of cases) expect(RenderDocSchema.safeParse(d).success).toBe(true);
  });

  it.each([
    ['queued with progress', doc({ progress: 1 })],
    ['done without output', doc({ status: 'done', progress: 100 })],
    ['done with progress 99', doc({ status: 'done', progress: 99, outputPath: 'x' })],
    ['encoding at 100', doc({ status: 'encoding', progress: 100 })],
    ['error without a code', doc({ status: 'error', progress: 5 })],
    ['a code on a running render', doc({ status: 'rendering', progress: 5, error: 'stalled' })],
    ['fractional progress', doc({ status: 'rendering', progress: 5.5 })],
    ['progress over 100', doc({ status: 'rendering', progress: 101 })],
    ['unknown mode', doc({ mode: 'edge' as never })],
    ['4K', doc({ resolution: '4k' as never })],
  ])('rejects %s', (_, d) => {
    expect(RenderDocSchema.safeParse(d).success).toBe(false);
  });

  it('renderDocIssues explains each broken invariant', () => {
    expect(renderDocIssues({ status: 'done', progress: 100 })).toEqual(['done implies outputPath']);
    expect(renderDocIssues({ status: 'queued', progress: 0 })).toEqual([]);
  });

  it('knows the error codes of design §5', () => {
    expect(RenderErrorCodeSchema.options).toEqual([
      'start-failed',
      'stalled',
      'input-missing',
      'compile-failed',
      'slot-failed',
      'render-failed',
      'timeout',
      'upload-failed',
      'internal',
    ]);
  });
});

describe('ShareDocSchema and API errors', () => {
  it('parses a share and rejects a missing render id', () => {
    const share = {
      schemaVersion: 1,
      ownerId: 'a',
      projectId: 'p',
      renderId: 'r',
      revoked: false,
      createdAt: at,
    };
    expect(ShareDocSchema.safeParse(share).success).toBe(true);
    expect(ShareDocSchema.safeParse({ ...share, renderId: '' }).success).toBe(false);
  });

  it('gives every API error an HTTP status', () => {
    for (const code of RenderApiErrorCodeSchema.options) {
      expect(RENDER_API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(RENDER_API_ERROR_STATUS['insufficient-credits']).toBe(402);
    expect(RENDER_API_ERROR_STATUS['render-active']).toBe(409);
    expect(RENDER_API_ERROR_STATUS['daily-limit']).toBe(429);
    expect(RENDER_API_ERROR_STATUS.disabled).toBe(503);
    expect(RenderApiErrorSchema.safeParse({ error: 'cost-changed', cost: 5 }).success).toBe(true);
    expect(RenderApiErrorSchema.safeParse({ error: 'nope' }).success).toBe(false);
  });
});

describe('exportCost', () => {
  const PAID = { '720p': 3, '1080p': 5 } as const;

  it('is free by default at every resolution (spec 13b R1)', () => {
    expect(exportCost('1080p', 18_000)).toBe(0);
    expect(exportCost('720p', 18_000)).toBe(0);
    expect(exportCost('1080p', 180_000)).toBe(0);
    expect(DEFAULT_EXPORT_CREDITS).toEqual({ '720p': 0, '1080p': 0 });
  });

  it('prices an 18 s 1080p export at 5 credits with the paid table (D-014)', () => {
    expect(exportCost('1080p', 18_000, PAID)).toBe(5);
    expect(exportCost('720p', 18_000, PAID)).toBe(3);
  });

  it('charges per started minute', () => {
    expect(exportCost('1080p', 0, PAID)).toBe(5);
    expect(exportCost('1080p', 60_000, PAID)).toBe(5);
    expect(exportCost('1080p', 60_001, PAID)).toBe(10);
    expect(exportCost('1080p', 180_000, PAID)).toBe(15);
  });

  it('uses a custom table and rejects bad durations', () => {
    expect(exportCost('1080p', 61_000, { '720p': 1, '1080p': 2 })).toBe(4);
    expect(() => exportCost('1080p', -1)).toThrow(RangeError);
    expect(() => exportCost('1080p', Number.NaN)).toThrow(RangeError);
  });
});

describe('renderPaths', () => {
  it('keeps every path under the render folder', () => {
    const p = renderPaths('alice', 'p1', 'rAbC_-1');
    expect(p.dir).toBe('users/alice/projects/p1/renders/rAbC_-1/');
    expect(p.input).toBe(`${p.dir}input/project.json`);
    expect(p.inputDir).toBe(`${p.dir}input/`);
    expect(p.output).toBe(`${p.dir}video.mp4`);
    expect(p.thumb).toBe(`${p.dir}thumb.jpg`);

    const webm = renderPaths('alice', 'p1', 'rAbC_-1', 'webm');
    expect(webm.output).toBe(`${webm.dir}video.webm`);
    expect(webm.thumb).toBe(`${webm.dir}thumb.jpg`);
  });

  it.each(['', '..', 'a/b', 'a b', 'a.b', 'é', 'x'.repeat(129)])('throws on id %j', (bad) => {
    expect(() => renderPaths(bad, 'p1', 'r1')).toThrow();
    expect(() => renderPaths('alice', bad, 'r1')).toThrow();
    expect(() => renderPaths('alice', 'p1', bad)).toThrow();
    expect(isSafeId(bad)).toBe(false);
  });
});

describe('voicePathFor', () => {
  const re = voicePathFor('alice', 'p1');

  it('matches only the owner and project voice objects', () => {
    expect(re.test('users/alice/audio/p1/voice-0123456789abcdef.wav')).toBe(true);
    expect(re.test('users/alice/audio/p1/voice-0123456789abcdef.m4a')).toBe(true);
    expect(re.test('users/bob/audio/p1/voice-0123456789abcdef.wav')).toBe(false);
    expect(re.test('users/alice/audio/p2/voice-0123456789abcdef.wav')).toBe(false);
    expect(re.test('users/alice/audio/p1/voice-0123456789abcdef.exe')).toBe(false);
    expect(re.test('users/alice/audio/p1/voice-xyz.wav')).toBe(false);
    expect(re.test('users/alice/audio/p1/../p2/voice-0123456789abcdef.wav')).toBe(false);
  });

  it('escapes regular-expression characters in ids', () => {
    const dotted = voicePathFor('a.b', 'p+1');
    expect(dotted.test('users/a.b/audio/p+1/voice-0123456789abcdef.wav')).toBe(true);
    expect(dotted.test('users/aXb/audio/p+1/voice-0123456789abcdef.wav')).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('keeps an ordinary title and adds the extension', () => {
    expect(sanitizeFilename('Untitled Project', 'mp4')).toBe('Untitled Project.mp4');
    expect(sanitizeFilename('Q3 revenue: 40% up?', 'mp4')).toBe('Q3 revenue 40% up.mp4');
  });

  it('removes separators, reserved characters and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd', 'mp4')).toBe('etcpasswd.mp4');
    expect(sanitizeFilename('a\\b|c"d<e>f*g', 'mp4')).toBe('abcdefg.mp4');
    expect(sanitizeFilename('line\nbreak\u0000nul\u202etxt', 'mp4')).toBe('linebreaknultxt.mp4');
  });

  it('falls back for empty, dot-only and reserved device names', () => {
    for (const t of ['', '   ', '...', '///', 'CON', 'nul', 'com1']) {
      expect(sanitizeFilename(t, 'mp4')).toBe('motionpop video.mp4');
    }
  });

  it('keeps emoji, including joined sequences, and non-Latin text', () => {
    expect(sanitizeFilename('🎬', 'mp4')).toBe('🎬.mp4');
    expect(sanitizeFilename('👩‍💻 demo', 'mp4')).toBe('👩‍💻 demo.mp4');
    expect(sanitizeFilename('Ñandú 日本語', 'mp4')).toBe('Ñandú 日本語.mp4');
  });

  it('caps the length at 80 without splitting a surrogate pair', () => {
    const base = sanitizeFilenameBase('x'.repeat(200));
    expect(base).toHaveLength(80);
    const emoji = sanitizeFilenameBase('a' + '🎬'.repeat(60));
    expect(emoji.length).toBeLessThanOrEqual(80);
    expect(emoji).not.toMatch(/[\ud800-\udbff]$/);
  });

  // Regression: the property test in render.property.test.ts found that a lone surrogate
  // survived the pass and made `encodeURIComponent` throw when the download header is built.
  it('drops lone surrogates so the name always encodes', () => {
    for (const t of ['\ud83d', 'a\udc00b', '\ud83d🎬', 'x\ude00']) {
      const base = sanitizeFilenameBase(t);
      expect(isWellFormed(base)).toBe(true);
      expect(() => encodeURIComponent(base)).not.toThrow();
    }
    expect(sanitizeFilename('a\udc00b', 'mp4')).toBe('ab.mp4');
    expect(sanitizeFilename('\ud83d🎬', 'mp4')).toBe('🎬.mp4');
  });

  it('is idempotent and normalises to NFC', () => {
    const t = 'Cafe\u0301 ... ';
    const once = sanitizeFilenameBase(t);
    expect(once).toBe('Café');
    expect(sanitizeFilenameBase(once)).toBe(once);
  });

  it('rejects an unsafe extension', () => {
    expect(() => sanitizeFilename('x', 'mp4/../')).toThrow();
    expect(() => sanitizeFilename('x', '')).toThrow();
    expect(() => sanitizeFilename('x', 'MP4')).toThrow();
  });
});

describe('state machine', () => {
  const all = RenderStatusSchema.options;

  it('allows only the forward path and error from an active status', () => {
    expect(canTransition('queued', 'rendering')).toBe(true);
    expect(canTransition('rendering', 'encoding')).toBe(true);
    expect(canTransition('encoding', 'done')).toBe(true);
    for (const s of ['queued', 'rendering', 'encoding'] as const) {
      expect(canTransition(s, 'error')).toBe(true);
    }
  });

  it('never leaves done or error, never skips a stage, never goes back', () => {
    for (const to of all) {
      expect(canTransition('done', to)).toBe(false);
      expect(canTransition('error', to)).toBe(false);
    }
    expect(canTransition('queued', 'encoding')).toBe(false);
    expect(canTransition('queued', 'done')).toBe(false);
    expect(canTransition('rendering', 'done')).toBe(false);
    expect(canTransition('encoding', 'rendering')).toBe(false);
    expect(canTransition('rendering', 'queued')).toBe(false);
    expect(canTransition('queued', 'queued')).toBe(false);
  });

  it('knows which statuses are active and final', () => {
    expect(all.filter(isActiveStatus)).toEqual(['queued', 'rendering', 'encoding']);
    expect(all.filter(isFinalStatus)).toEqual(['done', 'error']);
  });
});

describe('nextProgress', () => {
  it('never decreases and stays an integer in 0..100', () => {
    expect(nextProgress(10, 5)).toBe(10);
    expect(nextProgress(10, 42.4)).toBe(42);
    expect(nextProgress(10, 42.6)).toBe(43);
    expect(nextProgress(10, 250)).toBe(100);
    expect(nextProgress(0, -5)).toBe(0);
  });

  it('ignores a candidate that is not a number', () => {
    expect(nextProgress(33, Number.NaN)).toBe(33);
    expect(nextProgress(33, Number.POSITIVE_INFINITY)).toBe(33);
  });
});

describe('outputResolutionFor', () => {
  it('is native at 1080p and a 720p preset per format otherwise', () => {
    for (const f of ['16:9', '9:16', '1:1'] as const) {
      expect(outputResolutionFor(f, '1080p')).toBeUndefined();
    }
    expect(outputResolutionFor('16:9', '720p')).toBe('landscape-720p');
    expect(outputResolutionFor('9:16', '720p')).toBe('portrait-720p');
    expect(outputResolutionFor('1:1', '720p')).toBe('square-720p');
  });
});

describe('exportAvailability', () => {
  const ctx = (
    ok: (s: Slot, f: Format) => boolean = (s) => s.status === 'ready',
    maxMs = 180_000,
  ) => ({
    isRenderable: ok,
    maxMs,
  });

  it('counts ready slots as renderable and the rest as left out', () => {
    const p = {
      durationMs: 18_000,
      slots: [slot('a'), slot('b', { status: 'suggested' }), slot('c', { status: 'failed' })],
    };
    const r = exportAvailability(p, { format: '16:9' }, ctx());
    expect(r).toEqual({ renderableIds: ['a'], renderable: 1, leftOut: 2, reasons: [] });
  });

  it('keeps image slots in: pictures render in preview and export alike', () => {
    const withImage = slot('img', { params: { images: [{ assetId: 'x' }] } });
    const emptyImages = slot('plain', { params: { images: [] } });
    expect(isImageSlot(withImage)).toBe(true);
    expect(isImageSlot(emptyImages)).toBe(false);
    const r = exportAvailability(
      { durationMs: 5000, slots: [withImage, emptyImages] },
      { format: '1:1' },
      ctx(() => true),
    );
    expect(r.renderableIds).toEqual(['img', 'plain']);
    expect(r.leftOut).toBe(0);
  });

  it('passes the chosen format to the component check', () => {
    const seen: string[] = [];
    exportAvailability(
      { durationMs: 1000, slots: [slot('a')] },
      { format: '9:16' },
      ctx((_, f) => {
        seen.push(f);
        return true;
      }),
    );
    expect(seen).toEqual(['9:16']);
  });

  it('blocks an export with nothing to render, and one that is too long', () => {
    expect(
      exportAvailability({ durationMs: 1000, slots: [] }, { format: '16:9' }, ctx()).reasons,
    ).toEqual(['nothing-to-render']);
    const r = exportAvailability(
      { durationMs: 180_001, slots: [slot('a')] },
      { format: '16:9' },
      ctx(),
    );
    expect(r.reasons).toEqual(['too-long']);
    expect(
      exportAvailability({ durationMs: 180_000, slots: [slot('a')] }, { format: '16:9' }, ctx())
        .reasons,
    ).toEqual([]);
  });
});

describe('toRenderStatus', () => {
  const doc = RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: 'u1',
    projectId: 'p1',
    requestId: '3b241101-e2bb-4255-8caf-4136c566a962',
    title: 'Launch',
    format: '16:9',
    resolution: '1080p',
    captions: false,
    music: false,
    durationMs: 18000,
    slotCount: 2,
    status: 'error',
    progress: 40,
    costCredits: 5,
    mode: 'cloud',
    inputPath: 'users/u1/projects/p1/renders/r1/input/project.json',
    voicePath: 'users/u1/audio/p1/voice-0123456789abcdef.wav',
    error: 'render-failed',
    errorMessage: 'internal detail that must not be sent',
    createdAt: new Date(),
  });

  it('keeps the public fields and drops paths, messages and timestamps', () => {
    const r = toRenderStatus('r1', doc);
    expect(RenderStatusResponseSchema.parse(r)).toEqual(r);
    expect(r).toEqual({
      renderId: 'r1',
      status: 'error',
      progress: 40,
      error: 'render-failed',
      costCredits: 5,
      title: 'Launch',
      format: '16:9',
      resolution: '1080p',
      durationMs: 18000,
    });
    expect(JSON.stringify(r)).not.toContain('users/');
    expect(JSON.stringify(r)).not.toContain('internal detail');
  });
});
