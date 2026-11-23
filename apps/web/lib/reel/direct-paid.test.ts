import type { ReelWord } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { directReelPaid } from './media';

const words: ReelWord[] =
  'Revenue grew forty percent last year and nothing else changed at all. Comment GUIDE below.'
    .split(' ')
    .map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 360 }));
const durationMs = words.at(-1)!.endMs + 300;

describe('directReelPaid forwards the creator’s choices (spec 39 R5.7)', () => {
  it('applies them to the free plan, which also covers a refused spend or no router', async () => {
    const r = await directReelPaid(
      {
        look: 'mono',
        words,
        durationMs,
        refId: 'reel',
        choices: {
          cta: { enabled: true, text: 'Comment LINK' },
          captions: { enabled: false, style: 'clean' },
        },
        brief: {
          recipe: 'Tech Explainer',
          style: 'Mono Grid',
          hookStyle: 'headline',
          cta: { enabled: true, text: 'Comment LINK' },
          captionStyle: 'clean',
          music: 'auto',
        },
      },
      { credits: null, free: true },
    );
    expect(r.source).toBe('auto');
    expect(r.plan.captions).toBe(false);
    expect(r.plan.captionStyle).toBe('clean');
    expect(r.plan.scenes.at(-1)!.content).toEqual({
      template: 'cta',
      verb: 'Comment',
      keyword: 'LINK',
    });
  });
});
