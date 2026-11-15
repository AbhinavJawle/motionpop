import { z } from 'zod';

/** Quality-gate rules a slot can fail (spec 07 R9.2). */
export const GateRuleSchema = z.enum([
  'content-invalid',
  'unknown-id',
  'anchor-out-of-range',
  'text-overflow',
  'text-truncated',
  'overlap',
  'cue-dropped',
  'budget',
  'read-time',
]);
export type GateRule = z.infer<typeof GateRuleSchema>;

/**
 * One failed check, written so a small model can fix it: which actor, which rule, by how much,
 * and a plain hint ("label overflows by 34 px at 9:16; shorten to 4 words or fewer").
 */
export const GateReportSchema = z.object({
  slot: z.string().min(1),
  actor: z.string().min(1),
  rule: GateRuleSchema,
  measured: z.number(),
  limit: z.number(),
  hint: z.string().min(1).max(200),
});
export type GateReport = z.infer<typeof GateReportSchema>;

/** The repair message sent back to the model: one line per report. */
export function gateReportText(reports: readonly GateReport[]): string {
  // One line per report, even if a hint contains a line break.
  return reports
    .map((r) => `- ${r.actor} (${r.rule}): ${r.hint.replace(/\s*\n\s*/g, ' ')}`)
    .join('\n');
}
