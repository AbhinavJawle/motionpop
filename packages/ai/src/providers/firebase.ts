import { getGenerativeModel, InferenceMode, type AI, type Part } from 'firebase/ai';
import type { AIProvider, ProviderRequest, ProviderResponse } from '../router';

const EXPECTED_TEXT = { type: 'text' as const, languages: ['en'] };
const EXPECTED_IMAGE = { type: 'image' as const };
const EXPECTED_OUTPUTS = [EXPECTED_TEXT];

interface ChromeLanguageModelGlobal {
  LanguageModel?: {
    availability?: (opts?: {
      expectedInputs?: { type: string; languages?: string[] }[];
      expectedOutputs?: { type: string; languages?: string[] }[];
    }) => Promise<string>;
  };
}

/** Recursively removes JSON Schema `$schema` meta-properties before Chrome's `responseConstraint`. */
function stripSchemaMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSchemaMeta);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === '$schema') continue;
      out[k] = stripSchemaMeta(v);
    }
    return out;
  }
  return value;
}

/**
 * Firebase AI Logic provider (hybrid inference). One `GenerativeModel` per call: the mode,
 * model and output schema differ per task, and the SDK opens a fresh on-device session per
 * request anyway. Checked against `@firebase/ai` 3.1.0 (firebase 13.3.0):
 * - the cloud route takes `systemInstruction` + `responseJsonSchema`;
 * - the on-device route ignores `systemInstruction`, so the system text goes in as a `system`
 *   initial prompt, and the JSON Schema as the Prompt API `responseConstraint`;
 * - `response.inferenceSource` says where it actually ran (`on_device` | `in_cloud`);
 * - we explicitly pass `expectedInputs` matching actual media (so text-only tasks run even on
 *   text-only Gemini Nano installs) and guard `ONLY_ON_DEVICE` against `@firebase/ai` 3.1.0
 *   silently falling back to cloud when `LanguageModel` is absent or calling `LanguageModel.create`
 *   when status is `downloadable`/`downloading`.
 */
export function firebaseProvider(getAI: () => Promise<AI>): AIProvider {
  return {
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const hasImageMedia = Boolean(
        req.media?.mimeType.startsWith('image/') ||
          req.mediaList?.some((item) => item.mimeType.startsWith('image/')),
      );
      let includeImages = hasImageMedia;

      if (req.mode === 'ONLY_ON_DEVICE') {
        if (req.media && !req.media.mimeType.startsWith('image/')) {
          throw new Error(`On-device Gemini Nano does not support ${req.media.mimeType} media`);
        }
        const lm = (globalThis as unknown as ChromeLanguageModelGlobal).LanguageModel;
        if (lm?.availability) {
          const wantedInputs = hasImageMedia ? [EXPECTED_TEXT, EXPECTED_IMAGE] : [EXPECTED_TEXT];
          let status = await lm.availability({
            expectedInputs: wantedInputs,
            expectedOutputs: EXPECTED_OUTPUTS,
          });
          if (status !== 'available' && hasImageMedia) {
            const textStatus = await lm.availability({
              expectedInputs: [EXPECTED_TEXT],
              expectedOutputs: EXPECTED_OUTPUTS,
            });
            if (textStatus === 'available') {
              status = 'available';
              includeImages = false;
            }
          }
          if (status !== 'available') {
            throw new Error(`On-device Gemini Nano is ${status}`);
          }
        } else if (typeof window !== 'undefined') {
          // Guard against `@firebase/ai` 3.1.0 falling back to cloud when `chromeAdapter` is absent.
          throw new Error('On-device Gemini Nano is not available in this browser');
        }
      }

      const expectedInputs = includeImages ? [EXPECTED_TEXT, EXPECTED_IMAGE] : [EXPECTED_TEXT];
      const onDeviceSchema = stripSchemaMeta(req.jsonSchema) as Record<string, unknown>;

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
            // The SDK's GenerationConfig field (`@firebase/ai` 3.1.0, requests.d.ts). Cloud only.
            ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
          },
        },
        onDeviceParams: {
          createOptions: {
            expectedInputs,
            expectedOutputs: EXPECTED_OUTPUTS,
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: req.system }] }],
          },
          promptOptions: { responseConstraint: onDeviceSchema },
        },
      });
      const parts: Part[] = [{ type: 'text', text: req.prompt }];
      if (req.media && (includeImages || !req.media.mimeType.startsWith('image/')))
        parts.push({
          type: 'inlineData',
          inlineData: { mimeType: req.media.mimeType, data: req.media.base64 },
        });
      if (req.mediaList?.length) {
        for (const item of req.mediaList) {
          if (!includeImages && item.mimeType.startsWith('image/')) continue;
          parts.push({
            type: 'inlineData',
            inlineData: { mimeType: item.mimeType, data: item.base64 },
          });
        }
      }
      const result = await model.generateContent(parts);
      let text: string;
      try {
        text = result.response.text();
      } catch (err) {
        // A RECITATION stop is a false positive on short JSON answers ("Candidate was blocked due
        // to RECITATION"): hand back an empty answer so the router repairs it with a fresh sample
        // instead of failing the action outright (seen on `reel.note`, spec 29).
        if (!/RECITATION/.test(err instanceof Error ? err.message : String(err))) throw err;
        text = '';
      }
      return {
        text,
        ranOn: result.response.inferenceSource === 'on_device' ? 'device' : 'cloud',
      };
    },
  };
}
