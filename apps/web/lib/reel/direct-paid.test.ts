import type { Router, RunResult, TaskDef } from '@motionpop/ai';
import type { ReelWord } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { LocalCredits } from '@/lib/credits/local-credits';
import { directReelPaid } from './media';

const words: ReelWord[] =
  'Revenue grew forty percent last year and nothing else changed at all. Comment GUIDE below.'
    .split(' ')
    .map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 360 }));
const durationMs = words.at(-1)!.endMs + 300;

const NANO_DRAFT = {
  hook: '40% Growth',
  beats: [
    { fromWord: 0, template: 'counter' as const, title: 'Revenue grew', value: 40, suffix: '%' },
    { fromWord: 6, template: 'headline' as const, title: 'Zero Extra Spend', kicker: 'HOW' },
    { fromWord: 11, template: 'cta' as const, title: 'GUIDE', kicker: 'Comment' },
  ],
};

function stubRouter(answer: (id: string) => unknown): Router {
  return {
    async run<I, O>(task: TaskDef<I, O>): Promise<RunResult<O>> {
      const output = task.output.parse(answer(task.id));
      return {
        output,
        ranOn: task.id === 'reel.draft' ? 'device' : 'cloud',
        model: task.id === 'reel.draft' ? 'gemini-nano' : 'gemini-cloud',
        costCredits: task.id === 'reel.draft' ? 0 : 3,
        latencyMs: 5,
        attempts: 1,
        cached: false,
      };
    },
  };
}

describe('directReelPaid forwards the creator’s choices and hybrid Nano fallback (spec 39 R5.7)', () => {
  it('applies choices to the free plan and skips Nano when onDeviceReady is false', async () => {
    const spy = vi.fn(() => NANO_DRAFT);
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
      {
        credits: null,
        free: true,
        onDeviceReady: false,
        getRouter: async () => stubRouter(spy),
      },
    );
    expect(r.source).toBe('auto');
    expect(spy).not.toHaveBeenCalled();
    expect(r.plan.captions).toBe(false);
    expect(r.plan.captionStyle).toBe('clean');
    expect(r.plan.scenes.at(-1)!.content).toEqual({
      template: 'cta',
      verb: 'Comment',
      keyword: 'LINK',
    });
  });

  it('uses on-device Gemini Nano (reel.draft) for free reels when onDeviceReady is true and enforces choices', async () => {
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
      },
      {
        credits: null,
        free: true,
        onDeviceReady: true,
        getRouter: async () => stubRouter((id) => (id === 'reel.draft' ? NANO_DRAFT : {})),
      },
    );
    expect(r.source).toBe('device');
    expect(r.plan.by).toBe('gemini-nano');
    expect(r.plan.captions).toBe(false);
    expect(r.plan.scenes.at(-1)!.content).toEqual({
      template: 'cta',
      verb: 'Comment',
      keyword: 'LINK',
    });
  });

  it('refunds credits and falls back to on-device Gemini Nano when cloud reel.direct fails', async () => {
    const credits = new LocalCredits(20);
    const r = await directReelPaid(
      { look: 'mono', words, durationMs, refId: 'reel' },
      {
        credits,
        onDeviceReady: true,
        getRouter: async () =>
          stubRouter((id) => {
            if (id === 'reel.draft') return NANO_DRAFT;
            throw new Error('cloud timeout');
          }),
      },
    );
    expect(r.source).toBe('device');
    expect(r.plan.by).toBe('gemini-nano');
    // Credits fully refunded when cloud failed and Nano took over!
    expect(credits.balance()).toBe(20);
  });

  it('aborts an in-flight on-device reel.draft cleanly when cancelled', async () => {
    const ctrl = new AbortController();
    const slowRouter: Router = {
      async run() {
        await new Promise(() => {});
        throw new Error('unreachable');
      },
    };
    const promise = directReelPaid(
      { look: 'mono', words, durationMs, refId: 'reel' },
      { credits: null, free: true, onDeviceReady: true, getRouter: async () => slowRouter },
      ctrl.signal,
    );
    ctrl.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
