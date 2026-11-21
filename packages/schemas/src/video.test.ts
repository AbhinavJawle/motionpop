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
  isMediaStageMode,
  keptSourceSegments,
  MediaClipSchema,
  mediaLayerRectAt,
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

  it('rejects consecutive cutaways and excessive cutaways on video projects', () => {
    const words = Array.from({ length: 12 }, (_, i) => ({
      text: `w${i}`,
      startMs: i * 900,
      endMs: i * 900 + 800,
    }));
    const board: Storyboard = {
      title: 'Too many cutaways',
      thesis: 'Keep speaker visible',
      world: 'Clean studio world',
      carrier: 'Accent bar',
      props: [],
      beats: [
        {
          id: 'b1',
          wordStart: 0,
          wordEnd: 3,
          lead: 'type',
          archetype: 'kinetic-type',
          videoStage: 'full',
          idea: 'Bold hook over speaker',
          text: ['Hook'],
          landsOn: 1,
          staging: 'Pop on w1',
          seam: { kind: 'push', note: 'Push right' },
        },
        {
          id: 'b2',
          wordStart: 4,
          wordEnd: 7,
          lead: 'number',
          archetype: 'hero-stat',
          videoStage: 'cutaway',
          idea: 'Big stat cutaway',
          text: ['Zero'],
          landsOn: 5,
          staging: 'Count on w5',
          seam: { kind: 'push', note: 'Push right' },
        },
        {
          id: 'b3',
          wordStart: 8,
          wordEnd: 11,
          lead: 'picture',
          archetype: 'data-chart',
          videoStage: 'cutaway',
          idea: 'Another cutaway hiding speaker',
          text: ['Growth'],
          landsOn: 9,
          staging: 'Bars rise on w9',
          seam: { kind: 'push', note: 'Hold' },
        },
      ],
    };
    const issues = storyboardIssues(board, words, 11_000, { hasVideo: true });
    expect(issues.some((x) => x.includes('both "cutaway"'))).toBe(true);
    expect(issues.some((x) => x.includes('beats use "cutaway"'))).toBe(true);
  });
});

describe('multi-clip Media Bin & dual-layer choreography (spec 20)', () => {
  it('parses MediaClipSchema with moments and validates ranges', () => {
    const ok = MediaClipSchema.safeParse({
      id: 'clip-screen-1',
      name: 'dashboard-demo.mp4',
      src: 'idb:clip-1',
      kind: 'screen-recording',
      mimeType: 'video/mp4',
      width: 1920,
      height: 1080,
      durationMs: 12_000,
      summary: 'User clicks Deploy button in dashboard',
      tags: ['dashboard', 'deploy', 'ui'],
      dominantColors: ['#0b0c10', '#8b7cff'],
      moments: [
        {
          startMs: 1200,
          endMs: 4800,
          focusX: 0.72,
          focusY: 0.34,
          zoom: 1.65,
          description: 'Clicking the violet Deploy CTA',
        },
      ],
      indexedAt: 1_700_000_000_000,
    });
    expect(ok.success).toBe(true);
    expect(isMediaStageMode('screen-showcase')).toBe(true);
    expect(isMediaStageMode('split-top-broll')).toBe(true);
    expect(isMediaStageMode('broll-full')).toBe(true);
    expect(isMediaStageMode('media-card-pop')).toBe(true);
    expect(isMediaStageMode('split-left')).toBe(false);
  });

  it('evaluates mediaLayerRectAt with 3D tilt, smooth UI zoom, and glide-out exit', () => {
    const stages = stagesFromTimedBeats([
      { id: 'b1', startMs: 0, endMs: 3000, videoStage: 'full' },
      {
        id: 'b2',
        startMs: 3000,
        endMs: 7000,
        videoStage: 'screen-showcase',
        clipId: 'clip-1',
        clipStartMs: 1500,
        clipFocusX: 0.72,
        clipFocusY: 0.3,
        clipZoom: 1.7,
      },
      { id: 'b3', startMs: 7000, endMs: 10000, videoStage: 'split-left' },
    ]);

    // Hidden during non-media beat 1
    expect(mediaLayerRectAt(1000, stages, 1080, 1920).visible).toBe(false);

    // Enters and ramps zoom during screen-showcase beat 2
    const enter = mediaLayerRectAt(3050, stages, 1080, 1920);
    const settled = mediaLayerRectAt(5800, stages, 1080, 1920);
    expect(enter.visible).toBe(true);
    expect(enter.framed).toBe(true);
    expect(enter.clipId).toBe('clip-1');
    expect(enter.clipStartMs).toBe(1500);
    expect(settled.scale).toBeGreaterThan(1.5);
    expect(settled.focusX).toBeCloseTo(0.72, 2);
    expect(Math.abs(settled.rotateY)).toBeGreaterThan(0);

    // Speaker shrinks into PiP corner during screen-showcase
    const speaker = videoStageRectAt(5800, stages, [], 1080, 1920);
    expect(speaker.w).toBeLessThan(1080 * 0.4);
    expect(speaker.opacity).toBe(1);

    // Glides out smoothly on entering beat 3, then hides
    const exiting = mediaLayerRectAt(7100, stages, 1080, 1920);
    expect(exiting.visible).toBe(true);
    expect(exiting.opacity).toBeGreaterThan(0);
    expect(exiting.opacity).toBeLessThan(1);
    expect(mediaLayerRectAt(7400, stages, 1080, 1920).visible).toBe(false);
  });

  it('validates unknown or missing clipId in storyboardIssues', () => {
    const words = Array.from({ length: 6 }, (_, i) => ({
      text: `w${i}`,
      startMs: i * 900,
      endMs: i * 900 + 800,
    }));
    const board: Storyboard = {
      title: 'Multi-clip',
      thesis: 'Show product demo',
      world: 'Clean studio world',
      carrier: 'Accent highlight',
      props: [],
      beats: [
        {
          id: 'b1',
          wordStart: 0,
          wordEnd: 2,
          lead: 'picture',
          archetype: 'callout-hud',
          videoStage: 'screen-showcase',
          clipId: 'clip-missing',
          idea: 'Screen recording of dashboard',
          text: ['Live demo'],
          landsOn: 1,
          staging: 'Show UI on w1',
          seam: { kind: 'push', note: 'Push right' },
        },
        {
          id: 'b2',
          wordStart: 3,
          wordEnd: 5,
          lead: 'type',
          archetype: 'kinetic-type',
          videoStage: 'broll-full',
          idea: 'B-roll without clipId',
          text: ['Shipped'],
          landsOn: 4,
          staging: 'Pop on w4',
          seam: { kind: 'push', note: 'Hold' },
        },
      ],
    };
    const issues = storyboardIssues(board, words, 6000, {
      hasVideo: true,
      mediaBinIds: ['clip-real'],
    });
    expect(issues.some((x) => x.includes('unknown clipId'))).toBe(true);
    expect(issues.some((x) => x.includes('without a clipId'))).toBe(true);
  });

  it('supports editorial split-top-stage (topRadiusOnly), top-card, and clean stages (spec 23)', () => {
    const stages = stagesFromTimedBeats([
      { id: 'b1', startMs: 0, endMs: 3000, videoStage: 'split-top-stage', focusX: 0.5, focusY: 0.35 },
      { id: 'b2', startMs: 3000, endMs: 6000, videoStage: 'top-card', focusX: 0.5, focusY: 0.35 },
      { id: 'b3', startMs: 6000, endMs: 9000, videoStage: 'clean', focusX: 0.5, focusY: 0.35 },
    ]);
    // 9:16 vertical split-top-stage places arched speaker in bottom 45%
    const splitRect = videoStageRectAt(1200, stages, [], 1080, 1920);
    expect(splitRect.mode).toBe('split-top-stage');
    expect(splitRect.x).toBe(0);
    expect(splitRect.w).toBeCloseTo(1080, 0);
    expect(splitRect.y).toBeCloseTo(1920 * 0.55, 0);
    expect(splitRect.h).toBeCloseTo(1920 * 0.45, 0);
    expect(splitRect.radius).toBeGreaterThan(50);
    expect(splitRect.topRadiusOnly).toBe(true);

    // top-card keeps full-bleed speaker unobstructed
    const topCardRect = videoStageRectAt(4500, stages, [], 1080, 1920);
    expect(topCardRect.mode).toBe('top-card');
    expect(topCardRect.w).toBeCloseTo(1080, 0);
    expect(topCardRect.h).toBeCloseTo(1920, 0);
    expect(topCardRect.radius).toBe(0);

    // clean breathing beat keeps full-bleed speaker with smooth punch-in scale
    const cleanRect = videoStageRectAt(7500, stages, [], 1080, 1920);
    expect(cleanRect.mode).toBe('clean');
    expect(cleanRect.w).toBeCloseTo(1080, 0);
    expect(cleanRect.opacity).toBe(1);
  });
});
