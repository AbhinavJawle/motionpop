import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { GateReportSchema, GateRuleSchema, gateReportText, type GateReport } from './gate';

const report = (over: Partial<GateReport> = {}): GateReport => ({
  slot: 's1',
  actor: 'title',
  rule: 'text-overflow',
  measured: 34,
  limit: 0,
  hint: 'label overflows by 34 px at 9:16; shorten to 4 words or fewer',
  ...over,
});

const arbReport = fc.record({
  slot: fc.string({ minLength: 1 }),
  actor: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
  rule: fc.constantFrom(...GateRuleSchema.options),
  measured: fc.double({ noNaN: true, noDefaultInfinity: true }),
  limit: fc.double({ noNaN: true, noDefaultInfinity: true }),
  hint: fc.string({ minLength: 1, maxLength: 200 }),
});

describe('GateReportSchema', () => {
  it('parses a valid report and round-trips random ones', () => {
    expect(GateReportSchema.safeParse(report()).success).toBe(true);
    fc.assert(
      fc.property(arbReport, (r) => {
        const first = GateReportSchema.parse(r);
        expect(GateReportSchema.parse(first)).toEqual(first);
      }),
    );
  });
  it('rejects a hint over 200 characters or empty, accepts exactly 200', () => {
    expect(GateReportSchema.safeParse(report({ hint: 'x'.repeat(200) })).success).toBe(true);
    expect(GateReportSchema.safeParse(report({ hint: 'x'.repeat(201) })).success).toBe(false);
    expect(GateReportSchema.safeParse(report({ hint: '' })).success).toBe(false);
  });
  it('rejects unknown rules, empty slot or actor, and non-finite numbers', () => {
    expect(GateReportSchema.safeParse({ ...report(), rule: 'vibes' }).success).toBe(false);
    expect(GateReportSchema.safeParse(report({ slot: '' })).success).toBe(false);
    expect(GateReportSchema.safeParse(report({ actor: '' })).success).toBe(false);
    expect(GateReportSchema.safeParse(report({ measured: Number.NaN })).success).toBe(false);
  });
});

describe('gateReportText', () => {
  it('writes one line per rule naming the actor and the rule', () => {
    for (const rule of GateRuleSchema.options) {
      const text = gateReportText([report({ rule, actor: 'headline-1' })]);
      expect(text).toContain('headline-1');
      expect(text).toContain(rule);
      expect(text).toContain('shorten to 4 words');
    }
  });
  it('has exactly one line per report (hints without newlines)', () => {
    fc.assert(
      fc.property(fc.array(arbReport, { maxLength: 10 }), (rs) => {
        const text = gateReportText(rs.map((r) => ({ ...r, hint: r.hint.replace(/\n/g, ' ') })));
        expect(text === '' ? 0 : text.split('\n').length).toBe(rs.length);
      }),
    );
  });
  it('is empty for no reports', () => {
    expect(gateReportText([])).toBe('');
  });
});
