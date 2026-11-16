import { getGenerativeModel, InferenceMode, type AI } from 'firebase/ai';
import { z } from 'zod';

/**
 * `image.generate` (spec 07 R4, hybrid-ai.md: cloud only, never automatic). The image model
 * through Firebase AI Logic: `responseModalities: ['IMAGE']` with an aspect ratio and 1K size;
 * the answer is a PNG as inline data. Checked against `@firebase/ai` 3.1.0 types (`ImageConfig`,
 * `ResponseModality.IMAGE`) on 2026-11-16. Prompt and backdrop rules come from the D-030 spike.
 */

/** Words that belong to the look's recipe, not the subject (the AI must not restyle). */
const STYLE_WORDS =
  /\b(photo(graph)?|realistic|cinematic|illustration|cartoon|render(ed)?|3d|4k|8k|hdr|style|vintage|halftone|watercolou?r|painting|anime|film look|bokeh|lighting)\b/i;
/** Never a named real person, brand or text in the picture. */
const BANNED =
  /\b(logo|brand|trademark|text|words|letters|sign that says|celebrity|portrait of)\b/i;

export const ImageAspectSchema = z.enum(['1:1', '3:4', '4:3', '16:9', '9:16']);
export type ImageAspect = z.infer<typeof ImageAspectSchema>;

export const ImageSubjectSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine((s) => !STYLE_WORDS.test(s), 'Describe the thing, not the style')
  .refine((s) => !BANNED.test(s), 'No logos, text or named people');

export const ImageInputSchema = z.object({
  subject: ImageSubjectSchema,
  /** The look's recipe with `{subject}`. */
  recipe: z.string().includes('{subject}').max(400),
  /** Ask for a flat key-colour backdrop so the cutout can remove it (D-030). */
  keyed: z.boolean(),
  aspect: ImageAspectSchema.default('1:1'),
});
export type ImageInput = z.input<typeof ImageInputSchema>;

/** Recipe version: part of the asset hash, so a recipe change never reuses an old picture. */
export const IMAGE_RECIPE_VERSION = 1;

/** Used when a look has no recipe of its own. */
export const DEFAULT_IMAGE_RECIPE =
  '{subject}, clean studio photograph, soft even light, crisp detail, natural colours';

export function imagePrompt(raw: ImageInput): string {
  const input = ImageInputSchema.parse(raw);
  const lines = [
    input.recipe.replace('{subject}', input.subject),
    'One single subject, centred, the entire subject visible with empty margin around it.',
    input.keyed
      ? 'Background: perfectly flat, uniform, pure chroma green (#00FF00), no shadow, no gradient, no floor, no reflection. The subject is lit only by neutral white light: no green light, green tint or green reflection on the subject.'
      : 'A simple, uncluttered background that suits the subject.',
    'No text, no letters, no logos, no watermark, no frame. No real, identifiable people.',
  ];
  return lines.join(' ');
}

export interface ImageResult {
  bytes: Uint8Array;
  mimeType: string;
  latencyMs: number;
  model: string;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One picture. Rate limits (429) back off and retry up to 3 times: the spike saw 429s even at 2
 * parallel calls, so callers also generate one at a time.
 */
export async function generateImageWithFirebase(
  getAI: () => Promise<AI>,
  model: string,
  raw: ImageInput,
  now: () => number = () => performance.now(),
  wait: (ms: number) => Promise<void> = sleep,
): Promise<ImageResult> {
  const input = ImageInputSchema.parse(raw);
  const started = now();
  const ai = await getAI();
  const gm = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: input.aspect, imageSize: '1K' },
      },
    },
  });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await gm.generateContent([{ type: 'text', text: imagePrompt(input) }]);
      const parts = result.response.inlineDataParts() ?? [];
      const img = parts.find((p) => p.inlineData.mimeType?.startsWith('image/'));
      if (!img) throw new Error('The picture came back empty');
      return {
        bytes: base64ToBytes(img.inlineData.data),
        mimeType: img.inlineData.mimeType,
        latencyMs: Math.round(now() - started),
        model,
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/429|RESOURCE_EXHAUSTED|quota|rate/i.test(msg) || attempt === 3) throw e;
      await wait(2000 * 2 ** attempt);
    }
  }
  throw lastErr;
}
