import { describe, expect, it, vi } from 'vitest';
import type { CreditsClient } from '@/lib/credits/client';
import { generateVoice, voiceCost } from './generate-voice';

vi.mock('@/lib/firebase/client', () => ({ getAILogic: vi.fn() }));

function credits(balance = 20): CreditsClient & { refunds: string[] } {
  const refunds: string[] = [];
  return {
    refunds,
    balance: () => balance,
    subscribe: () => () => {},
    spend: vi.fn(async () => ({ ok: true as const, txId: 'tx-1', balance: balance - 2, cost: 2 })),
    refund: vi.fn(async (id: string) => void refunds.push(id)),
  } as unknown as CreditsClient & { refunds: string[] };
}

const pcm = new Int16Array(24_000).fill(1000);

describe('generateVoice', () => {
  it('charges per started minute and returns a WAV the intake can take', async () => {
    const c = credits();
    const speak = vi.fn(async () => ({ pcm, sampleRate: 24_000, latencyMs: 900, model: 'tts' }));
    const out = await generateVoice(
      { credits: c, speak },
      { text: 'Revenue grew forty percent.', voice: 'Kore' },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.file.type).toBe('audio/wav');
    expect(out.durationMs).toBe(1000);
    expect(out.credits).toBe(voiceCost('Revenue grew forty percent.', 1));
    expect(c.refunds).toEqual([]);
  });

  it('refunds when the voice fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = credits();
    const speak = vi.fn(async () => {
      throw new Error('boom');
    });
    const out = await generateVoice({ credits: c, speak }, { text: 'Hello there', voice: 'Puck' });
    expect(out).toMatchObject({ ok: false });
    expect(c.refunds).toEqual(['tx-1']);
  });

  it('reports a usage row for Settings: cloud, the TTS model, the credits (or 0 when refunded)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onUsage = vi.fn();
    const speak = vi.fn(async () => ({ pcm, sampleRate: 24_000, latencyMs: 900, model: 'tts' }));
    await generateVoice(
      { credits: credits(), speak, onUsage },
      { text: 'Hello there', voice: 'Kore' },
    );
    expect(onUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        task: 'tts.generate',
        ranOn: 'cloud',
        credits: voiceCost('Hello there', 1),
        latencyMs: 900,
        ok: true,
      }),
    );
    const fail = vi.fn(async () => {
      throw new Error('boom');
    });
    await generateVoice(
      { credits: credits(), speak: fail, onUsage },
      { text: 'Hi', voice: 'Kore' },
    );
    expect(onUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ task: 'tts.generate', credits: 0, ok: false }),
    );
  });

  it('never spends without a script or without a credits client', async () => {
    expect(
      await generateVoice({ credits: credits() }, { text: '  ', voice: 'Kore' }),
    ).toMatchObject({ ok: false });
    expect(await generateVoice({ credits: null }, { text: 'Hi', voice: 'Kore' })).toMatchObject({
      ok: false,
    });
  });
});
