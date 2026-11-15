import {
  DirectorPlanSchema,
  EnergySchema,
  type DirectorPlan,
  type Energy,
} from '@motionpop/schemas';
import type { z } from 'zod';

/**
 * The director's hard rules (spec 07 R6.1, design "AI flow" 2): "the AI plans, the code
 * enforces". `enforcePlan` runs on every plan, from the model or from `fallbackPlan`, and on
 * anything else too: a plan that doesn't parse is salvaged item by item. Pure and deterministic.
 */

/** What the director may pick for one scene (from the motion registry, passed in by the app). */
export interface PlanScene {
  /** Variant ids in the scene's order; the first is its safe default. */
  variants: readonly string[];
  /** The variant for the video's peak moment (e.g. stat-punch `hero`). */
  strongest: string;
  /** Whether the scene has an image role, so a planned image can land on it. */
  imageRole: boolean;
}

export interface PlanSlotInfo {
  /** Scene ids this slot may use, best first (the first is the detected scene). */
  candidates: readonly string[];
  /** The detector's 0..1 score: the fallback's peak is the highest. */
  score: number;
}

export interface PlanContext {
  slots: readonly PlanSlotInfo[];
  scenes: Readonly<Record<string, PlanScene>>;
  /** The look's motifs (mark and surface ids it can bring back). */
  motifs: readonly string[];
  /** `imagesPerVideoMax` from Remote Config. */
  imagesMax: number;
  /** The project's energy: the curve's base and the default for a slot the plan skips. */
  energy: Energy;
  /** Stable per project, for the variant rotation. */
  seed: number;
}

export interface EnforcedSlot {
  sceneId: string;
  variant: string;
  energy: Energy;
}

export interface EnforcedPlan {
  /** One entry per context slot, same order. */
  slots: EnforcedSlot[];
  /** Index of the peak slot, or -1 when there are no slots. */
  peak: number;
  /** Slots that get an image, best first, at most `imagesMax`, only scenes with an image role. */
  images: number[];
  motifs: { motif: string; slots: number[] }[];
  reasons: string[];
}

const ENERGIES = EnergySchema.options;
const level = (e: Energy) => ENERGIES.indexOf(e);
const atLevel = (n: number): Energy =>
  ENERGIES[Math.max(0, Math.min(ENERGIES.length - 1, n))] as Energy;

/** The items of `raw[key]` that parse on their own, so one bad entry doesn't sink the plan. */
function items<T>(raw: unknown, key: string, schema: z.ZodType<T>): T[] {
  const list = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const p = schema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}

const S = DirectorPlanSchema.shape;

/** A plan from anything: the whole plan when it parses, else every entry that does. */
export function salvagePlan(raw: unknown): DirectorPlan {
  const whole = DirectorPlanSchema.safeParse(raw);
  if (whole.success) return whole.data;
  const peak = S.peak.safeParse(
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).peak : undefined,
  );
  return {
    arc: items(raw, 'arc', S.arc.element),
    peak: peak.success ? peak.data : -1,
    scenes: items(raw, 'scenes', S.scenes.element),
    motifs: items(raw, 'motifs', S.motifs.element),
    images: items(raw, 'images', S.images.element),
    reasons: items(raw, 'reasons', S.reasons.unwrap().element),
  };
}

/** The highest-scoring slot, earliest on ties; -1 for none. */
export function scorePeak(slots: readonly PlanSlotInfo[]): number {
  let best = -1;
  slots.forEach((s, i) => {
    if (best < 0 || s.score > (slots[best] as PlanSlotInfo).score) best = i;
  });
  return best;
}

/**
 * The scene with this id, by own key only: a bare `ctx.scenes[id]` also finds Object.prototype
 * members, so an unknown id such as "toString" or "constructor" would pass as a scene.
 */
function sceneById(ctx: PlanContext, id: string): PlanScene | undefined {
  return Object.hasOwn(ctx.scenes, id) ? ctx.scenes[id] : undefined;
}

/** First variant of `scene` that differs from every id in `avoid`, starting at `from`. */
function differing(scene: PlanScene, from: number, avoid: readonly string[]): string | undefined {
  const n = scene.variants.length;
  for (let k = 0; k < n; k++) {
    const v = scene.variants[(from + k) % n] as string;
    if (!avoid.includes(v)) return v;
  }
  return undefined;
}

export function enforcePlan(raw: unknown, ctx: PlanContext): EnforcedPlan {
  const n = ctx.slots.length;
  if (n === 0) return { slots: [], peak: -1, images: [], motifs: [], reasons: [] };
  const plan = salvagePlan(raw);

  // 1. Scene per slot: the plan's first pick that is one of the slot's known candidates.
  const sceneOf = (i: number): string => {
    const cands = ctx.slots[i]?.candidates.filter((c) => sceneById(ctx, c) !== undefined) ?? [];
    const pick = plan.scenes.find((s) => s.slot === i && cands.includes(s.sceneId));
    return pick?.sceneId ?? cands[0] ?? '';
  };
  const sceneIds = Array.from({ length: n }, (_, i) => sceneOf(i));
  const wanted = (i: number): string | undefined => {
    const scene = sceneById(ctx, sceneIds[i] as string);
    const pick = plan.scenes.find((s) => s.slot === i && s.sceneId === sceneIds[i]);
    return pick?.variant && scene?.variants.includes(pick.variant) ? pick.variant : undefined;
  };

  // 2. The peak: the plan's if it names a slot, else the highest score.
  const peak = plan.peak >= 0 && plan.peak < n ? plan.peak : scorePeak(ctx.slots);

  // 3. Variants: the peak gets its scene's strongest; the others keep the plan's choice or a
  //    seeded rotation; then no two neighbours share a scene and a variant.
  const variants: (string | undefined)[] = new Array<string | undefined>(n).fill(undefined);
  const peakScene = sceneById(ctx, sceneIds[peak] as string);
  if (peakScene) {
    variants[peak] = peakScene.variants.includes(peakScene.strongest)
      ? peakScene.strongest
      : peakScene.variants[0];
  }
  for (let i = 0; i < n; i++) {
    if (i === peak) continue;
    const scene = sceneById(ctx, sceneIds[i] as string);
    if (!scene || scene.variants.length === 0) continue;
    const rot = Math.abs(Math.trunc(ctx.seed) + i) % scene.variants.length;
    const first = wanted(i) ?? (scene.variants[rot] as string);
    const avoid = [i - 1, i + 1]
      .filter((j) => j >= 0 && j < n && sceneIds[j] === sceneIds[i])
      .map((j) => variants[j])
      .filter((v): v is string => v !== undefined);
    variants[i] = avoid.includes(first)
      ? (differing(scene, scene.variants.indexOf(first) + 1, avoid) ??
        differing(scene, 0, avoid.slice(0, 1)) ??
        first)
      : first;
  }

  // 4. Energy: the plan's arc (first entry per slot), the project energy where it says nothing;
  //    neighbours differ by at most one step, except next to the peak.
  const energies = Array.from(
    { length: n },
    (_, i) => plan.arc.find((a) => a.slot === i)?.energy ?? ctx.energy,
  );
  for (let i = 1; i < n; i++) {
    if (i === peak || i - 1 === peak) continue;
    const prev = level(energies[i - 1] as Energy);
    energies[i] = atLevel(Math.min(prev + 1, Math.max(prev - 1, level(energies[i] as Energy))));
  }

  // 5. Images: known slots whose scene can show one, no repeats, at most the cap.
  const images: number[] = [];
  for (const i of plan.images) {
    if (images.length >= Math.max(0, Math.floor(ctx.imagesMax))) break;
    if (i >= n || images.includes(i)) continue;
    if (sceneById(ctx, sceneIds[i] as string)?.imageRole) images.push(i);
  }

  // 6. Motifs: the look's own, once each, on known slots.
  const motifs: EnforcedPlan['motifs'] = [];
  for (const m of plan.motifs) {
    if (!ctx.motifs.includes(m.motif) || motifs.some((x) => x.motif === m.motif)) continue;
    const slots = [...new Set(m.slots.filter((i) => i < n))].sort((a, b) => a - b);
    if (slots.length) motifs.push({ motif: m.motif, slots });
  }

  return {
    slots: sceneIds.map((sceneId, i) => ({
      sceneId,
      variant: variants[i] ?? '',
      energy: energies[i] as Energy,
    })),
    peak,
    images,
    motifs,
    reasons: (plan.reasons ?? []).slice(0, n).map((r) => r.slice(0, 160)),
  };
}
