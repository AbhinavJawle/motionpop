import { describe, expect, it, vi } from 'vitest';
import type { AIProvider, ProviderRequest } from '../router';
import {
  byokModelFor,
  geminiByokProvider,
  generateImageWithGeminiByok,
  redactApiKey,
  speakWithGeminiByok,
  testGeminiApiKey,
} from './gemini-byok';

const TEST_KEY = 'AIzaSyTestKey1234567890abcdefg';

const baseReq: ProviderRequest = {
  mode: 'ONLY_IN_CLOUD',
  model: 'gemini-4-neon',
  system: 'Return JSON.',
  prompt: 'Hello world',
  jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
};

describe('byokModelFor', () => {
  it('maps Vertex/AgentPlatform models to public Google AI Studio models', () => {
    expect(byokModelFor('gemini-4-neon', 'balanced')).toBe('gemini-2.5-pro');
    expect(byokModelFor('gemini-4-neon', 'flash')).toBe('gemini-2.5-flash');
    expect(byokModelFor('gemini-3.5-flash-lite', 'balanced')).toBe('gemini-2.5-flash');
    expect(byokModelFor('gemini-3.8-flash', 'balanced')).toBe('gemini-2.5-flash');
    expect(byokModelFor('gemini-3.8-flash-tts')).toBe('gemini-2.5-flash-preview-tts');
    expect(byokModelFor('gemini-nano-banana-2.1')).toBe('gemini-2.5-flash-image');
    expect(byokModelFor('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });
});

describe('redactApiKey', () => {
  it('strips both exact key and any AIza pattern from error messages', () => {
    const leaked = `Failed with ${TEST_KEY} and another AIzaSyOtherSecret987654321`;
    const clean = redactApiKey(leaked, TEST_KEY);
    expect(clean).not.toContain(TEST_KEY);
    expect(clean).not.toContain('AIzaSy');
    expect(clean).toBe('Failed with [redacted] and another [redacted]');
  });
});

describe('geminiByokProvider', () => {
  it('sends the API key exclusively in the x-goog-api-key header, never in the URL', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const provider = geminiByokProvider({
      apiKey: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const res = await provider.generate({
      ...baseReq,
      media: { mimeType: 'image/jpeg', base64: 'AAAA' },
    });

    expect(res).toEqual({ text: '{"ok":true}', ranOn: 'cloud' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
    expect(url).not.toContain(TEST_KEY);
    expect(url).not.toContain('key=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(TEST_KEY);
    const parsedBody = JSON.parse(String(init.body)) as {
      contents: Array<{ parts: unknown[] }>;
      generationConfig: { responseMimeType: string; responseJsonSchema: unknown };
    };
    expect(parsedBody.contents[0]?.parts).toHaveLength(2);
    expect(parsedBody.generationConfig.responseMimeType).toBe('application/json');
  });

  it('tries on-device Nano first for PREFER_ON_DEVICE and falls back to BYOK cloud on failure', async () => {
    const onDevice: AIProvider = {
      generate: vi.fn(async () => ({ text: '{"ok":true}', ranOn: 'device' as const })),
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"ok":false}' }] } }],
          }),
          { status: 200 },
        ),
    );
    const provider = geminiByokProvider({
      apiKey: TEST_KEY,
      onDevice,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const first = await provider.generate({ ...baseReq, mode: 'PREFER_ON_DEVICE' });
    expect(first).toEqual({ text: '{"ok":true}', ranOn: 'device' });
    expect(fetchMock).not.toHaveBeenCalled();

    (onDevice.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Nano busy'));
    const fallback = await provider.generate({ ...baseReq, mode: 'PREFER_ON_DEVICE' });
    expect(fallback).toEqual({ text: '{"ok":false}', ranOn: 'cloud' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('never calls cloud for ONLY_ON_DEVICE', async () => {
    const fetchMock = vi.fn();
    const provider = geminiByokProvider({
      apiKey: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(provider.generate({ ...baseReq, mode: 'ONLY_ON_DEVICE' })).rejects.toThrow(
      /not available/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the API key if fetch throws an error containing it', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error(`Network failed for ${TEST_KEY}`);
    });
    const provider = geminiByokProvider({
      apiKey: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(provider.generate(baseReq)).rejects.toThrow('Network failed for [redacted]');
  });
});

describe('testGeminiApiKey', () => {
  it('validates format before calling fetch and tests via GET /models with header auth', async () => {
    const fetchMock = vi.fn(async () => new Response('{"models":[]}', { status: 200 }));
    expect(await testGeminiApiKey('short', fetchMock as unknown as typeof fetch)).toMatchObject({
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const ok = await testGeminiApiKey(TEST_KEY, fetchMock as unknown as typeof fetch);
    expect(ok).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(TEST_KEY);
  });

  it('returns a friendly message on 401/403 without leaking the key', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: `Bad key ${TEST_KEY}` } }), {
          status: 403,
        }),
    );
    const res = await testGeminiApiKey(TEST_KEY, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).not.toContain(TEST_KEY);
  });
});

describe('speakWithGeminiByok & generateImageWithGeminiByok', () => {
  it('synthesizes PCM audio via AI Studio REST', async () => {
    const pcmBytes = new Uint8Array(24_000); // 12,000 samples (> 24000/4 = 6000)
    let bin = '';
    for (let i = 0; i < pcmBytes.length; i++) bin += String.fromCharCode(pcmBytes[i]!);
    const b64 = btoa(bin);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b64 } },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const res = await speakWithGeminiByok(
      TEST_KEY,
      'gemini-3.8-flash-tts',
      { text: 'Hello from BYOK.', voice: 'Kore', speed: 1 },
      () => 100,
      undefined,
      undefined,
      fetchMock as unknown as typeof fetch,
    );
    expect(res.sampleRate).toBe(24_000);
    expect(res.pcm.length).toBe(12_000);
    expect(res.model).toBe('gemini-2.5-flash-preview-tts');
  });

  it('generates PNG bytes via AI Studio REST', async () => {
    const b64 = btoa('PNGDATA');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const res = await generateImageWithGeminiByok(
      TEST_KEY,
      'gemini-nano-banana-2.1',
      {
        subject: 'brass coffee grinder',
        recipe: '{subject}, clean studio object',
        keyed: true,
        aspect: '1:1',
      },
      () => 100,
      async () => {},
      fetchMock as unknown as typeof fetch,
    );
    expect(res.mimeType).toBe('image/png');
    expect(res.bytes.length).toBe(7);
    expect(res.model).toBe('gemini-2.5-flash-image');
  });
});
