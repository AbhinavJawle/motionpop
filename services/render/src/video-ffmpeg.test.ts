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
    const ovlIdx = args.indexOf('/tmp/overlay.webm');
    expect(args.slice(ovlIdx - 3, ovlIdx + 1)).toEqual(['-c:v', 'libvpx-vp9', '-i', '/tmp/overlay.webm']);
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

  it('builds stage choreography filter graph for split-left, pip, backdrop and cutaway beats', () => {
    const args = buildVideoCompositeArgs({
      sourceVideoPath: '/tmp/source.mp4',
      overlayVideoPath: '/tmp/overlay.webm',
      voiceWavPath: '/tmp/voice.wav',
      outMp4Path: '/tmp/out.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 9000,
      segments: keptSourceSegments(9000, []),
      punchIns: [],
      bgColor: '#FAF8F5',
      stages: [
        { id: 's1', startMs: 0, endMs: 2500, mode: 'full', focusX: 0.5, focusY: 0.35, scaleFrom: 1, scaleTo: 1.05 },
        { id: 's2', startMs: 2500, endMs: 5000, mode: 'split-left', focusX: 0.48, focusY: 0.35, scaleFrom: 1, scaleTo: 1.04 },
        { id: 's3', startMs: 5000, endMs: 7000, mode: 'backdrop', focusX: 0.5, focusY: 0.35, scaleFrom: 1.04, scaleTo: 1.08 },
        { id: 's4', startMs: 7000, endMs: 9000, mode: 'cutaway', focusX: 0.5, focusY: 0.35, scaleFrom: 1, scaleTo: 1 },
      ],
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('color=c=0xFAF8F5:s=1280x720');
    expect(graph).toContain('alphamerge=shortest=1');
    expect(graph).toContain('boxblur=10:2');
    expect(graph).toContain('[vstaged][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]');
  });

  it('builds arched top-corner alpha mask for split-top-stage and full-bleed top-card/clean (spec 23)', () => {
    const args = buildVideoCompositeArgs({
      sourceVideoPath: '/tmp/source.mp4',
      overlayVideoPath: '/tmp/overlay.webm',
      voiceWavPath: '/tmp/voice.wav',
      outMp4Path: '/tmp/out.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 9000,
      segments: keptSourceSegments(9000, []),
      punchIns: [],
      bgColor: '#EDE8DF',
      stages: [
        { id: 's1', startMs: 0, endMs: 3000, mode: 'split-top-stage', focusX: 0.5, focusY: 0.35, scaleFrom: 1, scaleTo: 1.04 },
        { id: 's2', startMs: 3000, endMs: 6000, mode: 'top-card', focusX: 0.5, focusY: 0.35, scaleFrom: 1, scaleTo: 1.03 },
        { id: 's3', startMs: 6000, endMs: 9000, mode: 'clean', focusX: 0.5, focusY: 0.35, scaleFrom: 1, scaleTo: 1.08 },
      ],
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('color=c=0xEDE8DF:s=1080x1920');
    expect(graph).toContain('alphamerge=shortest=1');
    // Top-only arched mask uses lt(Y,R) without bottom corner cutoffs
    expect(graph).toContain('lt(Y,78)');
    expect(graph).toContain('[vstaged][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]');
  });

  it('composites multi-clip Media Bin videos and screenshots for screen-showcase, split-top-broll, broll-full and media-card-pop (spec 21)', () => {
    const args = buildVideoCompositeArgs({
      sourceVideoPath: '/tmp/aroll.mp4',
      overlayVideoPath: '/tmp/overlay.webm',
      voiceWavPath: '/tmp/voice.wav',
      outMp4Path: '/tmp/out.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 12_000,
      segments: keptSourceSegments(12_000, []),
      punchIns: [],
      bgColor: '#0B0C12',
      mediaClips: {
        'clip-screen': { path: '/tmp/screen.mp4', isVideo: true, durationMs: 8000 },
        'clip-broll': { path: '/tmp/broll.mp4', isVideo: true, durationMs: 6000 },
        'clip-shot': { path: '/tmp/shot.png', isVideo: false },
      },
      stages: [
        {
          id: 's1',
          startMs: 0,
          endMs: 3000,
          mode: 'split-top-broll',
          focusX: 0.5,
          focusY: 0.35,
          scaleFrom: 1,
          scaleTo: 1.04,
          clipId: 'clip-broll',
          clipStartMs: 500,
        },
        {
          id: 's2',
          startMs: 3000,
          endMs: 6500,
          mode: 'screen-showcase',
          focusX: 0.5,
          focusY: 0.35,
          scaleFrom: 1,
          scaleTo: 1.03,
          clipId: 'clip-screen',
          clipStartMs: 1000,
          clipFocusX: 0.72,
          clipFocusY: 0.32,
          clipZoom: 1.6,
        },
        {
          id: 's3',
          startMs: 6500,
          endMs: 9500,
          mode: 'broll-full',
          focusX: 0.5,
          focusY: 0.35,
          scaleFrom: 1,
          scaleTo: 1.04,
          clipId: 'clip-broll',
          clipStartMs: 1500,
        },
        {
          id: 's4',
          startMs: 9500,
          endMs: 12_000,
          mode: 'media-card-pop',
          focusX: 0.5,
          focusY: 0.35,
          scaleFrom: 1,
          scaleTo: 1.02,
          clipId: 'clip-shot',
        },
      ],
    });
    expect(args).toContain('/tmp/screen.mp4');
    expect(args).toContain('/tmp/broll.mp4');
    expect(args).toContain('/tmp/shot.png');
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    // B-roll clip used twice gets split cleanly into 2 streams
    expect(graph).toContain('split=2[mc_');
    // Screen-showcase adds crisp window border box
    expect(graph).toContain('drawbox=x=0:y=0:w=iw:h=ih');
    expect(graph).toContain('[vstaged][vovl]');
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
