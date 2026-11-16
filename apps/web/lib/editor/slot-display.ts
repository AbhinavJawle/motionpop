import { formatCount } from '@motionpop/motion';
import type { Slot } from '@motionpop/schemas';
import { componentFor } from '../motion/registry';

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
  return componentFor(componentId)?.name ?? PLANNED_NAMES[componentId] ?? componentId;
}

/**
 * The fields a summary reads: a component's params, or a scene score's `content` (spec 07),
 * so a stat-punch reads like a big-number.
 */
function fields(slot: Slot): Record<string, unknown> {
  const c = slot.params.content;
  return typeof c === 'object' && c !== null && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : slot.params;
}

const NUMBER_IDS = new Set(['big-number', 'stat-punch']);

function numberText(p: Record<string, unknown>): string | null {
  if (typeof p.value !== 'number') return null;
  return formatCount(p.value, {
    prefix: typeof p.prefix === 'string' ? p.prefix : undefined,
    suffix: typeof p.suffix === 'string' ? p.suffix : undefined,
    decimals: typeof p.decimals === 'number' ? p.decimals : undefined,
  });
}

/** A short summary of what the graphic shows, from its params. */
export function paramsSummary(slot: Slot): string | null {
  const p = fields(slot);
  const value = NUMBER_IDS.has(slot.componentId) ? numberText(p) : null;
  if (value) return typeof p.label === 'string' ? `${p.label} ${value}` : value;
  if (typeof p.title === 'string') return p.title;
  if (typeof p.line === 'string') return p.line;
  if (typeof p.label === 'string') return p.label;
  return null;
}

/** The value shown on a ready card's thumbnail tile ("40%"), if the graphic has one. */
export function thumbnailValue(slot: Slot): string | null {
  return NUMBER_IDS.has(slot.componentId) ? numberText(fields(slot)) : null;
}

function firstClause(text: string, max = 28): string {
  const clause = (text.split(/[:.]/)[0] ?? text).trim();
  return clause.length > max ? `${clause.slice(0, max - 1).trimEnd()}…` : `${clause}…`;
}

export interface SlotCardText {
  title: string;
  subtitle: string;
}

/** The card subtitles of a Generate in progress (spec 09 R6.4). */
export const GENERATE_PHASE_TEXT = {
  preparing: 'Preparing motion…',
  animating: 'Animating…',
} as const;

export function slotCardText(slot: Slot, phase?: keyof typeof GENERATE_PHASE_TEXT): SlotCardText {
  const name = componentName(slot.componentId);
  switch (slot.status) {
    case 'suggested':
      return { title: SKILL_NAMES[slot.skillId] ?? name, subtitle: 'Suggested' };
    case 'generating':
      return {
        title: firstClause(slot.prompt),
        subtitle: phase ? GENERATE_PHASE_TEXT[phase] : `Generating ${name.toLowerCase()}`,
      };
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
