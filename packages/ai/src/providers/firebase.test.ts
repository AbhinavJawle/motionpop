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

  it('builds hybrid params for both routes and maps the mode to the SDK value', async () => {
    generateContent.mockResolvedValue({
      response: { text: () => '{"ok":true}', inferenceSource: 'on_device' },
    });
    const res = await firebaseProvider(() => Promise.resolve(ai)).generate(REQ);
    expect(res).toEqual({ text: '{"ok":true}', ranOn: 'device' });
    expect(getGenerativeModel).toHaveBeenCalledWith(ai, {
      mode: 'prefer_on_device',
      inCloudParams: {
        model: 'gemini-test',
        systemInstruction: 'Answer with JSON.',
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object' },
        },
      },
      onDeviceParams: {
        createOptions: {
          initialPrompts: [
            { role: 'system', content: [{ type: 'text', value: 'Answer with JSON.' }] },
          ],
        },
        promptOptions: { responseConstraint: { type: 'object' } },
      },
    });
    expect(generateContent).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }]);
  });

  it('reports cloud when the SDK says in_cloud or says nothing, and sends images inline', async () => {
    const provider = firebaseProvider(() => Promise.resolve(ai));
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{}', inferenceSource: 'in_cloud' },
    });
    const image = { mimeType: 'image/jpeg' as const, base64: 'AAAA' };
    expect((await provider.generate({ ...REQ, image })).ranOn).toBe('cloud');
    expect(generateContent).toHaveBeenLastCalledWith([
      { type: 'text', text: 'hello' },
      { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
    ]);
    generateContent.mockResolvedValueOnce({ response: { text: () => '{}' } });
    expect((await provider.generate({ ...REQ, mode: 'ONLY_IN_CLOUD' })).ranOn).toBe('cloud');
  });
});
