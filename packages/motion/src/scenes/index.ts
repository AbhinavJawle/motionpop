import { chartStory } from './chart-story';
import { hookStatement } from './hook-statement';
import { statPunch } from './stat-punch';
import { versus } from './versus';

export * from './catalogue';
export * from './define';
export * from './exemplar';
export * from './exemplars';
export * from './gate';
export { chartStory, hookStatement, statPunch, versus };

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = {
  [statPunch.id]: statPunch,
  [hookStatement.id]: hookStatement,
  [versus.id]: versus,
  [chartStory.id]: chartStory,
} as const;
