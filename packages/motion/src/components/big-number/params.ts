import { z } from 'zod';

export const bigNumberParams = z.object({
  value: z
    .number()
    .describe('The number to land on, exactly as spoken (e.g. 40 for "forty percent")'),
  prefix: z.string().max(4).optional().describe('Text before the number, e.g. "$"'),
  suffix: z.string().max(4).optional().describe('Text after the number, e.g. "%", "M", "k"'),
  decimals: z.number().int().min(0).max(2).default(0).describe('Decimal places shown'),
  label: z.string().min(1).max(48).describe('Short line under the number, at most 6 words'),
  context: z.string().max(60).optional().describe('Small eyebrow line above the number'),
  countFrom: z.number().default(0).describe('Where the count starts'),
});

export type BigNumberParams = z.infer<typeof bigNumberParams>;
