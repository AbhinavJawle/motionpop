import { describe, expect, it, vi } from 'vitest';
import { LocalCredits } from '@/lib/credits/local-credits';
import { generateVoice } from './generate-voice';

vi.mock('@/lib/firebase/client', () => ({ getAILogic: vi.fn() }));

const pcm = new Int16Array(24_000).fill(1000);
const input = { text: 'Revenue grew forty percent.', voice: 'Kore' as const };
const result = { pcm, sampleRate: 24_000, latencyMs: 10, model: 'tts' };

function ledger() {
  const credits = new LocalCredits(20);
  const spend = vi.spyOn(credits, 'spend');
  const refund = vi.spyOn(credits, 'refund');
  return { credits, spend, refund };
}

describe('generateVoice cancel (spec 39 R6.9)', () => {
  it('spends nothing and throws when the signal has already fired', async () => {
    const { credits, spend } = ledger();
    const speak = vi.fn(async () => result);
    const c = new AbortController();
    c.abort();
    await expect(
      generateVoice({ credits, speak, partCache: null }, input, c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(spend).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(credits.balance()).toBe(20);
  });

  it('a cancel while the voice is being made refunds once and throws, without waiting for it', async () => {
    const { credits, refund } = ledger();
    let release!: () => void;
    const speak = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          release = () => resolve(result);
        }),
    );
    const c = new AbortController();
    const out = generateVoice({ credits, speak, partCache: null }, input, c.signal);
    await vi.waitFor(() => expect(speak).toHaveBeenCalled());
    expect(credits.balance()).toBeLessThan(20);
    c.abort();
    await expect(out).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(20);
    release(); // the late voice changes nothing
    await Promise.resolve();
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('a cancel the moment the voice arrives drops it: refund once, no result', async () => {
    const { credits, refund } = ledger();
    const c = new AbortController();
    const speak = vi.fn(async () => {
      c.abort();
      return result;
    });
    await expect(
      generateVoice({ credits, speak, partCache: null }, input, c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(20);
  });

  it('a cancel while the spend is in flight refunds it before any call is made', async () => {
    const { credits, spend, refund } = ledger();
    const c = new AbortController();
    const real = spend.getMockImplementation();
    spend.mockImplementation(async (req) => {
      const r = await (real ?? LocalCredits.prototype.spend).call(credits, req);
      c.abort();
      return r;
    });
    const speak = vi.fn(async () => result);
    await expect(
      generateVoice({ credits, speak, partCache: null }, input, c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(speak).not.toHaveBeenCalled();
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(20);
  });

  it('without a cancel it still returns the voice and keeps the charge', async () => {
    const { credits, refund } = ledger();
    const speak = vi.fn(async () => result);
    const c = new AbortController();
    const out = await generateVoice({ credits, speak, partCache: null }, input, c.signal);
    expect(out.ok).toBe(true);
    expect(refund).not.toHaveBeenCalled();
    expect(credits.balance()).toBeLessThan(20);
  });
});
