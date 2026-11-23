// @vitest-environment happy-dom
// Spec 39 task 7 (R5.1, R5.2): caption styles. Absent style = the look's own, so stored reels
// keep their exact captions; each style has its own limits and casing; the painter keeps every
// style inside the 9:16 clear zone.
import { ReelPlanSchema, type ReelCaptionStyle, type ReelLayout } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { CAPTION_STYLES, captionStyleOf, chunkCaptions } from './captions';
import { STAGE_H } from './looks';
import { mountReel } from './mount';

const STYLES = Object.keys(CAPTION_STYLES) as ReelCaptionStyle[];

const words = 'It is Thursday, and this is your thought of the day. You start strong.'
  .split(' ')
  .map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 }));

const texts = (style: ReelCaptionStyle | undefined, look: 'mono' | 'cream') =>
  chunkCaptions(words, look, style).map((c) => c.text);

describe('caption style defaults (R5.1)', () => {
  it('the look decides when the plan has no style: mono → seam, cream → pop', () => {
    expect(captionStyleOf('mono')).toBe('seam');
    expect(captionStyleOf('cream')).toBe('pop');
    expect(captionStyleOf('mono', 'boxed')).toBe('boxed');
    expect(captionStyleOf('cream', 'clean')).toBe('clean');
  });

  it('absent style gives exactly the chunks of the look default', () => {
    for (const look of ['mono', 'cream'] as const)
      expect(chunkCaptions(words, look)).toEqual(chunkCaptions(words, look, captionStyleOf(look)));
  });

  it('mono and cream without a style give the same chunks as before spec 39', () => {
    // Expected arrays recorded by running the chunker at git HEAD (before spec 39) on `words`.
    const span = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });
    const times = [
      [0, 600],
      [600, 900],
      [900, 1500],
      [1500, 2100],
      [2100, 2700],
      [2700, 3300],
      [3300, 3900],
      [3900, 4850],
    ] as const;
    const mono = [
      'IT IS',
      'THURSDAY',
      'AND THIS',
      'IS YOUR',
      'THOUGHT OF',
      'THE DAY',
      'YOU START',
      'STRONG',
    ];
    const cream = [
      'it is',
      'Thursday',
      'and this',
      'is your',
      'thought of',
      'the day',
      'you start',
      'strong',
    ];
    expect(chunkCaptions(words, 'mono')).toEqual(
      mono.map((t, i) => span(t, times[i]![0], times[i]![1])),
    );
    expect(chunkCaptions(words, 'cream')).toEqual(
      cream.map((t, i) => span(t, times[i]![0], times[i]![1])),
    );
  });
});

describe('caption style casing and limits (R5.2)', () => {
  it('seam and boxed are uppercase', () => {
    for (const s of ['seam', 'boxed'] as const)
      expect(texts(s, 'mono').every((t) => t === t.toUpperCase())).toBe(true);
    expect(texts('seam', 'mono')[1]).toBe('THURSDAY');
  });

  it('pop lowercases a sentence start but keeps the rest', () => {
    const t = texts('pop', 'cream');
    expect(t[0]).toBe('it is');
    expect(t).toContain('Thursday');
    expect(t).toContain('you start');
  });

  it('editorial and clean keep the speaker’s casing and allow 3 words', () => {
    for (const s of ['editorial', 'clean'] as const) {
      const t = texts(s, 'mono');
      expect(t[0]).toBe('It is Thursday');
      expect(t.some((x) => x.split(' ').length === 3)).toBe(true);
      expect(t.every((x) => x.split(' ').length <= 3)).toBe(true);
    }
  });

  it('the review limits hold: clean 3 words / 22 chars, editorial 3 / 20', () => {
    expect(CAPTION_STYLES.clean).toMatchObject({ maxWords: 3, maxChars: 22 });
    expect(CAPTION_STYLES.editorial).toMatchObject({ maxWords: 3, maxChars: 20 });
  });
});

describe('caption painter keeps each style in the clear zone (R5.2, review 14)', () => {
  const layouts: ReelLayout[] = ['speaker', 'split', 'card', 'full'];
  const plan = (layout: ReelLayout, captionStyle: ReelCaptionStyle, look: 'mono' | 'cream') =>
    ReelPlanSchema.parse({
      v: 1,
      look,
      captionStyle,
      scenes: [{ id: 'a', startMs: 0, endMs: 6000, layout, content: { template: 'none' } }],
    });

  it.each(
    STYLES.flatMap((s) =>
      layouts.flatMap((l) => (['mono', 'cream'] as const).map((k) => [s, l, k])),
    ),
  )('%s on a %s scene (%s look)', (style, layout, look) => {
    const host = document.createElement('div');
    document.body.append(host);
    const reel = mountReel(
      host,
      {
        plan: plan(layout as ReelLayout, style as ReelCaptionStyle, look as 'mono' | 'cream'),
        words,
        durationMs: 6000,
        video: { w: 720, h: 1280 },
      },
      [],
    );
    // Inside "thought of" (2100–2700), past the 140 ms settle.
    reel.seek(2500);
    const cap = host.querySelector<HTMLElement>('[data-reel-part="caption"]')!;
    expect(cap).not.toBeNull();
    expect(cap.style.visibility).toBe('visible');
    expect(cap.textContent?.length).toBeGreaterThan(0);
    const top = parseFloat(cap.style.top);
    expect(top).toBeGreaterThanOrEqual(STAGE_H * 0.12);
    // The seam label on a `full` scene keeps its pre-spec-39 position (1133, on the speaker
    // seam) so stored mono reels keep their exact pixels; every other case is in the clear zone.
    if (style === 'seam' && layout === 'full') expect(top).toBe(1133);
    else expect(top).toBeLessThanOrEqual(STAGE_H * 0.8);
    reel.destroy();
    host.remove();
  });
});
