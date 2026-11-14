import { z } from 'zod';

/** Firebase AI Logic inference modes (hybrid-ai.md). */
export const InferenceModeSchema = z.enum([
  'PREFER_ON_DEVICE',
  'ONLY_ON_DEVICE',
  'PREFER_IN_CLOUD',
  'ONLY_IN_CLOUD',
]);
export type InferenceMode = z.infer<typeof InferenceModeSchema>;

const NonNegInt = z.number().int().nonnegative();

/** Typed app configuration. Remote Config supplies flat strings; see `parseRemoteConfig`. */
export const AppConfigSchema = z.object({
  routingSlotsDetectDeviceMaxWords: NonNegInt,
  routingOverrides: z.record(z.string(), InferenceModeSchema),
  flagTier2: z.boolean(),
  flagAutoFill: z.boolean(),
  freeCredits: NonNegInt,
  judgeCredits: NonNegInt,
  dailyBudgetCredits: NonNegInt,
  killSwitch: z.boolean(),
  customProvider: z.enum(['gemini', 'claude']),
  modelFast: z.string().min(1),
  modelStrong: z.string().min(1),
  modelTts: z.string().min(1),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const APP_CONFIG_DEFAULTS: AppConfig = {
  routingSlotsDetectDeviceMaxWords: 400,
  routingOverrides: {},
  flagTier2: false,
  flagAutoFill: true,
  freeCredits: 20,
  judgeCredits: 500,
  dailyBudgetCredits: 20000,
  killSwitch: false,
  customProvider: 'gemini',
  modelFast: 'gemini-3.5-flash-lite',
  // Until a stronger model is set in the console.
  modelStrong: 'gemini-3.5-flash-lite',
  modelTts: 'gemini-3.1-flash-tts-preview',
};

type Decoder = (raw: string) => unknown;

const int = (raw: string): unknown => (/^\s*\d+\s*$/.test(raw) ? Number(raw) : undefined);
const bool = (raw: string): unknown => {
  const v = raw.trim().toLowerCase();
  return v === 'true' ? true : v === 'false' ? false : undefined;
};
const json = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};
const str = (raw: string): unknown => raw.trim();

/** Remote Config key and decoder for each AppConfig field. */
const KEYS: Record<keyof AppConfig, { key: string; decode: Decoder }> = {
  routingSlotsDetectDeviceMaxWords: { key: 'routing_slots_detect_device_max_words', decode: int },
  routingOverrides: { key: 'routing_overrides', decode: json },
  flagTier2: { key: 'flag_tier2', decode: bool },
  flagAutoFill: { key: 'flag_auto_fill', decode: bool },
  freeCredits: { key: 'free_credits', decode: int },
  judgeCredits: { key: 'judge_credits', decode: int },
  dailyBudgetCredits: { key: 'daily_budget_credits', decode: int },
  killSwitch: { key: 'kill_switch', decode: bool },
  customProvider: { key: 'custom_provider', decode: str },
  modelFast: { key: 'model_fast', decode: str },
  modelStrong: { key: 'model_strong', decode: str },
  modelTts: { key: 'model_tts', decode: str },
};

/**
 * Parse flat Remote Config string values into an AppConfig.
 * A missing or invalid key falls back to its own default without affecting the others.
 */
export function parseRemoteConfig(raw: Record<string, string>): AppConfig {
  const out: Record<string, unknown> = { ...APP_CONFIG_DEFAULTS };
  for (const field of Object.keys(KEYS) as (keyof AppConfig)[]) {
    const { key, decode } = KEYS[field];
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const candidate = decode(value);
    const result = AppConfigSchema.shape[field].safeParse(candidate);
    if (result.success) out[field] = result.data;
  }
  return AppConfigSchema.parse(out);
}
