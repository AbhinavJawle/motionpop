import { z } from 'zod';
import type { InferenceMode, RanOn } from '@motionpop/schemas';
import { cacheKeyOf, ROUTER_CACHE_TTL_MS, type RouterCache } from './cache';

/**
 * The AI router (hybrid-ai.md): every runtime AI call goes through `run(task, input)`. It picks
 * the inference mode, calls the provider, parses the JSON output with zod, repairs once, then
 * escalates to the cloud only when the task allows it. It never returns output that fails the
 * task's schema (spec 00 correctness property 3).
 */

/** What usage logs name an on-device run: Gemini Nano, served by Chrome. */
export const DEVICE_MODEL = 'gemini-nano';

export interface ProviderRequest {
  mode: InferenceMode;
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema of the expected output (structured output on both routes). */
  jsonSchema: Record<string, unknown>;
  /** Cloud thinking level (Gemini 3.x). Lower is faster; ignored on-device. */
  thinking?: ThinkingLevel;
  /** Cloud output cap in tokens (spec 13b R3.5); thinking tokens count against it. Ignored on-device. */
  maxOutputTokens?: number;
  /**
   * Optional inline media: a JPEG/PNG for note.fix (on-device accepts images), or audio for
   * transcribe.cloud (cloud only: Gemini Nano takes no audio).
   */
  media?: { mimeType: MediaMimeType; base64: string };
  /** Multiple inline media items (e.g. sampled video keyframes for video.direct, cloud only). */
  mediaList?: { mimeType: MediaMimeType; base64: string }[];
}

export const MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];

export type ThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface ProviderResponse {
  text: string;
  ranOn: RanOn;
  /** Explicit model ID reported by the provider (e.g. a local Ollama/LM Studio model). */
  model?: string;
  /** Input tokens the provider served from its implicit cache, when it reports them (cloud). */
  cachedTokens?: number;
}

export interface AIProvider {
  generate(req: ProviderRequest): Promise<ProviderResponse>;
}

export interface TaskDef<I, O> {
  id: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  /** Default mode for this input (e.g. slots.detect switches at 400 words). */
  mode: (input: I, cfg: RouterConfig) => InferenceMode;
  model: (cfg: RouterConfig) => string;
  system: string;
  prompt: (input: I) => string;
  /** Credits when the call ran in the cloud. */
  cloudCost: (input: I) => number;
  /** May the router retry in the cloud after a failed device answer? (No surprise spend.) */
  cloudFallback: boolean;
  /** Repair rounds after an invalid answer (default 1). `component.fill` uses 2 (spec 07 R1.4). */
  maxRepairs?: number;
  /** Answers may be cached (spec 13b R4.1). Only free routed tasks set this. */
  cacheable?: boolean;
  /** Version of the prompt text, part of the cache key (`prompts/<task>.v1.ts` → "v1"). */
  promptVersion?: string;
  /** Cloud thinking level; omit for the model default. */
  thinking?: ThinkingLevel;
  /** Cloud output cap in tokens, sized to the schema (spec 13b R3.5). Every cloud task sets one. */
  maxOutputTokens?: number;
  /**
   * Semantic check after the schema parse (e.g. "the patch applies and the params stay valid").
   * Returns an error message, or null when the output is usable. A failure counts as an invalid
   * answer: it triggers the repair, and the message is fed back to the model.
   */
  check?: (output: O, input: I) => string | null;
  /**
   * Structured-output schema for this input, when it depends on the input (`component.fill`
   * sends the component's own params schema, so no schema text goes in the prompt). Defaults
   * to the JSON Schema of `output`.
   */
  jsonSchema?: (input: I) => Record<string, unknown>;
  media?: (input: I) => ProviderRequest['media'];
  mediaList?: (input: I) => ProviderRequest['mediaList'];
}

export interface RouterConfig {
  routingOverrides: Record<string, InferenceMode>;
  routingSlotsDetectDeviceMaxWords: number;
  modelFast: string;
  modelStrong: string;
  modelFilmBuild: string;
  killSwitch: boolean;
}

export interface RunResult<O> {
  output: O;
  ranOn: RanOn;
  model: string;
  costCredits: number;
  latencyMs: number;
  /** 1 = first answer valid, 2 = after repair, 3 = after cloud escalation. 0 = from the cache. */
  attempts: number;
  /** True when the answer came from the router cache: no model call was made. */
  cached: boolean;
  /** Cached input tokens the cloud reported for this call, when it did. */
  cachedTokens?: number;
}

export interface UsageEvent {
  task: string;
  ranOn: RanOn;
  model: string;
  credits: number;
  /** Answered from the router cache (spec 13b R5.1). */
  cached?: boolean;
  /** Cached input tokens the provider reported (cloud calls only). */
  cachedTokens?: number;
  /** What this call would cost in the cloud: what an on-device call saved (Settings, spec 13). */
  cloudCost: number;
  latencyMs: number;
  ok: boolean;
  /** Provider calls made, repairs included. */
  attempts?: number;
  /** Why each rejected answer was rejected (gate reports, schema errors), at most 200 chars each. */
  problems?: string[];
}

export class RouterError extends Error {
  constructor(
    readonly task: string,
    readonly reason: 'invalid-input' | 'invalid-output' | 'provider' | 'kill-switch',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

const isCloudMode = (m: InferenceMode) => m === 'ONLY_IN_CLOUD' || m === 'PREFER_IN_CLOUD';

/** Pull the JSON value out of a model answer (tolerates ``` fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new SyntaxError('no JSON found in the model answer');
  }
}

function parseOutput<O>(
  schema: z.ZodType<O>,
  text: string,
): { ok: true; value: O } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'invalid JSON' };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: z.prettifyError(parsed.error).slice(0, 800) };
}

export interface RunOptions {
  mode?: InferenceMode;
  /**
   * Model id for this call (the Pip model selector, spec 18). Blank or missing means the task's
   * own model from the config. Used for the provider request, the cache key and the usage log.
   */
  model?: string;
  /**
   * `false` turns off the task's `cloudFallback` for this call. The app passes it for every
   * device-routed edit and note: escalating to the cloud is a user click with its own chip, never
   * a silent charge (spec 09 D-035). Default: the task's own `cloudFallback`.
   */
  allowCloud?: boolean;
  /** `false` skips the answer cache for this call (a fresh answer is wanted). */
  allowCache?: boolean;
}

export interface Router {
  run<I, O>(task: TaskDef<I, O>, input: I, opts?: RunOptions): Promise<RunResult<O>>;
}

export function createRouter(deps: {
  provider: AIProvider;
  config: () => RouterConfig;
  onUsage?: (e: UsageEvent) => void;
  now?: () => number;
  /** The answer cache for `cacheable` tasks (spec 13b R4.1). Without it nothing is cached. */
  cache?: RouterCache;
}): Router {
  const now = deps.now ?? (() => performance.now());
  return {
    async run<I, O>(task: TaskDef<I, O>, rawInput: I, opts: RunOptions = {}) {
      const cfg = deps.config();
      const input = task.input.safeParse(rawInput);
      if (!input.success) {
        throw new RouterError(task.id, 'invalid-input', z.prettifyError(input.error));
      }
      const chosen = opts.mode ?? cfg.routingOverrides[task.id] ?? task.mode(input.data, cfg);
      // Kill switch (daily budget): cloud-only work stops; everything else stays on the device.
      if (cfg.killSwitch && chosen === 'ONLY_IN_CLOUD') {
        throw new RouterError(task.id, 'kill-switch', 'Cloud AI is paused');
      }
      const mode: InferenceMode = cfg.killSwitch ? 'ONLY_ON_DEVICE' : chosen;
      const model = opts.model?.trim() ? opts.model.trim() : task.model(cfg);
      // A cached answer: no model call, so no credits and the stored `ranOn` unchanged (R4.1).
      const cacheKey =
        deps.cache && task.cacheable && opts.allowCache !== false
          ? cacheKeyOf({
              task: task.id,
              promptVersion: task.promptVersion ?? '',
              model,
              input: input.data,
            })
          : undefined;
      if (cacheKey !== undefined && deps.cache) {
        const t0 = now();
        const hit = await deps.cache.get(cacheKey).catch(() => undefined);
        const stored = hit ? task.output.safeParse(hit.output) : undefined;
        if (hit && stored?.success) {
          const latencyMs = Math.round(now() - t0);
          deps.onUsage?.({
            task: task.id,
            ranOn: hit.ranOn,
            model: hit.model,
            credits: 0,
            cached: true,
            cloudCost: task.cloudCost(input.data),
            latencyMs,
            ok: true,
            attempts: 0,
          });
          return {
            output: stored.data,
            ranOn: hit.ranOn,
            model: hit.model,
            costCredits: 0,
            latencyMs,
            attempts: 0,
            cached: true,
          };
        }
      }
      const jsonSchema =
        task.jsonSchema?.(input.data) ??
        (z.toJSONSchema(task.output, { target: 'draft-7' }) as Record<string, unknown>);
      const base = {
        model,
        system: task.system,
        jsonSchema,
        ...(task.thinking ? { thinking: task.thinking } : {}),
        ...(task.maxOutputTokens ? { maxOutputTokens: task.maxOutputTokens } : {}),
        ...(task.media ? { media: task.media(input.data) } : {}),
        ...(task.mediaList ? { mediaList: task.mediaList(input.data) } : {}),
      };
      const cloudCost = task.cloudCost(input.data);
      const started = now();
      let attempts = 0;
      let lastRanOn: RanOn = isCloudMode(mode) ? 'cloud' : 'device';
      let lastError = '';
      // Why each rejected answer was rejected (gate reports, schema errors), for usage logs.
      const problems: string[] = [];
      // Read through a function: TypeScript doesn't track writes made inside `attempt`.
      let lastFailure: 'provider' | 'invalid-output' = 'provider';
      const failure = () => lastFailure;

      const check = (value: O): string | null => {
        try {
          return task.check?.(value, input.data) ?? null;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      };

      const attempt = async (m: InferenceMode, prompt: string) => {
        attempts++;
        let res: ProviderResponse;
        try {
          res = await deps.provider.generate({ ...base, mode: m, prompt });
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          lastFailure = 'provider';
          return null;
        }
        lastRanOn = res.ranOn;
        const parsed = parseOutput(task.output, res.text);
        const problem = parsed.ok ? check(parsed.value) : parsed.error;
        if (parsed.ok && problem === null) {
          return {
            value: parsed.value,
            ranOn: res.ranOn,
            ...(res.model ? { model: res.model } : {}),
            ...(res.cachedTokens !== undefined ? { cachedTokens: res.cachedTokens } : {}),
          };
        }
        lastError = problem ?? 'invalid output';
        lastFailure = 'invalid-output';
        problems.push(lastError.slice(0, 200));
        return null;
      };

      const prompt = task.prompt(input.data);
      const repairPrompt = () =>
        `${prompt}\n\nYour previous answer was invalid:\n${lastError}\nAnswer again with JSON only, matching the schema exactly.`;

      let result = await attempt(mode, prompt);
      // Repair only a bad answer; a provider failure (model unavailable, network) won't fix itself.
      for (let round = 0; round < (task.maxRepairs ?? 1); round++) {
        if (result || failure() !== 'invalid-output') break;
        result = await attempt(mode, repairPrompt());
      }
      const mayEscalate = task.cloudFallback && opts.allowCloud !== false;
      if (!result && mayEscalate && !isCloudMode(mode) && !cfg.killSwitch) {
        result = await attempt(
          'PREFER_IN_CLOUD',
          failure() === 'invalid-output' ? repairPrompt() : prompt,
        );
      }

      const latencyMs = Math.round(now() - started);
      if (!result) {
        deps.onUsage?.({
          task: task.id,
          ranOn: lastRanOn,
          model,
          credits: 0,
          cloudCost,
          latencyMs,
          ok: false,
          attempts,
          ...(problems.length ? { problems } : {}),
        });
        throw new RouterError(task.id, lastFailure, lastError);
      }
      const costCredits = result.ranOn === 'cloud' ? cloudCost : 0;
      // The cloud model name is only true for a cloud run; on the device it is Chrome's model
      // unless the provider explicitly reports a local model ID (e.g. Ollama / LM Studio).
      const usedModel = result.model ?? (result.ranOn === 'device' ? DEVICE_MODEL : model);
      const cachedTokens = result.cachedTokens;
      // Only a valid answer is stored (it passed the schema and the task's check above).
      if (cacheKey !== undefined && deps.cache) {
        await deps.cache
          .set(
            cacheKey,
            { output: result.value, ranOn: result.ranOn, model: usedModel },
            ROUTER_CACHE_TTL_MS,
          )
          .catch(() => {});
      }
      deps.onUsage?.({
        task: task.id,
        ranOn: result.ranOn,
        model: usedModel,
        credits: costCredits,
        cached: false,
        ...(cachedTokens !== undefined ? { cachedTokens } : {}),
        cloudCost,
        latencyMs,
        ok: true,
        attempts,
        ...(problems.length ? { problems } : {}),
      });
      return {
        output: result.value,
        ranOn: result.ranOn,
        model: usedModel,
        costCredits,
        latencyMs,
        attempts,
        cached: false,
        ...(cachedTokens !== undefined ? { cachedTokens } : {}),
      };
    },
  };
}
