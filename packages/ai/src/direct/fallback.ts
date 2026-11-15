import { EnergySchema, type DirectorPlan, type Energy } from '@motionpop/schemas';
import { scorePeak, type PlanContext } from './enforce';

const ENERGIES = EnergySchema.options;
const step = (e: Energy, by: number): Energy =>
  ENERGIES[Math.max(0, Math.min(ENERGIES.length - 1, ENERGIES.indexOf(e) + by))] as Energy;

/**
 * The code-only plan (spec 07 R6.1, design "AI flow" 2): used when `direct.plan` fails, stays
 * invalid after its repair, or no model is available. The peak is the highest-scoring slot; the
 * energy rises to one step above the project's at the peak and releases after it; scenes are
 * each slot's first candidate with no variant, so the enforcer's seeded rotation picks them;
 * images go to the best-scoring image-capable slots, spread out; the look's first motif opens
 * and closes the video. Pure and deterministic. `enforcePlan` runs on it like on any plan.
 */
export function fallbackPlan(ctx: PlanContext): DirectorPlan {
  const n = ctx.slots.length;
  const peak = scorePeak(ctx.slots);
  const arc = ctx.slots.map((_, i) => ({
    slot: i,
    // Rise and release: the peak one step up, the last slot after it one step down.
    energy:
      i === peak
        ? step(ctx.energy, 1)
        : i === n - 1 && i > peak + 1
          ? step(ctx.energy, -1)
          : ctx.energy,
  }));
  const scenes = ctx.slots.flatMap((s, i) =>
    s.candidates[0] !== undefined ? [{ slot: i, sceneId: s.candidates[0] }] : [],
  );
  // Best score first (earlier on ties), never two neighbours while others are left.
  const capable = ctx.slots
    .map((s, i) => ({ i, score: s.score, ok: ctx.scenes[s.candidates[0] ?? '']?.imageRole }))
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const images: number[] = [];
  const cap = Math.max(0, Math.floor(ctx.imagesMax));
  for (const pass of [true, false]) {
    for (const x of capable) {
      if (images.length >= cap) break;
      if (images.includes(x.i)) continue;
      if (pass && images.some((j) => Math.abs(j - x.i) < 2)) continue;
      images.push(x.i);
    }
  }
  const motif = ctx.motifs[0];
  return {
    arc,
    peak: Math.max(0, peak),
    scenes,
    motifs: motif && n > 0 ? [{ motif, slots: [...new Set([0, n - 1])] }] : [],
    images,
  };
}
