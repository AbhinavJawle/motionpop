import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AI } from 'firebase/ai';

const generateContent = vi.fn();
const getGenerativeModel = vi.fn((_ai: unknown, _params: unknown) => ({ generateContent }));
vi.mock('firebase/ai', () => ({
  getGenerativeModel: (ai: unknown, params: unknown) => getGenerativeModel(ai, params),
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
    PREFER_IN_CLOUD: 'prefer_in_cloud',
  },
}));

const { firebaseProvider } = await import('./firebase');

const ai = {} as AI;
const REQ = {
  mode: 'PREFER_ON_DEVICE' as const,
  model: 'gemini-test',
  system: 'Answer with JSON.',
  prompt: 'hello',
  jsonSchema: { type: 'object' },
};

describe('firebaseProvider', () => {
  beforeEach(() => {
    generateContent.mockReset();
    getGenerativeModel.mockClear();
  });

  it('turns a RECITATION stop into an empty answer (repairable) and rethrows other blocks', async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () => {
          throw new Error('Candidate was blocked due to RECITATION');
        },
        inferenceSource: 'in_cloud',
      },
    });
    const p = firebaseProvider(() => Promise.resolve(ai));
    await expect(p.generate(REQ)).resolves.toEqual({ text: '', ranOn: 'cloud' });
    generateContent.mockResolvedValueOnce({
      response: {
        text: () => {
          throw new Error('Candidate was blocked due to SAFETY');
        },
      },
    });
    await expect(p.generate(REQ)).rejects.toThrow(/SAFETY/);
  });

  it('builds hybrid params for both routes and maps the mode to the SDK value', async () => {
    generateContent.mockResolvedValue({
      response: { text: () => '{"ok":true}', inferenceSource: 'on_device' },
    });
    const res = await firebaseProvider(() => Promise.resolve(ai)).generate({
      ...REQ,
      jsonSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { nested: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' } },
      },
    });
    expect(res).toEqual({ text: '{"ok":true}', ranOn: 'device' });
    expect(getGenerativeModel).toHaveBeenCalledWith(ai, {
      mode: 'prefer_on_device',
      inCloudParams: {
        model: 'gemini-test',
        systemInstruction: 'Answer with JSON.',
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
              nested: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' },
            },
          },
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
          initialPrompts: [
            { role: 'system', content: [{ type: 'text', value: 'Answer with JSON.' }] },
          ],
        },
        promptOptions: {
          responseConstraint: {
            type: 'object',
            properties: { nested: { type: 'string' } },
          },
        },
      },
    });
    expect(generateContent).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }]);
  });

  it('guards ONLY_ON_DEVICE against downloadable/downloading status and missing LanguageModel in browser', async () => {
    const provider = firebaseProvider(() => Promise.resolve(ai));
    const origLm = (globalThis as Record<string, unknown>).LanguageModel;
    const origWin = (globalThis as Record<string, unknown>).window;
    try {
      // Downloadable: must reject immediately without calling SDK (prevents silent download trigger).
      (globalThis as Record<string, unknown>).LanguageModel = {
        availability: vi.fn(async () => 'downloadable'),
      };
      await expect(
        provider.generate({ ...REQ, mode: 'ONLY_ON_DEVICE' }),
      ).rejects.toThrow(/downloadable/i);
      expect(getGenerativeModel).not.toHaveBeenCalled();

      // Browser without LanguageModel: must reject without falling back to cloud.
      delete (globalThis as Record<string, unknown>).LanguageModel;
      (globalThis as Record<string, unknown>).window = {};
      await expect(
        provider.generate({ ...REQ, mode: 'ONLY_ON_DEVICE' }),
      ).rejects.toThrow(/not available/i);
      expect(getGenerativeModel).not.toHaveBeenCalled();

      // Text-only Nano fallback when multimodal is unavailable for an image ONLY_ON_DEVICE call.
      const availability = vi
        .fn()
        .mockResolvedValueOnce('unavailable')
        .mockResolvedValueOnce('available');
      (globalThis as Record<string, unknown>).LanguageModel = { availability };
      generateContent.mockResolvedValueOnce({
        response: { text: () => '{"ok":true}', inferenceSource: 'on_device' },
      });
      const res = await provider.generate({
        ...REQ,
        mode: 'ONLY_ON_DEVICE',
        media: { mimeType: 'image/jpeg', base64: 'AAAA' },
      });
      expect(res).toEqual({ text: '{"ok":true}', ranOn: 'device' });
      expect(generateContent).toHaveBeenLastCalledWith([{ type: 'text', text: 'hello' }]);

      // PREFER_ON_DEVICE when downloadable: cleanly downgrades to ONLY_IN_CLOUD without triggering
      // an ungestured LanguageModel.create() download inside `@firebase/ai`.
      getGenerativeModel.mockClear();
      (globalThis as Record<string, unknown>).LanguageModel = {
        availability: vi.fn(async () => 'downloadable'),
      };
      generateContent.mockResolvedValueOnce({
        response: { text: () => '{"ok":true}', inferenceSource: 'in_cloud' },
      });
      const cloudFallback = await provider.generate({ ...REQ, mode: 'PREFER_ON_DEVICE' });
      expect(cloudFallback).toEqual({ text: '{"ok":true}', ranOn: 'cloud' });
      expect(getGenerativeModel).toHaveBeenCalledWith(
        ai,
        expect.objectContaining({ mode: 'only_in_cloud' }),
      );
    } finally {
      if (origLm === undefined) delete (globalThis as Record<string, unknown>).LanguageModel;
      else (globalThis as Record<string, unknown>).LanguageModel = origLm;
      if (origWin === undefined) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = origWin;
    }
  });

  it('reports cloud when the SDK says in_cloud or says nothing, and sends media inline', async () => {
    const provider = firebaseProvider(() => Promise.resolve(ai));
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{}', inferenceSource: 'in_cloud' },
    });
    const media = { mimeType: 'image/jpeg' as const, base64: 'AAAA' };
    expect((await provider.generate({ ...REQ, media })).ranOn).toBe('cloud');
    expect(generateContent).toHaveBeenLastCalledWith([
      { type: 'text', text: 'hello' },
      { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
    ]);
    const audio = { mimeType: 'audio/wav' as const, base64: 'UklG' };
    generateContent.mockResolvedValueOnce({ response: { text: () => '{}' } });
    await provider.generate({ ...REQ, mode: 'ONLY_IN_CLOUD', media: audio });
    expect(generateContent).toHaveBeenLastCalledWith([
      { type: 'text', text: 'hello' },
      { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data: 'UklG' } },
    ]);
    generateContent.mockResolvedValueOnce({ response: { text: () => '{}' } });
    expect((await provider.generate({ ...REQ, mode: 'ONLY_IN_CLOUD' })).ranOn).toBe('cloud');
  });
});

describe('firebaseProvider: output cap (spec 13b R3.5)', () => {
  beforeEach(() => {
    generateContent.mockReset();
    getGenerativeModel.mockClear();
    generateContent.mockResolvedValue({
      response: { text: () => '{}', inferenceSource: 'in_cloud' },
    });
  });

  it('passes maxOutputTokens as the cloud generationConfig field', async () => {
    await firebaseProvider(() => Promise.resolve(ai)).generate({
      ...REQ,
      mode: 'ONLY_IN_CLOUD',
      maxOutputTokens: 6144,
    });
    const params = getGenerativeModel.mock.calls[0]?.[1] as {
      inCloudParams: { generationConfig: Record<string, unknown> };
    };
    expect(params.inCloudParams.generationConfig['maxOutputTokens']).toBe(6144);
  });

  it('omits the field when a request sets no cap', async () => {
    await firebaseProvider(() => Promise.resolve(ai)).generate({ ...REQ, mode: 'ONLY_IN_CLOUD' });
    const params = getGenerativeModel.mock.calls[0]?.[1] as {
      inCloudParams: { generationConfig: Record<string, unknown> };
    };
    expect('maxOutputTokens' in params.inCloudParams.generationConfig).toBe(false);
  });
});
