import { z } from 'zod';
import type { AIProvider, ProviderRequest, ProviderResponse } from '../router';

/**
 * OpenAI-compatible local LLM provider for Ollama, LM Studio, llama.cpp, and other local
 * inference servers running on the user's machine.
 *
 * Security & privacy invariants:
 * - Communicates directly from the browser to the user-configured endpoint (default localhost).
 * - Optional API keys (for custom proxies) are sent ONLY in the `Authorization: Bearer` header
 *   and scrubbed from any thrown or returned error strings.
 * - Rejects non-HTTP(S) schemes and embedded URL credentials.
 */

export const LocalLlmPresetSchema = z.enum(['ollama', 'lmstudio', 'custom']);
export type LocalLlmPreset = z.infer<typeof LocalLlmPresetSchema>;

export interface LocalLlmPresetInfo {
  id: LocalLlmPreset;
  label: string;
  defaultBaseUrl: string;
  description: string;
}

export const LOCAL_LLM_PRESETS: Record<LocalLlmPreset, LocalLlmPresetInfo> = {
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    description: 'Local CLI & desktop runtime (port 11434)',
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    description: 'Desktop GUI local server (port 1234)',
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    defaultBaseUrl: 'http://localhost:8080/v1',
    description: 'llama.cpp, vLLM, Jan, or any /v1/chat/completions server',
  },
};

export const LocalLlmModelSchema = z
  .string()
  .trim()
  .min(1, 'Select or enter a local model name')
  .max(160, 'Model name is too long')
  .regex(/^[^\s\r\n]+$/, 'Model name cannot contain spaces');

export const LocalLlmApiKeySchema = z
  .string()
  .trim()
  .max(256, 'API key is too long')
  .regex(/^[\x21-\x7E]*$/, 'API key cannot contain spaces or non-ASCII characters');

/**
 * Validates and normalizes a local OpenAI-compatible endpoint URL.
 * Accepts bare origins (`http://localhost:11434`), `/v1` bases (`http://localhost:11434/v1`),
 * or pasted full paths (`http://localhost:11434/v1/chat/completions`), normalizing to the base
 * URL that `/models` and `/chat/completions` append to.
 */
export function normalizeLocalLlmBaseUrl(raw: string): string {
  let trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter a local server URL (e.g. http://localhost:11434/v1)');
  if (trimmed.length > 500) throw new Error('Server URL is too long');

  // Convenience: allow typing bare loopback hosts like `localhost:11434` or `127.0.0.1:1234`.
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid http:// or https:// URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// server URLs are supported');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Do not embed credentials in the server URL');
  }

  let pathname = parsed.pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/chat\/completions$/i, '');
  pathname = pathname.replace(/\/models$/i, '');
  pathname = pathname.replace(/\/api\/tags$/i, '');
  if (!pathname || pathname === '/') {
    pathname = '/v1';
  }
  return `${parsed.origin}${pathname}`;
}

export const LocalLlmBaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'Enter a local server URL')
  .max(500, 'Server URL is too long')
  .transform((val, ctx) => {
    try {
      return normalizeLocalLlmBaseUrl(val);
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: err instanceof Error ? err.message : 'Enter a valid server URL',
      });
      return z.NEVER;
    }
  });

/** True when the URL points to the local machine (loopback host). */
export function isLoopbackBaseUrl(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    const h = hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h === '[::1]' ||
      h === '0.0.0.0' ||
      h.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/** Infers the preset from a URL when none was explicitly stored. */
export function inferLocalLlmPreset(baseUrl: string): LocalLlmPreset {
  try {
    const { port } = new URL(baseUrl);
    if (port === '11434') return 'ollama';
    if (port === '1234') return 'lmstudio';
  } catch {
    // fall through
  }
  return 'custom';
}

/** Scrubs an optional bearer key before any error message reaches UI or logs. */
export function redactLocalApiKey(text: string, apiKey?: string | null): string {
  const key = apiKey?.trim();
  if (!key || key.length < 4) return text;
  return text.split(key).join('[redacted]');
}

/**
 * Security check: refuses sending a Bearer API key over cleartext `http://` to a remote
 * (non-loopback) host. Localhost `http://` and remote `https://` are allowed.
 */
export function assertSafeLocalLlmTransport(baseUrl: string, apiKey?: string | null): void {
  const key = apiKey?.trim();
  if (!key) return;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol === 'http:' && !isLoopbackBaseUrl(baseUrl)) {
      throw new Error(
        'Refusing to send a bearer token over unencrypted http:// to a non-localhost server. Use https:// instead.',
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Refusing to send')) throw err;
  }
}

export interface LocalLlmModelInfo {
  id: string;
  displayName: string;
  parameterSize?: string;
  quantization?: string;
}

export type ListLocalModelsResult =
  | { ok: true; models: LocalLlmModelInfo[]; baseUrl: string }
  | { ok: false; message: string; corsHint?: boolean };

interface OpenAiModelsResponse {
  data?: Array<{ id?: string; owned_by?: string }>;
  error?: string | { message?: string };
  message?: string;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    details?: {
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

const EXCLUDED_EMBEDDING_PATTERN = /(^|[-_/])(embed|embedding|bge-|e5-|rerank)/i;

async function readResponsePayload<T>(res: Response): Promise<{ data: T | null; rawText: string }> {
  const rawText = await res.text().catch(() => '');
  if (!rawText) return { data: null, rawText: '' };
  try {
    return { data: JSON.parse(rawText) as T, rawText };
  } catch {
    return { data: null, rawText };
  }
}

function extractHttpErrorMessage(
  data: { error?: string | { message?: string }; message?: string } | null,
  rawText: string,
  fallback: string,
): string {
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
  if (data?.error && typeof data.error === 'object' && typeof data.error.message === 'string') {
    const msg = data.error.message.trim();
    if (msg) return msg;
  }
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
  const plain = rawText.trim();
  if (plain && !plain.startsWith('<!DOCTYPE') && !plain.startsWith('<html')) {
    return plain.slice(0, 300);
  }
  return fallback;
}

function buildHeaders(apiKey?: string | null, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withJson) headers['Content-Type'] = 'application/json';
  const key = apiKey?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function isNetworkOrCorsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'TypeError') return true;
  return /failed to fetch|networkerror|load failed|cors|econnrefused|fetch failed/i.test(
    err.message,
  );
}

function formatConnectionError(baseUrl: string, err: unknown, apiKey?: string | null): {
  message: string;
  corsHint: boolean;
} {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return {
      message: `Timed out connecting to ${baseUrl}. Make sure your local server is running and responsive.`,
      corsHint: false,
    };
  }
  if (isNetworkOrCorsError(err)) {
    const preset = inferLocalLlmPreset(baseUrl);
    const serverName =
      preset === 'ollama' ? 'Ollama' : preset === 'lmstudio' ? 'LM Studio' : 'your local server';
    return {
      message: `Could not reach ${baseUrl}. Make sure ${serverName} is running and allows browser CORS requests.`,
      corsHint: true,
    };
  }
  const raw = err instanceof Error ? err.message : String(err);
  return { message: redactLocalApiKey(raw, apiKey), corsHint: false };
}

function parseOpenAiModels(body: OpenAiModelsResponse | null): LocalLlmModelInfo[] {
  const seen = new Set<string>();
  const models: LocalLlmModelInfo[] = [];
  for (const item of body?.data ?? []) {
    const id = item.id?.trim();
    if (!id || seen.has(id) || EXCLUDED_EMBEDDING_PATTERN.test(id)) continue;
    seen.add(id);
    models.push({ id, displayName: id });
  }
  return models;
}

function parseOllamaTags(body: OllamaTagsResponse | null): LocalLlmModelInfo[] {
  const seen = new Set<string>();
  const models: LocalLlmModelInfo[] = [];
  for (const item of body?.models ?? []) {
    const id = (item.name ?? item.model ?? '').trim();
    if (!id || seen.has(id) || EXCLUDED_EMBEDDING_PATTERN.test(id)) continue;
    seen.add(id);
    const param = item.details?.parameter_size?.trim();
    const quant = item.details?.quantization_level?.trim();
    models.push({
      id,
      displayName: id,
      ...(param ? { parameterSize: param } : {}),
      ...(quant ? { quantization: quant } : {}),
    });
  }
  return models;
}

/**
 * Discovers installed chat models on an Ollama, LM Studio, or custom OpenAI-compatible server.
 * Tries `GET <baseUrl>/models` first, and falls back to Ollama's `GET <origin>/api/tags` on 404.
 */
export async function listLocalLlmModels(
  rawBaseUrl: string,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ListLocalModelsResult> {
  const parsed = LocalLlmBaseUrlSchema.safeParse(rawBaseUrl);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a valid local server URL',
    };
  }
  const baseUrl = parsed.data;
  try {
    assertSafeLocalLlmTransport(baseUrl, opts.apiKey);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const headers = buildHeaders(opts.apiKey);

  try {
    const signal = timeoutSignal(timeoutMs);
    const res = await fetchFn(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      credentials: 'omit',
      ...(signal ? { signal } : {}),
    });

    if (res.ok) {
      const { data: body } = await readResponsePayload<OpenAiModelsResponse>(res);
      const models = parseOpenAiModels(body).sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true }),
      );
      return { ok: true, models, baseUrl };
    }

    // Fallback for older Ollama servers or origins without `/v1/models`.
    if (res.status === 404 || res.status === 405) {
      const origin = new URL(baseUrl).origin;
      const tagsSignal = timeoutSignal(timeoutMs);
      const tagsRes = await fetchFn(`${origin}/api/tags`, {
        method: 'GET',
        headers,
        credentials: 'omit',
        ...(tagsSignal ? { signal: tagsSignal } : {}),
      });
      if (tagsRes.ok) {
        const { data: tagsBody } = await readResponsePayload<OllamaTagsResponse>(tagsRes);
        const models = parseOllamaTags(tagsBody).sort((a, b) =>
          a.id.localeCompare(b.id, undefined, { numeric: true }),
        );
        return { ok: true, models, baseUrl };
      }
    }

    const { data: errBody, rawText } = await readResponsePayload<OpenAiModelsResponse>(res);
    const rawMsg = extractHttpErrorMessage(
      errBody,
      rawText,
      `Local server returned HTTP ${res.status} from ${baseUrl}/models`,
    );
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: 'Local server rejected credentials (HTTP 401/403). Check your optional API key.',
      };
    }
    return { ok: false, message: redactLocalApiKey(rawMsg, opts.apiKey) };
  } catch (err) {
    const { message, corsHint } = formatConnectionError(baseUrl, err, opts.apiKey);
    return { ok: false, message, ...(corsHint ? { corsHint: true } : {}) };
  }
}

interface OpenAiChatResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
    finish_reason?: string;
  }>;
  error?: string | { message?: string; type?: string; code?: string };
  message?: string;
}

/** Strips `<think>...</think>` blocks emitted by local reasoning models (e.g. Qwen3, DeepSeek-R1). */
export function stripThinkingTags(raw: string): string {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return cleaned || raw.trim();
}

function sanitizeJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema') continue;
    out[k] = v;
  }
  return out;
}

function extractChatText(data: OpenAiChatResponse | null): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return stripThinkingTags(content);
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
    return stripThinkingTags(joined);
  }
  return '';
}

function isSchemaUnsupportedError(status: number, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /response_format|json_schema|schema|grammar|unsupported|invalid.*format/i.test(message);
}

function isVisionUnsupportedError(status: number, message: string): boolean {
  if (status !== 400 && status !== 422 && status !== 500) return false;
  return /image|vision|multimodal|mmproj|does not support|invalid.*content|cannot.*image|expected string|content.*string|messages\[.*content|failed to process/i.test(
    message,
  );
}

type OpenAiUserContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

function buildUserContent(req: ProviderRequest, includeImages: boolean): OpenAiUserContent {
  const images: Array<{ mimeType: string; base64: string }> = [];
  if (req.media) {
    if (!req.media.mimeType.startsWith('image/')) {
      throw new Error(
        `Local LLM does not support ${req.media.mimeType} media. Use on-device Whisper transcription instead.`,
      );
    }
    images.push(req.media);
  }
  if (req.mediaList?.length) {
    for (const item of req.mediaList) {
      if (item.mimeType.startsWith('image/')) images.push(item);
    }
  }
  if (images.length === 0) return req.prompt;
  if (!includeImages) {
    return `${req.prompt}\n\n[Note: visual frame images were omitted because this local model is text-only; rely on the transcript and timing data.]`;
  }
  return [
    { type: 'text', text: req.prompt },
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    })),
  ];
}

export interface LocalLlmProviderOptions {
  /** Local OpenAI-compatible server base URL (e.g. `http://localhost:11434/v1`). */
  baseUrl: string;
  /** Installed model ID (e.g. `qwen3:8b`, `gemma3:12b`, `gpt-oss:20b`). */
  model: string;
  /** Optional Bearer token for custom local/LAN OpenAI-compatible servers. */
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds (default 120_000 for local inference). */
  timeoutMs?: number;
}

/**
 * Full local `AIProvider` for Ollama, LM Studio, and OpenAI-compatible servers.
 * Handles every `InferenceMode` locally (0 Motionpop credits) with automatic fallback when:
 * - A server rejects `response_format: json_schema` → retries with `json_object` + schema hint.
 * - A text-only local model rejects attached video/frame images → retries text-only cleanly.
 */
export function localLlmProvider(opts: LocalLlmProviderOptions): AIProvider {
  const baseUrl = LocalLlmBaseUrlSchema.parse(opts.baseUrl);
  const model = LocalLlmModelSchema.parse(opts.model);
  const apiKey = opts.apiKey ? LocalLlmApiKeySchema.parse(opts.apiKey) : null;
  assertSafeLocalLlmTransport(baseUrl, apiKey);
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const endpoint = `${baseUrl}/chat/completions`;
  const headers = buildHeaders(apiKey, true);

  return {
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const cleanSchema = sanitizeJsonSchema(req.jsonSchema);
      const hasImages = Boolean(
        req.media?.mimeType.startsWith('image/') ||
          req.mediaList?.some((m) => m.mimeType.startsWith('image/')),
      );

      // Give local reasoning models headroom so `<think>` blocks never truncate JSON output.
      const maxTokens = req.maxOutputTokens ? Math.max(req.maxOutputTokens, 4096) : undefined;

      const send = async (
        formatMode: 'json_schema' | 'json_object' | 'none',
        includeImages: boolean,
      ): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> => {
        const systemText =
          formatMode === 'json_schema'
            ? `${req.system}\n\nRespond with valid JSON only (no markdown fences or commentary).`
            : `${req.system}\n\nRespond with valid JSON only (no markdown fences or commentary) matching this JSON Schema:\n${JSON.stringify(cleanSchema)}`;

        const userContent = buildUserContent(req, includeImages);

        const body: Record<string, unknown> = {
          model,
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: systemText },
            { role: 'user', content: userContent },
          ],
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        };

        if (formatMode === 'json_schema') {
          body.response_format = {
            type: 'json_schema',
            json_schema: {
              name: 'motionpop_response',
              strict: false,
              schema: cleanSchema,
            },
          };
        } else if (formatMode === 'json_object') {
          body.response_format = { type: 'json_object' };
        }

        let res: Response;
        try {
          const signal = timeoutSignal(timeoutMs);
          res = await fetchFn(endpoint, {
            method: 'POST',
            headers,
            credentials: 'omit',
            body: JSON.stringify(body),
            ...(signal ? { signal } : {}),
          });
        } catch (err) {
          const { message } = formatConnectionError(baseUrl, err, apiKey);
          throw new Error(message);
        }

        const { data, rawText } = await readResponsePayload<OpenAiChatResponse>(res);
        if (!res.ok) {
          const rawMsg = extractHttpErrorMessage(
            data,
            rawText,
            `Local model request failed (HTTP ${res.status})`,
          );
          return {
            ok: false,
            status: res.status,
            message: redactLocalApiKey(rawMsg, apiKey),
          };
        }

        const text = extractChatText(data);
        if (!text) {
          return {
            ok: false,
            status: 502,
            message: `Local model "${model}" returned an empty response.`,
          };
        }
        return { ok: true, text };
      };

      let formatMode: 'json_schema' | 'json_object' | 'none' = 'json_schema';
      let includeImages = hasImages;
      let attempt = await send(formatMode, includeImages);

      // Progressive compatibility fallbacks (images -> json_object -> none, up to 3 steps).
      for (let i = 0; i < 3 && !attempt.ok; i++) {
        if (includeImages && isVisionUnsupportedError(attempt.status, attempt.message)) {
          includeImages = false;
          attempt = await send(formatMode, includeImages);
          continue;
        }
        if (
          formatMode === 'json_schema' &&
          isSchemaUnsupportedError(attempt.status, attempt.message)
        ) {
          formatMode = 'json_object';
          attempt = await send(formatMode, includeImages);
          continue;
        }
        if (
          formatMode === 'json_object' &&
          isSchemaUnsupportedError(attempt.status, attempt.message)
        ) {
          formatMode = 'none';
          attempt = await send(formatMode, includeImages);
          continue;
        }
        break;
      }

      if (!attempt.ok) {
        if (attempt.status === 404) {
          throw new Error(
            `Model "${model}" was not found on ${baseUrl}. Pull or load it in your local server, or pick another model in Settings.`,
          );
        }
        throw new Error(attempt.message);
      }

      return { text: attempt.text, ranOn: 'device', model };
    },
  };
}
