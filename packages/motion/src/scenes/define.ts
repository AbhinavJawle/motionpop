import { z } from 'zod';
import type { Format, MotionComponent } from '../contract';
import type { CueSpec } from '../engine/beats';
import type { SceneContext, StageComposition } from '../engine/stage';
import { buildCompanionLayer } from './companion-layer';
import { buildImageLayer, splitFrame } from './image-layer';

/**
 * A scene (spec 07 R2): hand-crafted choreography for one kind of moment. It is a
 * `MotionComponent` whose params are the score, so slots, versions, the compiler and quick
 * edits treat it like any component.
 */
export interface SceneScore<C> {
  variant?: string | undefined;
  content: C;
  beats: { cue: string; word: number }[];
  images: { role: string; subject: string; assetId?: string | undefined }[];
}

export interface VariantDef {
  id: string;
  /** One line for the AI: when this variant fits. */
  about: string;
}

export interface SceneCue extends CueSpec {
  /** One line for the AI: what lands on this cue. */
  about: string;
}

export interface ImageRoleDef {
  id: string;
  aspect: '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
  about: string;
}

export interface SceneDef<C> {
  id: string;
  name: string;
  category: MotionComponent<unknown>['category'];
  useWhen: string;
  content: z.ZodType<C>;
  defaultContent: C;
  /** At least 3. The first is the safe default. */
  variants: readonly [VariantDef, VariantDef, VariantDef, ...VariantDef[]];
  /** The variant for the video's peak moment (the director gives it to the peak slot). */
  peakVariant: string;
  cues: readonly SceneCue[];
  /** The cue that lands on the spoken word when the score gives no anchors. */
  focalCue: string;
  imageRoles: readonly ImageRoleDef[];
  /** Share of the frame a ready image takes (default 0.42; a photo-led scene takes more). */
  imageShare?: number;
  durationMs: { min: number; ideal: number; max: number };
  formats: Format[];
  /**
   * Safe-default content from the slot's own words (spec 07 R1.4), or null when the words don't
   * give it (then `defaultContent` is used). Deterministic, no AI.
   */
  safe?: (words: readonly string[]) => C | null;
  /** When the focal element lands with no word timings. Default: 35 % in, at most 1.2 s. */
  keyMomentMs?: (durationMs: number) => number;
  build: (ctx: SceneContext, score: SceneScore<C>, variant: string) => StageComposition;
}

export interface Scene<C> extends MotionComponent<SceneScore<C>> {
  useWhen: string;
  content: z.ZodType<C>;
  variants: readonly VariantDef[];
  peakVariant: string;
  cues: readonly SceneCue[];
  focalCue: string;
  imageRoles: readonly ImageRoleDef[];
  defaultContent: C;
  safe?: (words: readonly string[]) => C | null;
  build: (ctx: SceneContext, score: SceneScore<C>) => StageComposition;
}

/**
 * The scene's concrete score schema: `variant`, `cue` and `role` are enums of this scene's ids
 * and `content` is its own schema, so structured output can only name things that exist
 * (ai-tasks.md schema rules).
 */
export function scoreSchemaFor<C>(
  def: Pick<SceneDef<C>, 'content' | 'variants' | 'cues' | 'imageRoles'>,
) {
  const ids = <T extends { id: string }>(list: readonly T[]) =>
    list.map((x) => x.id) as [string, ...string[]];
  const images = def.imageRoles.length
    ? z
        .array(
          z.object({
            role: z.enum(ids(def.imageRoles)),
            subject: z.string().min(1).max(120),
            assetId: z.string().min(1).optional(),
          }),
        )
        .max(def.imageRoles.length)
        .default([])
    : z.array(z.never()).max(0).default([]);
  return z.object({
    variant: z.enum(ids(def.variants)).optional(),
    content: def.content,
    beats: z
      .array(z.object({ cue: z.enum(ids(def.cues)), word: z.number().int().nonnegative() }))
      .max(def.cues.length)
      .default([]),
    images,
  });
}

/** The variant to use: the score's, or a seeded pick so neighbouring slots differ. */
export function pickVariant(
  variants: readonly VariantDef[],
  wanted: string | undefined,
  seed: number,
): string {
  if (wanted && variants.some((v) => v.id === wanted)) return wanted;
  return (variants[Math.abs(Math.trunc(seed)) % variants.length] as VariantDef).id;
}

export function defineScene<C>(def: SceneDef<C>): Scene<C> {
  const params = scoreSchemaFor(def) as unknown as z.ZodType<SceneScore<C>>;
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    useWhen: def.useWhen,
    content: def.content,
    variants: def.variants,
    peakVariant: def.variants.some((v) => v.id === def.peakVariant)
      ? def.peakVariant
      : def.variants[0].id,
    cues: def.cues,
    focalCue: def.focalCue,
    imageRoles: def.imageRoles,
    defaultContent: def.defaultContent,
    ...(def.safe ? { safe: def.safe } : {}),
    params,
    defaults: { content: def.defaultContent, beats: [], images: [] },
    durationMs: def.durationMs,
    formats: def.formats,
    keyMomentMs: (_p, durationMs) =>
      Math.round(def.keyMomentMs?.(durationMs) ?? Math.min(1200, durationMs * 0.35)),
    build(ctx, score) {
      // Without word timings (checks, samples, a slot over silence) the focal cue lands on the
      // key moment: one synthetic word there keeps a single code path.
      const words = ctx.words?.length
        ? ctx.words
        : [{ startMs: ctx.keyMomentMs, endMs: ctx.keyMomentMs + 300 }];
      const beats =
        score.beats.length > 0
          ? score.beats
          : [{ cue: def.focalCue, word: nearest(words, ctx.keyMomentMs) }];
      const staging = ctx.staging;
      // The climax lands in the scene's strongest variant (spec 07c R3.3).
      const variant = staging?.climax
        ? def.peakVariant
        : pickVariant(def.variants, score.variant, ctx.seed);
      // The slot before the climax is held calm: stillness before the climax.
      const sctx: SceneContext = staging?.calm ? { ...ctx, energy: 'calm' } : ctx;
      // A ready image for one of this scene's roles splits the frame (image-layer.ts); without
      // one, the video plan's companion may take the open side instead (spec 07c R2).
      const roles = new Set(def.imageRoles.map((r) => r.id));
      const pick = score.images.find(
        (i) => roles.has(i.role) && i.assetId && ctx.images?.[i.assetId],
      );
      const ref = pick?.assetId ? ctx.images?.[pick.assetId] : undefined;
      const companion = !ref && roles.size > 0 ? (staging?.companion ?? null) : null;
      if (!ref && !companion) return def.build({ ...sctx, words }, { ...score, beats }, variant);

      const share = ref
        ? (def.imageShare ?? 0.42)
        : // A count needs room to be counted; a stamp is a smaller accent.
          companion?.kind === 'stamp'
          ? 0.36
          : 0.44;
      const sideSeed = staging ? (staging.side === 'left' ? 0 : 1) : ctx.seed;
      const split = splitFrame(ctx.format, ctx.width, ctx.height, share, sideSeed);
      const doc = ctx.root.ownerDocument;
      ctx.root.style.cssText = 'position:absolute;inset:0;';
      const sub = doc.createElement('div');
      sub.style.cssText = `position:absolute;left:${split.text.x}px;top:${split.text.y}px;width:${split.text.width}px;height:${split.text.height}px;`;
      const inner = doc.createElement('div');
      sub.append(inner);
      ctx.root.append(sub);
      const comp = def.build(
        {
          ...sctx,
          root: inner,
          width: split.text.width,
          height: split.text.height,
          format: split.textFormat,
          words,
        },
        { ...score, beats },
        variant,
      );
      // The text root fills the sub-frame (the stage set inset:0 on it).
      const cues = comp.report.plan.cues;
      const first = Math.min(...cues.map((c) => c.startMs), ctx.keyMomentMs);
      const exit = ctx.exit ?? 'fade';
      let layer: { el: HTMLElement; seek: (tMs: number) => void; landMs: number };
      if (ref) {
        layer = buildImageLayer({
          doc,
          parent: ctx.root,
          box: split.image,
          ref,
          style: ctx.style,
          look: ctx.look,
          seed: ctx.seed,
          durationMs: ctx.durationMs,
          enterAtMs: Math.max(0, first - 250),
          exit,
          frameH: ctx.height,
        });
      } else {
        // Counting companions run with the focal cue (the number counts, the dots fill); a
        // stamp arrives just ahead of the first cue, like a picture would.
        const focal = cues.find((c) => c.id === def.focalCue);
        const counts = companion!.kind !== 'stamp' && focal !== undefined;
        layer = buildCompanionLayer({
          doc,
          parent: ctx.root,
          box: split.image,
          companion: companion!,
          style: ctx.style,
          look: ctx.look,
          seed: ctx.seed,
          durationMs: ctx.durationMs,
          startMs: counts ? focal.startMs : Math.max(0, first - 250),
          landMs: counts ? focal.landMs : Math.max(0, first - 250) + 700,
          exitStartMs: comp.report.plan.exitStartMs,
          exit,
          frameH: ctx.height,
        });
      }
      ctx.root.insertBefore(layer.el, sub);
      return {
        ...comp,
        seek(tMs) {
          layer.seek(tMs);
          comp.seek(tMs);
        },
        soundCues: [
          ...comp.soundCues,
          { atMs: layer.landMs, kind: 'enter' as const, sound: ref ? 'whoosh' : 'pop' },
        ].sort((a, b) => a.atMs - b.atMs),
        dispose() {
          comp.dispose();
          layer.el.remove();
          sub.remove();
        },
      };
    },
  };
}

function nearest(words: readonly { startMs: number }[], tMs: number): number {
  let best = 0;
  words.forEach((w, i) => {
    if (Math.abs(w.startMs - tMs) < Math.abs((words[best] as { startMs: number }).startMs - tMs))
      best = i;
  });
  return best;
}
