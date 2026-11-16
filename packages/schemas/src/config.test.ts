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
      model_image: 'img-x',
      images_per_video_max: '4',
      image_credits: '3',
      plan_free_cloud_per_day: '7',
      exports_enabled: 'false',
      export_max_ms: '90000',
      renders_per_user_per_day: '4',
      export_credits: '{"720p":2,"1080p":6}',
      rate_limit_cloud_per_hour: '12',
      refunds_per_day: '15',
      usage_events_per_day: '300',
      credit_costs: '{"generate":2,"tts":5}',
      music_synth_enabled: 'true',
      audio_default_music: 'steady-pulse',
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
      modelImage: 'img-x',
      imagesPerVideoMax: 4,
      imageCredits: 3,
      planFreeCloudPerDay: 7,
      exportsEnabled: false,
      exportMaxMs: 90_000,
      rendersPerUserPerDay: 4,
      exportCredits: { '720p': 2, '1080p': 6 },
      rateLimitCloudPerHour: 12,
      refundsPerDay: 15,
      usageEventsPerDay: 300,
      creditCosts: { generate: 2, tts: 5 },
      musicSynthEnabled: true,
      audioDefaultMusic: 'steady-pulse',
    });
  });

  // Spec 12 B1: the synthesized beds stay hidden and new projects start without music.
  it('has the audio defaults of spec 12 (synth beds off, no music)', () => {
    expect(APP_CONFIG_DEFAULTS.musicSynthEnabled).toBe(false);
    expect(APP_CONFIG_DEFAULTS.audioDefaultMusic).toBe('none');
  });

  it.each([
    ['music_synth_enabled', 'yes', 'musicSynthEnabled', false],
    ['audio_default_music', 'own', 'audioDefaultMusic', 'none'],
    ['audio_default_music', 'jazz', 'audioDefaultMusic', 'none'],
  ] as const)('a bad audio key %s (%s) falls back to the default of %s', (key, raw, field, d) => {
    expect(parseRemoteConfig({ [key]: raw })[field]).toEqual(d);
  });

  it('parses the audio keys alone', () => {
    const cfg = parseRemoteConfig({ music_synth_enabled: 'TRUE', audio_default_music: 'calm-pad' });
    expect(cfg.musicSynthEnabled).toBe(true);
    expect(cfg.audioDefaultMusic).toBe('calm-pad');
  });

  // Spec 13: each new key falls back alone.
  it('has the credit defaults of spec 13 (30 spends an hour, 30 refunds and 1000 usage events a day)', () => {
    expect(APP_CONFIG_DEFAULTS.rateLimitCloudPerHour).toBe(30);
    expect(APP_CONFIG_DEFAULTS.refundsPerDay).toBe(30);
    expect(APP_CONFIG_DEFAULTS.usageEventsPerDay).toBe(1000);
    expect(APP_CONFIG_DEFAULTS.creditCosts).toEqual({});
  });

  it.each([
    ['rate_limit_cloud_per_hour', 'lots', 'rateLimitCloudPerHour', 30],
    ['rate_limit_cloud_per_hour', '-2', 'rateLimitCloudPerHour', 30],
    ['refunds_per_day', '1.5', 'refundsPerDay', 30],
    ['usage_events_per_day', '', 'usageEventsPerDay', 1000],
    ['credit_costs', '{not json', 'creditCosts', {}],
    ['credit_costs', '[1,2]', 'creditCosts', {}],
    ['credit_costs', 'null', 'creditCosts', {}],
  ] as const)('a bad %s value (%s) falls back to the default of %s', (key, raw, field, dflt) => {
    expect(parseRemoteConfig({ [key]: raw })[field]).toEqual(dflt);
  });

  it('credit_costs keeps good entries and drops bad or unknown ones one by one', () => {
    const cfg = parseRemoteConfig({
      credit_costs:
        '{"generate":2,"edit":0,"tts":"3","export":9,"pip-plan":2.5,"__proto__":4,"custom":7}',
    });
    expect(cfg.creditCosts).toEqual({ generate: 2, custom: 7 });
  });

  it('a bad credit_costs does not disturb the other new keys', () => {
    const cfg = parseRemoteConfig({ credit_costs: 'x', refunds_per_day: '7' });
    expect(cfg.creditCosts).toEqual({});
    expect(cfg.refundsPerDay).toBe(7);
  });

  it('has the export defaults of spec 08 (8 min, 10 a day, 720p 3 and 1080p 5 credits)', () => {
    // Changed: export cap raised from 3 min to 8 min (480000 ms) for long scripts.
    expect(APP_CONFIG_DEFAULTS.exportsEnabled).toBe(true);
    expect(APP_CONFIG_DEFAULTS.exportMaxMs).toBe(480_000);
    expect(APP_CONFIG_DEFAULTS.rendersPerUserPerDay).toBe(10);
    expect(APP_CONFIG_DEFAULTS.exportCredits).toEqual({ '720p': 3, '1080p': 5 });
  });

  it('falls back to the defaults for bad export keys', () => {
    const cfg = parseRemoteConfig({
      export_max_ms: '0',
      export_credits: '{"720p":3}',
      exports_enabled: 'maybe',
      renders_per_user_per_day: '-1',
    });
    // Changed: export cap default is now 480000 ms (8 min).
    expect(cfg.exportMaxMs).toBe(480_000);
    expect(cfg.exportCredits).toEqual({ '720p': 3, '1080p': 5 });
    expect(cfg.exportsEnabled).toBe(true);
    expect(cfg.rendersPerUserPerDay).toBe(10);
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
      fc.oneof(
        fc.string(),
        fc.constantFrom('true', 'false', '0', '12', '{}', '[]', 'null', 'gemini', 'claude'),
      ),
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
