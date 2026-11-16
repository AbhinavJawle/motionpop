import { costOf, APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateBlock } from '@/components/start/script-screen';
import { estimateMs, formatLength, minutesFor, scriptMoments, scriptWords } from './estimate';

describe('script estimate (spec 11 task 18)', () => {
  it('spots numbers, years and places, not comparison words', () => {
    const m = scriptMoments('Our revenue grew forty percent since 2020 in Europe.');
    expect(m.map((x) => x.text)).toEqual(expect.arrayContaining(['forty percent', '2020']));
    expect(m.some((x) => x.text === 'grew')).toBe(false);
  });

  it('times words in order and estimates ~150 words a minute', () => {
    const w = scriptWords('one two three');
    expect(w.map((x) => x.startMs)).toEqual([0, 400, 800]);
    expect(estimateMs(Array(150).fill('w').join(' '))).toBe(60_000);
    expect(formatLength(57_000)).toBe('~57s');
    expect(formatLength(83_000)).toBe('~1m 23s');
  });

  it('property 7: the chip price is the charge, at least one minute', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 600 }), fc.constantFrom(0.9, 1, 1.1), (n, speed) => {
        const text = Array(n).fill('word').join(' ');
        const minutes = minutesFor(text, speed);
        expect(minutes).toBeGreaterThanOrEqual(1);
        expect(minutes).toBeGreaterThanOrEqual(estimateMs(text, speed) / 60_000);
        expect(costOf('tts', minutes, APP_CONFIG_DEFAULTS)).toBe(2 * minutes);
      }),
    );
  });

  it('says why Generate is off', () => {
    const ok = { words: 10, online: true, killSwitch: false, signedIn: true };
    expect(generateBlock(ok)).toBeNull();
    expect(generateBlock({ ...ok, words: 0 })).toBe('Write a script first');
    expect(generateBlock({ ...ok, online: false })).toBe('Needs connection');
    expect(generateBlock({ ...ok, killSwitch: true })).toMatch(/paused/);
    expect(generateBlock({ ...ok, signedIn: false })).toMatch(/Sign in/);
  });
});
