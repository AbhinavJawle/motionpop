import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EditorProjectSchema } from './project';
import { storyboardIssues, type Storyboard } from './film';
import { videoPathFor } from './render';
import {
  activePunchIn,
  cleanedDurationFromSegments,
  cleanedToSourceMs,
  easedPunchInAt,
  keptSourceSegments,
  OverlayAnchorSchema,
  sourceToCleanedMs,
  STAGE_TRANSITION_MS,
  stagesFromTimedBeats,
  VideoCutSchema,
  VideoPunchInSchema,
  videoStageRectAt,
  VideoTrackSchema,
  type VideoCut,
  type VideoPunchIn,
} from './video';

type CutLike = Pick<VideoCut, 'startMs' | 'endMs' | 'enabled'>;

const cut = (startMs: number, endMs: number, enabled = true): CutLike => ({
  startMs,
  endMs,
  enabled,
});

const punch = (startMs: number, endMs: number): VideoPunchIn => ({
  id: `p${startMs}`,
  startMs,
  endMs,
  scale: 1.2,
  focusX: 0.5,
  focusY: 0.4,
  reason: 'test',
});

/** Random cuts within a source of `duration` ms, some disabled, some overlapping. */
const cutsFor = (duration: number) =>
  fc.array(
    fc
      .tuple(
        fc.integer({ min: 0, max: duration }),
        fc.integer({ min: 1, max: Math.max(1, Math.floor(duration / 3)) }),
        fc.boolean(),
      )
      .map(([start, len, enabled]) => cut(start, start + len, enabled)),
    { maxLength: 8 },
  );

const durationArb = fc.integer({ min: 1, max: 3000 });

describe('VideoCutSchema', () => {
  it('rejects a cut that does not end after it starts', () => {
    const base = { id: 'c', kind: 'silence', reason: '', enabled: true };
    expect(VideoCutSchema.safeParse({ ...base, startMs: 500, endMs: 500 }).success).toBe(false);
    expect(VideoCutSchema.safeParse({ ...base, startMs: 500, endMs: 400 }).success).toBe(false);
    expect(VideoCutSchema.safeParse({ ...base, startMs: 400, endMs: 500 }).success).toBe(true);
  });

  it('rejects floats and unknown kinds', () => {
    const base = { id: 'c', reason: '', enabled: true };
    expect(
      VideoCutSchema.safeParse({ ...base, kind: 'silence', startMs: 1.5, endMs: 900 }).success,
    ).toBe(false);
    expect(
      VideoCutSchema.safeParse({ ...base, kind: 'bogus', startMs: 1, endMs: 900 }).success,
    ).toBe(false);
  });
});

describe('VideoPunchInSchema', () => {
  it('enforces the scale range and a positive window', () => {
    const base = { id: 'p', startMs: 0, endMs: 1000, focusX: 0.5, focusY: 0.5, reason: '' };
    expect(VideoPunchInSchema.safeParse({ ...base, scale: 1.04 }).success).toBe(false);
    expect(VideoPunchInSchema.safeParse({ ...base, scale: 1.41 }).success).toBe(false);
    expect(VideoPunchInSchema.safeParse({ ...base, scale: 1.05 }).success).toBe(true);
    expect(VideoPunchInSchema.safeParse({ ...base, scale: 1.4 }).success).toBe(true);
    expect(VideoPunchInSchema.safeParse({ ...base, scale: 1.2, endMs: 0 }).success).toBe(false);
  });
});

describe('OverlayAnchorSchema', () => {
  it('accepts the six anchors only', () => {
    for (const a of ['top-right', 'top-left', 'lower-third', 'side-right', 'side-left', 'center']) {
      expect(OverlayAnchorSchema.safeParse(a).success).toBe(true);
    }
    expect(OverlayAnchorSchema.safeParse('bottom-left').success).toBe(false);
  });
});

describe('VideoTrackSchema', () => {
  it('fills defaults for cuts, punch-ins and anchor', () => {
    const r = VideoTrackSchema.parse({
      src: 'idb:v',
      width: 1920,
      height: 1080,
      originalDurationMs: 10_000,
    });
    expect(r.cuts).toEqual([]);
    expect(r.punchIns).toEqual([]);
    expect(r.defaultOverlayAnchor).toBe('top-right');
  });
});

describe('keptSourceSegments', () => {
  it('returns the whole source when there are no cuts', () => {
    expect(keptSourceSegments(5000, [])).toEqual([
      { startMs: 0, endMs: 5000, timelineStartMs: 0, timelineEndMs: 5000 },
    ]);
  });

  it('removes one middle cut and makes the timeline contiguous', () => {
    expect(keptSourceSegments(5000, [cut(1000, 2000)])).toEqual([
      { startMs: 0, endMs: 1000, timelineStartMs: 0, timelineEndMs: 1000 },
      { startMs: 2000, endMs: 5000, timelineStartMs: 1000, timelineEndMs: 4000 },
    ]);
  });

  it('ignores disabled cuts', () => {
    expect(keptSourceSegments(3000, [cut(500, 1000, false)])).toHaveLength(1);
  });

  it('merges overlapping and touching cuts', () => {
    const segs = keptSourceSegments(5000, [cut(1000, 2000), cut(1500, 2500), cut(2500, 3000)]);
    expect(segs).toEqual([
      { startMs: 0, endMs: 1000, timelineStartMs: 0, timelineEndMs: 1000 },
      { startMs: 3000, endMs: 5000, timelineStartMs: 1000, timelineEndMs: 3000 },
    ]);
  });

  it('clamps cuts that run past the ends and drops empty results', () => {
    const segs = keptSourceSegments(3000, [cut(-500, 400), cut(2800, 9000)]);
    expect(segs).toEqual([{ startMs: 400, endMs: 2800, timelineStartMs: 0, timelineEndMs: 2400 }]);
  });

  it('returns no segments when a cut removes everything', () => {
    expect(keptSourceSegments(1000, [cut(0, 1000)])).toEqual([]);
  });
});

describe('time mapping', () => {
  const segs = keptSourceSegments(5000, [cut(1000, 2000)]);

  it('maps cleaned time to source time across a cut', () => {
    expect(cleanedToSourceMs(0, segs)).toBe(0);
    expect(cleanedToSourceMs(999, segs)).toBe(999);
    expect(cleanedToSourceMs(1000, segs)).toBe(2000);
    expect(cleanedToSourceMs(3999, segs)).toBe(4999);
    expect(cleanedToSourceMs(9999, segs)).toBe(5000);
  });

  it('maps source time to cleaned time, or null inside a cut', () => {
    expect(sourceToCleanedMs(500, segs)).toBe(500);
    expect(sourceToCleanedMs(1500, segs)).toBeNull();
    expect(sourceToCleanedMs(2000, segs)).toBe(1000);
    expect(sourceToCleanedMs(5000, segs)).toBeNull();
  });

  it('reports the cleaned duration', () => {
    expect(cleanedDurationFromSegments(segs)).toBe(4000);
    expect(cleanedDurationFromSegments([])).toBe(0);
  });

  it('returns 0 or null with no segments', () => {
    expect(cleanedToSourceMs(100, [])).toBe(0);
    expect(sourceToCleanedMs(100, [])).toBeNull();
  });
});

describe('activePunchIn', () => {
  const punches = [punch(1000, 2000), punch(3000, 4000)];

  it('returns the punch-in covering the time (start inclusive, end exclusive)', () => {
    expect(activePunchIn(999, punches)).toBeNull();
    expect(activePunchIn(1000, punches)?.startMs).toBe(1000);
    expect(activePunchIn(1999, punches)?.startMs).toBe(1000);
    expect(activePunchIn(2000, punches)).toBeNull();
    expect(activePunchIn(3500, punches)?.startMs).toBe(3000);
  });
});

describe('properties', () => {
  it('round-trips cleaned -> source -> cleaned for every interior cleaned time', () => {
    fc.assert(
      fc.property(durationArb, cutsFor(3000), (duration, cuts) => {
        const d = Math.min(duration, 3000);
        const segs = keptSourceSegments(d, cuts);
        const total = cleanedDurationFromSegments(segs);
        for (let t = 0; t < total; t += Math.max(1, Math.floor(total / 40))) {
          const s = cleanedToSourceMs(t, segs);
          expect(sourceToCleanedMs(s, segs)).toBe(t);
        }
      }),
    );
  });

  it('keeps segments sorted, non-empty, non-overlapping and contiguous on the timeline', () => {
    fc.assert(
      fc.property(durationArb, cutsFor(3000), (duration, cuts) => {
        const segs = keptSourceSegments(Math.min(duration, 3000), cuts);
        let timeline = 0;
        let prevEnd = -1;
        for (const seg of segs) {
          expect(seg.endMs).toBeGreaterThan(seg.startMs);
          expect(seg.startMs).toBeGreaterThanOrEqual(prevEnd);
          expect(seg.timelineStartMs).toBe(timeline);
          expect(seg.timelineEndMs - seg.timelineStartMs).toBe(seg.endMs - seg.startMs);
          timeline = seg.timelineEndMs;
          prevEnd = seg.endMs;
        }
      }),
    );
  });

  it('kept plus merged cut duration equals the original duration', () => {
    fc.assert(
      fc.property(durationArb, cutsFor(3000), (duration, cuts) => {
        const d = Math.min(duration, 3000);
        const segs = keptSourceSegments(d, cuts);
        const covered = new Array<boolean>(d).fill(false);
        for (const c of cuts) {
          if (!c.enabled) continue;
          for (let ms = Math.max(0, c.startMs); ms < Math.min(d, c.endMs); ms++) covered[ms] = true;
        }
        const cutTotal = covered.filter(Boolean).length;
        expect(cleanedDurationFromSegments(segs) + cutTotal).toBe(d);
      }),
    );
  });
});

describe('voice-only projects still parse', () => {
  it('accepts an EditorProject with no video field', () => {
    const project = {
      schemaVersion: 1,
      id: 'p1',
      title: 'Voice only',
      format: '16:9',
      fps: 30,
      styleId: 'clean',
      durationMs: 20_000,
      voiceover: { src: 'voice.wav', durationMs: 20_000 },
      transcript: {
        words: [{ i: 0, text: 'hi', startMs: 0, endMs: 500, conf: 0.9, filler: false }],
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
    const r = EditorProjectSchema.safeParse(project);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.video).toBeUndefined();
  });
});

describe('video stage choreography (spec 19)', () => {
  const stages = stagesFromTimedBeats([
    { id: 'b1', startMs: 0, endMs: 3000, videoStage: 'full', focusX: 0.5, focusY: 0.35 },
    { id: 'b2', startMs: 3000, endMs: 6000, videoStage: 'split-left', focusX: 0.48, focusY: 0.32 },
    { id: 'b3', startMs: 6000, endMs: 9000, videoStage: 'pip', focusX: 0.5, focusY: 0.35 },
    { id: 'b4', startMs: 9000, endMs: 12000, videoStage: 'backdrop' },
    { id: 'b5', startMs: 12000, endMs: 15000, videoStage: 'cutaway' },
  ]);

  it('smoothly interpolates from full to split-left across STAGE_TRANSITION_MS', () => {
    const start = videoStageRectAt(3000, stages, [], 1920, 1080);
    const mid = videoStageRectAt(3000 + Math.floor(STAGE_TRANSITION_MS / 2), stages, [], 1920, 1080);
    const settled = videoStageRectAt(3000 + STAGE_TRANSITION_MS + 100, stages, [], 1920, 1080);
    expect(start.w).toBeCloseTo(1920, 0);
    expect(mid.w).toBeLessThan(1920);
    expect(mid.w).toBeGreaterThan(settled.w);
    expect(settled.w).toBeCloseTo(1920 * 0.43, 0);
    expect(settled.radius).toBeGreaterThan(20);
  });

  it('sets blur/dim for backdrop and hides video in cutaway', () => {
    const bg = videoStageRectAt(9600, stages, [], 1920, 1080);
    expect(bg.blurPx).toBeGreaterThanOrEqual(8);
    expect(bg.dim).toBeGreaterThan(0.4);
    const cutRect = videoStageRectAt(12600, stages, [], 1920, 1080);
    expect(cutRect.opacity).toBe(0);
  });

  it('ramps punch-ins smoothly instead of hard-snapping', () => {
    const p = punch(1000, 3000);
    const atEdge = easedPunchInAt(1000, [p]);
    const atMid = easedPunchInAt(2000, [p]);
    expect(atEdge?.scale).toBeCloseTo(1, 3);
    expect(atMid?.scale).toBeCloseTo(p.scale, 3);
  });

  it('validates source video storage paths via videoPathFor', () => {
    const re = videoPathFor('user_1', 'proj_2');
    expect(re.test('users/user_1/video/proj_2/source-0123456789abcdef.mp4')).toBe(true);
    expect(re.test('users/user_1/video/proj_2/source-0123456789abcdef.mov')).toBe(true);
    expect(re.test('users/user_1/video/proj_2/source-0123456789abcdef.wav')).toBe(false);
    expect(re.test('users/other/video/proj_2/source-0123456789abcdef.mp4')).toBe(false);
  });

  it('flags consecutive duplicate archetypes and 3 identical videoStages in storyboardIssues', () => {
    const words = Array.from({ length: 12 }, (_, i) => ({
      text: `w${i}`,
      startMs: i * 900,
      endMs: i * 900 + 800,
    }));
    const board: Storyboard = {
      title: 'Test',
      thesis: 'Test thesis',
      world: 'Clean studio world',
      carrier: 'Accent line',
      props: [],
      beats: [
        {
          id: 'b1',
          wordStart: 0,
          wordEnd: 3,
          lead: 'number',
          archetype: 'hero-stat',
          videoStage: 'full',
          idea: 'Big stat over speaker',
          text: ['40%'],
          landsOn: 1,
          staging: 'Pop stat on w1',
          seam: { kind: 'push', note: 'Push right' },
        },
        {
          id: 'b2',
          wordStart: 4,
          wordEnd: 7,
          lead: 'picture',
          archetype: 'hero-stat',
          videoStage: 'full',
          idea: 'Another stat repeated',
          text: ['2x'],
          landsOn: 5,
          staging: 'Pop on w5',
          seam: { kind: 'push', note: 'Push right' },
        },
        {
          id: 'b3',
          wordStart: 8,
          wordEnd: 11,
          lead: 'picture',
          archetype: 'data-chart',
          videoStage: 'full',
          idea: 'Bar chart of growth',
          text: ['Growth'],
          landsOn: 9,
          staging: 'Bars rise on w9',
          seam: { kind: 'push', note: 'Hold' },
        },
      ],
    };
    const issues = storyboardIssues(board, words, 11_000, { hasVideo: true });
    expect(issues.some((x) => x.includes('repeats archetype'))).toBe(true);
    expect(issues.some((x) => x.includes('stay in videoStage'))).toBe(true);
  });
});
