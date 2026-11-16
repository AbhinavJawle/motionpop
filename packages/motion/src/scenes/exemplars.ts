import { chartStoryExemplars } from './chart-story/exemplars';
import type { Exemplar } from './exemplar';
import { hookStatementExemplars } from './hook-statement/exemplars';
import { statPunchExemplars } from './stat-punch/exemplars';
import { versusExemplars } from './versus/exemplars';

/** Example library per scene id (spec 07 R9.3). New scenes add theirs here. */
export const exemplars: Record<string, readonly Exemplar<unknown>[]> = {
  'stat-punch': statPunchExemplars as Exemplar<unknown>[],
  'hook-statement': hookStatementExemplars as Exemplar<unknown>[],
  versus: versusExemplars as Exemplar<unknown>[],
  'chart-story': chartStoryExemplars as Exemplar<unknown>[],
};
