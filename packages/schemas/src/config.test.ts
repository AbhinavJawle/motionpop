import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG_DEFAULTS, AppConfigSchema, parseRemoteConfig } from './config';

describe('parseRemoteConfig', () => {
  it('returns defaults for empty input', () => {
    expect(parseRemoteConfig({})).toEqual(APP_CONFIG_DEFAULTS);
  });

  it('defaults are valid', () => {
    expect(AppConfigSchema.safeParse(APP_CONFIG_DEFAULTS).success).toBe(true);
  });

  it('parses valid values', () => {
    const cfg = parseRemoteConfig({
      routing_slots_detect_device_max_words: '250',
      routing_overrides: '{"edit.patch":"ONLY_IN_CLOUD"}',
      flag_tier2: 'true',
      flag_auto_fill: 'false',
      free_credits: '30',
      judge_credits: '1000',
      daily_budget_credits: '5',
      kill_switch: 'true',
      custom_provider: 'claude',
      model_fast: 'fast-x',
      model_strong: 'strong-x',
      model_tts: 'tts-x',
    });
    expect(cfg).toEqual({
      routingSlotsDetectDeviceMaxWords: 250,
      routingOverrides: { 'edit.patch': 'ONLY_IN_CLOUD' },
      flagTier2: true,
      flagAutoFill: false,
      freeCredits: 30,
      judgeCredits: 1000,
      dailyBudgetCredits: 5,
      killSwitch: true,
      customProvider: 'claude',
      modelFast: 'fast-x',
      modelStrong: 'strong-x',
      modelTts: 'tts-x',
    });
  });

  it('a bad key falls back alone, other keys still apply', () => {
    const cfg = parseRemoteConfig({
      judge_credits: 'lots',
      free_credits: '-3',
      flag_tier2: 'yes',
      custom_provider: 'gpt',
      routing_overrides: '{"x":"NOPE"}',
      model_fast: '   ',
      daily_budget_credits: '99',
      kill_switch: 'TRUE',
    });
    expect(cfg.judgeCredits).toBe(500);
    expect(cfg.freeCredits).toBe(20);
    expect(cfg.flagTier2).toBe(false);
    expect(cfg.customProvider).toBe('gemini');
    expect(cfg.routingOverrides).toEqual({});
    expect(cfg.modelFast).toBe(APP_CONFIG_DEFAULTS.modelFast);
    expect(cfg.dailyBudgetCredits).toBe(99);
    expect(cfg.killSwitch).toBe(true);
  });

  it('rejects non-integer and malformed JSON values', () => {
    const cfg = parseRemoteConfig({
      judge_credits: '1.5',
      routing_overrides: '{not json',
      routing_slots_detect_device_max_words: '',
    });
    expect(cfg).toEqual(APP_CONFIG_DEFAULTS);
  });

  it('property: any Record<string,string> parses to a valid AppConfig', () => {
    const knownKeys = [
      'routing_slots_detect_device_max_words',
      'routing_overrides',
      'flag_tier2',
      'flag_auto_fill',
      'free_credits',
      'judge_credits',
      'daily_budget_credits',
      'kill_switch',
      'custom_provider',
      'model_fast',
      'model_strong',
      'model_tts',
      '__proto__',
      'constructor',
    ];
    const arb = fc.dictionary(
      fc.oneof(fc.constantFrom(...knownKeys), fc.string()),
      fc.oneof(fc.string(), fc.constantFrom('true', 'false', '0', '12', '{}', '[]', 'null', 'gemini', 'claude')),
    );
    fc.assert(
      fc.property(arb, (raw) => {
        const cfg = parseRemoteConfig(raw);
        expect(AppConfigSchema.safeParse(cfg).success).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
