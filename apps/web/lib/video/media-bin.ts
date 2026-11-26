import {
  fallbackIndexClip,
  indexMediaClips,
  inferClipKind,
  type MediaIndexClipInput,
  type Router,
} from '@motionpop/ai';
import type { MediaClip, MediaClipKind } from '@motionpop/schemas';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import type { AudioStore } from '@/lib/audio/audio-store';
import { probeAndSampleVideo } from './frames';

export const MEDIA_BIN_ACCEPT =
  'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp,.mp4,.mov,.webm,.png,.jpg,.jpeg,.webp';

export const MAX_MEDIA_BIN_CLIPS = 24;
const MAX_CLIP_BYTES = 120 * 1024 * 1024;
const IMAGE_SAMPLE_MAX_SIDE = 640;

export interface ProbedMediaClip {
  clip: MediaClip;
  frames: { atMs: number; mimeType: 'image/jpeg' | 'image/png'; base64: string }[];
}

function newClipId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `clip-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function isSupportedMediaBinFile(file: Pick<File, 'name' | 'type' | 'size'>): boolean {
  if (file.size <= 0 || file.size > MAX_CLIP_BYTES) return false;
  if (file.type.startsWith('video/') || file.type.startsWith('image/')) return true;
  return /\.(mp4|mov|webm|png|jpe?g|webp)$/i.test(file.name);
}

export function guessMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function sampleImageBlob(
  blob: Blob,
): Promise<{ width: number; height: number; base64: string | null }> {
  if (typeof document === 'undefined') {
    return { width: 1280, height: 720, base64: null };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image'));
      el.src = url;
    });
    const width = Math.max(1, img.naturalWidth || 1280);
    const height = Math.max(1, img.naturalHeight || 720);
    const scale = Math.min(1, IMAGE_SAMPLE_MAX_SIDE / Math.max(width, height));
    const cw = Math.max(64, Math.round(width * scale));
    const ch = Math.max(64, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width, height, base64: null };
    ctx.drawImage(img, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const comma = dataUrl.indexOf(',');
    return { width, height, base64: comma > 0 ? dataUrl.slice(comma + 1) : null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Probes one uploaded B-roll video, screen recording, or screenshot blob and stores it in
 * `audioStore` (IndexedDB/Storage-backed) so it persists cleanly across reloads.
 */
export async function ingestMediaClipBlob(
  blob: Blob,
  meta: {
    name: string;
    mimeType?: string;
    projectId?: string;
    existingRef?: string;
    kindHint?: MediaClipKind;
  },
  store: AudioStore = appAudioStore(),
): Promise<ProbedMediaClip> {
  const mimeType = meta.mimeType || guessMimeType({ name: meta.name, type: blob.type });
  const isVideo = mimeType.startsWith('video/');
  const id = newClipId();
  const src =
    meta.existingRef ??
    (await store.put(
      blob,
      meta.projectId ? { projectId: meta.projectId, kind: 'voice' } : undefined,
    ));

  let width = 1920;
  let height = 1080;
  let durationMs: number | undefined;
  let frames: ProbedMediaClip['frames'] = [];

  if (isVideo) {
    try {
      const probe = await probeAndSampleVideo(blob, 4);
      width = probe.width;
      height = probe.height;
      durationMs = probe.durationMs;
      frames = probe.frames.map((f) => ({
        atMs: f.atMs,
        mimeType: 'image/jpeg' as const,
        base64: f.base64,
      }));
    } catch {
      durationMs = 5000;
    }
  } else {
    try {
      const sampled = await sampleImageBlob(blob);
      width = sampled.width;
      height = sampled.height;
      if (sampled.base64) {
        frames = [{ atMs: 0, mimeType: 'image/jpeg', base64: sampled.base64 }];
      }
    } catch {
      width = 1280;
      height = 720;
    }
  }

  const kind = meta.kindHint ?? inferClipKind(meta.name, mimeType);
  const clip: MediaClip = {
    id,
    name: meta.name.slice(0, 120),
    src,
    kind,
    mimeType,
    width,
    height,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
  return { clip, frames };
}

/**
 * Extracts keyframes for any unindexed clips in `mediaBin` and runs `media.index` (`gemini-4-neon`)
 * to enrich them with `kind`, `summary`, `tags`, `dominantColors`, and zoomable `moments`.
 */
export async function indexUnindexedMediaClips(
  clips: readonly MediaClip[],
  router: Router | null,
  opts?: {
    store?: AudioStore;
    preSampled?: ReadonlyMap<string, ProbedMediaClip['frames']>;
    /** Clips whose `kind` was explicitly chosen by the creator and must not be overwritten. */
    lockedKinds?: ReadonlyMap<string, MediaClipKind>;
    model?: string;
    now?: () => number;
  },
): Promise<{ clips: MediaClip[]; indexedCount: number; source: 'cloud' | 'fallback' }> {
  const store = opts?.store ?? appAudioStore();
  const now = opts?.now ?? Date.now;
  const toIndex = clips.filter((c) => !c.indexedAt);
  if (toIndex.length === 0) {
    return { clips: [...clips], indexedCount: 0, source: 'fallback' };
  }

  const inputs: MediaIndexClipInput[] = [];
  const fallbackOnly: MediaClip[] = [];

  for (const c of toIndex) {
    let frames = opts?.preSampled?.get(c.id);
    if (!frames || frames.length === 0) {
      const blob = await store.get(c.src).catch(() => null);
      if (blob) {
        if (c.mimeType.startsWith('video/')) {
          const probe = await probeAndSampleVideo(blob, 4).catch(() => null);
          if (probe?.frames.length) {
            frames = probe.frames.map((f) => ({
              atMs: f.atMs,
              mimeType: 'image/jpeg' as const,
              base64: f.base64,
            }));
          }
        } else {
          const sampled = await sampleImageBlob(blob).catch(() => null);
          if (sampled?.base64) {
            frames = [{ atMs: 0, mimeType: 'image/jpeg' as const, base64: sampled.base64 }];
          }
        }
      }
    }
    if (frames && frames.length > 0) {
      inputs.push({
        id: c.id,
        name: c.name,
        mimeType: c.mimeType,
        width: c.width,
        height: c.height,
        ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
        frames,
      });
    } else {
      fallbackOnly.push(c);
    }
  }

  const res =
    inputs.length > 0
      ? await indexMediaClips(router, inputs, opts?.model ? { model: opts.model } : undefined)
      : { results: [], source: 'fallback' as const };

  const byId = new Map(res.results.map((r) => [r.id, r]));
  for (const c of fallbackOnly) {
    byId.set(c.id, fallbackIndexClip(c));
  }

  const stamp = now();
  const updated = clips.map((c) => {
    const hit = byId.get(c.id);
    if (!hit) return c;
    return {
      ...c,
      kind: opts?.lockedKinds?.get(c.id) ?? hit.kind,
      summary: hit.summary,
      tags: hit.tags,
      dominantColors: hit.dominantColors,
      moments: hit.moments,
      indexedAt: stamp,
    };
  });

  return { clips: updated, indexedCount: byId.size, source: res.source };
}
