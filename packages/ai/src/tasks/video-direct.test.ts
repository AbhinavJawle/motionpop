import type { Word } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';
import {
  directVideo,
  enforceVideoDirect,
  fallbackVideoDirect,
  videoDirectTask,
  type VideoDirectOutput,
} from './video-direct';

function sampleWords(n = 20): Word[] {
  return Array.from({ length: n }, (_, i) => ({
    i,
    text: i === 2 ? 'um' : `word${i}`,
    startMs: i * 500,
    endMs: i * 500 + 420,
    filler: i === 2,
    conf: 1,
  }));
}

describe('video.direct', () => {
  it('defaults to cfg.modelStrong (gemini-4-neon) and sends sampled keyframes', async () => {
    const words = sampleWords(12);
    const seen: { model?: string; frames?: number } = {};
    const router = createRouter({
      config: () => ({
        routingOverrides: {},
        routingSlotsDetectDeviceMaxWords: 400,
        modelFast: 'gemini-3.5-flash-lite',
        modelStrong: 'gemini-4-neon',
        modelFilmBuild: 'gemini-3.5-flash-lite',
        killSwitch: false,
      }),
      provider: {
        generate: vi.fn(async (req) => {
          seen.model = req.model;
          seen.frames = req.mediaList?.length ?? 0;
          const answer: VideoDirectOutput = {
            summary: 'Cut retake on words 4-5 and punched in on reveal',
            defaultOverlayAnchor: 'top-right',
            cuts: [{ wordStart: 4, wordEnd: 5, kind: 'retake', reason: 'Repeated intro' }],
            punchIns: [
              {
                wordStart: 7,
                wordEnd: 10,
                scale: 1.18,
                focusX: 0.48,
                focusY: 0.34,
                reason: 'Key stat emphasis',
              },
            ],
            placements: [
              {
                wordStart: 7,
                wordEnd: 10,
                placement: 'overlay',
                anchor: 'top-right',
                reason: 'Keep speaker visible',
              },
            ],
          };
          return { text: JSON.stringify(answer), ranOn: 'cloud' as const };
        }),
      },
    });

    const plan = await directVideo(router, {
      format: '16:9',
      styleId: 'editorial-explainer',
      durationMs: 6000,
      words,
      frames: [
        { atMs: 1000, base64: 'AAAA' },
        { atMs: 4000, base64: 'BBBB' },
      ],
      audioEdlCuts: [{ startMs: 1000, endMs: 1420, kind: 'filler', reason: 'Filler word' }],
    });

    expect(seen.model).toBe('gemini-4-neon');
    expect(seen.frames).toBe(2);
    expect(plan.source).toBe('cloud');
    expect(plan.model).toBe('gemini-4-neon');
    expect(plan.cuts).toHaveLength(2);
    expect(plan.punchIns).toHaveLength(1);
    expect(plan.placements[0]?.placement).toBe('overlay');
    expect(videoDirectTask().id).toBe('video.direct');
  });

  it('falls back deterministically when offline or router fails', async () => {
    const words = sampleWords(24);
    const plan = await directVideo(null, {
      format: '9:16',
      styleId: 'field-notes',
      durationMs: 12000,
      words,
      audioEdlCuts: [{ startMs: 3000, endMs: 3800, kind: 'silence', reason: 'Pause' }],
    });
    expect(plan.source).toBe('rules');
    expect(plan.defaultOverlayAnchor).toBe('top-right');
    expect(plan.cuts).toHaveLength(1);
    expect(plan.punchIns.length).toBeGreaterThanOrEqual(1);
  });

  it('property: enforceVideoDirect never emits overlapping cuts or cuts >65% of duration', () => {
    const words = sampleWords(30);
    const durationMs = 15000;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            wordStart: fc.integer({ min: 0, max: 29 }),
            wordEnd: fc.integer({ min: 0, max: 29 }),
            kind: fc.constantFrom(
              'silence',
              'filler',
              'retake',
              'ramble',
              'manual',
            ) as fc.Arbitrary<'silence' | 'filler' | 'retake' | 'ramble' | 'manual'>,
            reason: fc.constant('test'),
          }),
          { maxLength: 15 },
        ),
        (cuts) => {
          const plan = enforceVideoDirect(
            {
              summary: 'test',
              defaultOverlayAnchor: 'top-right',
              cuts,
              punchIns: [],
              placements: [],
            },
            words,
            durationMs,
          );
          let enabledMs = 0;
          for (let i = 0; i < plan.cuts.length; i++) {
            const c = plan.cuts[i]!;
            expect(c.endMs).toBeGreaterThan(c.startMs);
            expect(c.startMs).toBeGreaterThanOrEqual(0);
            expect(c.endMs).toBeLessThanOrEqual(durationMs);
            if (i > 0) expect(c.startMs).toBeGreaterThan(plan.cuts[i - 1]!.endMs);
            if (c.enabled) enabledMs += c.endMs - c.startMs;
          }
          expect(enabledMs).toBeLessThanOrEqual(Math.floor(durationMs * 0.65));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fallbackVideoDirect prefers side-right on 16:9', () => {
    const plan = fallbackVideoDirect(sampleWords(10), 5000, '16:9');
    expect(plan.defaultOverlayAnchor).toBe('side-right');
  });
});
