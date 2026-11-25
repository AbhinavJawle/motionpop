import {
  clampSpeakerFocusY,
  mediaBoxForMode,
  stageBoxForMode,
  type KeptSegment,
  type VideoPunchIn,
  type VideoStageSegment,
} from '@motionpop/schemas';
import { demuxerForMedia } from './ffmpeg';

export interface CompositeMediaClip {
  path: string;
  isVideo: boolean;
  durationMs?: number;
}

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
  /** Coupled per-beat video choreography stages (spec 19 R5.2 + spec 21 R5.2). */
  stages?: readonly VideoStageSegment[];
  /** Local files for Media Bin clips referenced by `stages[].clipId` (spec 21 R5.2). */
  mediaClips?: Readonly<Record<string, CompositeMediaClip>>;
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
 * Generates a fast 1-frame looped rounded-rectangle alpha mask and merges it onto `[inLabel]`,
 * producing `[outLabel]` with crisp rounded corners (matching browser preview `borderRadius`).
 * When `topOnly` is true, only the top two corners are arched (`split-top-stage`, spec 23).
 */
export function roundedCornerFilter(
  inLabel: string,
  outLabel: string,
  bw: number,
  bh: number,
  radiusPx: number,
  fps: number,
  maskId: string,
  topOnly = false,
): string {
  const r = Math.max(4, Math.min(Math.round(radiusPx), Math.floor(Math.min(bw, bh) / 2) - 1));
  const m = `rmask_${maskId}`;
  const fg = `rfg_${maskId}`;
  const expr = topOnly
    ? `if(lt(Y,${r})*gt(abs(W/2-X),W/2-${r}),if(lte(hypot(${r}-(W/2-abs(W/2-X)),${r}-Y),${r}),255,0),255)`
    : `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),if(lte(hypot(${r}-(W/2-abs(W/2-X)),${r}-(H/2-abs(H/2-Y))),${r}),255,0),255)`;
  return (
    `[${inLabel}]format=rgba[${fg}];` +
    `color=c=black:s=${bw}x${bh}:r=${fps}:d=0.05,format=gray,` +
    `geq=lum='${expr}',` +
    `loop=-1:size=1:start=0[${m}];` +
    `[${fg}][${m}]alphamerge=shortest=1[${outLabel}]`
  );
}

/**
 * Pure FFmpeg argument builder for video projects (spec 18 R7.1, spec 19 R5.2, spec 21 R5.2):
 * 1. Trims and concatenates each kept source video segment (non-destructive cuts).
 * 2. Scales and center-crops the A-roll footage to exact output `width × height` at `fps` (30).
 * 3. Applies punch-in zoom windows on the cleaned timeline.
 * 4. Applies per-beat `VideoStageSegment` framing for all 10 choreography modes (`full`,
 *    `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`, `split-top-broll`,
 *    `screen-showcase`, `broll-full`, `media-card-pop`) — compositing A-roll AND any bound
 *    Media Bin clips (B-roll videos, zoomed framed screen recordings, and screenshots) in the
 *    exact preview z-order over the studio look canvas.
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

  // Base inputs: 0 = A-roll source video, 1 = transparent overlay WebM, 2 = cleaned voice WAV,
  // optional 3 = mixed SFX/music bed WAV, followed by any unique referenced Media Bin clips.
  // Note: FFmpeg's default native `vp9` decoder drops alpha (`yuva420p`); passing `-c:v libvpx-vp9`
  // before a `.webm` overlay preserves true transparency during compositing.
  const overlayDecoderArgs = args.overlayVideoPath.toLowerCase().endsWith('.webm')
    ? ['-c:v', 'libvpx-vp9']
    : [];
  const srcDemuxer = demuxerForMedia(args.sourceVideoPath);
  const inputs: string[] = [
    ...(srcDemuxer ? ['-f', srcDemuxer] : []),
    '-i',
    args.sourceVideoPath,
    ...overlayDecoderArgs,
    '-i',
    args.overlayVideoPath,
    '-i',
    args.voiceWavPath,
  ];
  let nextInputIndex = 3;
  let audioMap = '2:a:0';
  if (args.bedWavPath) {
    inputs.push('-i', args.bedWavPath);
    filters.push(`[2:a][${nextInputIndex}:a]amix=inputs=2:duration=first:normalize=0[aout]`);
    audioMap = '[aout]';
    nextInputIndex++;
  }

  // Register unique Media Bin clips used by any valid stage.
  const validStages = (args.stages ?? []).filter((s) => s.endMs > s.startMs);
  const clipInputIdx = new Map<string, { idx: number; clip: CompositeMediaClip }>();
  const clipUsageCount = new Map<string, number>();
  for (const s of validStages) {
    if (!s.clipId || !args.mediaClips?.[s.clipId]) continue;
    if (!mediaBoxForMode(s.mode, width, height)) continue;
    clipUsageCount.set(s.clipId, (clipUsageCount.get(s.clipId) ?? 0) + 1);
    if (!clipInputIdx.has(s.clipId)) {
      const clip = args.mediaClips[s.clipId]!;
      if (clip.isVideo) {
        const d = demuxerForMedia(clip.path);
        inputs.push(...(d ? ['-f', d] : []), '-stream_loop', '-1', '-i', clip.path);
      } else {
        inputs.push('-f', 'image2', '-loop', '1', '-i', clip.path);
      }
      clipInputIdx.set(s.clipId, { idx: nextInputIndex, clip });
      nextInputIndex++;
    }
  }

  // Split any Media Bin clip input referenced by multiple beats so each beat gets its own stream.
  const clipStreamPool = new Map<string, string[]>();
  for (const [clipId, info] of clipInputIdx.entries()) {
    const count = clipUsageCount.get(clipId) ?? 1;
    if (count === 1) {
      clipStreamPool.set(clipId, [`${info.idx}:v`]);
    } else {
      const labels = Array.from({ length: count }, (_, k) => `mc_${info.idx}_${k}`);
      filters.push(`[${info.idx}:v]split=${count}${labels.map((l) => `[${l}]`).join('')}`);
      clipStreamPool.set(clipId, labels);
    }
  }

  // 1. Trim + normalize each kept segment from input 0 (A-roll source video).
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
    const segInputs = segs.map((_, i) => `[vseg${i}]`).join('');
    filters.push(`${segInputs}concat=n=${segs.length}:v=1:a=0[vbase]`);
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

  // 3b. Stage choreography (spec 19 + spec 21 multi-clip compositing): frame A-roll & Media Bin
  // clips per beat over the look canvas in exact preview z-order.
  const hasChoreography = validStages.some((s) => s.mode !== 'full');
  let stagedLabel = 'vzoom';
  if (hasChoreography) {
    const aRollStages = validStages.filter((s) => s.mode !== 'cutaway' && s.mode !== 'broll-full');
    filters.push(
      `color=c=${ffHex(args.bgColor)}:s=${width}x${height}:r=${fps}:d=${sec(args.durationMs)}[vbg]`,
    );

    const aRollLabelFor = new Map<VideoStageSegment, string>();
    if (aRollStages.length === 0) {
      filters.push(`[vzoom]nullsink`);
    } else if (aRollStages.length === 1) {
      filters.push(`[vzoom]null[vsrc0]`);
      aRollLabelFor.set(aRollStages[0]!, 'vsrc0');
    } else {
      const splitOut = aRollStages.map((_, i) => `[vsrc${i}]`).join('');
      filters.push(`[vzoom]split=${aRollStages.length}${splitOut}`);
      aRollStages.forEach((s, i) => aRollLabelFor.set(s, `vsrc${i}`));
    }

    let canvas = 'vbg';
    let stepIdx = 0;

    const overlayARoll = (s: VideoStageSegment) => {
      const srcLabel = aRollLabelFor.get(s);
      if (!srcLabel) return;
      const lay = `vlay${stepIdx}`;
      const next = `vst${stepIdx}`;
      stepIdx++;
      const box = stageBoxForMode(s.mode, width, height, s.pipCorner);
      const bw = even(box.w * width);
      const bh = even(box.h * height);
      const bx = Math.max(0, Math.min(width - bw, Math.round(box.x * width)));
      const by = Math.max(0, Math.min(height - bh, Math.round(box.y * height)));
      const fx = Math.max(0, Math.min(1, s.focusX));
      const fy = clampSpeakerFocusY(s.focusY);

      let stageFilter: string;
      const shortSide = Math.min(width, height);
      const radiusPx = box.radiusFrac > 0 ? Math.round(box.radiusFrac * shortSide) : 0;
      if (s.mode === 'backdrop') {
        stageFilter = `[${srcLabel}]boxblur=10:2,eq=brightness=-0.24:contrast=0.92[${lay}]`;
      } else if (s.mode === 'media-card-pop' && height > width) {
        stageFilter = `[${srcLabel}]boxblur=2:1,eq=brightness=-0.10[${lay}]`;
      } else if (s.mode === 'full' || s.mode === 'top-card' || s.mode === 'clean') {
        stageFilter = `[${srcLabel}]null[${lay}]`;
      } else {
        const cropX = `max(0\\,min(iw-${bw}\\,round(iw*${fx.toFixed(3)}-${bw}/2)))`;
        const cropY = `max(0\\,min(ih-${bh}\\,round(ih*${fy.toFixed(3)}-${bh}/2)))`;
        const croppedLabel = radiusPx >= 4 ? `vcrop${stepIdx}` : lay;
        const baseCrop =
          `[${srcLabel}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,` +
          `crop=${bw}:${bh}:${cropX}:${cropY}[${croppedLabel}]`;
        stageFilter =
          radiusPx >= 4
            ? `${baseCrop};${roundedCornerFilter(croppedLabel, lay, bw, bh, radiusPx, fps, `a${stepIdx}`, Boolean(box.topRadiusOnly))}`
            : baseCrop;
      }
      filters.push(
        `${stageFilter};` +
          `[${canvas}][${lay}]overlay=${bx}:${by}:enable='between(t,${sec(s.startMs)},${sec(s.endMs)})'[${next}]`,
      );
      canvas = next;
    };

    const overlayMediaClip = (s: VideoStageSegment) => {
      if (!s.clipId) return;
      const pool = clipStreamPool.get(s.clipId);
      const info = clipInputIdx.get(s.clipId);
      const mBox = mediaBoxForMode(s.mode, width, height);
      if (!pool || pool.length === 0 || !info || !mBox) return;
      const rawStream = pool.shift()!;
      const lay = `mlay${stepIdx}`;
      const next = `vst${stepIdx}`;
      stepIdx++;

      const bw = even(mBox.w * width);
      const bh = even(mBox.h * height);
      const bx = Math.max(0, Math.min(width - bw, Math.round(mBox.x * width)));
      const by = Math.max(0, Math.min(height - bh, Math.round(mBox.y * height)));
      const fx = Math.max(0.1, Math.min(0.9, s.clipFocusX ?? 0.5));
      const fy = Math.max(0.1, Math.min(0.9, s.clipFocusY ?? 0.45));
      const zoom = Math.max(
        1,
        Math.min(2.2, s.clipZoom ?? (s.mode === 'screen-showcase' ? 1.4 : 1.0)),
      );

      // Zoomed scale dimensions before cropping around (fx, fy)
      const zw = even(bw * zoom);
      const zh = even(bh * zoom);
      const cropX = `max(0\\,min(iw-${bw}\\,round(iw*${fx.toFixed(3)}-${bw}/2)))`;
      const cropY = `max(0\\,min(ih-${bh}\\,round(ih*${fy.toFixed(3)}-${bh}/2)))`;

      const beatDurSec = sec(s.endMs - s.startMs);
      const rawClipStartMs = s.clipStartMs ?? 0;
      const wrappedStartMs =
        info.clip.isVideo && info.clip.durationMs && info.clip.durationMs > 0
          ? rawClipStartMs % info.clip.durationMs
          : rawClipStartMs;
      const clipStartSec = sec(wrappedStartMs);
      // Keep PTS at 0 until after roundedCornerFilter so alphamerge aligns with the PTS=0 mask.
      const trimPart = info.clip.isVideo
        ? `trim=start=${clipStartSec}:duration=${beatDurSec},setpts=PTS-STARTPTS,`
        : `trim=duration=${beatDurSec},setpts=PTS-STARTPTS,`;

      const borderPad = mBox.framed ? `,drawbox=x=0:y=0:w=iw:h=ih:color=0x262938@0.9:t=4` : '';
      const radiusPx =
        mBox.radiusFrac > 0 ? Math.round(mBox.radiusFrac * Math.min(width, height)) : 0;
      const rawLay = radiusPx >= 4 ? `mraw${stepIdx}` : `mpre${stepIdx}`;
      const maskLay = `mmask${stepIdx}`;
      const mediaPrep =
        `[${rawStream}]${trimPart}fps=${fps},` +
        `scale=${zw}:${zh}:force_original_aspect_ratio=increase,` +
        `crop=${bw}:${bh}:${cropX}:${cropY},setsar=1${borderPad}[${rawLay}]`;
      const mediaFinal =
        radiusPx >= 4
          ? `${mediaPrep};${roundedCornerFilter(rawLay, maskLay, bw, bh, radiusPx, fps, `m${stepIdx}`)};[${maskLay}]setpts=PTS-STARTPTS+${sec(s.startMs)}/TB[${lay}]`
          : `${mediaPrep};[${rawLay}]setpts=PTS-STARTPTS+${sec(s.startMs)}/TB[${lay}]`;

      filters.push(
        `${mediaFinal};` +
          `[${canvas}][${lay}]overlay=${bx}:${by}:eof_action=pass:enable='between(t,${sec(s.startMs)},${sec(s.endMs)})'[${next}]`,
      );
      canvas = next;
    };

    for (const s of validStages) {
      if (s.mode === 'screen-showcase') {
        // Screen window sits BEHIND the speaker PiP bubble.
        overlayMediaClip(s);
        overlayARoll(s);
      } else {
        // A-roll first, then B-roll / media card pop cleanly on top (or side-by-side).
        overlayARoll(s);
        overlayMediaClip(s);
      }
    }
    if (canvas === 'vbg') {
      stagedLabel = 'vbg';
    } else {
      filters.push(`[${canvas}]null[vstaged]`);
      stagedLabel = 'vstaged';
    }
  }

  // 4. Composite HyperFrames transparent overlay stream (input 1) onto staged video -> [vout].
  filters.push(
    `[1:v]fps=${fps},scale=${width}:${height},format=rgba[vovl]`,
    `[${stagedLabel}][vovl]overlay=0:0:shortest=1:format=auto,format=yuv420p[vout]`,
  );

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
