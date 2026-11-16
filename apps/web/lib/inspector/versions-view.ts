import type { EditorProject, Slot, Version } from '@motionpop/schemas';

/** Tiles shown at a time (spec 09 R5.2). */
export const TILES_PER_PAGE = 3;

/** The slot's versions, oldest first (the order they were made in). */
export function slotVersions(project: Pick<EditorProject, 'versions'>, slotId: string): Version[] {
  return project.versions.filter((v) => v.slotId === slotId);
}

/** The window shown by default: the newest `TILES_PER_PAGE`. */
export function lastPageStart(count: number): number {
  return Math.max(0, count - TILES_PER_PAGE);
}

/**
 * Pages by three: ‹ goes older, › goes newer. The start is kept inside `[0, count - 3]` (or 0
 * with fewer than three versions), so a page never shows a hole.
 */
export function pageStart(current: number, count: number, dir: 'older' | 'newer'): number {
  const max = lastPageStart(count);
  const next = dir === 'older' ? current - TILES_PER_PAGE : current + TILES_PER_PAGE;
  return Math.min(max, Math.max(0, next));
}

export function canPage(start: number, count: number, dir: 'older' | 'newer'): boolean {
  return dir === 'older' ? start > 0 : start < lastPageStart(count);
}

/** "v3": the position of the current version among the slot's versions, or null when none is current. */
export function positionLabel(
  versions: readonly Version[],
  currentId: string | undefined,
): string | null {
  const i = versions.findIndex((v) => v.id === currentId);
  return i < 0 ? null : `v${i + 1}`;
}

/** A version of another component (the slot changed since) can be seen but not restored (design edge cases). */
export function restorable(
  slot: Pick<Slot, 'componentId' | 'currentVersionId'>,
  v: Version,
): boolean {
  return v.componentId === slot.componentId && v.id !== slot.currentVersionId;
}

export type GlyphKind = 'bars' | 'lines' | 'split';

/** What a version tile draws: bars for numbers and data, lines for statements, halves for a comparison. */
export function glyphKind(componentId: string): GlyphKind {
  if (componentId === 'versus') return 'split';
  if (
    componentId === 'hook-statement' ||
    componentId === 'title-card' ||
    componentId === 'callout'
  ) {
    return 'lines';
  }
  return 'bars';
}

const ROUTE: Record<Version['source'], string> = {
  'ai-device': 'on-device',
  'ai-cloud': 'cloud',
  'ai-claude': 'cloud',
  user: 'by you',
  plan: 'Pip’s plan',
  default: 'template',
};

/** "2 min ago", "just now". */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** The tile's tooltip: "Quick edit · on-device · 2 min ago". */
export function versionTitle(v: Version, now: number): string {
  return [v.label?.trim() || 'Version', ROUTE[v.source], relativeTime(v.createdAt, now)].join(
    ' · ',
  );
}

/** The top bar's history button (R5.5): scrolls the inspector to VERSIONS; false when there is nothing to show. */
export function scrollToVersions(doc: Document, reducedMotion: boolean): boolean {
  const el = doc.querySelector<HTMLElement>('[data-inspector-versions]');
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  el.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  return true;
}

export const NO_SELECTION_TOAST = 'Select a graphic to see its versions.';
