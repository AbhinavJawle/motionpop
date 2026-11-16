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
