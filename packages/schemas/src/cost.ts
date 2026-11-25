import type { AppConfig } from './config';
import { isUnitAction, type CreditAction, type PricedAction } from './credits';
import { exportCost, type Resolution } from './render';

/**
 * The one price list (spec 13 R2). The browser chip, `packages/ai`, the credit routes and the
 * export transaction all call `costOf`; nothing else defines a price. Matches `ai-tasks.md`.
 * `image` comes from `AppConfig.imageCredits` and `export` from spec 08's `exportCost`.
 */
export const DEFAULT_COSTS: Readonly<Record<PricedAction, number>> = {
  generate: 3,
  edit: 1,
  'pip-plan': 2,
  custom: 3,
  // Per started 30 s of voiceover (`filmUnits`): the Director, every beat and its repairs.
  film: 5,
  reel: 3,
  music: 2,
  'slots-detect': 1,
  tts: 2,
  transcribe: 1,
};

export type CostConfig = Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;

export interface ExportCostOptions {
  resolution: Resolution;
  durationMs: number;
}

/**
 * Credits for `action`. For `slots-detect`, `tts` and `transcribe` the price is per unit (words /
 * 200, started minutes) times `units`; every other action is a fixed price and `units` is
 * ignored, so the charge always equals the chip. `export` needs `opts` and ignores `units`.
 * An image costs at least 1 even when `imageCredits` is 0. Throws `RangeError` for a bad `units`
 * or a missing `opts`.
 */
export function costOf(
  action: CreditAction,
  units: number,
  cfg: CostConfig,
  opts?: ExportCostOptions,
): number {
  if (!Number.isInteger(units) || units < 1) {
    throw new RangeError(`units must be a positive integer, got ${units}`);
  }
  if (action === 'export') {
    if (!opts) throw new RangeError('export needs resolution and durationMs');
    return exportCost(opts.resolution, opts.durationMs, cfg.exportCredits);
  }
  // An action never costs less than one credit: the spend response carries a positive cost.
  const unit =
    action === 'image'
      ? Math.max(1, cfg.imageCredits)
      : (cfg.creditCosts[action] ?? DEFAULT_COSTS[action]);
  return unit * (isUnitAction(action) ? units : 1);
}
