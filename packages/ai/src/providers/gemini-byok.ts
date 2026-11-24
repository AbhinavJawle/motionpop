import { z } from 'zod';
import {
  base64ToInt16,
  deliveryNote,
  partCacheKey,
  rateFromMime,
  SpeakInputSchema,
  splitScript,
  type PartAudio,
  type PartCache,
  type SpeakInput,
  type SpeakResult,
} from '../speech';
import {
  base64ToBytes,
  ImageInputSchema,
  imagePrompt,
  type ImageInput,
  type ImageResult,
} from '../image';
import type { AIProvider, ProviderRequest, ProviderResponse } from '../router';

/**
 * Direct Google AI Studio Gemini REST provider for user-supplied API keys (Spec 42 BYOK).
 *
 * Security invariants:
 * - The API key is sent ONLY in the `x-goog-api-key` HTTP header, never in URL query strings.
 * - Any thrown error message is scrubbed of the API key and `AIza...` key patterns.
 * - Hybrid-first: when an `onDevice` provider is supplied, `ONLY_ON_DEVICE` and `PREFER_ON_DEVICE`
 *   still run on Chrome's Gemini Nano first; Google AI Studio REST is used only for cloud routes.
 */

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const GeminiApiKeySchema = z
  .string()
  .trim()
  .min(20, 'Enter a valid Google AI Studio Gemini API key')
  .max(128, 'API key is too long')
  .regex(/^[\x21-\x7E]+$/, 'API key cannot contain spaces or non-ASCII characters');

export const ByokModelModeSchema = z.enum(['balanced', 'flash']);
export type ByokModelMode = z.infer<typeof ByokModelModeSchema>;

const AI_STUDIO_KEY_PATTERN = /AIza[0-9A-Za-z_-]{10,}/g;

/** Removes the raw key and any Google API key pattern before an error reaches UI or logs. */
export function redactApiKey(text: string, apiKey?: string): string {
  let out = text;
  if (apiKey && apiKey.length >= 8) {
    out = out.split(apiKey).join('[redacted]');
  }
  return out.replace(AI_STUDIO_KEY_PATTERN, '[redacted]');
}

/**
 * Maps Motionpop's Vertex/AgentPlatform model IDs to public Google AI Studio Gemini API models.
 * Standard Gemini 2.x/3.x public developer IDs pass straight through.
 */
export function byokModelFor(requestedModel: string, mode: ByokModelMode = 'balanced'): string {
  const m = requestedModel.trim();
  if (/tts/i.test(m)) return 'gemini-2.5-flash-preview-tts';
  if (/nano-banana|image/i.test(m)) return 'gemini-2.5-flash-image';
  if (/^gemini-2\./i.test(m)) return m;
  if (mode === 'flash') return 'gemini-2.5-flash';
  if (/lite|flash/i.test(m)) return 'gemini-2.5-flash';
  // Frontier / strong models (gemini-4-neon, gemini-4-carbon, gemini-4-hydrogen, *-pro)
  return 'gemini-2.5-pro';
}

interface GeminiInlinePart {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
  text?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: GeminiInlinePart[] };
    finishReason?: string;
  }>;
  error?: { code?: number; message?: string; status?: string };
}

function extractRestError(
  status: number,
  body: GeminiGenerateResponse | null,
  apiKey: string,
): Error {
  const raw = body?.error?.message ?? `Gemini API request failed (${status})`;
  if (status === 400 && /API key/i.test(raw)) {
    return new Error('Gemini API key was rejected. Check your key in Settings.');
  }
  if (status === 401 || status === 403) {
    return new Error('Gemini API key is invalid or lacks permission.');
  }
  if (status === 429) {
    return new Error('Gemini API rate limit reached (429). Try again or switch to Flash mode.');
  }
  return new Error(redactApiKey(raw, apiKey));
}

/**
 * Minimal Chrome Built-in AI (`LanguageModel`) on-device provider for BYOK sessions where
 * Firebase isn't initialized (e.g., local mode) so Gemini Nano still runs first when available.
 */
export function chromeOnDeviceProvider(): AIProvider {
  return {
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const g = globalThis as unknown as {
        LanguageModel?: {
          availability?: (opts?: unknown) => Promise<string>;
          create?: (opts?: unknown) => Promise<{
            prompt: (input: unknown, opts?: unknown) => Promise<string>;
            destroy?: () => void;
          }>;
        };
      };
      const api = g.LanguageModel;
      if (!api?.create) throw new Error('On-device Gemini Nano is not available');
      const expectedInputs = [
        { type: 'text' },
        ...(req.media ? [{ type: 'image' }] : []),
      ];
      if (api.availability) {
        const status = await api.availability({ expectedInputs });
        if (status !== 'available') throw new Error(`On-device Gemini Nano is ${status}`);
      }
      const session = await api.create({
        expectedInputs,
        initialPrompts: [{ role: 'system', content: req.system }],
      });
      try {
        let promptInput: unknown = req.prompt;
        if (req.media && typeof atob === 'function' && typeof Blob !== 'undefined') {
          try {
            const bin = atob(req.media.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: req.media.mimeType });
            promptInput = [
              {
                role: 'user',
                content: [
                  { type: 'text', value: req.prompt },
                  { type: 'image', value: blob },
                ],
              },
            ];
          } catch {
            // Invalid base64: fall back to text-only prompt cleanly.
            promptInput = req.prompt;
          }
        }
        const text = await session.prompt(promptInput, {
          responseConstraint: req.jsonSchema,
        });
        return { text, ranOn: 'device' };
      } finally {
        session.destroy?.();
      }
    },
  };
}

export interface GeminiByokProviderOptions {
  apiKey: string;
  /** Optional on-device provider (Firebase AI Logic or Chrome Prompt API) tried first for local modes. */
  onDevice?: AIProvider;
  modelMode?: ByokModelMode;
  fetchImpl?: typeof fetch;
}

/**
 * Hybrid provider that keeps on-device Gemini Nano first for `ONLY_ON_DEVICE` / `PREFER_ON_DEVICE`
 * and sends cloud requests directly to Google AI Studio using the user's API key.
 */
export function geminiByokProvider(opts: GeminiByokProviderOptions): AIProvider {
  const apiKey = GeminiApiKeySchema.parse(opts.apiKey);
  const mode = opts.modelMode ?? 'balanced';
  const fetchFn = opts.fetchImpl ?? fetch;

  return {
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      if (req.mode === 'ONLY_ON_DEVICE') {
        if (!opts.onDevice) throw new Error('On-device Gemini Nano is not available');
        return opts.onDevice.generate({ ...req, mode: 'ONLY_ON_DEVICE' });
      }
      if (req.mode === 'PREFER_ON_DEVICE' && opts.onDevice) {
        try {
          return await opts.onDevice.generate({ ...req, mode: 'ONLY_ON_DEVICE' });
        } catch {
          // Fall through to user's cloud Gemini key
        }
      }

      const model = byokModelFor(req.model, mode);
      const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: req.prompt },
      ];

      if (req.media) {
        parts.push({
          inlineData: { mimeType: req.media.mimeType, data: req.media.base64 },
        });
      }
      if (req.mediaList?.length) {
        for (const item of req.mediaList) {
          parts.push({
            inlineData: { mimeType: item.mimeType, data: item.base64 },
          });
        }
      }

      const generationConfig: Record<string, unknown> = {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseJsonSchema: req.jsonSchema,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      };

      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig,
      };

      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(redactApiKey(msg, apiKey));
      }

      const data = (await res.json().catch(() => null)) as GeminiGenerateResponse | null;
      if (!res.ok) throw extractRestError(res.status, data, apiKey);

      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason === 'RECITATION') {
        return { text: '', ranOn: 'cloud' };
      }
      const text = (candidate?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();
      return { text, ranOn: 'cloud' };
    },
  };
}

export type KeyTestResult = { ok: true } | { ok: false; message: string };

/**
 * Lightweight zero-token check that validates a Google AI Studio key against `/v1beta/models`.
 * Sends the key ONLY in `x-goog-api-key` and redacts any error string.
 */
export async function testGeminiApiKey(
  rawKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyTestResult> {
  const parsed = GeminiApiKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a valid Gemini API key',
    };
  }
  const apiKey = parsed.data;
  try {
    const res = await fetchImpl(`${GEMINI_API_BASE}/models?pageSize=1`, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as GeminiGenerateResponse | null;
    return { ok: false, message: extractRestError(res.status, body, apiKey).message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: redactApiKey(msg, apiKey) };
  }
}

const PART_GAP_MS = 220;

/**
 * Script → voice over Google AI Studio REST using the user's BYOK key (mirrors `speakWithFirebase`).
 */
export async function speakWithGeminiByok(
  rawKey: string,
  requestedModel: string,
  raw: SpeakInput,
  now: () => number = () => performance.now(),
  onPart?: (done: number, total: number) => void,
  partCache?: PartCache,
  fetchImpl: typeof fetch = fetch,
): Promise<SpeakResult> {
  const apiKey = GeminiApiKeySchema.parse(rawKey);
  const model = byokModelFor(requestedModel);
  const input = SpeakInputSchema.parse(raw);
  const started = now();
  const parts = splitScript(input.text);
  const audio: Int16Array[] = [];
  let rate = 24_000;
  onPart?.(0, parts.length);

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i] ?? '';
    const sentText = `${deliveryNote(input.speed)}${text}`;
    const key = partCacheKey(sentText, input.voice, model);
    let r: PartAudio | null = partCache ? await partCache.get(key).catch(() => null) : null;
    if (!r) {
      const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: sentText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } },
            },
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as GeminiGenerateResponse | null;
      if (!res.ok) throw extractRestError(res.status, data, apiKey);

      const resParts = data?.candidates?.[0]?.content?.parts ?? [];
      const chunks: Int16Array[] = [];
      let partRate = 24_000;
      for (const p of resParts) {
        const inline =
          p.inlineData ??
          (p.inline_data
            ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data }
            : undefined);
        if (inline?.data && inline.mimeType?.startsWith('audio/')) {
          partRate = rateFromMime(inline.mimeType);
          chunks.push(base64ToInt16(inline.data));
        }
      }
      const totalSamples = chunks.reduce((n, c) => n + c.length, 0);
      if (totalSamples < partRate / 4) throw new Error('The voice came back empty');
      const merged = new Int16Array(totalSamples);
      let o = 0;
      for (const c of chunks) {
        merged.set(c, o);
        o += c.length;
      }
      r = { pcm: merged, sampleRate: partRate };
      await partCache?.put(key, r).catch(() => {});
    }
    rate = r.sampleRate;
    if (i > 0) audio.push(new Int16Array(Math.round((rate * PART_GAP_MS) / 1000)));
    audio.push(r.pcm);
    onPart?.(i + 1, parts.length);
  }

  const total = audio.reduce((n, c) => n + c.length, 0);
  const pcm = new Int16Array(total);
  let o = 0;
  for (const c of audio) {
    pcm.set(c, o);
    o += c.length;
  }
  return { pcm, sampleRate: rate, latencyMs: Math.round(now() - started), model };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Generates an image over Google AI Studio REST using the user's BYOK key (mirrors `generateImageWithFirebase`).
 */
export async function generateImageWithGeminiByok(
  rawKey: string,
  requestedModel: string,
  raw: ImageInput,
  now: () => number = () => performance.now(),
  wait: (ms: number) => Promise<void> = sleep,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageResult> {
  const apiKey = GeminiApiKeySchema.parse(rawKey);
  const model = byokModelFor(requestedModel);
  const input = ImageInputSchema.parse(raw);
  const started = now();
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: imagePrompt(input) }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: input.aspect, imageSize: '1K' },
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as GeminiGenerateResponse | null;
      if (!res.ok) throw extractRestError(res.status, data, apiKey);

      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      let found: { data: string; mimeType: string } | null = null;
      for (const p of parts) {
        const inline =
          p.inlineData ??
          (p.inline_data
            ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data }
            : undefined);
        if (inline?.data && inline.mimeType?.startsWith('image/')) {
          found = { data: inline.data, mimeType: inline.mimeType };
          break;
        }
      }
      if (!found) throw new Error('The picture came back empty');
      return {
        bytes: base64ToBytes(found.data),
        mimeType: found.mimeType,
        latencyMs: Math.round(now() - started),
        model,
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/429|RESOURCE_EXHAUSTED|quota|rate/i.test(msg) || attempt === 3) {
        throw e instanceof Error ? new Error(redactApiKey(e.message, apiKey)) : e;
      }
      await wait(2000 * 2 ** attempt);
    }
  }
  throw lastErr;
}
