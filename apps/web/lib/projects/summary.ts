import {
  SLOT_STATES_MAX,
  type EditorProject,
  type ProjectStatus,
  type ProjectSummary,
} from '@motionpop/schemas';

/** Version sources that count as a generated graphic (design §2.2). */
const AI_SOURCES = new Set(['ai-device', 'ai-cloud', 'ai-claude', 'plan']);

/**
 * What the dashboard lists for a project, from the project alone (pure). `ready` means every
 * slot has a graphic; render state is never stored here (D-065 #15). No poster yet: cards show
 * the style's static poster until live posters land (task 12).
 */
export function summarise(p: EditorProject): ProjectSummary {
  const ordered = [...p.slots].sort((a, b) => a.startMs - b.startMs);
  const readySlotCount = ordered.filter((s) => s.status === 'ready').length;
  const status: ProjectStatus =
    ordered.length > 0 && readySlotCount === ordered.length ? 'ready' : 'draft';
  return {
    id: p.id,
    title: p.title,
    format: p.format,
    styleId: p.styleId,
    durationMs: p.durationMs,
    status,
    slotCount: ordered.length,
    readySlotCount,
    slotStates: ordered
      .slice(0, SLOT_STATES_MAX)
      .map((s) => (s.status === 'ready' ? 'ready' : 'pending')),
    graphicsGenerated: p.versions.filter((v) => AI_SOURCES.has(v.source)).length,
    lastOpenedAt: p.lastOpenedAt ?? p.updatedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Every audio ref a stored project points at, read loosely so damaged saves are cleaned too. */
export function audioRefsOf(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const v = (raw as { voiceover?: unknown }).voiceover;
  if (typeof v !== 'object' || v === null) return [];
  const refs = [(v as { src?: unknown }).src, (v as { originalSrc?: unknown }).originalSrc];
  return [...new Set(refs.filter((r): r is string => typeof r === 'string' && r.length > 0))];
}
