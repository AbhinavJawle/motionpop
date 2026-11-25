import {
  DEFAULT_IMAGE_RECIPE,
  ImageSubjectSchema,
  generateImageWithFirebase,
  generateImageWithGeminiByok,
} from '@motionpop/ai';
import { getByokKey } from '@/lib/ai/byok';
import {
  APP_CONFIG_DEFAULTS,
  type Format,
  type ImageAsset,
  type Look,
  type MediaClip,
} from '@motionpop/schemas';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { getAILogic } from '@/lib/firebase/client';
import { putImage } from '@/lib/images/image-store';
import { processImage, sha256Hex } from '@/lib/images/process';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import type { StockMediaItem } from '@/app/api/media/stock/route';

/**
 * Fetches a license-free external stock video or photo via `/api/media/stock` (Pixabay when
 * `PIXABAY_API_KEY` is configured, falling back to Pexels or zero-key Wikimedia Commons), proxies
 * it cleanly into local IndexedDB (`appAudioStore`), and returns a ready `MediaClip` for Media Bin
 * preview + FFmpeg export (spec 23 R6.1).
 */
export async function fetchStockMediaClip(
  query: string,
  opts: { format: Format; preferVideo?: boolean; clipId?: string },
): Promise<MediaClip | null> {
  if (typeof window === 'undefined') return null;
  const q = query.trim();
  if (!q) return null;
  const orientation =
    opts.format === '9:16' ? 'portrait' : opts.format === '16:9' ? 'landscape' : 'square';
  const kind = opts.preferVideo === false ? 'photo' : 'video';

  try {
    const auth = getAuthSnapshot();
    const headers =
      auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
    const searchRes = await fetch(
      `/api/media/stock?q=${encodeURIComponent(q)}&kind=${kind}&orientation=${orientation}&limit=3`,
      headers ? { headers } : undefined,
    );
    if (!searchRes.ok) return null;
    const payload = (await searchRes.json()) as { items?: StockMediaItem[] };
    const hit = payload.items?.[0];
    if (!hit) return null;

    const blobRes = await fetch(
      `/api/media/stock?proxy=${encodeURIComponent(hit.url)}`,
      headers ? { headers } : undefined,
    );
    if (!blobRes.ok) return null;
    const blob = await blobRes.blob();
    if (blob.size < 1024) return null;

    const src = await appAudioStore().put(blob);
    const id = opts.clipId ?? `stock-${crypto.randomUUID().slice(0, 8)}`;
    const isVideo = hit.kind === 'video' || hit.mimeType.startsWith('video/');
    return {
      id,
      name: `${hit.title.slice(0, 64)} (${hit.provider})`,
      src,
      kind: isVideo ? 'broll' : 'photo',
      mimeType: hit.mimeType || blob.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      width: Math.max(1, hit.width),
      height: Math.max(1, hit.height),
      ...(isVideo && hit.durationMs ? { durationMs: hit.durationMs } : {}),
      summary: `${q} — ${hit.attribution}`,
      tags: q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6),
      indexedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Generates an AI studio cutout or editorial illustration via Firebase AI Logic + on-device
 * chroma-keying (`key.ts`) and saves it to `imageStore` so `mp.image(asset.id)` can render it
 * deterministically in both preview and export with zero external URLs (spec 23 R6.2).
 */
export async function generateReelImageAsset(
  subjectRaw: string,
  style: Look,
  opts: { keyed?: boolean; now?: () => number } = {},
): Promise<{ asset: ImageAsset; dataUrl: string } | null> {
  if (typeof window === 'undefined') return null;
  const parsed = ImageSubjectSchema.safeParse(subjectRaw.trim());
  if (!parsed.success) return null;
  const subject = parsed.data;
  const keyed = opts.keyed !== false;
  const recipe =
    'image' in style && style.image?.recipe ? style.image.recipe : DEFAULT_IMAGE_RECIPE;
  const model = APP_CONFIG_DEFAULTS.modelImage;

  try {
    const byokKey = getByokKey();
    const imgInput = {
      subject,
      recipe,
      keyed,
      aspect: '1:1' as const,
    };
    const res = byokKey
      ? await generateImageWithGeminiByok(byokKey, model, imgInput)
      : await generateImageWithFirebase(getAILogic, model, imgInput);
    const rawBlob = new Blob([new Uint8Array(res.bytes)], { type: res.mimeType });
    const processed = await processImage(rawBlob, keyed);
    const hash = await sha256Hex(`${model}|${recipe}|${subject}|${keyed ? 1 : 0}`);
    const src = await putImage(hash, processed.blob);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(processed.blob);
    });
    const asset: ImageAsset = {
      id: `img-${crypto.randomUUID().slice(0, 8)}`,
      subject,
      source: 'generated',
      src,
      width: processed.width,
      height: processed.height,
      keyed: processed.keyed,
      hash,
      status: 'ready',
    };
    return { asset, dataUrl };
  } catch {
    return null;
  }
}
