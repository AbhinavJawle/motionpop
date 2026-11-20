import { keptSourceSegments } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildVideoCompositeArgs } from './video-ffmpeg';

describe('buildVideoCompositeArgs', () => {
  it('builds a clean trim+concat+punchIn+alpha-overlay filter graph with voice and bed', () => {
    const segs = keptSourceSegments(10000, [
      { startMs: 2000, endMs: 3000, enabled: true },
      { startMs: 6000, endMs: 7000, enabled: true },
    ]);
    const args = buildVideoCompositeArgs({
      sourceVideoPath: '/tmp/source.mp4',
      overlayVideoPath: '/tmp/overlay.webm',
      voiceWavPath: '/tmp/voice.wav',
      bedWavPath: '/tmp/bed.wav',
      outMp4Path: '/tmp/out.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: 8000,
      segments: segs,
      punchIns: [
        {
          id: 'p1',
          startMs: 1000,
          endMs: 3000,
          scale: 1.2,
          focusX: 0.5,
          focusY: 0.35,
          reason: 'Reveal',
        },
      ],
    });

    const fcIdx = args.indexOf('-filter_complex');
    expect(fcIdx).toBeGreaterThan(-1);
    const graph = args[fcIdx + 1]!;
    expect(graph).toContain('concat=n=3:v=1:a=0[vbase]');
    expect(graph).toContain("overlay=0:0:enable='between(t,1.000,3.000)'[vzoom]");
    expect(graph).toContain('[vzoom][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]');
    expect(graph).toContain('[2:a][3:a]amix=inputs=2:duration=first:normalize=0[aout]');
    expect(args).toContain('-map');
    expect(args).toContain('[aout]');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  it('maps voice directly when no bed wav is present', () => {
    const args = buildVideoCompositeArgs({
      sourceVideoPath: '/tmp/source.mp4',
      overlayVideoPath: '/tmp/overlay.webm',
      voiceWavPath: '/tmp/voice.wav',
      outMp4Path: '/tmp/out.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 5000,
      segments: keptSourceSegments(5000, []),
      punchIns: [],
    });
    expect(args).toContain('2:a:0');
    expect(args).not.toContain('[aout]');
  });

  it('property: always emits valid concat count matching kept segments', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3000, max: 30000 }),
        fc.array(
          fc.record({
            startMs: fc.integer({ min: 0, max: 25000 }),
            endMs: fc.integer({ min: 100, max: 30000 }),
            enabled: fc.boolean(),
          }),
          { maxLength: 6 },
        ),
        (dur, cuts) => {
          const segs = keptSourceSegments(dur, cuts);
          const args = buildVideoCompositeArgs({
            sourceVideoPath: '/tmp/s.mp4',
            overlayVideoPath: '/tmp/o.webm',
            voiceWavPath: '/tmp/v.wav',
            outMp4Path: '/tmp/out.mp4',
            width: 1280,
            height: 720,
            fps: 30,
            durationMs: Math.max(100, segs[segs.length - 1]?.timelineEndMs ?? dur),
            segments: segs,
            punchIns: [],
          });
          const graph = args[args.indexOf('-filter_complex') + 1]!;
          if (segs.length > 1) {
            expect(graph).toContain(`concat=n=${segs.length}:v=1:a=0[vbase]`);
          } else {
            expect(graph).toContain('[vseg0]null[vbase]');
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
