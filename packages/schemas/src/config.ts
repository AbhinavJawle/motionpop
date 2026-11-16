import { z } from 'zod';
import { CreditCostsSchema, PricedActionSchema } from './credits';
import { DEFAULT_EXPORT_CREDITS, ExportCreditsSchema } from './render';

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
  /** Gemini image model for generated images (spec 07, D-030). */
  modelImage: z.string().min(1),
  imagesPerVideoMax: NonNegInt,
  imageCredits: NonNegInt,
  /** Free cloud `direct.plan` calls per user per day; on-device plans are unlimited. */
  planFreeCloudPerDay: NonNegInt,
  /** Pause exports without the global kill switch (spec 08). */
  exportsEnabled: z.boolean(),
  /** The longest video that may be exported, in ms (3 minutes). */
  exportMaxMs: z.number().int().positive(),
  /** Renders a user may start per UTC day. */
  rendersPerUserPerDay: NonNegInt,
  /** Credits per started minute for each export resolution. */
  exportCredits: ExportCreditsSchema,
  /** AI spends a user may make per UTC hour (spec 13 R3.1). */
  rateLimitCloudPerHour: NonNegInt,
  /** Client refunds per user per UTC day; at least the hourly cap so the rate limit binds first. */
  refundsPerDay: NonNegInt,
  /** Usage events stored per user per UTC day (spec 13 R7.1). */
  usageEventsPerDay: NonNegInt,
  /** Partial overrides of the AI price table in `cost.ts` (spec 13 R2.1). */
  creditCosts: CreditCostsSchema,
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
  // Plans and long slot detection (D-026). Raise to gemini-4-carbon in Remote Config if needed.
  modelStrong: 'gemini-3.8-flash',
  modelTts: 'gemini-3.8-flash-tts',
  modelImage: 'gemini-nano-banana-2.1',
  imagesPerVideoMax: 6,
  imageCredits: 2,
  planFreeCloudPerDay: 10,
  exportsEnabled: true,
  exportMaxMs: 180_000,
  rendersPerUserPerDay: 10,
  exportCredits: DEFAULT_EXPORT_CREDITS,
  rateLimitCloudPerHour: 30,
  refundsPerDay: 30,
  usageEventsPerDay: 1000,
  creditCosts: {},
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
/** A JSON object of price overrides; an entry that is not a known action with a positive integer is dropped alone. */
const creditCosts = (raw: string): unknown => {
  const parsed = json(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const out: Record<string, number> = {};
  for (const action of PricedActionSchema.options) {
    if (!Object.prototype.hasOwnProperty.call(parsed, action)) continue;
    const v = (parsed as Record<string, unknown>)[action];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) out[action] = v;
  }
  return out;
};

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
  modelImage: { key: 'model_image', decode: str },
  imagesPerVideoMax: { key: 'images_per_video_max', decode: int },
  imageCredits: { key: 'image_credits', decode: int },
  planFreeCloudPerDay: { key: 'plan_free_cloud_per_day', decode: int },
  exportsEnabled: { key: 'exports_enabled', decode: bool },
  exportMaxMs: { key: 'export_max_ms', decode: int },
  rendersPerUserPerDay: { key: 'renders_per_user_per_day', decode: int },
  exportCredits: { key: 'export_credits', decode: json },
  rateLimitCloudPerHour: { key: 'rate_limit_cloud_per_hour', decode: int },
  refundsPerDay: { key: 'refunds_per_day', decode: int },
  usageEventsPerDay: { key: 'usage_events_per_day', decode: int },
  creditCosts: { key: 'credit_costs', decode: creditCosts },
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
