import { getGenerativeModel, InferenceMode, type AI, type Part } from 'firebase/ai';
import type { AIProvider, ProviderRequest, ProviderResponse } from '../router';

/**
 * Firebase AI Logic provider (hybrid inference). One `GenerativeModel` per call: the mode,
 * model and output schema differ per task, and the SDK opens a fresh on-device session per
 * request anyway. Checked against `@firebase/ai` 3.1.0 (firebase 13.3.0) on 2026-11-15:
 * - the cloud route takes `systemInstruction` + `responseJsonSchema`;
 * - the on-device route ignores `systemInstruction`, so the system text goes in as a `system`
 *   initial prompt, and the JSON Schema as the Prompt API `responseConstraint`;
 * - `response.inferenceSource` says where it actually ran (`on_device` | `in_cloud`).
 */
export function firebaseProvider(getAI: () => Promise<AI>): AIProvider {
  return {
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const ai = await getAI();
      const model = getGenerativeModel(ai, {
        // Our schema uses the constant names; the SDK's values are lowercase strings.
        mode: InferenceMode[req.mode],
        inCloudParams: {
          model: req.model,
          systemInstruction: req.system,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseJsonSchema: req.jsonSchema,
            ...(req.thinking ? { thinkingConfig: { thinkingLevel: req.thinking } } : {}),
          },
        },
        onDeviceParams: {
          createOptions: {
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: req.system }] }],
          },
          promptOptions: { responseConstraint: req.jsonSchema },
        },
      });
      const parts: Part[] = [{ type: 'text', text: req.prompt }];
      if (req.image)
        parts.push({
          type: 'inlineData',
          inlineData: { mimeType: req.image.mimeType, data: req.image.base64 },
        });
      const result = await model.generateContent(parts);
      return {
        text: result.response.text(),
        ranOn: result.response.inferenceSource === 'on_device' ? 'device' : 'cloud',
      };
    },
  };
}
