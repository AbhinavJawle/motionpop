import type { MotionComponent } from '../../contract';
import { buildCustom } from './build';
import { customExample } from './example';
import { customParams, type CustomParams } from './params';

export { BLOCKED_GLOBALS, CUSTOM_ALLOW_FLAG, scopeCss } from './build';
export { customExample } from './example';
export { lintCustom } from './lint';
export { CUSTOM_LIMITS, customParams, type CustomParams } from './params';

/**
 * Tier 2 (spec 15): a graphic the model wrote, run through the same engine as the library. Not
 * auto-suggested and not offered by the director: only an explicit "Custom" request makes one.
 */
export const custom: MotionComponent<CustomParams> = {
  id: 'custom',
  name: 'Custom graphic',
  category: 'callout',
  params: customParams,
  defaults: customExample(),
  durationMs: { min: 1500, ideal: 4500, max: 12_000 },
  formats: ['16:9', '9:16', '1:1'],
  keyMomentMs: (p, durationMs) => Math.min(p.keyMomentMs ?? 600, durationMs),
  build: buildCustom,
};
