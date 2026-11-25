// ffmpeg and ffprobe behind the `Ffmpeg` port. Arguments are passed as an array (no shell), and
// the probe JSON is parsed with zod before anything uses it.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Ffmpeg, MediaProbe } from './ports';
import { buildVideoCompositeArgs } from './video-ffmpeg';
import { buildStockCompositeArgs } from './stock-ffmpeg';

const run = promisify(execFile);

const ProbeJson = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        codec_name: z.string().optional(),
        pix_fmt: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        nb_read_frames: z.string().optional(),
        nb_frames: z.string().optional(),
        tags: z.record(z.string(), z.string()).optional(),
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
  const alphaTag = video?.tags?.['alpha_mode'] ?? video?.tags?.['ALPHA_MODE'];
  const alphaMode = alphaTag === '1' || video?.pix_fmt === 'yuva420p';
  return {
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0,
    audioStreams: j.streams.filter((s) => s.codec_type === 'audio').length,
    videoStreams: j.streams.filter((s) => s.codec_type === 'video').length,
    ...(video?.width !== undefined ? { width: video.width } : {}),
    ...(video?.height !== undefined ? { height: video.height } : {}),
    ...(Number.isFinite(frames) ? { frames } : {}),
    ...(video?.codec_name ? { codecName: video.codec_name } : {}),
    ...(video?.pix_fmt ? { pixFmt: video.pix_fmt } : {}),
    ...(alphaMode ? { alphaMode: true } : {}),
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
        { timeout, maxBuffer: 16 * 1024 * 1024 },
      );
    },
    async frame({ video, atMs, destJpg, longSide }) {
      const isWebm = video.toLowerCase().endsWith('.webm');
      const scaleFilter = `scale='if(gt(iw,ih),${longSide},-2)':'if(gt(iw,ih),-2,${longSide})'`;
      await run(
        ffmpeg,
        [
          '-loglevel',
          'error',
          '-y',
          '-protocol_whitelist',
          'file',
          '-ss',
          (atMs / 1000).toFixed(3),
          ...(isWebm ? ['-c:v', 'libvpx-vp9'] : []),
          '-i',
          video,
          '-frames:v',
          '1',
          '-vf',
          isWebm ? `${scaleFilter},format=rgba,premultiply=inplace=1,format=yuvj420p` : scaleFilter,
          '-q:v',
          '3',
          destJpg,
        ],
        { timeout, maxBuffer: 16 * 1024 * 1024 },
      );
    },
    async compositeVideo(args) {
      await run(ffmpeg, buildVideoCompositeArgs(args), {
        timeout: timeout * 15,
        maxBuffer: 16 * 1024 * 1024,
      });
    },
    async compositeStockLayers(args) {
      await run(ffmpeg, buildStockCompositeArgs(args), {
        timeout: timeout * 15,
        maxBuffer: 16 * 1024 * 1024,
      });
    },
    async normalizeLoudness({ src, dest, lufs, truePeakDb }) {
      const isWebm = dest.toLowerCase().endsWith('.webm');
      const target = `I=${lufs}:TP=${truePeakDb}:LRA=11`;
      const { stderr } = await run(
        ffmpeg,
        [
          '-hide_banner',
          '-nostats',
          '-protocol_whitelist',
          'file',
          '-i',
          src,
          '-map',
          '0:a:0',
          '-af',
          `loudnorm=${target}:print_format=json`,
          '-f',
          'null',
          '-',
        ],
        { timeout: timeout * 2, maxBuffer: 16 * 1024 * 1024 },
      );
      const m = parseLoudnorm(stderr);
      // Silence (or an unreadable measurement) keeps the audio as it is.
      if (!m) throw new Error('loudness could not be measured');
      const filter = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
      await run(
        ffmpeg,
        [
          '-y',
          '-hide_banner',
          '-nostats',
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'file',
          '-i',
          src,
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0',
          '-c:v',
          'copy',
          '-af',
          filter,
          ...(isWebm
            ? ['-metadata:s:v:0', 'alpha_mode=1', '-c:a', 'libopus', '-b:a', '192k']
            : ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']),
          dest,
        ],
        { timeout: timeout * 4, maxBuffer: 16 * 1024 * 1024 },
      );
    },
    async proxyVideo({ src, dest, longSide }) {
      const fit = `min(1\\,${longSide}/max(iw\\,ih))`;
      const srcDemuxer = demuxerForMedia(src);
      await run(
        ffmpeg,
        [
          '-loglevel',
          'error',
          '-y',
          '-protocol_whitelist',
          'file',
          ...(srcDemuxer ? ['-f', srcDemuxer] : []),
          '-i',
          src,
          '-map',
          '0:v:0',
          // Reel speaker clips play their own audio (data-has-audio), so the first audio stream
          // stays, re-encoded so PCM/ALAC phone audio fits the MP4.
          '-map',
          '0:a:0?',
          '-sn',
          '-dn',
          '-vf',
          `scale=w='trunc(${fit}*iw/2)*2':h='trunc(${fit}*ih/2)*2',format=yuv420p`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-c:a',
          'aac',
          '-b:a',
          '256k',
          '-ar',
          '48000',
          '-movflags',
          '+faststart',
          dest,
        ],
        // Twenty minutes of 4K footage takes a while even at veryfast.
        { timeout: timeout * 10 },
      );
    },
  };
}

/**
 * Forces the ffmpeg demuxer from a trusted storage/local extension so crafted playlists or
 * `concat` scripts renamed to `.mp4`/`.png`/`.mp3` cannot auto-detect and read other local files.
 */
export function demuxerForMedia(path: string, opts?: { isImage?: boolean }): string | undefined {
  if (opts?.isImage) return 'image2';
  const dot = path.lastIndexOf('.');
  if (dot < 0) return undefined;
  const ext = path.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    mp4: 'mov',
    mov: 'mov',
    m4a: 'mov',
    webm: 'matroska',
    mp3: 'mp3',
    wav: 'wav',
    ogg: 'ogg',
    png: 'image2',
    jpg: 'image2',
    jpeg: 'image2',
    webp: 'image2',
  };
  return map[ext];
}

export interface LoudnormMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** The first-pass `loudnorm` JSON from ffmpeg's log, or null when it is missing or silent. */
export function parseLoudnorm(log: string): LoudnormMeasure | null {
  const start = log.lastIndexOf('{');
  const end = log.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(log.slice(start, end + 1)) as Record<string, unknown>;
    const keys = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const;
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = Number(j[k]);
      if (!Number.isFinite(v)) return null;
      out[k] = String(v);
    }
    return out as unknown as LoudnormMeasure;
  } catch {
    return null;
  }
}
