import type { MotionComponent } from '../../contract';
import { buildBigNumber } from './build';
import { bigNumberParams, type BigNumberParams } from './params';

export const bigNumber: MotionComponent<BigNumberParams> = {
  id: 'big-number',
  name: 'Big number',
  category: 'data',
  params: bigNumberParams,
  defaults: {
    value: 40,
    suffix: '%',
    decimals: 0,
    label: 'Revenue growth since 2020',
    countFrom: 0,
  },
  // min: shortest slot where the label still holds 800 ms at the default key moment (entrance compresses).
  durationMs: { min: 2600, ideal: 3600, max: 8000 },
  formats: ['16:9', '9:16', '1:1'],
  keyMomentMs: (_p, durationMs) => Math.round(Math.min(1200, durationMs * 0.35)),
  build: buildBigNumber,
};

export { bigNumberParams, type BigNumberParams };
