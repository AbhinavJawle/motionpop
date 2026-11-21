// Reel engine (spec 26 R1.5): where a carried scene's graphic really began. A carried scene
// continues the last graphic with the same template (other scenes may sit in between), so it is
// built and timed from that graphic's start: items already shown stay shown.
import type { ReelScene } from '@motionpop/schemas';

export function carryOrigins(scenes: readonly ReelScene[]): Map<ReelScene, number> {
  const origins = new Map<ReelScene, number>();
  const lastOf = new Map<string, ReelScene>();
  for (const s of scenes) {
    if (s.layout === 'speaker') continue;
    const prev = lastOf.get(s.content.template);
    origins.set(s, s.carry && prev ? (origins.get(prev) ?? prev.startMs) : s.startMs);
    lastOf.set(s.content.template, s);
  }
  return origins;
}

/** True when a carried scene directly follows its own graphic (no other graphic between). */
export function carriedInPlace(scenes: readonly ReelScene[], i: number): boolean {
  const s = scenes[i];
  if (!s?.carry) return false;
  for (let k = i - 1; k >= 0; k--) {
    const p = scenes[k]!;
    if (p.layout === 'speaker') continue;
    return p.content.template === s.content.template;
  }
  return false;
}
