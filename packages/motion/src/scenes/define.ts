import { z } from 'zod';
import type { Format, MotionComponent } from '../contract';
import type { CueSpec } from '../engine/beats';
import type { SceneContext, StageComposition } from '../engine/stage';

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
  cues: readonly SceneCue[];
  /** The cue that lands on the spoken word when the score gives no anchors. */
  focalCue: string;
  imageRoles: readonly ImageRoleDef[];
  durationMs: { min: number; ideal: number; max: number };
  formats: Format[];
  build: (ctx: SceneContext, score: SceneScore<C>, variant: string) => StageComposition;
}

export interface Scene<C> extends MotionComponent<SceneScore<C>> {
  useWhen: string;
  content: z.ZodType<C>;
  variants: readonly VariantDef[];
  cues: readonly SceneCue[];
  focalCue: string;
  imageRoles: readonly ImageRoleDef[];
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
    cues: def.cues,
    focalCue: def.focalCue,
    imageRoles: def.imageRoles,
    params,
    defaults: { content: def.defaultContent, beats: [], images: [] },
    durationMs: def.durationMs,
    formats: def.formats,
    keyMomentMs: (_p, durationMs) => Math.round(Math.min(1200, durationMs * 0.35)),
    build(ctx, score) {
      // Without word timings (checks, samples, a slot over silence) the focal cue lands on the
      // key moment: one synthetic word there keeps a single code path.
      const words = ctx.words ?? [{ startMs: ctx.keyMomentMs, endMs: ctx.keyMomentMs + 300 }];
      const beats =
        score.beats.length > 0
          ? score.beats
          : [{ cue: def.focalCue, word: nearest(words, ctx.keyMomentMs) }];
      return def.build(
        { ...ctx, words },
        { ...score, beats },
        pickVariant(def.variants, score.variant, ctx.seed),
      );
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
