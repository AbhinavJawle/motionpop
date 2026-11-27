import {
  ImageSubjectSchema,
  directGraphic,
  directReel,
  generateImageWithFirebase,
  generateImageWithGeminiByok,
  reviewReelEdit,
  type EditChoices,
  type GraphicSceneBlueprint,
  type ReelDirectBrief,
  type ReelDirectMediaClip,
  type UsageEvent,
} from '@motionpop/ai';
import type { EditReview } from '@/lib/audio/retakes';
import {
  APP_CONFIG_DEFAULTS,
  costOf,
  reelMediaKey,
  reelMediaOf,
  setReelMediaAssets,
  type AppConfig,
  type Format,
  type ImageAsset,
  type ReelLook,
  type ReelMedia,
  type ReelPlan,
  type ReelWord,
} from '@motionpop/schemas';
import { abortError, isAbortError, raceAbort, throwIfAborted } from '@/lib/abort';
import { useAIStatusStore } from '@/lib/ai/ai-status';
import { getByokKey } from '@/lib/ai/byok';
import { isLocalLlmActive } from '@/lib/ai/local-llm';
import { emitAIUsage, getRouter } from '@/lib/ai/router-client';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { getAILogic, getAuthClient } from '@/lib/firebase/client';
import { apiHeaders } from '@/lib/users/bootstrap-client';
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
  /** Optional style id / prompt cue (e.g. `paper-collage`, `vox`, `newsprint`, `midnight-neon`) to art-direct cutout illustrations. */
  styleHint?: string;
  fetchFn?: typeof fetch;
  generate?: typeof generateImageWithFirebase;
  onUsage?: (e: UsageEvent) => void;
}

/** Media recipe version: part of the asset hash, so a recipe change never reuses old pictures. */
const REEL_MEDIA_VERSION = 4;

function styleBucket(look: ReelLook, styleHint?: string): string {
  const s = (styleHint ?? '').toLowerCase();
  if (/\b(apple-keynote|apple|keynote|notch|macos|liquid-glass|saas)\b/.test(s))
    return 'apple-keynote';
  if (/\b(kinetic-lime|kinetic|lime|anti-ppt|colorblock|brutalist|retro-terminal|crt)\b/.test(s))
    return 'kinetic-lime';
  if (/\b(risograph|riso|zine|overprint)\b/.test(s)) return 'risograph';
  if (/\b(blueprint|schematic|3b1b|3blue1brown|architecture|diagram)\b/.test(s)) return 'blueprint';
  if (/\b(kurzgesagt|cosmos|flat-vector|science)\b/.test(s)) return 'kurzgesagt';
  if (/\b(paper-collage|vox|collage|cutout|cut-out|magazine|scrapbook|johnny harris)\b/.test(s))
    return 'vox-collage';
  if (/\b(newsprint|newspaper|archival|investigative|bloomberg|economist|nyt)\b/.test(s))
    return 'newsprint';
  if (/\b(midnight-neon|hyper-color|creator-dark|market-dark|launch-dark|dark|neon|cyber|3d)\b/.test(s))
    return 'dark-3d';
  if (/\b(warm-editorial|editorial-cream|editorial-explainer|warm-paper|executive-cream|field-notes|whiteboard|sketch)\b/.test(s))
    return 'warm-editorial';
  return look === 'cream' ? 'warm-editorial' : 'swiss-mono';
}

/** The image model recipe for a reel illustration matched to the chosen look & style (≤ 400 chars). */
export function reelIllustrationRecipe(look: ReelLook, styleHint?: string): string {
  switch (styleBucket(look, styleHint)) {
    case 'apple-keynote':
      return 'Sleek Apple industrial design studio object render of {subject}, smooth anodized aluminum and frosted glass surfaces, subtle cool rim light, crisp clean silhouette isolated on solid pure white background, completely empty white background, no text, no watermark, no floor shadow.';
    case 'kinetic-lime':
      return 'High-contrast bold graphic editorial cutout of {subject}, sharp obsidian ink shading with crisp electric lime and cobalt accent highlights, clean isolated silhouette on solid pure white background, completely empty white background, no text, no watermark, no floor shadow.';
    case 'risograph':
      return '2-color risograph screenprint editorial cutout illustration of {subject}, fluorescent coral and cobalt blue overprint halftone dots, crisp clean silhouette isolated on solid pure white background, completely empty white background, no text, no letters, no watermark.';
    case 'blueprint':
      return 'Crisp isometric technical blueprint and architectural schematic illustration of {subject}, clean cyan and deep navy drafting linework with subtle amber highlight, isolated cleanly on solid pure white background, completely empty white background, no text, no watermark.';
    case 'kurzgesagt':
      return 'Vibrant Kurzgesagt-inspired flat geometric vector illustration of {subject}, rich jewel-tone indigo, cyan, coral and solar gold shading with crisp clean silhouettes, isolated on solid pure white background, completely empty white background, no text, no watermark.';
    case 'vox-collage':
      return 'Editorial Vox magazine photo-collage cutout illustration of {subject}, vintage archival print grain with subtle halftone dots, warm terracotta coral, sage green, charcoal ink and cream tones, crisp clean silhouette isolated on solid pure white background, completely empty white background, no text, no letters, no watermark, no frame, no floor shadow.';
    case 'newsprint':
      return 'Archival investigative journalism lithograph & halftone ink illustration of {subject}, fine charcoal crosshatching with subtle crimson editorial accent, crisp isolated silhouette on solid pure white background, completely empty white background, no text, no letters, no watermark, no border.';
    case 'dark-3d':
      return 'Sleek high-contrast 3D editorial studio object illustration of {subject}, subtle luminous rim lighting, crisp geometric silhouette isolated on solid pure white background, completely empty white background, no text, no letters, no watermark, no floor shadow.';
    case 'warm-editorial':
      return 'Warm New Yorker editorial gouache and ink illustration of {subject}, soft grain, muted terracotta orange, ochre, sage and charcoal ink tones, crisp clean silhouette isolated on solid pure white background, completely empty white background, no text, no letters, no watermark, no floor line.';
    default:
      return 'Crisp Swiss editorial ink and risograph illustration of {subject}, bold architectural linework with flat light slate shading, clean isolated silhouette on solid pure white background, completely empty white background, no text, no letters, no watermark, no floor shadow.';
  }
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

/** `fetch` options carrying the signal (none when there is no signal). */
const withSignal = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;

async function fetchLogo(
  f: typeof fetch,
  q: string,
  signal?: AbortSignal,
): Promise<Fetched | null> {
  const headers = await optionalAuthHeaders();
  const res = await f(`/api/reel/logo?q=${encodeURIComponent(q)}`, {
    ...withSignal(signal),
    ...(headers ? { headers } : {}),
  }).catch(() => null);
  const blob = await blobFrom(res);
  if (!blob) return null;
  const png = blob.type.includes('svg') ? await rasterizeSvg(blob) : blob;
  return { blob: png, source: 'logo', maxSide: 512 };
}

async function optionalAuthHeaders(): Promise<HeadersInit | undefined> {
  try {
    const auth = await getAuthClient();
    const user = auth.currentUser;
    if (!user) return undefined;
    return await apiHeaders(() => user.getIdToken());
  } catch {
    return undefined;
  }
}

async function fetchScreenshot(
  f: typeof fetch,
  q: string,
  signal?: AbortSignal,
): Promise<Fetched | null> {
  const headers = await optionalAuthHeaders();
  const res = await f(`/api/reel/screenshot?url=${encodeURIComponent(q)}`, {
    ...withSignal(signal),
    ...(headers ? { headers } : {}),
  }).catch(() => null);
  const blob = await blobFrom(res);
  return blob ? { blob, source: 'screenshot', maxSide: 1800 } : null;
}

async function fetchPhoto(
  f: typeof fetch,
  q: string,
  signal?: AbortSignal,
): Promise<Fetched | null> {
  const headers = await optionalAuthHeaders();
  const res = await f(
    `/api/media/stock?q=${encodeURIComponent(q)}&kind=photo&orientation=landscape&limit=3`,
    { ...withSignal(signal), ...(headers ? { headers } : {}) },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    items?: { url?: string; attribution?: string; width?: number }[];
  } | null;
  for (const item of data?.items ?? []) {
    if (!item.url) continue;
    const img = await f(`/api/media/stock?proxy=${encodeURIComponent(item.url)}`, {
      ...withSignal(signal),
      ...(headers ? { headers } : {}),
    }).catch(() => null);
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
  signal?: AbortSignal,
): Promise<{ plan: ReelPlan; assets: ImageAsset[] }> {
  // Nothing is fetched or spent for a call that is already cancelled.
  throwIfAborted(signal);
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
  // Illustrations paid for in this call and not yet refunded: a cancel hands them all back,
  // because nothing was saved from this call (spec 39 R6.9).
  const paid = new Set<string>();
  const refundPaid = async (): Promise<void> => {
    const txs = [...paid];
    paid.clear();
    await Promise.all(txs.map((tx) => deps.credits?.refund(tx).catch(() => {})));
  };
  try {
    return await resolveAll();
  } catch (e) {
    if (isAbortError(e) || signal?.aborted) {
      await refundPaid();
      throw isAbortError(e) ? e : abortError();
    }
    throw e;
  }

  async function resolveAll(): Promise<{ plan: ReelPlan; assets: ImageAsset[] }> {
    const isOffline =
      typeof navigator !== 'undefined' && navigator.onLine === false && !deps.fetchFn;
    for (const [key, m] of unique) {
      throwIfAborted(signal);
      done++;
      onProgress?.(done, total);
      // Logos and screenshots look the same in either look; drawings follow look + style bucket.
      const scope =
        m.kind === 'illustration'
          ? `${styleBucket(look, deps.styleHint)}|${cfg.modelImage}`
          : m.kind;
      const hash = await sha256Hex(`reel|${REEL_MEDIA_VERSION}|${scope}|${key}`);
      const known = (deps.existing ?? []).find((a) => a.hash === hash && a.status === 'ready');
      if (known && (await getImage(known.src ?? ''))) {
        assets.push(known);
        ids[key] = known.id;
        continue;
      }
      if (isOffline) continue;
      let got: Fetched | null = null;
      try {
        if (m.kind === 'logo') got = await fetchLogo(f, m.query, signal);
        else if (m.kind === 'screenshot') got = await fetchScreenshot(f, m.query, signal);
        else if (m.kind === 'photo') got = await fetchPhoto(f, m.query, signal);
        else got = await illustrate(m.query);
      } catch (e) {
        // A cancel is not a failed picture: it stops the whole call (and refunds, above).
        if (isAbortError(e) || signal?.aborted) throw e;
        console.warn('Reel picture failed', key, e);
        got = null;
      }
      throwIfAborted(signal);
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
      const byokKey = !deps.generate ? getByokKey() : null;
      const canPayForImage = Boolean(
        byokKey || (deps.credits && (deps.credits.canSpend?.('image') ?? true)),
      );
      if (!parsed.success || illustrations >= max || cfg.killSwitch || !canPayForImage)
        return null;
      // No spend for a call that is already cancelled.
      throwIfAborted(signal);
      let txId: string | null = null;
      let charged = 0;
      const cost = costOf('image', 1, cfg);
      if (!byokKey && deps.credits) {
        const spent = await spendWithUi(
          deps.credits,
          { action: 'image', key: newSpendKey(), refId: projectId },
          cfg,
        );
        if (!spent?.ok) return null;
        txId = spent.txId;
        charged = spent.cost;
        paid.add(spent.txId);
      }
      illustrations++;
      const t0 = performance.now();
      try {
        // Cancelled while the spend was in flight: hand it back before any call is made.
        throwIfAborted(signal);
        const imgInput = {
          subject: parsed.data,
          recipe: reelIllustrationRecipe(look, deps.styleHint),
          keyed: false,
          aspect: '1:1' as const,
        };
        const call = byokKey
          ? generateImageWithGeminiByok(byokKey, cfg.modelImage, imgInput)
          : (deps.generate ?? generateImageWithFirebase)(getAILogic, cfg.modelImage, imgInput);
        const r = await raceAbort(call, signal);
        // Cancelled while the picture was made: it is dropped (the caller refunds every spend).
        throwIfAborted(signal);
        report({
          task: 'image.generate',
          ranOn: 'cloud',
          model: r.model,
          credits: charged,
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
        // Out of `paid` first, so the cancel path never refunds the same spend twice.
        if (txId && deps.credits) {
          paid.delete(txId);
          await deps.credits.refund(txId).catch(() => {});
        }
        throw e;
      }
    }
  }
}

/**
 * Resolves a standalone list of `ReelMedia` requests (e.g. visuals planned for custom scenes
 * before `reel.compose` runs) using the exact same caching, keying, and credit rules as
 * `resolveReelMedia`. Returns the resolved media entries (with `asset` populated) and new assets.
 */
export async function resolveReelMediaList(
  items: readonly ReelMedia[],
  look: ReelLook,
  projectId: string,
  deps: ReelMediaDeps,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ media: ReelMedia[]; assets: ImageAsset[] }> {
  if (items.length === 0) return { media: [], assets: [] };
  const dummyPlan: ReelPlan = {
    v: 1,
    look,
    focus: { x: 0.5, y: 0.32 },
    captions: false,
    scenes: items.map((m, i) => ({
      id: `m${i}`,
      startMs: i * 1000,
      endMs: (i + 1) * 1000,
      layout: 'full',
      content: {
        template: 'custom',
        title: `visual-${i}`,
        brief: 'visual',
        html: '',
        css: '',
        script: 'return {seek(){}}',
        media: [m],
      },
    })),
  };
  const resolved = await resolveReelMedia(dummyPlan, look, projectId, deps, onProgress, signal);
  const media = resolved.plan.scenes.map((s, i) =>
    s.content.template === 'custom' && s.content.media?.[0] ? s.content.media[0] : items[i]!,
  );
  return { media, assets: resolved.assets };
}

/**
 * The cloud reel director, charged (spec 26 R5.1): the price is spent first and refunded when
 * the director fails and the free plan is used instead. Without credits (or when the spend is
 * refused) the free director runs.
 */
export async function directReelPaid(
  params: {
    look: ReelLook;
    words: readonly ReelWord[];
    durationMs: number;
    refId: string;
    frames?: readonly { atMs: number; base64: string }[];
    /** The creator's recipe and choices as text for the director (spec 39 R3.5). */
    brief?: ReelDirectBrief;
    /** The creator's choices, enforced on the plan from either director (spec 39 R5.7). */
    choices?: EditChoices;
    /** True for voiceover-only projects without speaker video (every scene uses `full` layout). */
    noVideo?: boolean;
    /** Indexed creator-uploaded Media Bin clips to weave into matching beats (spec 48). */
    mediaBin?: readonly ReelDirectMediaClip[];
  },
  deps: {
    credits: CreditsClient | null;
    config?: Partial<ReelCfg>;
    free?: boolean;
    /** Override for Chrome Gemini Nano availability (defaults to `useAIStatusStore`). */
    onDeviceReady?: boolean;
    /** Optional router override for tests. */
    getRouter?: () => Promise<Awaited<ReturnType<typeof getRouter>>>;
  },
  /**
   * Cancels the call. Nothing is spent when it has already fired; a cancel after the spend hands
   * the price back and throws an `AbortError` instead of returning a plan (spec 39 R6.9).
   */
  signal?: AbortSignal,
): Promise<{
  plan: ReelPlan;
  source: 'cloud' | 'device' | 'auto';
  draft?: boolean;
  model?: string;
  error?: string;
}> {
  throwIfAborted(signal);
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  // The choices apply to the free plan too; the brief is only text for the cloud director.
  const base = {
    look: params.look,
    words: params.words,
    durationMs: params.durationMs,
    ...(params.choices ? { choices: params.choices } : {}),
    ...(params.noVideo ? { noVideo: true } : {}),
  };
  const withFrames = {
    ...base,
    ...(params.frames?.length ? { frames: params.frames } : {}),
    ...(params.brief ? { brief: params.brief } : {}),
    ...(params.mediaBin?.length ? { mediaBin: params.mediaBin } : {}),
  };
  const onDeviceReady =
    deps.onDeviceReady ?? useAIStatusStore.getState().availability === 'available';
  const router = await (deps.getRouter ?? getRouter)().catch(() => null);
  const deviceOrAuto = async () => {
    throwIfAborted(signal);
    const out =
      router && onDeviceReady
        ? await raceAbort(directReel(router, { ...base, preferOnDevice: true }), signal)
        : await directReel(null, base);
    throwIfAborted(signal);
    return out;
  };
  const hasLocalLlm = isLocalLlmActive();
  const hasByok = Boolean(getByokKey());
  if (
    ((hasLocalLlm && !deps.free) || (hasByok && !deps.free && !cfg.killSwitch)) &&
    router &&
    params.words.length >= 4
  ) {
    const r = await raceAbort(
      directReel(router, { ...withFrames, fallbackOnDevice: onDeviceReady || hasLocalLlm }),
      signal,
    );
    throwIfAborted(signal);
    if (r.error && (r.draft || r.source === 'auto')) {
      console.warn(
        `${hasLocalLlm ? 'Local LLM' : 'BYOK'} reel.direct fell back to ${r.draft ? 'compact draft' : 'free director'}:`,
        r.error,
      );
    }
    return r;
  }
  if (deps.free || !deps.credits || cfg.killSwitch || params.words.length < 4)
    return deviceOrAuto();
  if (!router) return directReel(null, base);
  const spent = await spendWithUi(
    deps.credits,
    { action: 'reel', key: newSpendKey(), refId: params.refId },
    cfg,
  );
  if (!spent?.ok) return deviceOrAuto();
  const credits = deps.credits;
  let refunded = false;
  const refundOnce = async () => {
    if (refunded) return;
    refunded = true;
    await credits.refund(spent.txId).catch(() => {});
  };
  let r: Awaited<ReturnType<typeof directReel>>;
  try {
    // Cancelled while the spend was in flight: hand it back before any call is made.
    throwIfAborted(signal);
    r = await raceAbort(
      directReel(router, { ...withFrames, fallbackOnDevice: onDeviceReady }),
      signal,
    );
    // Cancelled just as the plan arrived: it is dropped, never returned.
    throwIfAborted(signal);
  } catch (e) {
    // Any way out without a plan hands the price back (a throw used to keep it).
    await refundOnce();
    throw e;
  }
  if (r.source !== 'cloud') {
    // Never silent (spec 29): a director failure used to fall back to the free plan unseen.
    console.warn('Reel director failed; using the free director:', r.error);
    await refundOnce();
  }
  return r;
}

/**
 * Prompt-driven motion graphics director (`reel.graphic`), charged like `directReelPaid` (or 0
 * credits with BYOK / on-device / local fallback).
 */
export async function directGraphicPaid(
  params: {
    prompt: string;
    look: ReelLook;
    format?: Format;
    durationMs?: number;
    brief?: ReelDirectBrief;
    styleDirection?: string;
    illustrations?: boolean;
    refId: string;
  },
  deps: {
    credits: CreditsClient | null;
    config?: Partial<ReelCfg>;
    free?: boolean;
    onDeviceReady?: boolean;
    getRouter?: () => Promise<Awaited<ReturnType<typeof getRouter>>>;
  },
  signal?: AbortSignal,
): Promise<{
  plan: ReelPlan;
  blueprints?: GraphicSceneBlueprint[];
  durationMs: number;
  title?: string;
  source: 'cloud' | 'device' | 'auto';
  error?: string;
}> {
  throwIfAborted(signal);
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  const router = await (deps.getRouter ?? getRouter)().catch(() => null);
  const onDeviceReady =
    deps.onDeviceReady ?? useAIStatusStore.getState().availability === 'available';
  const base = {
    prompt: params.prompt,
    look: params.look,
    ...(params.format ? { format: params.format } : {}),
    ...(params.durationMs ? { durationMs: params.durationMs } : {}),
    ...(params.brief ? { brief: params.brief } : {}),
    ...(params.styleDirection ? { styleDirection: params.styleDirection } : {}),
    ...(params.illustrations !== undefined ? { illustrations: params.illustrations } : {}),
  };
  const fallback = async () => {
    throwIfAborted(signal);
    const out =
      router && onDeviceReady
        ? await raceAbort(directGraphic(router, { ...base, preferOnDevice: true }), signal)
        : await directGraphic(null, base);
    throwIfAborted(signal);
    return out;
  };
  const hasLocalLlm = isLocalLlmActive();
  const hasByok = Boolean(getByokKey());
  if (((hasLocalLlm && !deps.free) || (hasByok && !deps.free && !cfg.killSwitch)) && router) {
    const r = await raceAbort(directGraphic(router, base), signal);
    throwIfAborted(signal);
    return r;
  }
  if (deps.free || !deps.credits || cfg.killSwitch) return fallback();
  if (!router) return directGraphic(null, base);
  const spent = await spendWithUi(
    deps.credits,
    { action: 'reel', key: newSpendKey(), refId: params.refId },
    cfg,
  );
  if (!spent?.ok) return fallback();
  const credits = deps.credits;
  let refunded = false;
  const refundOnce = async () => {
    if (refunded) return;
    refunded = true;
    await credits.refund(spent.txId).catch(() => {});
  };
  let r: Awaited<ReturnType<typeof directGraphic>>;
  try {
    throwIfAborted(signal);
    r = await raceAbort(directGraphic(router, base), signal);
    throwIfAborted(signal);
  } catch (e) {
    await refundOnce();
    throw e;
  }
  if (r.source !== 'cloud') {
    console.warn('Graphic director failed; using fallback:', r.error);
    await refundOnce();
  }
  return r;
}

/**
 * The cloud editor's check of the automatic retake cuts (spec 28 R3). Part of a directed reel:
 * it runs for signed-in creators with credits and is not charged on its own. Null when it can't
 * run; the rule-based edit then stands.
 */
export async function reviewReelCuts(
  phrases: [number, string, boolean][],
  deps: { credits: CreditsClient | null; config?: Partial<ReelCfg>; timeoutMs?: number },
): Promise<EditReview | null> {
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  // R3.1: runs for creators with credits, active local LLM, or BYOK (a signed-in account at 0
  // without local LLM / BYOK gets the rules alone).
  const hasLocalLlm = isLocalLlmActive();
  const hasByok = Boolean(getByokKey());
  const balance = deps.credits?.balance() ?? null;
  const allowed =
    hasLocalLlm ||
    (hasByok && !cfg.killSwitch) ||
    (Boolean(deps.credits) && balance !== null && balance > 0 && !cfg.killSwitch);
  if (!allowed || phrases.length < 2) return null;
  const router = await getRouter().catch(() => null);
  // A hung call must not hold the "Removing retakes" step: after this long the rules stand.
  // Local LLMs on laptops run slower (~6-15 tok/s) than cloud Gemini, so give them more headroom
  // to finish cleanly instead of timing out mid-request and jamming Ollama's single inference slot.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const effectiveTimeoutMs =
    deps.timeoutMs ?? (hasLocalLlm ? LOCAL_LLM_REVIEW_TIMEOUT_MS : REVIEW_TIMEOUT_MS);
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), effectiveTimeoutMs);
  });
  try {
    return await Promise.race([reviewReelEdit(router, phrases), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The longest the automatic edit waits for the cloud editor's check (spec 28 review). */
export const REVIEW_TIMEOUT_MS = 25_000;
/** Longer review window for local Ollama / LM Studio inference on consumer laptops. */
export const LOCAL_LLM_REVIEW_TIMEOUT_MS = 90_000;

/**
 * The reel's soundtrack (spec 27 R3.2): asks our server to generate music from the director's
 * brief, looped to the reel's length, and stores it as the project's music file. Signed-in only;
 * any failure leaves the plan without music (the reel still has its sound effects).
 */
export async function resolveReelMusic(
  plan: ReelPlan,
  durationMs: number,
  projectId: string,
  deps: {
    audioStore: {
      put(blob: Blob, place: { projectId: string; kind: 'music' }): Promise<string>;
      delete?(ref: string): Promise<void>;
    };
    fetchFn?: typeof fetch;
  },
  signal?: AbortSignal,
): Promise<ReelPlan> {
  const brief = plan.music?.brief;
  if (!brief || plan.music?.src) return plan;
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !deps.fetchFn) return plan;
  throwIfAborted(signal);
  try {
    const auth = await getAuthClient();
    const user = auth.currentUser;
    if (!user) return plan;
    const res = await (deps.fetchFn ?? fetch)('/api/reel/music', {
      method: 'POST',
      headers: {
        ...(await apiHeaders(() => user.getIdToken())),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brief, durationMs: Math.max(1000, Math.round(durationMs)) }),
      ...(signal ? { signal } : {}),
    });
    const blob = await blobFrom(res);
    if (!blob) return plan;
    throwIfAborted(signal);
    const src = await deps.audioStore.put(new Blob([blob], { type: 'audio/wav' }), {
      projectId,
      kind: 'music',
    });
    if (signal?.aborted) {
      // Cancelled while it was being stored: the file goes, and no plan comes back.
      await deps.audioStore.delete?.(src).catch(() => undefined);
      throw abortError();
    }
    return { ...plan, music: { brief, src } };
  } catch (e) {
    // A cancel stops the job; any other failure leaves the reel with its sound effects.
    if (isAbortError(e) || signal?.aborted) throw isAbortError(e) ? e : abortError();
    console.warn('Reel music failed', e);
    return plan;
  }
}
