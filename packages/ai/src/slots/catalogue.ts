/**
 * Component and director-skill catalogue for slot detection (spec 06 R2.4). Mirrors
 * `.kiro/steering/component-library.md` and the frontmatter of `skills/*.md`; tests check both
 * against the files and the `@motionpop/motion` registry, so drift fails CI. `packages/ai`
 * doesn't import rendering code: durations for built components are copied here and verified.
 */

export interface CatalogueEntry {
  id: string;
  name: string;
  /** "Use when" line from component-library.md (prompt material for slots.detect). */
  useWhen: string;
  minMs: number;
  idealMs: number;
  maxMs: number;
  /** Exists in the motion registry and can render now. */
  built: boolean;
}

export const CATALOGUE: readonly CatalogueEntry[] = [
  {
    id: 'kinetic-headline',
    name: 'Kinetic headline',
    useWhen: 'a strong statement, title, chapter, hook or quote without data',
    minMs: 2500,
    idealMs: 4000,
    maxMs: 8000,
    built: false,
  },
  {
    id: 'big-number',
    name: 'Big number',
    useWhen: 'one striking number, percentage, money amount or count',
    // Same as the registry (checked by catalogue.test.ts).
    minMs: 2600,
    idealMs: 3600,
    maxMs: 8000,
    built: true,
  },
  {
    id: 'bar-chart',
    name: 'Bar chart',
    useWhen: 'comparing 2–8 values',
    minMs: 3500,
    idealMs: 5000,
    maxMs: 10000,
    built: false,
  },
  {
    id: 'line-chart',
    name: 'Line chart',
    useWhen: 'a trend over time, growth or decline',
    minMs: 3500,
    idealMs: 5500,
    maxMs: 10000,
    built: false,
  },
  {
    id: 'callout',
    name: 'Callout',
    useWhen: 'introducing a person or term, a quote, a takeaway, or labelling something',
    minMs: 2000,
    idealMs: 3500,
    maxMs: 8000,
    built: false,
  },
  {
    id: 'map-zoom',
    name: 'Map zoom',
    useWhen: 'a place, route or spread is mentioned',
    minMs: 3500,
    idealMs: 5000,
    maxMs: 10000,
    built: false,
  },
];

export interface SkillEntry {
  id: string;
  useWhen: string;
  worksWith: readonly string[];
  defaultDurationMs: number;
}

export const SKILLS: readonly SkillEntry[] = [
  {
    id: 'brand-sting',
    useWhen: 'intro, outro, channel name, product name, or a call to action at the start/end',
    worksWith: ['kinetic-headline', 'callout'],
    defaultDurationMs: 3000,
  },
  {
    id: 'calm-explanation',
    useWhen: 'the narration explains a concept, definition or key idea without numbers',
    worksWith: ['kinetic-headline', 'callout'],
    defaultDurationMs: 5000,
  },
  {
    id: 'contrast-split',
    useWhen:
      'the narration compares two things (before/after, A vs B, us vs them, expectation vs reality)',
    worksWith: ['bar-chart', 'big-number', 'kinetic-headline'],
    defaultDurationMs: 5000,
  },
  {
    id: 'countdown-ranking',
    useWhen: 'the narration lists or ranks items (top 3, biggest, first/second/third)',
    worksWith: ['bar-chart', 'kinetic-headline'],
    defaultDurationMs: 6000,
  },
  {
    id: 'journey-along-a-timeline',
    useWhen: 'the narration walks through dates, years, steps or a sequence of events',
    worksWith: ['kinetic-headline', 'callout', 'line-chart'],
    defaultDurationMs: 6000,
  },
  {
    id: 'shocking-stat-reveal',
    useWhen: 'the narration states a single surprising number, percentage or money amount',
    worksWith: ['big-number', 'kinetic-headline'],
    defaultDurationMs: 4000,
  },
  {
    id: 'slow-build-trend',
    useWhen: 'the narration describes growth, decline or change over time',
    worksWith: ['line-chart', 'bar-chart'],
    defaultDurationMs: 6000,
  },
  {
    id: 'zoom-from-world-to-place',
    useWhen: 'the narration mentions a country, city, region, route or where something happened',
    worksWith: ['map-zoom'],
    defaultDurationMs: 5000,
  },
];

const byId = new Map(CATALOGUE.map((c) => [c.id, c]));
const skillById = new Map(SKILLS.map((s) => [s.id, s]));

export const catalogueEntry = (id: string): CatalogueEntry | undefined => byId.get(id);
export const skillEntry = (id: string): SkillEntry | undefined => skillById.get(id);

/** Duration limits for the post-pass; unknown ids get null (the suggestion is dropped). */
export function componentLimits(
  id: string,
): { minMs: number; idealMs: number; maxMs: number } | null {
  const c = byId.get(id);
  return c ? { minMs: c.minMs, idealMs: c.idealMs, maxMs: c.maxMs } : null;
}
