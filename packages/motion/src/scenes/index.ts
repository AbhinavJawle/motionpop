import { chartStory } from './chart-story';
import { hookStatement } from './hook-statement';
import { mapZoom } from './map-zoom';
import { listStack } from './list-stack';
import { photoEvidence } from './photo-evidence';
import { quote } from './quote';
import { statPunch } from './stat-punch';
import { timeline } from './timeline';
import { versus } from './versus';

export * from './catalogue';
export * from './define';
export * from './exemplar';
export * from './exemplars';
export * from './gate';
export { mapFromWords, placeTarget, type MapZoomContent } from './map-zoom';
export {
  chartStory,
  hookStatement,
  listStack,
  mapZoom,
  photoEvidence,
  quote,
  statPunch,
  timeline,
  versus,
};

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = {
  [statPunch.id]: statPunch,
  [hookStatement.id]: hookStatement,
  [versus.id]: versus,
  [mapZoom.id]: mapZoom,
  [chartStory.id]: chartStory,
  [listStack.id]: listStack,
  [timeline.id]: timeline,
  [quote.id]: quote,
  [photoEvidence.id]: photoEvidence,
} as const;
