import {
  stageBoxForMode,
  type KeptSegment,
  type VideoPunchIn,
  type VideoStageSegment,
} from '@motionpop/schemas';

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
  /** Coupled per-beat video choreography stages (spec 19 R5.2). */
  stages?: readonly VideoStageSegment[];
  /** Studio look background hex colour exposed during split/pip/cutaway beats. */
  bgColor?: string;
}

const sec = (ms: number): string => (ms / 1000).toFixed(3);
const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);
const ffHex = (hex: string | undefined): string => {
  const m = /^#([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  return m ? `0x${m[1]}` : '0x0E0E13';
};

/**
 * Pure FFmpeg argument builder for video projects (spec 18 R7.1, upgraded for stage choreography in
 * spec 19 R5.2):
 * 1. Trims and concatenates each kept source video segment (non-destructive cuts).
 * 2. Scales and center-crops the footage to exact output `width × height` at `fps` (30).
 * 3. Applies punch-in zoom windows on the cleaned timeline.
 * 4. Applies per-beat `VideoStageSegment` framing (`full`, `split-left`, `split-right`, `pip`,
 *    `backdrop` blur+dim, `cutaway`) over the look's studio background canvas when stages exist.
 * 5. Composites the transparent HyperFrames graphics + captions stream over the staged footage.
 * 6. Muxes cleaned voice (+ optional SFX/music bed) into H.264 + AAC 1080p/720p MP4.
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
        const cw = even(width / p.scale);
        const ch = even(height / p.scale);
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

  // 3b. Stage choreography (spec 19 R5.2): frame the speaker per beat on the look canvas.
  const validStages = (args.stages ?? []).filter((s) => s.endMs > s.startMs);
  const hasChoreography = validStages.some((s) => s.mode !== 'full');
  let stagedLabel = 'vzoom';
  if (hasChoreography) {
    const visibleStages = validStages.filter((s) => s.mode !== 'cutaway');
    filters.push(
      `color=c=${ffHex(args.bgColor)}:s=${width}x${height}:r=${fps}:d=${sec(args.durationMs)}[vbg]`,
    );
    if (visibleStages.length === 0) {
      filters.push(`[vzoom]nullsink`);
      stagedLabel = 'vbg';
    } else {
      const splitOut = visibleStages.map((_, i) => `[vsrc${i}]`).join('');
      if (visibleStages.length === 1) {
        filters.push(`[vzoom]null[vsrc0]`);
      } else {
        filters.push(`[vzoom]split=${visibleStages.length}${splitOut}`);
      }
      let canvas = 'vbg';
      visibleStages.forEach((s, i) => {
        const next = i === visibleStages.length - 1 ? 'vstaged' : `vst${i}`;
        const box = stageBoxForMode(s.mode, width, height, s.pipCorner);
        const bw = even(box.w * width);
        const bh = even(box.h * height);
        const bx = Math.max(0, Math.min(width - bw, Math.round(box.x * width)));
        const by = Math.max(0, Math.min(height - bh, Math.round(box.y * height)));
        const fx = Math.max(0, Math.min(1, s.focusX));
        const fy = Math.max(0, Math.min(1, s.focusY));

        let stageFilter: string;
        if (s.mode === 'backdrop') {
          stageFilter = `[vsrc${i}]boxblur=10:2,eq=brightness=-0.24:contrast=0.92[vlay${i}]`;
        } else if (s.mode === 'full') {
          stageFilter = `[vsrc${i}]null[vlay${i}]`;
        } else {
          // Scale with cover aspect ratio and crop around the speaker's (focusX, focusY).
          const cropX = `max(0\\,min(iw-${bw}\\,round(iw*${fx.toFixed(3)}-${bw}/2)))`;
          const cropY = `max(0\\,min(ih-${bh}\\,round(ih*${fy.toFixed(3)}-${bh}/2)))`;
          stageFilter =
            `[vsrc${i}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,` +
            `crop=${bw}:${bh}:${cropX}:${cropY}[vlay${i}]`;
        }
        filters.push(
          `${stageFilter};` +
            `[${canvas}][vlay${i}]overlay=${bx}:${by}:enable='between(t,${sec(s.startMs)},${sec(s.endMs)})'[${next}]`,
        );
        canvas = next;
      });
      stagedLabel = 'vstaged';
    }
  }

  // 4. Composite HyperFrames transparent overlay stream (input 1) onto staged video -> [vout].
  filters.push(
    `[1:v]fps=${fps},scale=${width}:${height},format=rgba[vovl]`,
    `[${stagedLabel}][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]`,
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
