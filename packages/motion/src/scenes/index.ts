import { hookStatement } from './hook-statement';
import { mapZoom } from './map-zoom';
import { statPunch } from './stat-punch';
import { versus } from './versus';

export * from './catalogue';
export * from './define';
export * from './exemplar';
export * from './exemplars';
export * from './gate';
export { hookStatement, mapZoom, statPunch, versus };
export { mapFromWords, placeTarget, type MapZoomContent } from './map-zoom';

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = {
  [statPunch.id]: statPunch,
  [hookStatement.id]: hookStatement,
  [versus.id]: versus,
  [mapZoom.id]: mapZoom,
} as const;
