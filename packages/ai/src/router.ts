import { z } from 'zod';
import type { InferenceMode, RanOn } from '@motionpop/schemas';

/**
 * The AI router (hybrid-ai.md): every runtime AI call goes through `run(task, input)`. It picks
 * the inference mode, calls the provider, parses the JSON output with zod, repairs once, then
 * escalates to the cloud only when the task allows it. It never returns output that fails the
 * task's schema (spec 00 correctness property 3).
 */

export interface ProviderRequest {
  mode: InferenceMode;
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema of the expected output (structured output on both routes). */
  jsonSchema: Record<string, unknown>;
  /** Cloud thinking level (Gemini 3.x). Lower is faster; ignored on-device. */
  thinking?: ThinkingLevel;
  /**
   * Optional inline media: a JPEG/PNG for note.fix (on-device accepts images), or audio for
   * transcribe.cloud (cloud only: Gemini Nano takes no audio).
   */
  media?: { mimeType: MediaMimeType; base64: string };
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
  /** Cloud thinking level; omit for the model default. */
  thinking?: ThinkingLevel;
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
}

export interface RouterConfig {
  routingOverrides: Record<string, InferenceMode>;
  routingSlotsDetectDeviceMaxWords: number;
  modelFast: string;
  modelStrong: string;
  killSwitch: boolean;
}

export interface RunResult<O> {
  output: O;
  ranOn: RanOn;
  model: string;
  costCredits: number;
  latencyMs: number;
  /** 1 = first answer valid, 2 = after repair, 3 = after cloud escalation. */
  attempts: number;
}

export interface UsageEvent {
  task: string;
  ranOn: RanOn;
  model: string;
  credits: number;
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

export interface Router {
  run<I, O>(task: TaskDef<I, O>, input: I, opts?: { mode?: InferenceMode }): Promise<RunResult<O>>;
}

export function createRouter(deps: {
  provider: AIProvider;
  config: () => RouterConfig;
  onUsage?: (e: UsageEvent) => void;
  now?: () => number;
}): Router {
  const now = deps.now ?? (() => performance.now());
  return {
    async run<I, O>(task: TaskDef<I, O>, rawInput: I, opts: { mode?: InferenceMode } = {}) {
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
      const model = task.model(cfg);
      const jsonSchema =
        task.jsonSchema?.(input.data) ??
        (z.toJSONSchema(task.output, { target: 'draft-7' }) as Record<string, unknown>);
      const base = {
        model,
        system: task.system,
        jsonSchema,
        ...(task.thinking ? { thinking: task.thinking } : {}),
        ...(task.media ? { media: task.media(input.data) } : {}),
      };
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
        if (parsed.ok && problem === null) return { value: parsed.value, ranOn: res.ranOn };
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
      if (!result && task.cloudFallback && !isCloudMode(mode) && !cfg.killSwitch) {
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
          latencyMs,
          ok: false,
          attempts,
          ...(problems.length ? { problems } : {}),
        });
        throw new RouterError(task.id, lastFailure, lastError);
      }
      const costCredits = result.ranOn === 'cloud' ? task.cloudCost(input.data) : 0;
      deps.onUsage?.({
        task: task.id,
        ranOn: result.ranOn,
        model,
        credits: costCredits,
        latencyMs,
        ok: true,
        attempts,
        ...(problems.length ? { problems } : {}),
      });
      return { output: result.value, ranOn: result.ranOn, model, costCredits, latencyMs, attempts };
    },
  };
}
