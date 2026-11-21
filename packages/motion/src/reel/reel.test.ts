import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ReelPlanSchema, tileReelScenes, type ReelScene } from '@motionpop/schemas';
import { chunkAt, chunkCaptions } from './captions';
import { compileReel } from './compile';

const words = 'It is Thursday, and this is your thought of the day. You start strong.'
  .split(' ')
  .map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 }));

describe('reel captions', () => {
  it('mono: at most 2 words, uppercase, punctuation trimmed', () => {
    const c = chunkCaptions(words, 'mono');
    expect(c.every((x) => x.text.split(' ').length <= 2)).toBe(true);
    expect(c.every((x) => x.text === x.text.toUpperCase())).toBe(true);
    expect(c.map((x) => x.text)).toContain('THURSDAY');
  });
  it('cream: lowercases sentence starts but keeps I', () => {
    const c = chunkCaptions(
      [
        { text: 'Today', startMs: 0, endMs: 200 },
        { text: 'I', startMs: 900, endMs: 1000 },
      ],
      'cream',
    );
    expect(c[0]!.text).toBe('today');
    expect(c[1]!.text).toBe('I');
  });
  it('chunks never overlap and chunkAt finds them', () => {
    const c = chunkCaptions(words, 'cream');
    for (let i = 1; i < c.length; i++)
      expect(c[i]!.startMs).toBeGreaterThanOrEqual(c[i - 1]!.endMs);
    expect(chunkAt(c, c[2]!.startMs + 1)).toBe(2);
    expect(chunkAt(c, -5)).toBe(-1);
  });
});

const scene = (id: string, startMs: number, endMs: number): ReelScene => ({
  id,
  startMs,
  endMs,
  layout: 'split',
  content: { template: 'none' },
});

describe('tileReelScenes', () => {
  it('tiles [0, duration] exactly with no gaps or overlaps (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(60_000), fc.nat(8_000)), { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 2_000, max: 60_000 }),
        (spans, duration) => {
          const input = spans.map(([s, d], i) => scene(`s${i}`, s, s + d + 1));
          const out = tileReelScenes(input, duration);
          if (out.length === 0) return true;
          expect(out[0]!.startMs).toBe(0);
          expect(out[out.length - 1]!.endMs).toBe(duration);
          for (let i = 1; i < out.length; i++) expect(out[i]!.startMs).toBe(out[i - 1]!.endMs);
          for (const s of out) expect(s.endMs).toBeGreaterThan(s.startMs);
          return true;
        },
      ),
    );
  });
});

describe('compileReel', () => {
  it('emits one timed video per segment and inlines the plan', () => {
    const plan = ReelPlanSchema.parse({ v: 1, look: 'mono', scenes: [scene('a', 0, 4000)] });
    const html = compileReel(
      {
        plan,
        words,
        durationMs: 4000,
        videoSrc: 'speaker.mp4',
        video: { w: 720, h: 1280 },
        segments: [
          { srcStartMs: 0, srcEndMs: 1500 },
          { srcStartMs: 2000, srcEndMs: 4500 },
        ],
      },
      {
        reelRuntimeJs: '/*rt*/',
        hyperframesRuntimeJs: '/*hf*/',
        fonts: {
          Inter: 'AA',
          Newsreader: 'AA',
          'Playfair Display Italic': 'AA',
          'Geist Mono': 'AA',
        },
      },
    );
    expect(html.match(/<video /g)?.length).toBe(2);
    expect(html).toContain('data-media-start="2"');
    expect(html).toContain('data-start="1.5"');
    expect(html).toContain('data-no-timeline');
    expect(html).toContain('window.__REEL__');
    expect(html).not.toContain('</script></script>');
  });
});
