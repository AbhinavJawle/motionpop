import { costOf, APP_CONFIG_DEFAULTS, type EditConfig } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { defaultEdit } from './defaults';
import { summarize, usesResolved, type SummaryContext } from './summary';

const config = {
  creditCosts: APP_CONFIG_DEFAULTS.creditCosts,
  imageCredits: 2,
  exportCredits: APP_CONFIG_DEFAULTS.exportCredits,
  killSwitch: false,
};

const ctx = (over: Partial<SummaryContext> = {}): SummaryContext => ({
  kind: 'video',
  signedIn: true,
  balance: 100,
  online: true,
  config,
  ...over,
});

const row = (s: ReturnType<typeof summarize>, id: string) => s.rows.find((r) => r.id === id);

const resolved: NonNullable<EditConfig['resolved']> = {
  recipeId: 'gaming',
  look: 'mono',
  theme: { accent: '#FF2D95', background: 'bold' },
  captionStyle: 'pop',
  hookStyle: 'stat',
  musicMood: 'upbeat',
  directorNotes: '',
};

describe('summarize: video', () => {
  it('prices directing through costOf and illustrations as "up to"', () => {
    const s = summarize(defaultEdit('video'), ctx());
    expect(row(s, 'direct')).toMatchObject({
      value: `${costOf('reel', 1, config)} credits`,
      credits: 3,
      route: 'cloud',
    });
    expect(row(s, 'illustrations')).toMatchObject({
      value: 'up to 6 credits',
      credits: 6,
      upTo: true,
    });
    expect(s.total).toBe(9);
    expect(s.totalUpTo).toBe(true);
    expect(s.block).toBeUndefined();
    expect(s.note).toBeUndefined();
  });

  it('local steps are free and on-device', () => {
    const s = summarize(defaultEdit('video'), ctx());
    expect(row(s, 'transcribe')).toMatchObject({ value: 'Free · on-device', credits: 0 });
    expect(row(s, 'cleanup')?.value).toBe('Free');
    expect(row(s, 'captions')?.credits).toBe(0);
    expect(row(s, 'sfx')?.credits).toBe(0);
  });

  it('signed out falls back to the free director and turns illustrations off', () => {
    const s = summarize(defaultEdit('video'), ctx({ signedIn: false, balance: null }));
    expect(row(s, 'direct')).toMatchObject({ value: 'Free director', credits: 0 });
    expect(row(s, 'illustrations')).toMatchObject({ value: 'Off · needs credits', credits: 0 });
    expect(s.total).toBe(0);
    expect(s.totalUpTo).toBe(false);
    expect(s.note).toBe('Sign in for the AI director and illustrations.');
    expect(row(s, 'music')?.route).toBe('none');
  });

  it('the kill switch and being offline behave like signed out, with a different note', () => {
    for (const c of [ctx({ config: { ...config, killSwitch: true } }), ctx({ online: false })]) {
      const s = summarize(defaultEdit('video'), c);
      expect(row(s, 'direct')?.value).toBe('Free director');
      expect(s.total).toBe(0);
      expect(s.note).toBe('Paid steps run their free versions.');
    }
  });

  it('illustrations off has no illustrations row and no "up to"', () => {
    const s = summarize({ ...defaultEdit('video'), illustrations: false }, ctx());
    expect(row(s, 'illustrations')).toBeUndefined();
    expect(s.total).toBe(3);
    expect(s.totalUpTo).toBe(false);
  });

  it('follows imageCredits', () => {
    const s = summarize(defaultEdit('video'), ctx({ config: { ...config, imageCredits: 3 } }));
    expect(row(s, 'illustrations')).toMatchObject({ value: 'up to 9 credits', credits: 9 });
  });

  it('music none has no music row; any mood has one', () => {
    const base = defaultEdit('video');
    expect(row(summarize(base, ctx()), 'music')).toMatchObject({
      label: 'AI soundtrack',
      route: 'cloud',
    });
    const none = summarize({ ...base, sound: { ...base.sound, music: 'none' } }, ctx());
    expect(row(none, 'music')).toBeUndefined();
  });

  it('cleanup, sfx and captions rows follow their switches', () => {
    const base = defaultEdit('video');
    const s = summarize(
      {
        ...base,
        captions: { ...base.captions, enabled: false },
        sound: { cleanup: false, sfx: false, music: 'none' },
      },
      ctx(),
    );
    expect(['cleanup', 'sfx', 'captions', 'music'].map((id) => row(s, id))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('summarize: voiceover', () => {
  it('has a free graphics plan and no director, illustrations or block', () => {
    const s = summarize(defaultEdit('voiceover'), ctx({ kind: 'voiceover' }));
    expect(row(s, 'plan')).toMatchObject({ label: 'Graphics plan', value: 'Free · on-device' });
    expect(row(s, 'direct')).toBeUndefined();
    expect(row(s, 'illustrations')).toBeUndefined();
    expect(row(s, 'voice')).toBeUndefined();
    expect(s.total).toBe(0);
    expect(s.totalUpTo).toBe(false);
    expect(s.block).toBeUndefined();
    expect(row(s, 'music')?.label).toBe('Music bed');
  });

  it('does not block or charge when signed out', () => {
    const s = summarize(defaultEdit('voiceover'), ctx({ kind: 'voiceover', signedIn: false }));
    expect(s.total).toBe(0);
    expect(s.block).toBeUndefined();
    expect(s.note).toBeUndefined();
  });
});

describe('summarize: script', () => {
  const script = (minutes: number, over: Partial<SummaryContext> = {}) =>
    ctx({ kind: 'voiceover', script: { minutes }, ...over });
  const edit = defaultEdit('voiceover', { source: 'tts' });

  it('prices the voice by started minutes through costOf', () => {
    for (const m of [1, 2, 5]) {
      const s = summarize(edit, script(m));
      expect(row(s, 'voice')).toMatchObject({
        credits: costOf('tts', m, config),
        route: 'cloud',
        label: 'Voice from script',
      });
      expect(s.total).toBe(costOf('tts', m, config));
      expect(s.block).toBeUndefined();
    }
  });

  it('shows no speech cleanup row (cleanup is off for a made voice)', () => {
    expect(row(summarize(edit, script(1)), 'cleanup')).toBeUndefined();
    expect(edit.sound.cleanup).toBe(false);
  });

  it('blocks Create offline, signed out, on the kill switch and on a short balance', () => {
    expect(summarize(edit, script(1, { online: false })).block).toBe('Needs connection');
    expect(summarize(edit, script(1, { signedIn: false, balance: null })).block).toBe(
      'Sign in to generate a voice',
    );
    expect(summarize(edit, script(1, { config: { ...config, killSwitch: true } })).block).toBe(
      'Voices are paused right now',
    );
    expect(summarize(edit, script(3, { balance: 5 })).block).toBe(
      'Not enough credits for the voice',
    );
  });

  it('allows a balance equal to the voice cost and an unknown balance', () => {
    const cost = costOf('tts', 3, config);
    expect(summarize(edit, script(3, { balance: cost })).block).toBeUndefined();
    expect(summarize(edit, script(3, { balance: null })).block).toBeUndefined();
  });

  it('offline wins over the other blocks', () => {
    expect(summarize(edit, script(1, { online: false, signedIn: false, balance: 0 })).block).toBe(
      'Needs connection',
    );
  });
});

describe('summarize: your style row', () => {
  const base = defaultEdit('video');

  it('appears for a custom recipe with resolved, naming the route', () => {
    const edit: EditConfig = { ...base, recipeId: 'custom', customRecipe: 'gamer', resolved };
    const quick = row(summarize(edit, ctx({ resolvedBy: 'rules' })), 'resolved');
    expect(quick).toMatchObject({
      label: 'Your style',
      value: 'Free · quick match',
      route: 'none',
    });
    expect(quick?.note).toContain('mono');
    expect(quick?.note).toContain('pop captions');
    const device = row(summarize(edit, ctx({ resolvedBy: 'device' })), 'resolved');
    expect(device).toMatchObject({ value: 'Free · on-device', route: 'device', credits: 0 });
  });

  it('appears for a custom style on a built-in recipe', () => {
    const edit: EditConfig = { ...base, customStyle: 'dark neon', resolved };
    expect(row(summarize(edit, ctx()), 'resolved')).toBeDefined();
  });

  it('is absent without resolved, and when nothing custom is in use', () => {
    expect(row(summarize({ ...base, recipeId: 'custom' }, ctx()), 'resolved')).toBeUndefined();
    expect(row(summarize({ ...base, resolved }, ctx()), 'resolved')).toBeUndefined();
    expect(usesResolved(base)).toBe(false);
    expect(usesResolved({ recipeId: 'custom', customStyle: undefined })).toBe(true);
  });
});

describe('summarize: Gemini BYOK (spec 42)', () => {
  it('prices video directing and illustrations at 0 credits with BYOK even signed out at 0 balance', () => {
    const s = summarize(defaultEdit('video'), ctx({ signedIn: false, balance: 0, byok: true }));
    expect(row(s, 'direct')).toMatchObject({
      value: 'Free · your key',
      credits: 0,
      route: 'cloud',
    });
    expect(row(s, 'illustrations')).toMatchObject({
      value: 'Free · your key',
      credits: 0,
      upTo: false,
      route: 'cloud',
    });
    expect(s.total).toBe(0);
    expect(s.totalUpTo).toBe(false);
    expect(s.note).toContain('Gemini API key');
  });

  it('allows script voice generation at 0 credits with BYOK online, and still blocks offline', () => {
    const edit = defaultEdit('voiceover', { source: 'tts' });
    const online = summarize(
      edit,
      ctx({ kind: 'voiceover', script: { minutes: 3 }, signedIn: false, balance: 0, byok: true }),
    );
    expect(row(online, 'voice')).toMatchObject({ value: 'Free · your key', credits: 0 });
    expect(online.total).toBe(0);
    expect(online.block).toBeUndefined();

    const offline = summarize(
      edit,
      ctx({ kind: 'voiceover', script: { minutes: 1 }, online: false, byok: true }),
    );
    expect(offline.block).toBe('Needs connection');
  });
});
