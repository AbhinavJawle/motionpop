import { describe, expect, it } from 'vitest';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { directPlan, planContextOf, type DirectPlanInput } from '../tasks/direct-plan';
import { enforcePlan, salvagePlan, type PlanContext } from './enforce';
import { fallbackPlan } from './fallback';
import { planVideo } from './plan-video';

const SCENES: DirectPlanInput['scenes'] = [
  {
    id: 'stat-punch',
    about: 'one striking number',
    variants: [
      { id: 'stack', about: 'one column' },
      { id: 'hero', about: 'as large as possible' },
      { id: 'side', about: 'label beside' },
    ],
    strongest: 'hero',
    imageRole: false,
  },
  {
    id: 'hook-statement',
    about: 'an opening line or a claim',
    variants: [
      { id: 'center', about: 'centred' },
      { id: 'left', about: 'accent bar' },
      { id: 'punch', about: 'emphasis huge' },
    ],
    strongest: 'punch',
    imageRole: false,
  },
  {
    id: 'photo-evidence',
    about: 'a thing worth showing',
    variants: [
      { id: 'single', about: 'one photo' },
      { id: 'pinned', about: 'pinned photo' },
      { id: 'pair', about: 'two photos' },
    ],
    strongest: 'pinned',
    imageRole: true,
  },
];

const slot = (candidates: string[], score: number, stress = 50, words = 'some words') => ({
  words,
  kinds: [],
  candidates,
  stress,
  score,
});

const INPUT: Omit<DirectPlanInput, 'route'> = {
  energy: 'steady',
  slots: [
    slot(['hook-statement'], 0.58, 70, "Let's look at the numbers"),
    slot(['stat-punch'], 0.95, 90, 'revenue grew forty percent'),
    slot(['stat-punch'], 0.85, 60, 'profit hit two million'),
    slot(['photo-evidence', 'hook-statement'], 0.5),
    slot(['hook-statement'], 0.55, 40, "Here's what comes next"),
  ],
  scenes: SCENES,
  motifs: ['marker-circle', 'torn-strip'],
  imagesMax: 1,
};
const CTX: PlanContext = planContextOf(INPUT, 3);

describe('enforcePlan (spec 07 R6.1)', () => {
  it('keeps a good plan as it is', () => {
    const out = enforcePlan(
      {
        arc: [
          { slot: 0, energy: 'steady' },
          { slot: 1, energy: 'hype' },
          { slot: 2, energy: 'lively' },
          { slot: 3, energy: 'steady' },
          { slot: 4, energy: 'calm' },
        ],
        peak: 1,
        scenes: [
          { slot: 0, sceneId: 'hook-statement', variant: 'left' },
          { slot: 1, sceneId: 'stat-punch', variant: 'hero' },
          { slot: 2, sceneId: 'stat-punch', variant: 'side' },
          { slot: 3, sceneId: 'photo-evidence', variant: 'single' },
          { slot: 4, sceneId: 'hook-statement', variant: 'center' },
        ],
        motifs: [{ motif: 'marker-circle', slots: [4, 1] }],
        images: [3],
        reasons: ['the opening line'],
      },
      CTX,
    );
    expect(out).toEqual({
      slots: [
        { sceneId: 'hook-statement', variant: 'left', energy: 'steady' },
        { sceneId: 'stat-punch', variant: 'hero', energy: 'hype' },
        { sceneId: 'stat-punch', variant: 'side', energy: 'lively' },
        { sceneId: 'photo-evidence', variant: 'single', energy: 'steady' },
        { sceneId: 'hook-statement', variant: 'center', energy: 'calm' },
      ],
      peak: 1,
      images: [3],
      motifs: [{ motif: 'marker-circle', slots: [1, 4] }],
      reasons: ['the opening line'],
    });
  });

  it('drops unknown and non-candidate scenes, and gives the peak its strongest variant', () => {
    const out = enforcePlan(
      {
        arc: [],
        peak: 2,
        scenes: [
          { slot: 0, sceneId: 'stat-punch', variant: 'hero' }, // not a candidate of slot 0
          { slot: 2, sceneId: 'stat-punch', variant: 'stack' },
          { slot: 3, sceneId: 'mystery', variant: 'x' },
        ],
        motifs: [],
        images: [],
      },
      CTX,
    );
    expect(out.slots.map((s) => s.sceneId)).toEqual([
      'hook-statement',
      'stat-punch',
      'stat-punch',
      'photo-evidence',
      'hook-statement',
    ]);
    expect(out.peak).toBe(2);
    expect(out.slots[2]?.variant).toBe('hero');
    // Its neighbour has the same scene, so it may not also be hero.
    expect(out.slots[1]?.variant).not.toBe('hero');
  });

  it('breaks a repeated scene and variant between neighbours', () => {
    const out = enforcePlan(
      {
        arc: [],
        peak: 0,
        scenes: [
          { slot: 1, sceneId: 'stat-punch', variant: 'side' },
          { slot: 2, sceneId: 'stat-punch', variant: 'side' },
        ],
        motifs: [],
        images: [],
      },
      CTX,
    );
    expect(out.slots[1]?.variant).toBe('side');
    expect(out.slots[2]?.variant).not.toBe('side');
  });

  it('clamps energy steps between neighbours, except next to the peak', () => {
    const out = enforcePlan(
      {
        arc: [
          { slot: 0, energy: 'calm' },
          { slot: 1, energy: 'hype' },
          { slot: 2, energy: 'calm' },
          { slot: 3, energy: 'hype' },
          { slot: 4, energy: 'calm' },
        ],
        peak: 1,
        scenes: [],
        motifs: [],
        images: [],
      },
      CTX,
    );
    // calm → hype → calm around the peak is allowed; after it, steps of one.
    expect(out.slots.map((s) => s.energy)).toEqual(['calm', 'hype', 'calm', 'steady', 'calm']);
  });

  it('caps images, keeps them on image scenes only, and keeps only the look motifs', () => {
    const out = enforcePlan(
      {
        arc: [],
        peak: 1,
        scenes: [],
        motifs: [
          { motif: 'neon-glow', slots: [0] },
          { motif: 'torn-strip', slots: [9, 2, 2] },
          { motif: 'torn-strip', slots: [0] },
        ],
        images: [1, 3, 3, 4],
      },
      CTX,
    );
    expect(out.images).toEqual([3]);
    expect(out.motifs).toEqual([{ motif: 'torn-strip', slots: [2] }]);
  });

  it('treats ids named like object properties as unknown (regression: "toString" crashed)', () => {
    // Found by enforce.property.test.ts: `ctx.scenes[id]` also finds Object.prototype members,
    // so a candidate such as "toString" passed as a known scene and its missing variants threw.
    const ctx: PlanContext = {
      ...CTX,
      slots: [
        { candidates: ['constructor', 'stat-punch'], score: 0.9 },
        { candidates: ['toString'], score: 0.4 },
        { candidates: ['__proto__', 'photo-evidence'], score: 0.2 },
      ],
    };
    const out = enforcePlan(
      {
        arc: [],
        peak: 0,
        scenes: [
          { slot: 0, sceneId: 'constructor', variant: 'x' },
          { slot: 1, sceneId: 'toString' },
        ],
        motifs: [],
        images: [1, 2],
      },
      ctx,
    );
    expect(out.slots.map((s) => [s.sceneId, s.variant])).toEqual([
      ['stat-punch', 'hero'],
      ['', ''],
      ['photo-evidence', expect.any(String) as string],
    ]);
    expect(out.images).toEqual([2]);
  });

  it('salvages what parses from a broken plan, and plans an empty video as empty', () => {
    const broken = {
      arc: [{ slot: 1, energy: 'hype' }, { slot: 'x' }],
      peak: 'the second one',
      scenes: 'all of them',
      images: [3, -1],
    };
    expect(salvagePlan(broken)).toMatchObject({
      arc: [{ slot: 1, energy: 'hype' }],
      peak: -1,
      scenes: [],
      images: [3],
    });
    const out = enforcePlan(broken, CTX);
    expect(out.peak).toBe(1); // highest score
    expect(out.slots).toHaveLength(5);
    expect(enforcePlan(broken, { ...CTX, slots: [] })).toEqual({
      slots: [],
      peak: -1,
      images: [],
      motifs: [],
      reasons: [],
    });
  });
});

describe('fallbackPlan', () => {
  it('peaks on the best score, rises and releases, and spreads its images', () => {
    const plan = fallbackPlan(CTX);
    expect(plan.peak).toBe(1);
    expect(plan.arc.map((a) => a.energy)).toEqual(['steady', 'lively', 'steady', 'steady', 'calm']);
    expect(plan.images).toEqual([3]);
    expect(plan.motifs).toEqual([{ motif: 'marker-circle', slots: [0, 4] }]);
    const out = enforcePlan(plan, CTX);
    expect(out.slots[1]?.variant).toBe('hero');
    expect(out.slots.map((s) => s.sceneId)).toEqual(INPUT.slots.map((s) => s.candidates[0]));
  });
});

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};
function routerWith(answer: (req: ProviderRequest) => string | Error) {
  const calls: ProviderRequest[] = [];
  const provider: AIProvider = {
    generate(req) {
      calls.push(req);
      const a = answer(req);
      return a instanceof Error
        ? Promise.reject(a)
        : Promise.resolve({ text: a, ranOn: req.mode === 'ONLY_IN_CLOUD' ? 'cloud' : 'device' });
    },
  };
  return { router: createRouter({ provider, config: () => CONFIG }), calls };
}
const GOOD = JSON.stringify({
  arc: [{ slot: 1, energy: 'hype' }],
  peak: 1,
  scenes: [{ slot: 0, sceneId: 'hook-statement', variant: 'left' }],
  motifs: [],
  images: [],
});

describe('planVideo', () => {
  const allowed = () => Promise.resolve({ allowed: true as const });

  it('plans on the device first, with enums of what exists in the structured output', async () => {
    const { router, calls } = routerWith(() => GOOD);
    const r = await planVideo(router, INPUT, { cloudAllowed: allowed, seed: 3 });
    expect(r).toMatchObject({ source: 'device', model: 'fast' });
    expect(calls.map((c) => c.mode)).toEqual(['ONLY_ON_DEVICE']);
    expect(r.plan.slots[0]?.variant).toBe('left');
    const schema = JSON.stringify(calls[0]?.jsonSchema);
    expect(schema).toContain('"enum":["stat-punch","hook-statement","photo-evidence"]');
    expect(calls[0]?.prompt).toContain(
      '1 | stat-punch | 90 | statement | "revenue grew forty percent"',
    );
  });

  it('asks the server before a cloud plan, and plans with the rules when it says no', async () => {
    const { router, calls } = routerWith((req) =>
      req.mode === 'ONLY_ON_DEVICE' ? new Error('no Nano') : GOOD,
    );
    const cloud = await planVideo(router, INPUT, { cloudAllowed: allowed, seed: 3 });
    expect(cloud.source).toBe('cloud');
    expect(calls.map((c) => c.mode)).toEqual(['ONLY_ON_DEVICE', 'ONLY_IN_CLOUD']);

    const limited = routerWith((req) =>
      req.mode === 'ONLY_ON_DEVICE' ? new Error('no Nano') : GOOD,
    );
    const r = await planVideo(limited.router, INPUT, {
      cloudAllowed: () => Promise.resolve({ allowed: false, reason: 'limit' }),
      seed: 3,
    });
    expect(r).toMatchObject({ source: 'rules', why: 'limit' });
    expect(limited.calls).toHaveLength(1);
  });

  it('repairs once, then falls back to the rules; without a router it uses the rules', async () => {
    const { router, calls } = routerWith(() => JSON.stringify({ ...JSON.parse(GOOD), peak: 9 }));
    const r = await planVideo(router, INPUT, {
      cloudAllowed: () => Promise.resolve({ allowed: false, reason: 'unavailable' }),
      seed: 3,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain('peak 9 is not a slot');
    expect(r).toMatchObject({ source: 'rules', why: 'failed' });
    expect(await planVideo(null, INPUT, { cloudAllowed: allowed, seed: 3 })).toMatchObject({
      source: 'rules',
      why: 'no-model',
    });
  });

  it('is free on both routes', () => {
    expect(directPlan.cloudCost({ ...INPUT, route: 'cloud' })).toBe(0);
  });
});
