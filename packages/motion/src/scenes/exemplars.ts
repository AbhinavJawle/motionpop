import { chartStoryExemplars } from './chart-story/exemplars';
import type { Exemplar } from './exemplar';
import { hookStatementExemplars } from './hook-statement/exemplars';
import { mapZoomExemplars } from './map-zoom/exemplars';
import { listStackExemplars } from './list-stack/exemplars';
import { photoEvidenceExemplars } from './photo-evidence/exemplars';
import { quoteExemplars } from './quote/exemplars';
import { statPunchExemplars } from './stat-punch/exemplars';
import { timelineExemplars } from './timeline/exemplars';
import { versusExemplars } from './versus/exemplars';

/** Example library per scene id (spec 07 R9.3). New scenes add theirs here. */
export const exemplars: Record<string, readonly Exemplar<unknown>[]> = {
  'stat-punch': statPunchExemplars as Exemplar<unknown>[],
  'hook-statement': hookStatementExemplars as Exemplar<unknown>[],
  versus: versusExemplars as Exemplar<unknown>[],
  'map-zoom': mapZoomExemplars as Exemplar<unknown>[],
  'chart-story': chartStoryExemplars as Exemplar<unknown>[],
  'list-stack': listStackExemplars as Exemplar<unknown>[],
  timeline: timelineExemplars as Exemplar<unknown>[],
  quote: quoteExemplars as Exemplar<unknown>[],
  'photo-evidence': photoEvidenceExemplars as Exemplar<unknown>[],
};
