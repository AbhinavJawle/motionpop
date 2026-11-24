import {
  DEFAULT_IMAGE_RECIPE,
  IMAGE_RECIPE_VERSION,
  ImageSubjectSchema,
  generateImageWithFirebase,
  generateImageWithGeminiByok,
  type UsageEvent,
} from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  costOf,
  type AppConfig,
  type EditorProject,
  type ImageAsset,
} from '@motionpop/schemas';
import { create } from 'zustand';
import { getByokKey } from '@/lib/ai/byok';
import { emitAIUsage } from '@/lib/ai/router-client';
import { setSlotImage, type Command } from '@/lib/commands';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { getAILogic } from '@/lib/firebase/client';
import { lookFor, sceneFor } from '@/lib/motion/registry';
import { getImage, putImage } from './image-store';
import { processImage, sha256Hex } from './process';

/**
 * Pictures for scenes (spec 07 R4, hybrid-ai.md): the image model through Firebase AI Logic,
 * cloud only, never automatic. Each picture is charged before the call (the price is on the
 * button) and refunded when it fails. Identical requests (same model, recipe, subject, look)
 * reuse the stored picture for free. Calls run one at a time: parallel calls hit the rate limit
 * (D-030).
 */
export type ImageOutcome =
  | { ok: true; asset: ImageAsset; reused: boolean; credits: number }
  | { ok: false; reason: string; noCredits?: boolean };

export interface ImageDeps {
  credits: CreditsClient | null;
  config?: Partial<
    Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits' | 'modelImage' | 'killSwitch'>
  >;
  getProject: () => EditorProject | null;
  exec: (cmd: Command) => boolean;
  /** Injected in tests. */
  generate?: typeof generateImageWithFirebase;
  process?: typeof processImage;
  onUsage?: (e: UsageEvent) => void;
}

export interface ImageRequest {
  slotId: string;
  role: string;
  subject: string;
}

/** Jobs in flight, by slot id (the inspector and the timeline read it). */
export const useImageJobs = create<{ busy: Record<string, string> }>(() => ({ busy: {} }));
const setBusy = (slotId: string, subject: string | null) =>
  useImageJobs.setState((s) => {
    const busy = { ...s.busy };
    if (subject === null) delete busy[slotId];
    else busy[slotId] = subject;
    return { busy };
  });

export const imageCost = (
  cfg: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'> = APP_CONFIG_DEFAULTS,
) => costOf('image', 1, cfg);

/** The scene's first image role, or null when the slot's graphic takes no picture. */
export function imageRoleOf(componentId: string): string | null {
  return sceneFor(componentId)?.imageRoles[0]?.id ?? null;
}

let chain: Promise<unknown> = Promise.resolve();

export function generateSlotImage(deps: ImageDeps, req: ImageRequest): Promise<ImageOutcome> {
  const run = chain.then(() => generateNow(deps, req));
  chain = run.catch(() => undefined);
  return run;
}

async function generateNow(deps: ImageDeps, req: ImageRequest): Promise<ImageOutcome> {
  const subject = ImageSubjectSchema.safeParse(req.subject);
  if (!subject.success)
    return { ok: false, reason: subject.error.issues[0]?.message ?? 'Describe the picture' };
  const project = deps.getProject();
  const slot = project?.slots.find((s) => s.id === req.slotId);
  if (!project || !slot) return { ok: false, reason: 'The graphic is gone' };
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  const look = lookFor(project.styleId);
  // A plain style pack has no image block: the default recipe, keyed.
  const image = 'image' in look ? look.image : undefined;
  const recipe = image?.recipe ?? DEFAULT_IMAGE_RECIPE;
  const tryKey = (image?.treatment ?? ['key']).includes('key');
  const hash = await sha256Hex(
    [
      cfg.modelImage,
      IMAGE_RECIPE_VERSION,
      recipe,
      tryKey ? 'key' : 'plain',
      subject.data.toLowerCase(),
    ].join('|'),
  );
  const apply = (asset: ImageAsset) => {
    const ok = deps.exec(
      setSlotImage(req.slotId, { role: req.role, subject: subject.data, asset }),
    );
    return ok;
  };

  // Same request as before: reuse the stored picture, free.
  const known = project.assets?.find((a) => a.hash === hash && a.status === 'ready');
  if (known && (await getImage(known.src ?? ''))) {
    apply(known);
    return { ok: true, asset: known, reused: true, credits: 0 };
  }

  if (cfg.killSwitch) return { ok: false, reason: 'Cloud AI is paused right now' };
  if (!deps.credits) return { ok: false, reason: 'Sign in to make pictures' };
  const cost = imageCost(cfg);
  const spent = await spendWithUi(
    deps.credits,
    { action: 'image', key: newSpendKey(), refId: req.slotId },
    cfg,
  );
  if (!spent) return { ok: false, reason: 'Not enough credits', noCredits: true };
  if (!spent.ok)
    return spent.reason === 'insufficient'
      ? { ok: false, reason: 'Not enough credits', noCredits: true }
      : { ok: false, reason: 'Couldn’t reserve the credits' };

  const report = deps.onUsage ?? emitAIUsage;
  const byokKey = !deps.generate ? getByokKey() : null;
  const charged = spent.cost;
  const t0 = performance.now();
  setBusy(req.slotId, subject.data);
  try {
    const imgInput = {
      subject: subject.data,
      recipe,
      keyed: tryKey,
      aspect: '1:1' as const,
    };
    const r = byokKey
      ? await generateImageWithGeminiByok(byokKey, cfg.modelImage, imgInput)
      : await (deps.generate ?? generateImageWithFirebase)(getAILogic, cfg.modelImage, imgInput);
    const raw = new Blob([r.bytes.slice().buffer], { type: r.mimeType });
    const img = await (deps.process ?? processImage)(raw, tryKey);
    const src = await putImage(hash, img.blob);
    const asset: ImageAsset = {
      id: hash.slice(0, 16),
      hash,
      status: 'ready',
      source: 'generated',
      subject: subject.data,
      keyed: img.keyed,
      width: img.width,
      height: img.height,
      src,
    };
    report({
      task: 'image.generate',
      ranOn: 'cloud',
      model: r.model,
      credits: charged,
      cloudCost: cost,
      latencyMs: Math.round(performance.now() - t0),
      ok: true,
    });
    // The slot may have been deleted or changed to a graphic without pictures meanwhile.
    const now = deps.getProject()?.slots.find((s) => s.id === req.slotId);
    if (!now || imageRoleOf(now.componentId) === null) {
      return { ok: true, asset, reused: false, credits: charged };
    }
    apply(asset);
    return { ok: true, asset, reused: false, credits: charged };
  } catch (err) {
    console.warn('Picture generation failed', err);
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
    return { ok: false, reason: 'Couldn’t make the picture. Credits returned.' };
  } finally {
    setBusy(req.slotId, null);
  }
}

/**
 * A picture the user brings (upload or the open media search): stored by the hash of its
 * bytes, keyed out when it happens to sit on a clean key colour, else framed. Free.
 */
export async function addOwnImage(
  deps: Pick<ImageDeps, 'getProject' | 'exec' | 'process'>,
  req: {
    slotId: string;
    role: string;
    subject: string;
    blob: Blob;
    source: 'upload' | 'openverse';
    attribution?: string;
  },
): Promise<ImageOutcome> {
  if (!req.blob.type.startsWith('image/')) return { ok: false, reason: 'That isn’t a picture' };
  if (req.blob.size > 10 * 1024 * 1024) return { ok: false, reason: 'Pictures up to 10 MB' };
  const hash = await sha256Hex(await req.blob.arrayBuffer());
  setBusy(req.slotId, req.subject);
  try {
    const img = await (deps.process ?? processImage)(req.blob, true);
    const src = await putImage(hash, img.blob);
    const asset: ImageAsset = {
      id: hash.slice(0, 16),
      hash,
      status: 'ready',
      source: req.source,
      subject: req.subject.slice(0, 120) || 'Picture',
      keyed: img.keyed,
      width: img.width,
      height: img.height,
      src,
      ...(req.attribution ? { attribution: req.attribution.slice(0, 240) } : {}),
    };
    const ok = deps.exec(
      setSlotImage(req.slotId, { role: req.role, subject: asset.subject, asset }),
    );
    return ok
      ? { ok: true, asset, reused: false, credits: 0 }
      : { ok: false, reason: 'Couldn’t add it' };
  } catch (e) {
    console.warn('Picture intake failed', e);
    return { ok: false, reason: 'Couldn’t read that picture' };
  } finally {
    setBusy(req.slotId, null);
  }
}

/** A starting subject for a slot: what the score already names, else its main line. */
export function suggestSubject(slot: { params: unknown }): string {
  const p = slot.params as { images?: { subject?: unknown }[]; content?: Record<string, unknown> };
  const named = p.images?.[0]?.subject;
  if (typeof named === 'string' && named.trim()) return named;
  const c = p.content ?? {};
  for (const k of ['caption', 'label', 'line', 'title', 'quote', 'headline']) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return '';
}
