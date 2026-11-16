import { chartStory } from './chart-story';
import { hookStatement } from './hook-statement';
import { listStack } from './list-stack';
import { quote } from './quote';
import { statPunch } from './stat-punch';
import { timeline } from './timeline';
import { versus } from './versus';

export * from './catalogue';
export * from './define';
export * from './exemplar';
export * from './exemplars';
export * from './gate';
export { chartStory, hookStatement, listStack, quote, statPunch, timeline, versus };

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = {
  [statPunch.id]: statPunch,
  [hookStatement.id]: hookStatement,
  [versus.id]: versus,
  [chartStory.id]: chartStory,
  [listStack.id]: listStack,
  [timeline.id]: timeline,
  [quote.id]: quote,
} as const;
