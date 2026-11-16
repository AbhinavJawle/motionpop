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
    worksWith: ['kinetic-headline', 'callout', 'quote', 'photo-evidence'],
    defaultDurationMs: 5000,
  },
  {
    id: 'contrast-split',
    useWhen:
      'the narration compares two things (before/after, A vs B, us vs them, expectation vs reality)',
    worksWith: ['versus', 'bar-chart', 'big-number', 'kinetic-headline'],
    defaultDurationMs: 5000,
  },
  {
    id: 'countdown-ranking',
    useWhen: 'the narration lists or ranks items (top 3, biggest, first/second/third)',
    worksWith: ['bar-chart', 'kinetic-headline', 'list-stack'],
    defaultDurationMs: 6000,
  },
  {
    id: 'journey-along-a-timeline',
    useWhen: 'the narration walks through dates, years, steps or a sequence of events',
    worksWith: ['kinetic-headline', 'callout', 'line-chart', 'timeline'],
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

export interface SceneEntry extends CatalogueEntry {
  /**
   * Components this scene supersedes for new detections (spec 07 task 27). They stay in the
   * motion registry so saved projects keep rendering; detection offers the scene instead, and
   * a skill that works with a replaced component works with its scene.
   */
  replaces: readonly string[];
}

/**
 * Scenes (spec 07): mirror the `scenes` registry in `@motionpop/motion` (catalogue.test.ts checks
 * ids, names, "use when" lines and durations), so the detector and `slots.detect` can pick them.
 */
export const SCENES: readonly SceneEntry[] = [
  {
    id: 'stat-punch',
    name: 'Stat punch',
    useWhen: 'the narration states one striking number, percentage, money amount or count',
    minMs: 2600,
    idealMs: 4600,
    maxMs: 8000,
    built: true,
    replaces: ['big-number'],
  },
  {
    id: 'hook-statement',
    name: 'Hook statement',
    useWhen: 'an opening line, a bold claim, a question to the viewer or a new chapter',
    minMs: 2400,
    idealMs: 8400,
    maxMs: 12000,
    built: true,
    replaces: ['kinetic-headline'],
  },
  {
    id: 'versus',
    name: 'Versus',
    useWhen: 'the narration compares two things: A versus B, before and after, this or that',
    minMs: 3400,
    idealMs: 5800,
    maxMs: 10000,
    built: true,
    // No component did this before (bar-chart compares values, not two named sides).
    replaces: [],
  },
  {
    id: 'chart-story',
    name: 'Chart story',
    useWhen:
      'the narration gives 2 to 6 values to compare or a trend over time (years, places, groups)',
    minMs: 5000,
    idealMs: 7200,
    maxMs: 12000,
    built: true,
    // Spec 07 task 24: bars, rows and a line in one scene.
    replaces: ['bar-chart', 'line-chart'],
  },
  {
    id: 'list-stack',
    name: 'List stack',
    useWhen: 'the narration lists or counts 3 to 5 things: steps, reasons, tips, ingredients',
    minMs: 5600,
    idealMs: 6400,
    maxMs: 12000,
    built: true,
    // Spec 07 task 33: no component listed items before (lists went to a hook-statement).
    replaces: [],
  },
  {
    id: 'timeline',
    name: 'Timeline',
    useWhen: 'the narration walks through 3 to 6 dated events, years or steps in time',
    minMs: 6600,
    idealMs: 7400,
    maxMs: 14000,
    built: true,
    // Spec 07 task 33: dated events had no graphic (years without values were a data-less
    // line-chart suggestion).
    replaces: [],
  },
  {
    id: 'quote',
    name: 'Quote',
    useWhen: 'the narration quotes someone or reads out words someone said or wrote',
    minMs: 3000,
    idealMs: 10800,
    maxMs: 15000,
    built: true,
    // callout stays planned: it also covers people, terms and labels, not only quotes.
    replaces: [],
  },
  {
    id: 'map-zoom',
    name: 'Map',
    useWhen: 'the narration names a country, city, continent or region',
    minMs: 3500,
    idealMs: 5000,
    maxMs: 10000,
    built: true,
    replaces: [],
  },
  {
    id: 'photo-evidence',
    name: 'Photo',
    useWhen:
      'the narration describes a concrete thing worth seeing: an object, place, animal, invention, artefact or scene',
    minMs: 2600,
    idealMs: 5200,
    maxMs: 10000,
    built: true,
    replaces: [],
  },
];

const replacedBy = new Map(SCENES.flatMap((s) => s.replaces.map((r) => [r, s.id] as const)));

/**
 * What detection offers (the deterministic detector and `slots.detect`): every scene, then the
 * planned components no scene replaces yet.
 */
export const DETECT_CATALOGUE: readonly CatalogueEntry[] = [
  ...SCENES,
  ...CATALOGUE.filter((c) => !replacedBy.has(c.id)),
];

const byId = new Map<string, CatalogueEntry>([
  ...CATALOGUE.map((c) => [c.id, c] as const),
  ...SCENES.map((s) => [s.id, s] as const),
]);
const sceneById = new Map(SCENES.map((s) => [s.id, s]));
const detectIds = new Set(DETECT_CATALOGUE.map((c) => c.id));
const skillById = new Map(SKILLS.map((s) => [s.id, s]));

/** A component or scene by id (legacy components included, for saved projects). */
export const catalogueEntry = (id: string): CatalogueEntry | undefined => byId.get(id);
export const sceneEntry = (id: string): SceneEntry | undefined => sceneById.get(id);
/** Whether detection may suggest this id (scenes and not-yet-replaced components). */
export const isDetectable = (id: string): boolean => detectIds.has(id);
export const skillEntry = (id: string): SkillEntry | undefined => skillById.get(id);

/** A skill works with a component it lists, or with the scene that replaces one it lists. */
export function skillWorksWith(skill: SkillEntry, componentId: string): boolean {
  if (skill.worksWith.includes(componentId)) return true;
  return sceneEntry(componentId)?.replaces.some((r) => skill.worksWith.includes(r)) ?? false;
}

/** A skill's `worksWith` in detection ids: replaced components become their scene. */
export function detectWorksWith(skill: SkillEntry): string[] {
  return [...new Set(skill.worksWith.map((id) => replacedBy.get(id) ?? id))];
}

/** Duration limits for the post-pass; unknown ids get null (the suggestion is dropped). */
export function componentLimits(
  id: string,
): { minMs: number; idealMs: number; maxMs: number } | null {
  const c = byId.get(id);
  return c ? { minMs: c.minMs, idealMs: c.idealMs, maxMs: c.maxMs } : null;
}
