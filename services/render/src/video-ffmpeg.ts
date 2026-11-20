import type { KeptSegment, VideoPunchIn } from '@motionpop/schemas';

export interface VideoCompositeArgs {
  sourceVideoPath: string;
  overlayVideoPath: string;
  voiceWavPath: string;
  bedWavPath?: string;
  outMp4Path: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  segments: readonly KeptSegment[];
  punchIns: readonly VideoPunchIn[];
}

const sec = (ms: number): string => (ms / 1000).toFixed(3);

/**
 * Pure FFmpeg argument builder for video projects (spec 18 R7.1):
 * 1. Trims and concatenates each kept source video segment (non-destructive cuts).
 * 2. Scales and center-crops the footage to exact output `width × height` at `fps` (30).
 * 3. Applies punch-in zoom expressions cleanly on active cleaned-timeline windows.
 * 4. Composites the transparent HyperFrames graphics + captions stream over the footage.
 * 5. Muxes cleaned voice (+ optional SFX/music bed) into H.264 + AAC 1080p/720p MP4.
 */
export function buildVideoCompositeArgs(args: VideoCompositeArgs): string[] {
  const { width, height, fps } = args;
  const segs: readonly KeptSegment[] =
    args.segments.length > 0
      ? args.segments
      : [
          {
            startMs: 0,
            endMs: Math.max(100, args.durationMs),
            timelineStartMs: 0,
            timelineEndMs: Math.max(100, args.durationMs),
          },
        ];

  const filters: string[] = [];

  // 1. Trim + normalize each kept segment from input 0 (source video).
  segs.forEach((s, i) => {
    filters.push(
      `[0:v]trim=start=${sec(s.startMs)}:end=${sec(s.endMs)},setpts=PTS-STARTPTS,` +
        `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1[vseg${i}]`,
    );
  });

  // 2. Concatenate kept segments into [vbase].
  if (segs.length === 1) {
    filters.push(`[vseg0]null[vbase]`);
  } else {
    const inputs = segs.map((_, i) => `[vseg${i}]`).join('');
    filters.push(`${inputs}concat=n=${segs.length}:v=1:a=0[vbase]`);
  }

  // 3. Apply punch-in zoom windows on the cleaned timeline (if any) into [vzoom].
  // Each punch-in crops around (focusX, focusY) and scales back to W×H during its active window.
  if (args.punchIns.length === 0) {
    filters.push(`[vbase]null[vzoom]`);
  } else {
    const valid = args.punchIns.filter((p) => p.endMs > p.startMs && p.scale > 1.01);
    if (valid.length === 0) {
      filters.push(`[vbase]null[vzoom]`);
    } else {
      let cur = 'vbase';
      valid.forEach((p, i) => {
        const next = i === valid.length - 1 ? 'vzoom' : `vz${i}`;
        const cw = Math.max(2, Math.floor(width / p.scale / 2) * 2);
        const ch = Math.max(2, Math.floor(height / p.scale / 2) * 2);
        const cx = Math.max(0, Math.min(width - cw, Math.round(p.focusX * width - cw / 2)));
        const cy = Math.max(0, Math.min(height - ch, Math.round(p.focusY * height - ch / 2)));
        filters.push(
          `[${cur}]split=2[va${i}][vb${i}];` +
            `[vb${i}]crop=${cw}:${ch}:${cx}:${cy},scale=${width}:${height}[vzcrop${i}];` +
            `[va${i}][vzcrop${i}]overlay=0:0:enable='between(t,${sec(p.startMs)},${sec(p.endMs)})'[${next}]`,
        );
        cur = next;
      });
    }
  }

  // 4. Composite HyperFrames transparent overlay stream (input 1) onto [vzoom] -> [vout].
  filters.push(
    `[1:v]fps=${fps},scale=${width}:${height},format=rgba[vovl]`,
    `[vzoom][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]`,
  );

  // 5. Audio: input 2 is cleaned voice WAV; optional input 3 is mixed SFX/music bed WAV.
  const inputs: string[] = [
    '-i',
    args.sourceVideoPath,
    '-i',
    args.overlayVideoPath,
    '-i',
    args.voiceWavPath,
  ];
  let audioMap = '2:a:0';
  if (args.bedWavPath) {
    inputs.push('-i', args.bedWavPath);
    filters.push(`[2:a][3:a]amix=inputs=2:duration=first:normalize=0[aout]`);
    audioMap = '[aout]';
  }

  return [
    '-loglevel',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    audioMap,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    sec(args.durationMs),
    args.outMp4Path,
  ];
}
