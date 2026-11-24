import { stockOverlayBoxFor, type StockOverlayLayout } from '@motionpop/schemas';
import { roundedCornerFilter } from './video-ffmpeg';

export interface ResolvedStockOverlay {
  id: string;
  path: string;
  isVideo: boolean;
  startMs: number;
  endMs: number;
  sourceOffsetMs: number;
  clipDurationMs?: number;
  layout: StockOverlayLayout;
  track: number;
}

export interface ResolvedStockAudio {
  id: string;
  path: string;
  kind: 'sfx' | 'music';
  startMs: number;
  endMs: number;
  sourceOffsetMs: number;
  volume: number;
  track: number;
}

export interface StockCompositeArgs {
  baseVideoPath: string;
  outMp4Path: string;
  /** Output container (`webm` preserves VP9 `yuva420p` alpha and encodes Opus audio; default `mp4`). */
  container?: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  overlays: readonly ResolvedStockOverlay[];
  audioClips: readonly ResolvedStockAudio[];
}

const sec = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(3);
const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Pure FFmpeg argument builder for post-compositing multi-lane `Stock Media` overlays and mixing
 * multi-lane `Stock Audio` clips onto any rendered base MP4 (motion, video, or reel, spec 45 R5.3).
 *
 * - Deduplicates repeated file inputs (e.g., split clips) and fans them out via `split` / `asplit`.
 * - Honors `sourceOffsetMs` on both visual and audio clips.
 * - Renders overlays in ascending `track` z-order using the shared `stockOverlayBoxFor` geometry
 *   with rounded corners applied at PTS=0 prior to timeline PTS shifting.
 * - Mixes SFX (with `apad` safety for split offsets) and looped music at exact linear `volume`
 *   using `amix=duration=first:dropout_transition=0:normalize=0`.
 */
export function buildStockCompositeArgs(args: StockCompositeArgs): string[] {
  const { width, height, fps, durationMs } = args;
  const validOverlays = args.overlays
    .filter((o) => o.endMs > o.startMs && o.startMs < durationMs)
    .map((o) => ({
      ...o,
      startMs: Math.max(0, Math.round(o.startMs)),
      endMs: Math.min(durationMs, Math.round(o.endMs)),
      sourceOffsetMs: Math.max(0, Math.round(o.sourceOffsetMs)),
    }))
    .filter((o) => o.endMs > o.startMs);

  const validAudio = args.audioClips
    .filter((a) => a.endMs > a.startMs && a.startMs < durationMs && a.volume > 0)
    .map((a) => ({
      ...a,
      startMs: Math.max(0, Math.round(a.startMs)),
      endMs: Math.min(durationMs, Math.round(a.endMs)),
      sourceOffsetMs: Math.max(0, Math.round(a.sourceOffsetMs)),
    }))
    .filter((a) => a.endMs > a.startMs);

  const isWebm = args.container === 'webm' || args.outMp4Path.toLowerCase().endsWith('.webm');
  const baseDecoderArgs =
    isWebm && validOverlays.length > 0 && args.baseVideoPath.toLowerCase().endsWith('.webm')
      ? ['-c:v', 'libvpx-vp9']
      : [];
  const inputs: string[] = [...baseDecoderArgs, '-i', args.baseVideoPath];
  const filters: string[] = [];
  let nextInputIdx = 1;

  // 1. Register deduplicated visual overlay inputs.
  const ovInputKey = (o: ResolvedStockOverlay) => `${o.isVideo ? 'v' : 'i'}:${o.path}`;
  const ovInputIdx = new Map<string, number>();
  const ovUsageCount = new Map<string, number>();
  for (const ov of validOverlays) {
    const key = ovInputKey(ov);
    ovUsageCount.set(key, (ovUsageCount.get(key) ?? 0) + 1);
    if (!ovInputIdx.has(key)) {
      if (ov.isVideo) inputs.push('-stream_loop', '-1', '-i', ov.path);
      else inputs.push('-loop', '1', '-i', ov.path);
      ovInputIdx.set(key, nextInputIdx++);
    }
  }

  const ovStreamPool = new Map<string, string[]>();
  for (const [key, idx] of ovInputIdx.entries()) {
    const count = ovUsageCount.get(key) ?? 1;
    if (count === 1) {
      ovStreamPool.set(key, [`${idx}:v`]);
    } else {
      const labels = Array.from({ length: count }, (_, k) => `sov_${idx}_${k}`);
      filters.push(`[${idx}:v]split=${count}${labels.map((l) => `[${l}]`).join('')}`);
      ovStreamPool.set(key, labels);
    }
  }

  // 2. Register deduplicated audio inputs.
  const auInputKey = (a: ResolvedStockAudio) => `${a.kind === 'music' ? 'loop' : 'once'}:${a.path}`;
  const auInputIdx = new Map<string, number>();
  const auUsageCount = new Map<string, number>();
  for (const au of validAudio) {
    const key = auInputKey(au);
    auUsageCount.set(key, (auUsageCount.get(key) ?? 0) + 1);
    if (!auInputIdx.has(key)) {
      if (au.kind === 'music') inputs.push('-stream_loop', '-1', '-i', au.path);
      else inputs.push('-i', au.path);
      auInputIdx.set(key, nextInputIdx++);
    }
  }

  const auStreamPool = new Map<string, string[]>();
  for (const [key, idx] of auInputIdx.entries()) {
    const count = auUsageCount.get(key) ?? 1;
    if (count === 1) {
      auStreamPool.set(key, [`${idx}:a`]);
    } else {
      const labels = Array.from({ length: count }, (_, k) => `sau_${idx}_${k}`);
      filters.push(`[${idx}:a]asplit=${count}${labels.map((l) => `[${l}]`).join('')}`);
      auStreamPool.set(key, labels);
    }
  }

  // 3. Build visual overlay chain (in ascending track z-order).
  let videoMap = '0:v:0';
  if (validOverlays.length > 0) {
    let cur = '0:v';
    const scaleFactor = Math.max(1, Math.min(width, height) / 720);

    validOverlays.forEach((ov, i) => {
      const rawStream = ovStreamPool.get(ovInputKey(ov))?.shift();
      if (!rawStream) return;

      const box = stockOverlayBoxFor(ov.layout);
      const bw = even(box.w * width);
      const bh = even(box.h * height);
      const bx = Math.max(0, Math.min(width - bw, Math.round(box.x * width)));
      const by = Math.max(0, Math.min(height - bh, Math.round(box.y * height)));
      const clipLenMs = Math.max(40, ov.endMs - ov.startMs);
      const effectiveOffsetMs =
        ov.isVideo && ov.clipDurationMs && ov.clipDurationMs > 0
          ? ov.sourceOffsetMs % ov.clipDurationMs
          : ov.sourceOffsetMs;

      const trimPart = ov.isVideo
        ? `setpts=PTS-STARTPTS,trim=start=${sec(effectiveOffsetMs)}:duration=${sec(clipLenMs)},setpts=PTS-STARTPTS,`
        : `trim=duration=${sec(clipLenMs)},setpts=PTS-STARTPTS,`;

      const radiusPx = box.radiusPx >= 4 ? Math.round(box.radiusPx * scaleFactor) : 0;
      const baseLabel = `sov_base_${i}`;
      const shiftedLabel = `sov_sh_${i}`;
      const nextCanvas = `sv_${i}`;

      filters.push(
        `[${rawStream}]${trimPart}fps=${fps},` +
          `scale=${bw}:${bh}:force_original_aspect_ratio=increase,` +
          `crop=${bw}:${bh},setsar=1[${baseLabel}]`,
      );

      if (radiusPx >= 4) {
        const maskedLabel = `sov_mask_${i}`;
        filters.push(
          roundedCornerFilter(baseLabel, maskedLabel, bw, bh, radiusPx, fps, `st${i}`),
          `[${maskedLabel}]setpts=PTS-STARTPTS+${sec(ov.startMs)}/TB[${shiftedLabel}]`,
        );
      } else {
        filters.push(`[${baseLabel}]setpts=PTS-STARTPTS+${sec(ov.startMs)}/TB[${shiftedLabel}]`);
      }

      filters.push(
        `[${cur}][${shiftedLabel}]overlay=${bx}:${by}:eof_action=pass:format=auto:enable='between(t,${sec(ov.startMs)},${sec(ov.endMs)})'[${nextCanvas}]`,
      );
      cur = nextCanvas;
    });

    filters.push(`[${cur}]format=${isWebm ? 'yuva420p' : 'yuv420p'}[vout]`);
    videoMap = '[vout]';
  }

  // 4. Build audio mix chain.
  let audioMap = '0:a:0';
  if (validAudio.length > 0) {
    filters.push(`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[abase]`);
    const mixLabels: string[] = ['[abase]'];

    validAudio.forEach((au, k) => {
      const rawStream = auStreamPool.get(auInputKey(au))?.shift();
      if (!rawStream) return;

      const clipLenMs = Math.max(40, au.endMs - au.startMs);
      const offsetMs = au.sourceOffsetMs;
      const delayMs = au.startMs;
      const vol = Math.max(0, Math.min(1.5, au.volume)).toFixed(3);
      // For one-shot SFX, pad silence up to offset+len so splits past natural SFX end never emit 0 frames.
      const padPart = au.kind === 'sfx' ? `apad=whole_dur=${sec(offsetMs + clipLenMs)},` : '';
      const delayPart = delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : '';

      filters.push(
        `[${rawStream}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `asetpts=PTS-STARTPTS,${padPart}atrim=start=${sec(offsetMs)}:duration=${sec(clipLenMs)},` +
          `asetpts=PTS-STARTPTS,volume=${vol}${delayPart}[sa${k}]`,
      );
      mixLabels.push(`[sa${k}]`);
    });

    filters.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`,
    );
    audioMap = '[aout]';
  }

  const videoCodecArgs =
    validOverlays.length > 0
      ? isWebm
        ? [
            '-c:v',
            'libvpx-vp9',
            '-pix_fmt',
            'yuva420p',
            '-auto-alt-ref',
            '0',
            '-crf',
            '24',
            '-b:v',
            '0',
            '-r',
            String(fps),
          ]
        : [
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
          ]
      : ['-c:v', 'copy'];

  const audioCodecArgs =
    validAudio.length > 0
      ? isWebm
        ? ['-c:a', 'libopus', '-b:a', '192k', '-ar', '48000']
        : ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000']
      : ['-c:a', 'copy'];

  return [
    '-loglevel',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    ...inputs,
    ...(filters.length > 0 ? ['-filter_complex', filters.join(';')] : []),
    '-map',
    videoMap,
    '-map',
    audioMap,
    ...videoCodecArgs,
    ...audioCodecArgs,
    ...(isWebm ? ['-metadata:s:v:0', 'alpha_mode=1'] : ['-movflags', '+faststart']),
    '-t',
    sec(durationMs),
    args.outMp4Path,
  ];
}
