import { components, formatCount } from '@motionpop/motion';
import type { Slot } from '@motionpop/schemas';

/**
 * Display text for slots on the timeline and in the inspector (editor.png). Names for
 * components that land in spec 07 are listed here so suggested and generating slots read well.
 */
const PLANNED_NAMES: Record<string, string> = {
  'title-card': 'Title card',
  'bar-chart': 'Bar chart',
  'line-chart': 'Line chart',
  'map-zoom': 'Map',
  callout: 'Callout',
  'lower-third': 'Lower third',
  custom: 'Custom graphic',
};

const SKILL_NAMES: Record<string, string> = {
  'opening-title': 'Opening title',
};

export function componentName(componentId: string): string {
  const c = (components as Record<string, { name: string } | undefined>)[componentId];
  return c?.name ?? PLANNED_NAMES[componentId] ?? componentId;
}

/** A short summary of what the graphic shows, from its params. */
export function paramsSummary(slot: Slot): string | null {
  const p = slot.params;
  if (slot.componentId === 'big-number' && typeof p.value === 'number') {
    const value = formatCount(p.value, {
      prefix: typeof p.prefix === 'string' ? p.prefix : undefined,
      suffix: typeof p.suffix === 'string' ? p.suffix : undefined,
      decimals: typeof p.decimals === 'number' ? p.decimals : undefined,
    });
    return typeof p.label === 'string' ? `${p.label} ${value}` : value;
  }
  if (typeof p.title === 'string') return p.title;
  if (typeof p.label === 'string') return p.label;
  return null;
}

/** The value shown on a ready card's thumbnail tile ("40%"), if the graphic has one. */
export function thumbnailValue(slot: Slot): string | null {
  const p = slot.params;
  if (slot.componentId !== 'big-number' || typeof p.value !== 'number') return null;
  return formatCount(p.value, {
    prefix: typeof p.prefix === 'string' ? p.prefix : undefined,
    suffix: typeof p.suffix === 'string' ? p.suffix : undefined,
    decimals: typeof p.decimals === 'number' ? p.decimals : undefined,
  });
}

function firstClause(text: string, max = 28): string {
  const clause = (text.split(/[:.]/)[0] ?? text).trim();
  return clause.length > max ? `${clause.slice(0, max - 1).trimEnd()}…` : `${clause}…`;
}

export interface SlotCardText {
  title: string;
  subtitle: string;
}

export function slotCardText(slot: Slot): SlotCardText {
  const name = componentName(slot.componentId);
  switch (slot.status) {
    case 'suggested':
      return { title: SKILL_NAMES[slot.skillId] ?? name, subtitle: 'Suggested' };
    case 'generating':
      return { title: firstClause(slot.prompt), subtitle: `Generating ${name.toLowerCase()}` };
    case 'failed':
      return { title: name, subtitle: "Couldn't generate" };
    case 'ready':
      return { title: name, subtitle: paramsSummary(slot) ?? `${name} · Ready` };
  }
}

/** "0:04.2" */
export function formatClock(ms: number): string {
  const tenths = Math.round(ms / 100);
  const m = Math.floor(tenths / 600);
  const s = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

/** "00:05.6" */
export function formatTimecode(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const m = String(Math.floor(tenths / 600)).padStart(2, '0');
  const s = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

/** The words a slot is linked to, as spoken ("revenue grew forty percent since 2020"). */
export function spokenText(slot: Slot, words: ReadonlyArray<{ text: string }>): string {
  return words
    .slice(slot.wordStart, slot.wordEnd + 1)
    .map((w) => w.text)
    .join(' ')
    .replace(/[.,!?;:]+$/, '');
}
