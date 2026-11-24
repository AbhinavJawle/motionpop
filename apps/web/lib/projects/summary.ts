import {
  SLOT_STATES_MAX,
  type EditorProject,
  type ProjectStatus,
  type ProjectSummary,
} from '@motionpop/schemas';
import { buildProjectPreview } from './preview';

/** Version sources that count as a generated graphic (design §2.2). */
const AI_SOURCES = new Set(['ai-device', 'ai-cloud', 'ai-claude', 'plan']);

/**
 * What the dashboard lists for a project, from the project alone (pure). `ready` means every
 * slot (or directed reel scene) has its graphic; render state is never stored here (D-065 #15).
 * Carries a real content `preview` (spec 41) so cards never show generic look placeholders.
 */
export function summarise(p: EditorProject): ProjectSummary {
  const ordered = [...p.slots].sort((a, b) => a.startMs - b.startMs);
  const isReel = Boolean(p.video && p.reel && p.reel.scenes.length > 0 && ordered.length === 0);
  const reelScenes = isReel ? (p.reel?.scenes.length ?? 0) : 0;
  const slotCount = isReel ? reelScenes : ordered.length;
  const readySlotCount = isReel ? reelScenes : ordered.filter((s) => s.status === 'ready').length;
  const status: ProjectStatus = slotCount > 0 && readySlotCount === slotCount ? 'ready' : 'draft';
  const slotStates: ProjectSummary['slotStates'] = isReel
    ? Array.from({ length: Math.min(SLOT_STATES_MAX, reelScenes) }, () => 'ready' as const)
    : ordered.slice(0, SLOT_STATES_MAX).map((s) => (s.status === 'ready' ? 'ready' : 'pending'));
  return {
    id: p.id,
    title: p.title,
    format: p.format,
    styleId: p.styleId,
    durationMs: p.durationMs,
    status,
    slotCount,
    readySlotCount,
    slotStates,
    graphicsGenerated: p.versions.filter((v) => AI_SOURCES.has(v.source)).length,
    preview: buildProjectPreview(p),
    lastOpenedAt: p.lastOpenedAt ?? p.updatedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Every audio/media ref a stored project points at, read loosely so damaged saves are cleaned too. */
export function audioRefsOf(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const obj = raw as {
    voiceover?: { src?: unknown; originalSrc?: unknown };
    stockOverlays?: { src?: unknown }[];
    stockAudio?: { src?: unknown }[];
  };
  const refs: unknown[] = [obj.voiceover?.src, obj.voiceover?.originalSrc];
  if (Array.isArray(obj.stockOverlays)) {
    for (const c of obj.stockOverlays) refs.push(c?.src);
  }
  if (Array.isArray(obj.stockAudio)) {
    for (const c of obj.stockAudio) refs.push(c?.src);
  }
  return [...new Set(refs.filter((r): r is string => typeof r === 'string' && r.length > 0))];
}
