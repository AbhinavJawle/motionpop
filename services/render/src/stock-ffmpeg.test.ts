import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fixtureProject, statPunchSlot } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProcessFfmpeg } from './ffmpeg';
import { runRender } from './run-render';
import { buildStockCompositeArgs, type StockCompositeArgs } from './stock-ffmpeg';
import { OWNER, makeHarness } from './testing/harness';

const execFileAsync = promisify(execFile);
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

describe('buildStockCompositeArgs (spec 45 R5.3)', () => {
  it('deduplicates split clip files, applies rounded corners at PTS=0 before timeline shift, and mixes audio with apad + amix', () => {
    const args = buildStockCompositeArgs({
      baseVideoPath: '/tmp/base.mp4',
      outMp4Path: '/tmp/out.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 8000,
      overlays: [
        {
          id: 'ov-1a',
          path: '/tmp/broll.mp4',
          isVideo: true,
          startMs: 0,
          endMs: 2500,
          sourceOffsetMs: 0,
          clipDurationMs: 6000,
          layout: 'full',
          track: 0,
        },
        {
          id: 'ov-1b',
          path: '/tmp/broll.mp4',
          isVideo: true,
          startMs: 3000,
          endMs: 5500,
          sourceOffsetMs: 2500,
          clipDurationMs: 6000,
          layout: 'card',
          track: 0,
        },
        {
          id: 'ov-2',
          path: '/tmp/photo.png',
          isVideo: false,
          startMs: 1000,
          endMs: 4000,
          sourceOffsetMs: 0,
          layout: 'pip',
          track: 1,
        },
      ],
      audioClips: [
        {
          id: 'sa-1a',
          path: '/tmp/whoosh.mp3',
          kind: 'sfx',
          startMs: 500,
          endMs: 1500,
          sourceOffsetMs: 0,
          volume: 0.9,
          track: 0,
        },
        {
          id: 'sa-1b',
          path: '/tmp/whoosh.mp3',
          kind: 'sfx',
          startMs: 4000,
          endMs: 5000,
          sourceOffsetMs: 1000,
          volume: 1.1,
          track: 0,
        },
        {
          id: 'sa-2',
          path: '/tmp/music.mp3',
          kind: 'music',
          startMs: 0,
          endMs: 8000,
          sourceOffsetMs: 2000,
          volume: 0.28,
          track: 1,
        },
      ],
    });

    // Deduplicated inputs: /tmp/broll.mp4 appears once, /tmp/whoosh.mp3 appears once, with forced demuxers.
    expect(args.filter((a) => a === '/tmp/broll.mp4')).toHaveLength(1);
    expect(args.filter((a) => a === '/tmp/whoosh.mp3')).toHaveLength(1);
    expect(args[args.indexOf('/tmp/broll.mp4') - 5]).toBe('-f');
    expect(args[args.indexOf('/tmp/broll.mp4') - 4]).toBe('mov');
    expect(args[args.indexOf('/tmp/photo.png') - 5]).toBe('-f');
    expect(args[args.indexOf('/tmp/photo.png') - 4]).toBe('image2');
    expect(args[args.indexOf('/tmp/whoosh.mp3') - 3]).toBe('-f');
    expect(args[args.indexOf('/tmp/whoosh.mp3') - 2]).toBe('mp3');
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('[1:v]split=2[sov_1_0][sov_1_1]');
    expect(graph).toContain('[3:a]asplit=2[sau_3_0][sau_3_1]');
    // Split right half trims from sourceOffsetMs=2.500 and shifts PTS to 3.000 after rounded mask
    expect(graph).toContain('trim=start=2.500:duration=2.500');
    expect(graph).toContain(
      'alphamerge=shortest=1[sov_mask_1];[sov_mask_1]setpts=PTS-STARTPTS+3.000/TB',
    );
    expect(graph).toContain("enable='between(t,3.000,5.500)'");
    // SFX uses apad + adelay + amix normalize=0
    expect(graph).toContain('apad=whole_dur=2.000,atrim=start=1.000:duration=1.000');
    expect(graph).toContain('adelay=4000|4000');
    expect(graph).toContain('amix=inputs=4:duration=first:dropout_transition=0:normalize=0[aout]');
    expect(args).toContain('[vout]');
    expect(args).toContain('[aout]');
  });

  it('handles silent base videos (hasBaseAudio: false) without mapping missing 0:a:0 (H7)', () => {
    const overlayOnly = buildStockCompositeArgs({
      baseVideoPath: '/tmp/silent.mp4',
      outMp4Path: '/tmp/out.mp4',
      hasBaseAudio: false,
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000,
      overlays: [
        {
          id: 'ov-1',
          path: '/tmp/photo.png',
          isVideo: false,
          startMs: 0,
          endMs: 2000,
          sourceOffsetMs: 0,
          layout: 'card',
          track: 0,
        },
      ],
      audioClips: [],
    });
    expect(overlayOnly).not.toContain('0:a:0');

    const withStockAudio = buildStockCompositeArgs({
      baseVideoPath: '/tmp/silent.mp4',
      outMp4Path: '/tmp/out.mp4',
      hasBaseAudio: false,
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000,
      overlays: [],
      audioClips: [
        {
          id: 'sa-1',
          path: '/tmp/whoosh.mp3',
          kind: 'sfx',
          startMs: 500,
          endMs: 1500,
          sourceOffsetMs: 0,
          volume: 0.9,
          track: 0,
        },
      ],
    });
    const graph = withStockAudio[withStockAudio.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('anullsrc=r=48000:cl=stereo');
    expect(graph).not.toContain('[0:a]');
    expect(withStockAudio).toContain('[aout]');
  });

  it('uses stream copy for untouched video (audio-only stock) or untouched audio (video-only stock)', () => {
    const audioOnly = buildStockCompositeArgs({
      baseVideoPath: '/tmp/base.mp4',
      outMp4Path: '/tmp/out.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 5000,
      overlays: [],
      audioClips: [
        {
          id: 's1',
          path: '/tmp/sfx.wav',
          kind: 'sfx',
          startMs: 500,
          endMs: 1200,
          sourceOffsetMs: 0,
          volume: 0.9,
          track: 0,
        },
      ],
    });
    expect(audioOnly.slice(audioOnly.indexOf('-c:v'), audioOnly.indexOf('-c:v') + 2)).toEqual([
      '-c:v',
      'copy',
    ]);
    expect(audioOnly).toContain('[aout]');

    const videoOnly = buildStockCompositeArgs({
      baseVideoPath: '/tmp/base.mp4',
      outMp4Path: '/tmp/out.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 5000,
      overlays: [
        {
          id: 'o1',
          path: '/tmp/pic.jpg',
          isVideo: false,
          startMs: 500,
          endMs: 2500,
          sourceOffsetMs: 0,
          layout: 'card',
          track: 0,
        },
      ],
      audioClips: [],
    });
    expect(videoOnly.slice(videoOnly.indexOf('-c:a'), videoOnly.indexOf('-c:a') + 2)).toEqual([
      '-c:a',
      'copy',
    ]);
    expect(videoOnly).toContain('[vout]');

    // Transparent WebM mode preserves VP9 yuva420p alpha and encodes Opus audio (spec 47).
    const webmOverlays = buildStockCompositeArgs({
      baseVideoPath: '/tmp/base.webm',
      outMp4Path: '/tmp/out.webm',
      container: 'webm',
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000,
      overlays: [
        {
          id: 'p1',
          path: '/tmp/p1.png',
          isVideo: false,
          startMs: 0,
          endMs: 2000,
          sourceOffsetMs: 0,
          layout: 'card',
          track: 0,
        },
      ],
      audioClips: [
        {
          id: 'a1',
          path: '/tmp/sfx.wav',
          kind: 'sfx',
          startMs: 200,
          endMs: 1000,
          sourceOffsetMs: 0,
          volume: 1,
          track: 0,
        },
      ],
    });
    expect(webmOverlays.indexOf('-c:v')).toBeLessThan(webmOverlays.indexOf('/tmp/base.webm'));
    expect(webmOverlays).toContain('yuva420p');
    expect(webmOverlays).toContain('-auto-alt-ref');
    expect(webmOverlays).toContain('libopus');
    expect(webmOverlays).toContain('alpha_mode=1');
    expect(webmOverlays).not.toContain('-movflags');
    expect(webmOverlays[webmOverlays.indexOf('-filter_complex') + 1]).toContain('format=yuva420p');

    const webmAudioOnly = buildStockCompositeArgs({
      baseVideoPath: '/tmp/base.webm',
      outMp4Path: '/tmp/out.webm',
      container: 'webm',
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000,
      overlays: [],
      audioClips: [
        {
          id: 'a1',
          path: '/tmp/sfx.wav',
          kind: 'sfx',
          startMs: 200,
          endMs: 1000,
          sourceOffsetMs: 0,
          volume: 1,
          track: 0,
        },
      ],
    });
    expect(
      webmAudioOnly.slice(webmAudioOnly.indexOf('-c:v'), webmAudioOnly.indexOf('-c:v') + 2),
    ).toEqual(['-c:v', 'copy']);
    expect(webmAudioOnly).toContain('libopus');
    expect(webmAudioOnly).toContain('alpha_mode=1');
    expect(webmAudioOnly).not.toContain('-movflags');
  });

  it('property: generates balanced split/asplit filter chains for arbitrary multi-lane clip sets', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            path: fc.constantFrom('/tmp/v1.mp4', '/tmp/v2.mp4', '/tmp/p1.png'),
            isVideo: fc.boolean(),
            startMs: fc.integer({ min: 0, max: 6000 }),
            spanMs: fc.integer({ min: 250, max: 3000 }),
            sourceOffsetMs: fc.integer({ min: 0, max: 4000 }),
            layout: fc.constantFrom(
              'card' as const,
              'full' as const,
              'top' as const,
              'pip' as const,
            ),
            track: fc.integer({ min: 0, max: 3 }),
          }),
          { minLength: 0, maxLength: 6 },
        ),
        fc.array(
          fc.record({
            id: fc.uuid(),
            path: fc.constantFrom('/tmp/a1.mp3', '/tmp/a2.wav'),
            kind: fc.constantFrom('sfx' as const, 'music' as const),
            startMs: fc.integer({ min: 0, max: 6000 }),
            spanMs: fc.integer({ min: 250, max: 3000 }),
            sourceOffsetMs: fc.integer({ min: 0, max: 4000 }),
            volume: fc.double({ min: 0.1, max: 1.5, noNaN: true }),
            track: fc.integer({ min: 0, max: 3 }),
          }),
          { minLength: 0, maxLength: 6 },
        ),
        (rawOv, rawAu) => {
          const overlays = rawOv.map((o) => ({
            id: o.id,
            path: o.path,
            isVideo: o.path.endsWith('.mp4'),
            startMs: o.startMs,
            endMs: o.startMs + o.spanMs,
            sourceOffsetMs: o.sourceOffsetMs,
            layout: o.layout,
            track: o.track,
          }));
          const audioClips = rawAu.map((a) => ({
            id: a.id,
            path: a.path,
            kind: a.kind,
            startMs: a.startMs,
            endMs: a.startMs + a.spanMs,
            sourceOffsetMs: a.sourceOffsetMs,
            volume: a.volume,
            track: a.track,
          }));
          const args = buildStockCompositeArgs({
            baseVideoPath: '/tmp/base.mp4',
            outMp4Path: '/tmp/out.mp4',
            width: 1280,
            height: 720,
            fps: 30,
            durationMs: 10_000,
            overlays,
            audioClips,
          });
          expect(args[args.length - 1]).toBe('/tmp/out.mp4');
          if (overlays.length > 0) expect(args).toContain('[vout]');
          if (audioClips.length > 0) expect(args).toContain('[aout]');
        },
      ),
      { numRuns: 40 },
    );
  });

  it.skipIf(!HAS_FFMPEG)(
    'real FFmpeg integration: composites split multi-lane video + photo overlays and split SFX + music into valid MP4',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'mp-stock-ff-'));
      try {
        const baseMp4 = join(dir, 'base.mp4');
        const stockVid = join(dir, 'stock.mp4');
        const stockImg = join(dir, 'badge.png');
        const stockSfx = join(dir, 'sfx.wav');
        const stockMusic = join(dir, 'music.wav');
        const outMp4 = join(dir, 'out.mp4');

        // Create tiny synthetic media fixtures with FFmpeg.
        await Promise.all([
          execFileAsync('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=0x111118:s=640x360:r=30:d=3',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=220:sample_rate=48000:duration=3',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            baseMp4,
          ]),
          execFileAsync('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=size=320x180:rate=30:duration=2',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            stockVid,
          ]),
          execFileAsync('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=0x3DDC97:s=240x160:d=1',
            '-frames:v',
            '1',
            stockImg,
          ]),
          execFileAsync('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=880:sample_rate=48000:duration=0.6',
            stockSfx,
          ]),
          execFileAsync('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=330:sample_rate=48000:duration=1.2',
            stockMusic,
          ]),
        ]);

        const ff = createProcessFfmpeg();
        await ff.compositeStockLayers!({
          baseVideoPath: baseMp4,
          outMp4Path: outMp4,
          width: 640,
          height: 360,
          fps: 30,
          durationMs: 3000,
          overlays: [
            {
              id: 'v1a',
              path: stockVid,
              isVideo: true,
              startMs: 0,
              endMs: 1200,
              sourceOffsetMs: 0,
              clipDurationMs: 2000,
              layout: 'full',
              track: 0,
            },
            {
              id: 'v1b',
              path: stockVid,
              isVideo: true,
              startMs: 1500,
              endMs: 2800,
              sourceOffsetMs: 1200,
              clipDurationMs: 2000,
              layout: 'card',
              track: 0,
            },
            {
              id: 'p2',
              path: stockImg,
              isVideo: false,
              startMs: 500,
              endMs: 2200,
              sourceOffsetMs: 0,
              layout: 'pip',
              track: 1,
            },
          ],
          audioClips: [
            {
              id: 'sfx1a',
              path: stockSfx,
              kind: 'sfx',
              startMs: 300,
              endMs: 900,
              sourceOffsetMs: 0,
              volume: 0.9,
              track: 0,
            },
            // Split right half whose sourceOffsetMs is past the 0.6s SFX natural end (tests apad safety!)
            {
              id: 'sfx1b',
              path: stockSfx,
              kind: 'sfx',
              startMs: 1500,
              endMs: 2100,
              sourceOffsetMs: 800,
              volume: 0.8,
              track: 0,
            },
            {
              id: 'm1',
              path: stockMusic,
              kind: 'music',
              startMs: 0,
              endMs: 3000,
              sourceOffsetMs: 400,
              volume: 0.25,
              track: 1,
            },
          ],
        });

        const probe = await ff.probe(outMp4, { countFrames: true });
        expect(probe.videoStreams).toBe(1);
        expect(probe.audioStreams).toBe(1);
        expect(probe.width).toBe(640);
        expect(probe.height).toBe(360);
        expect(probe.durationMs).toBeGreaterThanOrEqual(2850);
        expect(probe.durationMs).toBeLessThanOrEqual(3150);

        // Also verify real FFmpeg audio-only (-c:v copy) and video-only (-c:a copy) paths!
        const audioOnlyOut = join(dir, 'out-audio-only.mp4');
        await ff.compositeStockLayers!({
          baseVideoPath: baseMp4,
          outMp4Path: audioOnlyOut,
          width: 640,
          height: 360,
          fps: 30,
          durationMs: 3000,
          overlays: [],
          audioClips: [
            {
              id: 'm2',
              path: stockMusic,
              kind: 'music',
              startMs: 200,
              endMs: 2800,
              sourceOffsetMs: 300,
              volume: 0.3,
              track: 0,
            },
          ],
        });
        const aoProbe = await ff.probe(audioOnlyOut);
        expect(aoProbe.videoStreams).toBe(1);
        expect(aoProbe.audioStreams).toBe(1);

        const videoOnlyOut = join(dir, 'out-video-only.mp4');
        await ff.compositeStockLayers!({
          baseVideoPath: baseMp4,
          outMp4Path: videoOnlyOut,
          width: 640,
          height: 360,
          fps: 30,
          durationMs: 3000,
          overlays: [
            {
              id: 'p-only',
              path: stockImg,
              isVideo: false,
              startMs: 300,
              endMs: 2000,
              sourceOffsetMs: 0,
              layout: 'top',
              track: 0,
            },
          ],
          audioClips: [],
        });
        const voProbe = await ff.probe(videoOnlyOut);
        expect(voProbe.videoStreams).toBe(1);
        expect(voProbe.audioStreams).toBe(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

describe('runRender: multi-lane stock export parity (spec 45 R5.3)', () => {
  it('downloads visible stock overlays and audible stock audio, skips hidden/muted lanes and foreign paths, and composites before probe', async () => {
    const base = fixtureProject({ slots: [statPunchSlot('a', 0, 3000)], durationMs: 6000 });
    const project = EditorProjectSchema.parse({
      ...base,
      stockMediaLanes: [{ index: 0 }, { index: 1, hidden: true }, { index: 2 }],
      stockAudioLanes: [{ index: 0 }, { index: 1, muted: true }],
      stockOverlays: [
        {
          id: 'ov-vis-2',
          name: 'Top Badge',
          src: 'idb:p1',
          kind: 'photo',
          mimeType: 'image/png',
          startMs: 500,
          endMs: 2500,
          track: 2,
          layout: 'pip',
          provider: 'upload',
        },
        {
          id: 'ov-hidden',
          name: 'Hidden Layer',
          src: 'idb:p2',
          kind: 'photo',
          mimeType: 'image/png',
          startMs: 0,
          endMs: 3000,
          track: 1,
          layout: 'card',
          provider: 'upload',
        },
        {
          id: 'ov-vis-0',
          name: 'Base Clip',
          src: 'idb:v1',
          kind: 'video',
          mimeType: 'video/mp4',
          startMs: 0,
          endMs: 4000,
          sourceOffsetMs: 1200,
          track: 0,
          layout: 'full',
          provider: 'pixabay',
        },
      ],
      stockAudio: [
        {
          id: 'au-ok',
          name: 'Whoosh',
          src: 'idb:s1',
          kind: 'sfx',
          mimeType: 'audio/mpeg',
          startMs: 1000,
          endMs: 2000,
          sourceOffsetMs: 250,
          volume: 0.9,
          track: 0,
        },
        {
          id: 'au-muted',
          name: 'Muted Bed',
          src: 'idb:s2',
          kind: 'music',
          mimeType: 'audio/mpeg',
          startMs: 0,
          endMs: 6000,
          volume: 0.3,
          track: 1,
        },
      ],
    });

    const ov0Path = `users/${OWNER}/video/${project.id}/stock-ov-0000000000000001.mp4`;
    const ov2Path = `users/${OWNER}/video/${project.id}/stock-ov-0000000000000002.png`;
    const ovHiddenPath = `users/${OWNER}/video/${project.id}/stock-ov-0000000000000003.png`;
    const auOkPath = `users/${OWNER}/audio/${project.id}/stock-au-0000000000000004.mp3`;
    const auMutedPath = `users/${OWNER}/audio/${project.id}/stock-au-0000000000000005.mp3`;

    const h = await makeHarness({
      project,
      doc: {
        stockOverlayPaths: {
          'ov-vis-0': ov0Path,
          'ov-vis-2': ov2Path,
          'ov-hidden': ovHiddenPath,
        },
        stockAudioPaths: {
          'au-ok': auOkPath,
          'au-muted': auMutedPath,
        },
      },
    });
    await h.blobs.put(ov0Path, 'fake video');
    await h.blobs.put(ov2Path, 'fake png');
    await h.blobs.put(ovHiddenPath, 'should never be composited');
    await h.blobs.put(auOkPath, 'fake mp3');
    await h.blobs.put(auMutedPath, 'should never be mixed');

    let captured: StockCompositeArgs | null = null;
    h.deps.ffmpeg = {
      ...h.deps.ffmpeg,
      compositeStockLayers: async (args) => {
        captured = args;
        await writeFile(args.outMp4Path, 'composited mp4 bytes');
      },
    };

    expect(await runRender(h.renderId, h.deps)).toBe('done');
    expect(captured).not.toBeNull();
    // Sorted in ascending lane order: ov-vis-0 (track 0) before ov-vis-2 (track 2); hidden excluded!
    expect(
      captured!.overlays.map((o) => ({ id: o.id, track: o.track, offset: o.sourceOffsetMs })),
    ).toEqual([
      { id: 'ov-vis-0', track: 0, offset: 1200 },
      { id: 'ov-vis-2', track: 2, offset: 0 },
    ]);
    // Muted audio lane excluded!
    expect(captured!.audioClips.map((a) => ({ id: a.id, offset: a.sourceOffsetMs }))).toEqual([
      { id: 'au-ok', offset: 250 },
    ]);
  });

  it.skipIf(!HAS_FFMPEG)(
    'real FFmpeg integration: preserves VP9 alpha_mode=1 and pixel alpha=0 when compositing stock overlay + SFX onto transparent WebM (spec 47)',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'mp-stock-webm-'));
      try {
        const baseWebm = join(dir, 'base.webm');
        const ovPng = join(dir, 'ov.png');
        const sfxWav = join(dir, 'sfx.wav');
        const outWebm = join(dir, 'out.webm');

        const mkBase = spawnSync('ffmpeg', [
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=black@0.0:s=320x180:r=30:d=1,format=rgba',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1',
          '-c:v',
          'libvpx-vp9',
          '-pix_fmt',
          'yuva420p',
          '-auto-alt-ref',
          '0',
          '-c:a',
          'libopus',
          baseWebm,
        ]);
        expect(mkBase.status).toBe(0);

        const mkPng = spawnSync('ffmpeg', [
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=red:s=160x160:d=0.1',
          '-frames:v',
          '1',
          ovPng,
        ]);
        expect(mkPng.status).toBe(0);

        const mkSfx = spawnSync('ffmpeg', [
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=880:duration=0.4',
          sfxWav,
        ]);
        expect(mkSfx.status).toBe(0);

        const args = buildStockCompositeArgs({
          baseVideoPath: baseWebm,
          outMp4Path: outWebm,
          container: 'webm',
          width: 320,
          height: 180,
          fps: 30,
          durationMs: 1000,
          overlays: [
            {
              id: 'ov1',
              path: ovPng,
              isVideo: false,
              startMs: 0,
              endMs: 1000,
              sourceOffsetMs: 0,
              layout: 'card',
              track: 0,
            },
          ],
          audioClips: [
            {
              id: 'au1',
              path: sfxWav,
              kind: 'sfx',
              startMs: 100,
              endMs: 500,
              sourceOffsetMs: 0,
              volume: 0.8,
              track: 0,
            },
          ],
        });
        const comp = spawnSync('ffmpeg', args);
        expect(comp.status).toBe(0);

        const probed = spawnSync('ffprobe', [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_streams',
          outWebm,
        ]);
        expect(probed.status).toBe(0);
        const streams = (
          JSON.parse(probed.stdout.toString('utf8')) as {
            streams: Array<{
              codec_type: string;
              codec_name?: string;
              tags?: Record<string, string>;
            }>;
          }
        ).streams;
        const vStream = streams.find((s) => s.codec_type === 'video');
        const aStream = streams.find((s) => s.codec_type === 'audio');
        expect(vStream?.codec_name).toBe('vp9');
        expect(vStream?.tags?.['alpha_mode'] ?? vStream?.tags?.['ALPHA_MODE']).toBe('1');
        expect(aStream?.codec_name).toBe('opus');

        // Corner (0, 0) outside the 'card' overlay box must remain fully transparent (alpha === 0).
        const corner = spawnSync('ffmpeg', [
          '-loglevel',
          'error',
          '-c:v',
          'libvpx-vp9',
          '-i',
          outWebm,
          '-frames:v',
          '1',
          '-vf',
          'format=rgba,crop=1:1:0:0',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-',
        ]);
        expect(corner.status).toBe(0);
        expect(corner.stdout[3]).toBe(0);

        // Center (160, 90) inside the red 'card' overlay must be opaque (alpha === 255).
        const center = spawnSync('ffmpeg', [
          '-loglevel',
          'error',
          '-c:v',
          'libvpx-vp9',
          '-i',
          outWebm,
          '-frames:v',
          '1',
          '-vf',
          'format=rgba,crop=1:1:160:90',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-',
        ]);
        expect(center.status).toBe(0);
        expect(center.stdout[3]).toBe(255);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
