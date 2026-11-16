import { describe, expect, it } from 'vitest';
import { formatCount, withYear } from './count';
describe('years', () => {
  it('a bare year has no thousands separator, a count does', () => {
    expect(formatCount(1989, withYear(1989, {}))).toBe('1989');
    expect(formatCount(1990, withYear(1990, { suffix: 's' }))).toBe('1990s');
    expect(formatCount(1989, withYear(1989, { prefix: '$' }))).toBe('$1,989');
    expect(formatCount(25000, withYear(25000, {}))).toBe('25,000');
  });
});
