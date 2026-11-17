import { beforeEach, describe, expect, it, vi } from 'vitest';
import { splitScript, type PartAudio, type PartCache } from '@motionpop/ai';
import type { CreditsClient } from '@/lib/credits/client';
import { generateVoice } from './generate-voice';

// The real speakWithFirebase runs; only the model call is replaced, and counted.
const calls = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('firebase/ai', () => ({
  InferenceMode: { ONLY_IN_CLOUD: 'ONLY_IN_CLOUD' },
  getGenerativeModel: () => ({ generateContent: calls.generateContent }),
}));
vi.mock('@/lib/firebase/client', () => ({ getAILogic: vi.fn() }));

const SAMPLE_B64 = Buffer.from(new Int16Array(24_000).fill(900).buffer).toString('base64');

function credits(): CreditsClient {
  return {
    balance: () => 1000,
    subscribe: () => () => {},
    spend: vi.fn(async () => ({ ok: true as const, txId: 'tx', balance: 999, cost: 1 })),
    refund: vi.fn(async () => {}),
  } as unknown as CreditsClient;
}

/** A script of two long parts: changing only the last sentence changes only the last part. */
function script(last: string): string {
  const sentence = (i: number) => `Sentence ${i} ${'padding '.repeat(11)}ends here.`;
  return [...Array.from({ length: 14 }, (_, i) => sentence(i)), last].join(' ');
}

function memoryPartCache(): PartCache & { store: Map<string, PartAudio> } {
  const store = new Map<string, PartAudio>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, audio) {
      store.set(key, audio);
    },
  };
}

describe('generateVoice part cache (spec 13b R4.2)', () => {
  beforeEach(() => {
    calls.generateContent.mockReset();
    calls.generateContent.mockImplementation(async () => ({
      response: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: SAMPLE_B64 } }],
            },
          },
        ],
      },
    }));
  });

  it('a second generation of the same script makes no TTS call', async () => {
    const cache = memoryPartCache();
    const text = script('The end.');
    const parts = splitScript(text);
    expect(parts.length).toBeGreaterThan(1);

    const first = await generateVoice(
      { credits: credits(), partCache: cache },
      { text, voice: 'Kore' },
    );
    expect(first.ok).toBe(true);
    expect(calls.generateContent).toHaveBeenCalledTimes(parts.length);

    calls.generateContent.mockClear();
    const second = await generateVoice(
      { credits: credits(), partCache: cache },
      { text, voice: 'Kore' },
    );
    expect(second.ok).toBe(true);
    expect(calls.generateContent).not.toHaveBeenCalled();
  });

  it('a changed part calls the model only for that part', async () => {
    const cache = memoryPartCache();
    await generateVoice(
      { credits: credits(), partCache: cache },
      { text: script('The end.'), voice: 'Kore' },
    );
    calls.generateContent.mockClear();

    await generateVoice(
      { credits: credits(), partCache: cache },
      { text: script('A different ending.'), voice: 'Kore' },
    );
    expect(calls.generateContent).toHaveBeenCalledTimes(1);
  });

  it('another voice or speed is a different part, so it is generated again', async () => {
    const cache = memoryPartCache();
    const text = script('The end.');
    await generateVoice({ credits: credits(), partCache: cache }, { text, voice: 'Kore' });
    calls.generateContent.mockClear();
    await generateVoice({ credits: credits(), partCache: cache }, { text, voice: 'Puck' });
    expect(calls.generateContent).toHaveBeenCalled();
  });
});
