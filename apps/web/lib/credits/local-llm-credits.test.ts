import { describe, expect, it, vi } from 'vitest';
import { ByokCredits } from './byok-credits';
import type { CreditsClient } from './client';
import { LocalLlmCredits } from './local-llm-credits';
import { spendWithUi } from './spend-with-ui';

describe('LocalLlmCredits', () => {
  it('resolves LLM actions at 0 credits locally while still enforcing inner credits for TTS & images', async () => {
    const innerSpend = vi.fn().mockResolvedValue({
      ok: true,
      txId: 's-tts12345',
      balance: 8,
      cost: 2,
    });
    const innerRefund = vi.fn().mockResolvedValue(undefined);
    const inner: CreditsClient = {
      balance: () => 10,
      subscribe: () => () => {},
      spend: innerSpend,
      refund: innerRefund,
    };

    const local = new LocalLlmCredits(inner);
    expect(local.isZeroCostFor('generate')).toBe(true);
    expect(local.isZeroCostFor('reel')).toBe(true);
    expect(local.isZeroCostFor('edit')).toBe(true);
    expect(local.isZeroCostFor('tts')).toBe(false);
    expect(local.isZeroCostFor('image')).toBe(false);

    // LLM task runs at 0 credits without touching server credits.
    const genRes = await spendWithUi(local, { action: 'generate', key: 'genkey12345' });
    expect(genRes).toEqual({
      ok: true,
      txId: 'local-llm-genkey12345',
      balance: 10,
      cost: 0,
    });
    expect(innerSpend).not.toHaveBeenCalled();

    // Refund of a local-llm tx is a no-op and never hits the server.
    await local.refund('local-llm-genkey12345');
    expect(innerRefund).not.toHaveBeenCalled();

    // Cloud TTS still delegates to the inner server client!
    const ttsRes = await spendWithUi(local, { action: 'tts', units: 1, key: 'ttskey12345' });
    expect(ttsRes).toEqual({
      ok: true,
      txId: 's-tts12345',
      balance: 8,
      cost: 2,
    });
    expect(innerSpend).toHaveBeenCalledTimes(1);

    await local.refund('s-tts12345');
    expect(innerRefund).toHaveBeenCalledWith('s-tts12345');
  });

  it('works signed out (inner=null) for LLM actions and reports canSpend=false for cloud TTS/image', async () => {
    const local = new LocalLlmCredits(null);
    expect(local.canSpend('edit')).toBe(true);
    expect(local.canSpend('reel')).toBe(true);
    expect(local.canSpend('image')).toBe(false);
    expect(local.canSpend('tts')).toBe(false);

    const editRes = await spendWithUi(local, { action: 'edit', key: 'editkey12345' });
    expect(editRes).toEqual({
      ok: true,
      txId: 'local-llm-editkey12345',
      balance: 0,
      cost: 0,
    });

    const imgRes = await local.spend({ action: 'image', key: 'imgkey12345' });
    expect(imgRes).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('composes cleanly with ByokCredits when both Local LLM and Gemini BYOK are active', async () => {
    const combined = new LocalLlmCredits(new ByokCredits(null));
    expect(combined.isByok).toBe(true);
    expect(combined.isZeroCostFor('generate')).toBe(true);
    expect(combined.isZeroCostFor('tts')).toBe(true);
    expect(combined.isZeroCostFor('image')).toBe(true);

    const ttsRes = await spendWithUi(combined, { action: 'tts', units: 2, key: 'ttsbyok12345' });
    expect(ttsRes).toMatchObject({ ok: true, cost: 0 });
  });
});
