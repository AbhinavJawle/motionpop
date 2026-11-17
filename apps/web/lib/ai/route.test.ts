import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  chipFor,
  chooseRoute,
  cloudCostFor,
  type Availability,
  type InferenceModeName,
  type RouteInput,
  type RoutedTask,
} from './route';
import { routeInputFrom } from './use-route';

const base: RouteInput = {
  task: 'edit.patch',
  availability: 'available',
  online: true,
  preferOnDevice: true,
  killSwitch: false,
  cloudAvailable: true,
  balance: 20,
  cloudCost: 1,
};
const route = (o: Partial<RouteInput>) => chooseRoute({ ...base, ...o });

describe('chooseRoute: edits and notes', () => {
  it.each(['edit.patch', 'note.fix'] as const)(
    '%s runs on the device when it is ready and preferred',
    (task) => {
      expect(route({ task })).toEqual({
        kind: 'device',
        mode: 'ONLY_ON_DEVICE',
        allowCloud: false,
      });
    },
  );

  it('turning "Prefer on-device AI" off moves a ready device edit to ☁ 1 (R6.5)', () => {
    const r = route({ preferOnDevice: false });
    expect(r).toEqual({
      kind: 'cloud',
      mode: 'ONLY_IN_CLOUD',
      allowCloud: false,
      credits: 1,
      insufficient: false,
    });
    expect(chipFor(r)).toEqual({ route: 'cloud', credits: 1 });
  });

  it('the first second after load (checking) is ☁, never a mint chip that could turn into a charge', () => {
    expect(route({ availability: 'checking' }).kind).toBe('cloud');
    expect(route({ availability: 'downloadable' }).kind).toBe('cloud');
    expect(route({ availability: 'downloading' }).kind).toBe('cloud');
  });

  it('without a usable cloud the device is used even when the preference is off', () => {
    expect(route({ preferOnDevice: false, cloudAvailable: false }).kind).toBe('device');
    expect(route({ preferOnDevice: false, online: false }).kind).toBe('device');
  });

  it('offline with no device is "Needs connection"; no cloud with no device says why', () => {
    expect(route({ availability: 'unavailable', online: false })).toEqual({
      kind: 'disabled',
      reason: 'Needs connection',
    });
    expect(
      route({
        availability: 'unavailable',
        cloudAvailable: false,
        cloudBlockedReason: 'Cloud AI is coming soon',
      }),
    ).toEqual({
      kind: 'disabled',
      reason: 'Cloud AI is coming soon',
    });
    expect(route({ availability: 'unavailable', cloudAvailable: false })).toEqual({
      kind: 'disabled',
      reason: 'Sign in to use cloud AI',
    });
  });

  it('the kill switch pauses the cloud route', () => {
    expect(route({ preferOnDevice: false, killSwitch: true })).toEqual({
      kind: 'disabled',
      reason: 'Cloud AI is paused',
    });
  });

  it('"Try in the cloud" forces the cloud route; an unknown balance is not insufficient, a low one is', () => {
    expect(route({ forceCloud: true }).kind).toBe('cloud');
    expect(route({ forceCloud: true, balance: null })).toMatchObject({
      kind: 'cloud',
      insufficient: false,
    });
    expect(route({ forceCloud: true, balance: 0 })).toMatchObject({
      kind: 'cloud',
      insufficient: true,
    });
  });

  it('Remote Config overrides: a cloud mode acts like preferOnDevice off; ONLY_ON_DEVICE forbids the cloud', () => {
    expect(route({ override: 'PREFER_IN_CLOUD' }).kind).toBe('cloud');
    expect(route({ override: 'ONLY_IN_CLOUD' }).kind).toBe('cloud');
    expect(route({ override: 'ONLY_ON_DEVICE', forceCloud: true }).kind).toBe('device');
    expect(route({ override: 'ONLY_ON_DEVICE', availability: 'unavailable' })).toEqual({
      kind: 'disabled',
      reason: 'Needs on-device AI',
    });
  });
});

describe('chooseRoute: the other tasks', () => {
  it('generate is always the cloud route, with its price, and never the device', () => {
    expect(route({ task: 'generate', cloudCost: 3 })).toMatchObject({ kind: 'cloud', credits: 3 });
    expect(route({ task: 'generate', preferOnDevice: true, availability: 'available' }).kind).toBe(
      'cloud',
    );
    expect(route({ task: 'generate', online: false })).toEqual({
      kind: 'disabled',
      reason: 'Needs connection',
    });
    expect(route({ task: 'generate', killSwitch: true })).toEqual({
      kind: 'disabled',
      reason: 'Cloud AI is paused',
    });
  });

  it('prefill and auto-fill use the device or deterministic code, whatever the preference', () => {
    for (const task of ['prompt.prefill', 'autofill'] as const) {
      expect(route({ task, preferOnDevice: false }).kind).toBe('device');
      expect(route({ task, preferOnDevice: false, availability: 'unavailable' })).toEqual({
        kind: 'local',
      });
      expect(route({ task, override: 'ONLY_IN_CLOUD', availability: 'unavailable' })).toEqual({
        kind: 'local',
      });
    }
  });
});

describe('chooseRoute: the rule table (spec 09 task 3)', () => {
  const SOON = 'Cloud AI is coming soon' as const;
  const SIGN_IN = 'Sign in to use cloud AI' as const;
  const dev = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
  const cloud = (credits: number, insufficient = false) => ({
    kind: 'cloud',
    mode: 'ONLY_IN_CLOUD',
    allowCloud: false,
    credits,
    insufficient,
  });
  const off = (reason: string) => ({ kind: 'disabled', reason });

  // One row per rule, in the order of the design: [label, input, expected route].
  const rows: [string, Partial<RouteInput>, object][] = [
    ['prefill, device ready', { task: 'prompt.prefill' }, dev],
    [
      'prefill, no device',
      { task: 'prompt.prefill', availability: 'unavailable' },
      { kind: 'local' },
    ],
    [
      'prefill, offline, no device',
      { task: 'prompt.prefill', availability: 'unavailable', online: false },
      { kind: 'local' },
    ],
    [
      'generate, no Firebase (sign in)',
      { task: 'generate', cloudCost: 3, cloudAvailable: false },
      off(SIGN_IN),
    ],
    [
      'generate, ServerCredits missing (coming soon)',
      { task: 'generate', cloudCost: 3, cloudAvailable: false, cloudBlockedReason: SOON },
      off(SOON),
    ],
    [
      'generate, offline beats coming soon',
      {
        task: 'generate',
        cloudCost: 3,
        online: false,
        cloudAvailable: false,
        cloudBlockedReason: SOON,
      },
      off('Needs connection'),
    ],
    [
      'generate, kill switch',
      { task: 'generate', cloudCost: 3, killSwitch: true },
      off('Cloud AI is paused'),
    ],
    ['generate, enough credits', { task: 'generate', cloudCost: 3, balance: 3 }, cloud(3)],
    [
      'generate, not enough credits',
      { task: 'generate', cloudCost: 3, balance: 2 },
      cloud(3, true),
    ],
    ['generate, balance loading', { task: 'generate', cloudCost: 3, balance: null }, cloud(3)],
    ['edit, device ready and preferred', {}, dev],
    ['edit, device ready, prefer off', { preferOnDevice: false }, cloud(1)],
    [
      'edit, device ready, prefer off, no cloud',
      { preferOnDevice: false, cloudAvailable: false, cloudBlockedReason: SOON },
      dev,
    ],
    ['edit, no device, cloud ok', { availability: 'unavailable' }, cloud(1)],
    [
      'edit, no device, offline',
      { availability: 'unavailable', online: false },
      off('Needs connection'),
    ],
    [
      'edit, no device, ServerCredits missing',
      { availability: 'unavailable', cloudAvailable: false, cloudBlockedReason: SOON },
      off(SOON),
    ],
    [
      'edit, no device, kill switch',
      { availability: 'unavailable', killSwitch: true },
      off('Cloud AI is paused'),
    ],
    ['edit, user clicked the cloud', { forceCloud: true }, cloud(1)],
    [
      'edit, user clicked the cloud, kill switch',
      { forceCloud: true, killSwitch: true },
      off('Cloud AI is paused'),
    ],
    [
      'note, user clicked the cloud, no cloud',
      { task: 'note.fix', forceCloud: true, cloudAvailable: false },
      off(SIGN_IN),
    ],
    [
      'edit, override ONLY_ON_DEVICE, no device',
      { override: 'ONLY_ON_DEVICE', availability: 'unavailable' },
      off('Needs on-device AI'),
    ],
    ['edit, override ONLY_IN_CLOUD', { override: 'ONLY_IN_CLOUD' }, cloud(1)],
  ];
  it.each(rows)('%s', (_label, input, expected) => {
    expect(route(input)).toEqual(expected);
  });

  it('chipFor maps device to mint, cloud to the price and everything else to no chip', () => {
    expect(chipFor(dev as never)).toEqual({ route: 'device' });
    expect(chipFor(cloud(3) as never)).toEqual({ route: 'cloud', credits: 3 });
    expect(chipFor({ kind: 'local' })).toBeNull();
    expect(chipFor(off(SOON) as never)).toBeNull();
  });
});

const TASKS: RoutedTask[] = ['edit.patch', 'note.fix', 'generate', 'prompt.prefill', 'autofill'];
const AVAIL: Availability[] = [
  'checking',
  'available',
  'downloadable',
  'downloading',
  'unavailable',
];
const OVERRIDES: (InferenceModeName | undefined)[] = [
  undefined,
  'ONLY_ON_DEVICE',
  'PREFER_ON_DEVICE',
  'PREFER_IN_CLOUD',
  'ONLY_IN_CLOUD',
];

describe('chooseRoute: no surprise spend (P4)', () => {
  const inputArb: fc.Arbitrary<RouteInput> = fc.record({
    task: fc.constantFrom(...TASKS),
    availability: fc.constantFrom(...AVAIL),
    online: fc.boolean(),
    preferOnDevice: fc.boolean(),
    killSwitch: fc.boolean(),
    cloudAvailable: fc.boolean(),
    balance: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
    cloudCost: fc.integer({ min: 1, max: 5 }),
    forceCloud: fc.boolean(),
    override: fc.constantFrom(...OVERRIDES),
  }) as unknown as fc.Arbitrary<RouteInput>;

  it('device and local routes never carry credits; offline, no cloud and the kill switch never yield cloud; generate never runs on the device; checking never runs on the device', () => {
    fc.assert(
      fc.property(inputArb, (i) => {
        const r = chooseRoute(i);
        if (r.kind === 'device' || r.kind === 'local') {
          expect('credits' in r).toBe(false);
          expect(chipFor(r)?.route === 'cloud').toBe(false);
        }
        if (r.kind === 'device') expect(i.availability).toBe('available');
        if (r.kind === 'cloud') {
          expect(r.credits).toBe(i.cloudCost);
          expect(r.credits).toBeGreaterThan(0);
          expect(i.online && i.cloudAvailable && !i.killSwitch).toBe(true);
          expect(i.task === 'generate' || i.task === 'edit.patch' || i.task === 'note.fix').toBe(
            true,
          );
          expect(r.allowCloud).toBe(false);
        }
        if (i.task === 'generate') expect(r.kind === 'device' || r.kind === 'local').toBe(false);
        if (i.task === 'prompt.prefill' || i.task === 'autofill')
          expect(r.kind === 'cloud').toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('cloudAvailable: false never yields cloud, and every disabled route carries one of the known reasons', () => {
    const reasons = new Set([
      'Needs connection',
      'Cloud AI is paused',
      'Sign in to use cloud AI',
      'Cloud AI is coming soon',
      'Needs on-device AI',
    ]);
    fc.assert(
      fc.property(inputArb, (i) => {
        const r = chooseRoute({ ...i, cloudAvailable: false });
        expect(r.kind === 'cloud').toBe(false);
        const any = chooseRoute(i);
        if (any.kind === 'disabled') expect(reasons.has(any.reason)).toBe(true);
        if (any.kind === 'cloud')
          expect(any.insufficient).toBe(i.balance !== null && i.balance < i.cloudCost);
      }),
      { numRuns: 500 },
    );
  });

  it('the preference only matters for edits and notes (R6.5): flipping it never changes generate, prefill or auto-fill', () => {
    fc.assert(
      fc.property(inputArb, (i) => {
        if (i.task === 'edit.patch' || i.task === 'note.fix') return;
        expect(chooseRoute({ ...i, preferOnDevice: true })).toEqual(
          chooseRoute({ ...i, preferOnDevice: false }),
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe('routeInputFrom (live state to route input)', () => {
  const state = {
    availability: 'available' as const,
    online: true,
    config: APP_CONFIG_DEFAULTS,
    cloudAvailable: true,
    cloudBlockedReason: null,
    balance: 20,
  };

  it('prices from costOf and follows the preference: off moves quick edits to ☁ 1 and leaves auto-fill on the device', () => {
    const on = (task: RoutedTask, preferOnDevice: boolean) =>
      chooseRoute(routeInputFrom({ ...state, task, preferOnDevice }));
    expect(on('edit.patch', true).kind).toBe('device');
    expect(on('edit.patch', false)).toMatchObject({ kind: 'cloud', credits: 1 });
    expect(on('autofill', false).kind).toBe('device');
    expect(on('autofill', true).kind).toBe('device');
    expect(on('generate', false)).toMatchObject({ kind: 'cloud', credits: 3 });
  });

  it('follows a Remote Config price change and a routing override', () => {
    const cfg = {
      ...APP_CONFIG_DEFAULTS,
      creditCosts: { edit: 2 },
      routingOverrides: { 'edit.patch': 'ONLY_IN_CLOUD' as const },
    };
    expect(cloudCostFor('edit.patch', cfg)).toBe(2);
    expect(
      chooseRoute(
        routeInputFrom({ ...state, task: 'edit.patch', preferOnDevice: true, config: cfg }),
      ),
    ).toMatchObject({
      kind: 'cloud',
      credits: 2,
    });
  });

  it('passes the blocked reason through, and the kill switch', () => {
    const r = chooseRoute(
      routeInputFrom({
        ...state,
        task: 'generate',
        preferOnDevice: true,
        cloudAvailable: false,
        cloudBlockedReason: 'Cloud AI is coming soon',
      }),
    );
    expect(r).toEqual({ kind: 'disabled', reason: 'Cloud AI is coming soon' });
    expect(
      chooseRoute(
        routeInputFrom({
          ...state,
          task: 'generate',
          preferOnDevice: true,
          config: { ...APP_CONFIG_DEFAULTS, killSwitch: true },
        }),
      ),
    ).toEqual({ kind: 'disabled', reason: 'Cloud AI is paused' });
  });
});

describe('chooseRoute: film (spec 07b R5.5, R6)', () => {
  it('a film takes the cloud route with its price', () => {
    expect(route({ task: 'film', cloudCost: 5 })).toMatchObject({ kind: 'cloud', credits: 5 });
  });

  it('is disabled offline, with "Needs connection", and never runs on the device', () => {
    expect(route({ task: 'film', online: false, preferOnDevice: true })).toEqual({
      kind: 'disabled',
      reason: 'Needs connection',
    });
  });

  it('is paused by the kill switch', () => {
    expect(route({ task: 'film', killSwitch: true })).toEqual({
      kind: 'disabled',
      reason: 'Cloud AI is paused',
    });
  });
});
