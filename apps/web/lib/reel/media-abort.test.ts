import { ReelPlanSchema, type ReelPlan, type ReelWord } from '@motionpop/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCredits } from '@/lib/credits/local-credits';
import { directReelPaid, resolveReelMedia, resolveReelMusic } from './media';

const ai = vi.hoisted(() => ({ directReel: vi.fn() }));
vi.mock('@motionpop/ai', async (orig) => ({
  ...(await orig<typeof import('@motionpop/ai')>()),
  directReel: ai.directReel,
}));
vi.mock('@/lib/firebase/client', () => ({
  getAILogic: vi.fn(),
  getAuthClient: vi.fn(async () => ({ currentUser: { getIdToken: async () => 'tok' } })),
}));
vi.mock('@/lib/ai/router-client', () => ({
  getRouter: vi.fn(async () => ({})),
  emitAIUsage: vi.fn(),
}));
vi.mock('@/lib/users/bootstrap-client', () => ({ apiHeaders: vi.fn(async () => ({})) }));
vi.mock('@/lib/images/image-store', () => ({
  getImage: vi.fn(async () => null),
  putImage: vi.fn(async (hash: string) => `media:${hash}.webp`),
}));
vi.mock('@/lib/images/process', () => ({
  processImage: vi.fn(async () => ({ blob: new Blob(['img']), width: 8, height: 8 })),
  sha256Hex: vi.fn(async (s: string) =>
    Array.from(s)
      .reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
      .toString(16)
      .padStart(32, '0'),
  ),
}));
vi.mock('@/lib/images/trim', () => ({ trimPaper: vi.fn(async (b: Blob) => b) }));

const words: ReelWord[] = 'Revenue grew forty percent last year and nothing else changed at all'
  .split(' ')
  .map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 360 }));
const cloud = (plan: ReelPlan) => ({ plan, source: 'cloud' as const });

const speakerPlan: ReelPlan = ReelPlanSchema.parse({
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [{ id: 'r1', startMs: 0, endMs: 5000, layout: 'speaker', content: { template: 'none' } }],
});

const pictures = (...kinds: ('illustration' | 'logo')[]): ReelPlan =>
  ReelPlanSchema.parse({
    ...speakerPlan,
    scenes: kinds.map((kind, i) => ({
      id: `r${i + 1}`,
      startMs: i * 2000,
      endMs: (i + 1) * 2000,
      layout: 'full',
      content: { template: 'image', media: { kind, query: `subject ${i}` } },
    })),
  });

function ledger(start = 30) {
  const credits = new LocalCredits(start);
  return {
    credits,
    spend: vi.spyOn(credits, 'spend'),
    refund: vi.spyOn(credits, 'refund'),
    start,
  };
}

beforeEach(() => {
  ai.directReel.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('directReelPaid cancel (spec 39 R6.9)', () => {
  const params = { look: 'mono' as const, words, durationMs: 5000, refId: 'reel' };

  it('spends nothing when the signal has already fired', async () => {
    const { credits, spend } = ledger();
    const c = new AbortController();
    c.abort();
    await expect(directReelPaid(params, { credits }, c.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(spend).not.toHaveBeenCalled();
    expect(ai.directReel).not.toHaveBeenCalled();
  });

  it('a cancel while the director works refunds once and returns no plan', async () => {
    const { credits, refund, start } = ledger();
    let release!: () => void;
    ai.directReel.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(cloud(speakerPlan));
        }),
    );
    const c = new AbortController();
    const out = directReelPaid(params, { credits }, c.signal);
    await vi.waitFor(() => expect(ai.directReel).toHaveBeenCalled());
    expect(credits.balance()).toBeLessThan(start);
    c.abort();
    await expect(out).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
    release();
    await Promise.resolve();
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('a cancel the moment the plan arrives drops it: refund once, nothing returned', async () => {
    const { credits, refund, start } = ledger();
    const c = new AbortController();
    ai.directReel.mockImplementation(async () => {
      c.abort();
      return cloud(speakerPlan);
    });
    await expect(directReelPaid(params, { credits }, c.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('a director that fell back to the free plan and a cancel still refund only once', async () => {
    const { credits, refund, start } = ledger();
    const c = new AbortController();
    ai.directReel.mockImplementation(async () => {
      c.abort();
      return { plan: speakerPlan, source: 'auto' as const, error: 'boom' };
    });
    await expect(directReelPaid(params, { credits }, c.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('a director that throws hands the price back, too', async () => {
    const { credits, refund, start } = ledger();
    ai.directReel.mockRejectedValue(new Error('network'));
    await expect(directReelPaid(params, { credits })).rejects.toThrow('network');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('without a cancel the plan is returned and the charge stays', async () => {
    const { credits, refund, start } = ledger();
    ai.directReel.mockResolvedValue(cloud(speakerPlan));
    const c = new AbortController();
    const r = await directReelPaid(params, { credits }, c.signal);
    expect(r.source).toBe('cloud');
    expect(refund).not.toHaveBeenCalled();
    expect(credits.balance()).toBeLessThan(start);
  });
});

describe('resolveReelMedia cancel (spec 39 R6.9)', () => {
  const imageBytes = {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
    latencyMs: 5,
    model: 'img',
  };

  it('spends and fetches nothing when the signal has already fired', async () => {
    const { credits, spend } = ledger();
    const fetchFn = vi.fn();
    const generate = vi.fn();
    const c = new AbortController();
    c.abort();
    await expect(
      resolveReelMedia(
        pictures('illustration', 'logo'),
        'mono',
        'p-1',
        { credits, fetchFn: fetchFn as never, generate },
        undefined,
        c.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(spend).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('a cancel while an illustration is made refunds it once and returns nothing', async () => {
    const { credits, refund, start } = ledger();
    const generate = vi.fn(() => new Promise<never>(() => {}));
    const c = new AbortController();
    const out = resolveReelMedia(
      pictures('illustration'),
      'mono',
      'p-1',
      { credits, generate },
      undefined,
      c.signal,
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    expect(credits.balance()).toBeLessThan(start);
    c.abort();
    await expect(out).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('a cancel after one illustration finished refunds both: nothing was saved', async () => {
    const { credits, refund, spend, start } = ledger();
    const c = new AbortController();
    const generate = vi
      .fn()
      .mockResolvedValueOnce(imageBytes)
      .mockImplementationOnce(() => new Promise<never>(() => {}));
    const out = resolveReelMedia(
      pictures('illustration', 'illustration'),
      'mono',
      'p-1',
      { credits, generate },
      undefined,
      c.signal,
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(spend).toHaveBeenCalledTimes(2);
    c.abort();
    await expect(out).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(2);
    expect(new Set(refund.mock.calls.map((a) => a[0])).size).toBe(2);
    expect(credits.balance()).toBe(start);
  });

  it('a cancel the moment a picture arrives drops it and refunds, once', async () => {
    const { credits, refund, start } = ledger();
    const c = new AbortController();
    const generate = vi.fn(async () => {
      c.abort();
      return imageBytes;
    });
    await expect(
      resolveReelMedia(
        pictures('illustration'),
        'mono',
        'p-1',
        { credits, generate },
        undefined,
        c.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('a picture that fails (no cancel) is refunded once and the call carries on', async () => {
    const { credits, refund, start } = ledger();
    const generate = vi.fn().mockRejectedValue(new Error('no image'));
    const r = await resolveReelMedia(pictures('illustration'), 'mono', 'p-1', {
      credits,
      generate,
    });
    expect(r.assets).toEqual([]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(start);
  });

  it('a finished call keeps its charges and returns the pictures', async () => {
    const { credits, refund, start } = ledger();
    const generate = vi.fn().mockResolvedValue(imageBytes);
    const c = new AbortController();
    const r = await resolveReelMedia(
      pictures('illustration'),
      'mono',
      'p-1',
      { credits, generate },
      undefined,
      c.signal,
    );
    expect(r.assets).toHaveLength(1);
    expect(r.assets[0]?.source).toBe('generated');
    expect(refund).not.toHaveBeenCalled();
    expect(credits.balance()).toBeLessThan(start);
  });

  it('hands the signal to the picture fetches, and a cancelled fetch stops the call', async () => {
    const c = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      c.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      resolveReelMedia(
        pictures('logo'),
        'mono',
        'p-1',
        { credits: null, fetchFn: fetchFn as never },
        undefined,
        c.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen[0]).toBe(c.signal);
  });
});

describe('resolveReelMusic cancel (spec 39 R6.9)', () => {
  const plan: ReelPlan = { ...speakerPlan, music: { brief: 'calm lo-fi pad' } };
  const store = () => ({
    put: vi.fn(async () => 'audio:music-1'),
    delete: vi.fn(async () => undefined),
  });
  const wav = () => new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200 });

  it('does nothing when the signal has already fired', async () => {
    const fetchFn = vi.fn();
    const c = new AbortController();
    c.abort();
    await expect(
      resolveReelMusic(
        plan,
        5000,
        'p-1',
        { audioStore: store(), fetchFn: fetchFn as never },
        c.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('passes the signal to the request and rethrows a cancelled one', async () => {
    const c = new AbortController();
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBe(c.signal);
      c.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      resolveReelMusic(
        plan,
        5000,
        'p-1',
        { audioStore: store(), fetchFn: fetchFn as never },
        c.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a cancel while the file is stored removes it and returns no plan', async () => {
    const c = new AbortController();
    const audioStore = store();
    audioStore.put.mockImplementation(async () => {
      c.abort();
      return 'audio:music-1';
    });
    const fetchFn = vi.fn(async () => wav());
    await expect(
      resolveReelMusic(plan, 5000, 'p-1', { audioStore, fetchFn: fetchFn as never }, c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(audioStore.delete).toHaveBeenCalledWith('audio:music-1');
  });

  it('a normal run returns the plan with the stored music', async () => {
    const out = await resolveReelMusic(plan, 5000, 'p-1', {
      audioStore: store(),
      fetchFn: vi.fn(async () => wav()) as never,
    });
    expect(out.music?.src).toBe('audio:music-1');
  });
});
