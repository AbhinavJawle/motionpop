import {
  ImageSubjectSchema,
  directReel,
  generateImageWithFirebase,
  type UsageEvent,
} from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  costOf,
  reelMediaKey,
  reelMediaOf,
  setReelMediaAssets,
  type AppConfig,
  type ImageAsset,
  type ReelLook,
  type ReelMedia,
  type ReelPlan,
  type ReelWord,
} from '@motionpop/schemas';
import { emitAIUsage, getRouter } from '@/lib/ai/router-client';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { getAILogic } from '@/lib/firebase/client';
import { getImage, putImage } from '@/lib/images/image-store';
import { processImage, sha256Hex } from '@/lib/images/process';
import { trimPaper } from '@/lib/images/trim';

/**
 * Reel media (spec 26): fetches every picture a reel plan asks for and stores it like any other
 * image asset (`media:{hash}.webp`, mirrored to the account's Storage so the export can read it).
 * Logos and site screenshots are free; illustrations use the image model through Firebase AI
 * Logic and cost image credits each (refunded when they fail). Identical requests reuse the
 * stored picture. Any failure leaves the request unresolved and the template draws its fallback.
 */
export type ReelCfg = Pick<
  AppConfig,
  'creditCosts' | 'imageCredits' | 'exportCredits' | 'modelImage' | 'killSwitch'
>;

export interface ReelMediaDeps {
  credits: CreditsClient | null;
  config?: Partial<ReelCfg>;
  /** Pictures the project already holds (reuse by hash). */
  existing?: readonly ImageAsset[];
  /** Most illustrations one reel may generate (each costs credits). */
  maxIllustrations?: number;
  fetchFn?: typeof fetch;
  generate?: typeof generateImageWithFirebase;
  onUsage?: (e: UsageEvent) => void;
}

/** Media recipe version: part of the asset hash, so a recipe change never reuses old pictures. */
const REEL_MEDIA_VERSION = 2;

/** The image model recipe for a reel illustration in the look's style (≤ 400 chars). */
export function reelIllustrationRecipe(look: ReelLook): string {
  return look === 'mono'
    ? 'Minimal black ink line illustration with flat light grey shading, editorial explainer style, crisp clean strokes. Subject: {subject}. Background: plain pure white, completely empty, no floor, no shadow.'
    : 'Warm editorial illustration, soft grain, muted terracotta orange, charcoal and sand tones, gentle shading. Subject: {subject}. Background: plain warm off-white paper, completely empty, no floor line, no frame.';
}

async function blobFrom(res: Response | null): Promise<Blob | null> {
  if (!res || !res.ok) return null;
  const b = await res.blob();
  return b.size > 0 ? b : null;
}

/** An SVG logo drawn onto a 512 px transparent canvas (createImageBitmap can't read SVG). */
async function rasterizeSvg(svg: Blob, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo did not load'));
      img.src = url;
    });
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const k = size / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Fetched {
  blob: Blob;
  source: ImageAsset['source'];
  maxSide?: number;
  attribution?: string;
}

async function fetchLogo(f: typeof fetch, q: string): Promise<Fetched | null> {
  const res = await f(`/api/reel/logo?q=${encodeURIComponent(q)}`).catch(() => null);
  const blob = await blobFrom(res);
  if (!blob) return null;
  const png = blob.type.includes('svg') ? await rasterizeSvg(blob) : blob;
  return { blob: png, source: 'logo', maxSide: 512 };
}

async function fetchScreenshot(f: typeof fetch, q: string): Promise<Fetched | null> {
  const res = await f(`/api/reel/screenshot?url=${encodeURIComponent(q)}`).catch(() => null);
  const blob = await blobFrom(res);
  return blob ? { blob, source: 'screenshot', maxSide: 1800 } : null;
}

async function fetchPhoto(f: typeof fetch, q: string): Promise<Fetched | null> {
  const res = await f(
    `/api/media/stock?q=${encodeURIComponent(q)}&kind=photo&orientation=landscape&limit=3`,
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    items?: { url?: string; attribution?: string; width?: number }[];
  } | null;
  for (const item of data?.items ?? []) {
    if (!item.url) continue;
    const img = await f(`/api/media/stock?proxy=${encodeURIComponent(item.url)}`).catch(() => null);
    const blob = await blobFrom(img);
    if (blob)
      return {
        blob,
        source: 'stock',
        ...(item.attribution ? { attribution: item.attribution.slice(0, 240) } : {}),
      };
  }
  return null;
}

export async function resolveReelMedia(
  plan: ReelPlan,
  look: ReelLook,
  projectId: string,
  deps: ReelMediaDeps,
  onProgress?: (done: number, total: number) => void,
): Promise<{ plan: ReelPlan; assets: ImageAsset[] }> {
  const f = deps.fetchFn ?? fetch;
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  const report = deps.onUsage ?? emitAIUsage;
  const unique = new Map<string, ReelMedia>();
  for (const m of reelMediaOf(plan))
    if (!unique.has(reelMediaKey(m))) unique.set(reelMediaKey(m), m);
  const assets: ImageAsset[] = [];
  const ids: Record<string, string> = {};
  let illustrations = 0;
  let done = 0;
  const total = unique.size;
  for (const [key, m] of unique) {
    done++;
    onProgress?.(done, total);
    // Logos and screenshots look the same in either look; drawings follow it.
    const scope = m.kind === 'illustration' ? `${look}|${cfg.modelImage}` : m.kind;
    const hash = await sha256Hex(`reel|${REEL_MEDIA_VERSION}|${scope}|${key}`);
    const known = (deps.existing ?? []).find((a) => a.hash === hash && a.status === 'ready');
    if (known && (await getImage(known.src ?? ''))) {
      assets.push(known);
      ids[key] = known.id;
      continue;
    }
    let got: Fetched | null = null;
    try {
      if (m.kind === 'logo') got = await fetchLogo(f, m.query);
      else if (m.kind === 'screenshot') got = await fetchScreenshot(f, m.query);
      else if (m.kind === 'photo') got = await fetchPhoto(f, m.query);
      else got = await illustrate(m.query);
    } catch (e) {
      console.warn('Reel picture failed', key, e);
      got = null;
    }
    if (!got) continue;
    try {
      const img = await processImage(got.blob, false, got.maxSide);
      const src = await putImage(hash, img.blob);
      const asset: ImageAsset = {
        id: hash.slice(0, 16),
        hash,
        status: 'ready',
        source: got.source,
        subject: m.query.slice(0, 120),
        keyed: false,
        width: img.width,
        height: img.height,
        src,
        ...(got.attribution ? { attribution: got.attribution } : {}),
      };
      assets.push(asset);
      ids[key] = asset.id;
    } catch (e) {
      console.warn('Reel picture could not be stored', key, e);
    }
  }
  return { plan: setReelMediaAssets(plan, ids), assets };

  async function illustrate(subject: string): Promise<Fetched | null> {
    const max = deps.maxIllustrations ?? 3;
    const parsed = ImageSubjectSchema.safeParse(subject.slice(0, 120));
    if (!parsed.success || illustrations >= max || cfg.killSwitch || !deps.credits) return null;
    const spent = await spendWithUi(
      deps.credits,
      { action: 'image', key: newSpendKey(), refId: projectId },
      cfg,
    );
    if (!spent?.ok) return null;
    illustrations++;
    const cost = costOf('image', 1, cfg);
    const t0 = performance.now();
    try {
      const r = await (deps.generate ?? generateImageWithFirebase)(getAILogic, cfg.modelImage, {
        subject: parsed.data,
        recipe: reelIllustrationRecipe(look),
        keyed: false,
        aspect: '1:1',
      });
      report({
        task: 'image.generate',
        ranOn: 'cloud',
        model: cfg.modelImage,
        credits: cost,
        cloudCost: cost,
        latencyMs: Math.round(performance.now() - t0),
        ok: true,
      });
      const raw = new Blob([r.bytes.slice().buffer], { type: r.mimeType });
      return { blob: await trimPaper(raw).catch(() => raw), source: 'generated' };
    } catch (e) {
      report({
        task: 'image.generate',
        ranOn: 'cloud',
        model: cfg.modelImage,
        credits: 0,
        cloudCost: cost,
        latencyMs: Math.round(performance.now() - t0),
        ok: false,
      });
      await deps.credits.refund(spent.txId).catch(() => {});
      throw e;
    }
  }
}

/**
 * The cloud reel director, charged (spec 26 R5.1): the price is spent first and refunded when
 * the director fails and the free plan is used instead. Without credits (or when the spend is
 * refused) the free director runs.
 */
export async function directReelPaid(
  params: { look: ReelLook; words: readonly ReelWord[]; durationMs: number; refId: string },
  deps: { credits: CreditsClient | null; config?: Partial<ReelCfg>; free?: boolean },
): Promise<{ plan: ReelPlan; source: 'cloud' | 'auto'; error?: string }> {
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  const base = { look: params.look, words: params.words, durationMs: params.durationMs };
  if (deps.free || !deps.credits || cfg.killSwitch || params.words.length < 4)
    return directReel(null, base);
  const router = await getRouter().catch(() => null);
  if (!router) return directReel(null, base);
  const spent = await spendWithUi(
    deps.credits,
    { action: 'reel', key: newSpendKey(), refId: params.refId },
    cfg,
  );
  if (!spent?.ok) return directReel(null, base);
  const r = await directReel(router, base);
  if (r.source !== 'cloud') await deps.credits.refund(spent.txId).catch(() => {});
  return r;
}
