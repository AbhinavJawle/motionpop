/**
 * Transient one-shot flag so a freshly uploaded/processed video project automatically starts
 * the gapless Video Choreography Engine on arrival in `/editor/[id]` (spec 19 R4.2) without ever
 * re-running on page reload.
 */
const pending = new Set<string>();

export function markAutoChoreograph(projectId: string): void {
  pending.add(projectId);
}

export function hasAutoChoreograph(projectId: string): boolean {
  return pending.has(projectId);
}

export function consumeAutoChoreograph(projectId: string): boolean {
  if (!pending.has(projectId)) return false;
  pending.delete(projectId);
  return true;
}
