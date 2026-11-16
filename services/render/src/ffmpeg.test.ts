import { spawnSync } from 'node:child_process';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProcessFfmpeg, parseProbe } from './ffmpeg';
import { demuxerFor } from './run-render';

const ff = process.env['FFMPEG_PATH'] ?? 'ffmpeg';
const hasFfmpeg =
  spawnSync(ff, ['-version']).status === 0 &&
  spawnSync(process.env['FFPROBE_PATH'] ?? 'ffprobe', ['-version']).status === 0;

describe('parseProbe', () => {
  it('reads streams, size, frames and duration', () => {
    const p = parseProbe(
      JSON.stringify({
        streams: [
          { codec_type: 'video', width: 1920, height: 1080, nb_read_frames: '540' },
          { codec_type: 'audio' },
        ],
        format: { duration: '18.000000' },
      }),
    );
    expect(p).toEqual({
      durationMs: 18000,
      audioStreams: 1,
      videoStreams: 1,
      width: 1920,
      height: 1080,
      frames: 540,
    });
  });

  it('copes with no duration (a browser recording) and no video', () => {
    const p = parseProbe(JSON.stringify({ streams: [{ codec_type: 'audio' }], format: {} }));
    expect(p).toEqual({ durationMs: 0, audioStreams: 1, videoStreams: 0 });
  });

  it('throws on anything that is not probe JSON', () => {
    expect(() => parseProbe('not json')).toThrow();
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: 5 }] }))).toThrow();
  });
});

describe.skipIf(!hasFfmpeg)('createProcessFfmpeg (needs ffmpeg and ffprobe)', () => {
  const ffmpeg = createProcessFfmpeg();
  const run = (...args: string[]) => spawnSync(ff, ['-loglevel', 'error', '-y', ...args]);

  it('probes, forces a demuxer and re-encodes each accepted voice format to WAV', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-ffmpeg-'));
    for (const ext of ['wav', 'mp3', 'm4a', 'webm', 'ogg']) {
      const src = join(dir, `voice.${ext}`);
      const made = run('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', src);
      if (made.status !== 0) continue; // this ffmpeg build lacks the encoder
      const inputFormat = demuxerFor(`voice-0123456789abcdef.${ext}`);
      const probe = await ffmpeg.probe(src, { inputFormat });
      expect(probe.audioStreams, ext).toBe(1);
      const wav = join(dir, `out-${ext}.wav`);
      await ffmpeg.toWav(src, wav, { maxMs: 60_000, inputFormat });
      const out = await ffmpeg.probe(wav);
      expect(out.audioStreams, ext).toBe(1);
      expect(Math.abs(out.durationMs - 2000), ext).toBeLessThan(150);
    }
  });

  it('cuts a long voice at maxMs so a small upload cannot expand', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-ffmpeg-'));
    const src = join(dir, 'long.wav');
    run('-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-ar', '8000', src);
    const wav = join(dir, 'cut.wav');
    await ffmpeg.toWav(src, wav, { maxMs: 3000, inputFormat: 'wav' });
    const out = await ffmpeg.probe(wav);
    expect(out.durationMs).toBeGreaterThan(2800);
    expect(out.durationMs).toBeLessThan(3200);
  });

  it('does not follow a playlist or concat file renamed to .wav', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-ffmpeg-'));
    const real = join(dir, 'real.wav');
    run('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', real);
    const evil = join(dir, 'evil.wav');
    await writeFile(evil, `ffconcat version 1.0\nfile '${real}'\n`);
    await expect(ffmpeg.probe(evil, { inputFormat: 'wav' })).rejects.toThrow();
    await expect(
      ffmpeg.toWav(evil, join(dir, 'x.wav'), { maxMs: 5000, inputFormat: 'wav' }),
    ).rejects.toThrow();
  });

  it('refuses a file that is not media', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-ffmpeg-'));
    const txt = join(dir, 'a.wav');
    await writeFile(txt, 'hello, this is not audio');
    await expect(ffmpeg.probe(txt, { inputFormat: 'wav' })).rejects.toThrow();
  });

  it('counts frames and takes a JPEG at the long side', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-ffmpeg-'));
    const video = join(dir, 'v.mp4');
    run('-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=2', '-pix_fmt', 'yuv420p', video);
    const probe = await ffmpeg.probe(video, { countFrames: true });
    expect(probe).toMatchObject({ width: 640, height: 360, frames: 60, videoStreams: 1 });
    const jpg = join(dir, 't.jpg');
    await ffmpeg.frame({ video, atMs: 1000, destJpg: jpg, longSide: 320 });
    expect((await stat(jpg)).size).toBeGreaterThan(100);
    const thumb = await ffmpeg.probe(jpg);
    expect(thumb).toMatchObject({ width: 320, height: 180 });
  });
});
