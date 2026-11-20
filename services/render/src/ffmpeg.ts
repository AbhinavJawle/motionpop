// ffmpeg and ffprobe behind the `Ffmpeg` port. Arguments are passed as an array (no shell), and
// the probe JSON is parsed with zod before anything uses it.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Ffmpeg, MediaProbe } from './ports';
import { buildVideoCompositeArgs } from './video-ffmpeg';

const run = promisify(execFile);

const ProbeJson = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        nb_read_frames: z.string().optional(),
        nb_frames: z.string().optional(),
      }),
    )
    .default([]),
  format: z.object({ duration: z.string().optional() }).default({}),
});

/** Parses `ffprobe -print_format json -show_streams -show_format` output. Throws on bad JSON. */
export function parseProbe(json: string): MediaProbe {
  const j = ProbeJson.parse(JSON.parse(json));
  const video = j.streams.find((s) => s.codec_type === 'video');
  const seconds = Number(j.format.duration ?? 'NaN');
  const frameText = video?.nb_read_frames ?? video?.nb_frames;
  const frames = frameText !== undefined ? Number(frameText) : Number.NaN;
  return {
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0,
    audioStreams: j.streams.filter((s) => s.codec_type === 'audio').length,
    videoStreams: j.streams.filter((s) => s.codec_type === 'video').length,
    ...(video?.width !== undefined ? { width: video.width } : {}),
    ...(video?.height !== undefined ? { height: video.height } : {}),
    ...(Number.isFinite(frames) ? { frames } : {}),
  };
}

export interface ProcessFfmpegOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  /** Kills a stuck process (default 120 s). */
  timeoutMs?: number;
}

export function createProcessFfmpeg(opts: ProcessFfmpegOptions = {}): Ffmpeg {
  const ffmpeg = opts.ffmpegPath ?? process.env['FFMPEG_PATH'] ?? 'ffmpeg';
  const ffprobe = opts.ffprobePath ?? process.env['FFPROBE_PATH'] ?? 'ffprobe';
  const timeout = opts.timeoutMs ?? 120_000;
  return {
    async probe(file, o) {
      const { stdout } = await run(
        ffprobe,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file',
          ...(o?.inputFormat ? ['-f', o.inputFormat] : []),
          ...(o?.countFrames ? ['-count_frames'] : []),
          '-print_format',
          'json',
          '-show_streams',
          '-show_format',
          file,
        ],
        { timeout, maxBuffer: 8 * 1024 * 1024 },
      );
      return parseProbe(stdout);
    },
    async toWav(src, destWav, { maxMs, inputFormat }) {
      await run(
        ffmpeg,
        [
          '-loglevel',
          'error',
          '-y',
          '-protocol_whitelist',
          'file',
          ...(inputFormat ? ['-f', inputFormat] : []),
          '-i',
          src,
        ]
          .concat(['-map', '0:a:0', '-vn', '-sn', '-dn', '-t', (maxMs / 1000).toFixed(3)])
          .concat(['-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', destWav]),
        { timeout },
      );
    },
    async frame({ video, atMs, destJpg, longSide }) {
      await run(
        ffmpeg,
        [
          '-loglevel',
          'error',
          '-y',
          '-ss',
          (atMs / 1000).toFixed(3),
          '-i',
          video,
          '-frames:v',
          '1',
          '-vf',
          `scale='if(gt(iw,ih),${longSide},-2)':'if(gt(iw,ih),-2,${longSide})'`,
          '-q:v',
          '3',
          destJpg,
        ],
        { timeout },
      );
    },
    async compositeVideo(args) {
      await run(ffmpeg, buildVideoCompositeArgs(args), { timeout: timeout * 4 });
    },
  };
}
