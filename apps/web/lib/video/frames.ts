import type { Format } from '@motionpop/schemas';

export interface VideoSampledFrame {
  atMs: number;
  base64: string;
}

export interface VideoProbeResult {
  width: number;
  height: number;
  durationMs: number;
  format: Format;
  frames: VideoSampledFrame[];
}

/** Pick the Motionpop canvas format that fits a recording's natural dimensions. */
export function formatForVideo(width: number, height: number): Format {
  if (height > width * 1.2) return '9:16';
  if (width > height * 1.2) return '16:9';
  return '1:1';
}

const FRAME_MAX_WIDTH = 480;
const FRAME_JPEG_QUALITY = 0.7;

function seekVideo(v: HTMLVideoElement, sec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('seek failed'));
    };
    const cleanup = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onError);
    };
    v.addEventListener('seeked', onSeeked, { once: true });
    v.addEventListener('error', onError, { once: true });
    v.currentTime = sec;
  });
}

/**
 * Browser-only video probe + evenly spaced JPEG keyframe sampler (spec 18 R4.1).
 * Never throws on canvas failure: if frame capture is blocked, it still returns valid dimensions
 * and duration with `frames: []`.
 */
export async function probeAndSampleVideo(file: Blob, maxFrames = 6): Promise<VideoProbeResult> {
  if (typeof document === 'undefined') {
    throw new Error('Video probing requires a browser');
  }
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error('Could not read the uploaded video'));
      v.src = url;
    });
    const width = Math.max(1, v.videoWidth || 1920);
    const height = Math.max(1, v.videoHeight || 1080);
    const durationMs = Math.max(
      1000,
      Math.round((Number.isFinite(v.duration) ? v.duration : 1) * 1000),
    );
    const format = formatForVideo(width, height);
    const frames: VideoSampledFrame[] = [];

    const count = Math.max(0, Math.min(maxFrames, Math.floor(durationMs / 1500) || 1));
    const scale = Math.min(1, FRAME_MAX_WIDTH / width);
    const cw = Math.max(64, Math.round(width * scale));
    const ch = Math.max(64, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    if (ctx && count > 0) {
      for (let i = 0; i < count; i++) {
        const frac = (i + 0.5) / count;
        const atMs = Math.round(durationMs * frac);
        try {
          await seekVideo(v, Math.max(0.05, Math.min(v.duration - 0.05, atMs / 1000)));
          ctx.drawImage(v, 0, 0, cw, ch);
          const dataUrl = canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY);
          const comma = dataUrl.indexOf(',');
          if (comma > 0) {
            frames.push({ atMs, base64: dataUrl.slice(comma + 1) });
          }
        } catch {
          // Skip frames that fail to decode in headless/restricted codecs.
        }
      }
    }

    return { width, height, durationMs, format, frames };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
