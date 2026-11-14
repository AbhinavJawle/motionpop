import { describe, expect, it } from 'vitest';
import { demoProject } from '../projects/fixture';
import { formatClock, formatTimecode, slotCardText, spokenText, thumbnailValue } from './slot-display';

describe('slot display', () => {
  const p = demoProject();
  const [s1, s2, s3, s4] = p.slots;

  it('labels each demo slot like the design', () => {
    expect(slotCardText(s1!)).toEqual({ title: 'Opening title', subtitle: 'Suggested' });
    expect(slotCardText(s2!)).toEqual({ title: 'Big number', subtitle: 'Revenue grew 40%' });
    expect(slotCardText(s3!)).toEqual({ title: 'Finding the bigger picture…', subtitle: 'Generating map' });
    expect(thumbnailValue(s4!)).toBe('40%');
  });

  it('quotes the linked words without trailing punctuation', () => {
    expect(spokenText(s2!, p.transcript.words)).toBe('revenue grew forty percent since 2020');
  });

  it('formats clocks like the design', () => {
    expect(formatClock(4200)).toBe('0:04.2');
    expect(formatClock(7800)).toBe('0:07.8');
    expect(formatTimecode(5600)).toBe('00:05.6');
    expect(formatTimecode(18000)).toBe('00:18.0');
    expect(formatTimecode(65_400)).toBe('01:05.4');
  });
});
