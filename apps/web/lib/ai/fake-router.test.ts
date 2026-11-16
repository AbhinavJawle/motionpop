import { componentFillTask, editPatchTask, editContext, noteFixTask } from '@motionpop/ai';
import type { UsageEvent } from '@motionpop/ai';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { schemaFor } from '@/lib/motion/registry';
import {
  createFakeRouter,
  fillAnswer,
  parseFakeSwitches,
  patchAnswer,
  routerKind,
  seededRandom,
} from './fake-router';

const DEFAULTS = { speed: 1, ease: 'inOut', fade: true } as const;
const BIG = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };
const STAT = {
  variant: 'hero',
  content: { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 },
  beats: [],
  images: [],
};
const ctx = (id = 'big-number', params: Record<string, unknown> = BIG) =>
  editContext(schemaFor(id)!, id, params, undefined, DEFAULTS);

const make = (search = '', usage: UsageEvent[] = []) => {
  const slept: number[] = [];
  const router = createFakeRouter({
    search,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
    onUsage: (e) => usage.push(e),
  });
  return { router, slept };
};
const EDIT = editPatchTask(schemaFor, { timingDefaults: DEFAULTS });
const NOTE = noteFixTask(schemaFor, { timingDefaults: DEFAULTS });
const FILL = componentFillTask(schemaFor);
const fillInput = (over: Record<string, unknown> = {}) => ({
  purpose: 'generate' as const,
  componentId: 'stat-punch',
  words: 'Revenue grew 40% since 2020',
  prompt: '',
  styleId: 'editorial-explainer',
  skill: { shotSequence: '', emphasis: '' },
  ...over,
});

describe('parseFakeSwitches and seededRandom', () => {
  it('reads the URL switches, with safe defaults', () => {
    expect(parseFakeSwitches('')).toEqual({
      deviceOff: false,
      fail: null,
      failRate: 0,
      seed: 1,
      latencyMs: null,
    });
    expect(parseFakeSwitches('?device=off&fakeFail=generate&fakeFailRate=0.3&fakeSeed=7')).toEqual({
      deviceOff: true,
      fail: 'generate',
      failRate: 0.3,
      seed: 7,
      latencyMs: null,
    });
    expect(parseFakeSwitches('?fakeLatency=1500').latencyMs).toBe(1500);
    expect(parseFakeSwitches('?fakeLatency=abc').latencyMs).toBe(300);
    expect(parseFakeSwitches('?fakeLatency=99999').latencyMs).toBe(10_000);
    expect(parseFakeSwitches('?fakeFail=nonsense&fakeFailRate=9&fakeSeed=x')).toMatchObject({
      fail: null,
      failRate: 1,
      seed: 1,
    });
  });

  it('is deterministic per seed and stays in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), (seed) => {
        const a = seededRandom(seed);
        const b = seededRandom(seed);
        for (let i = 0; i < 20; i++) {
          const x = a();
          expect(x).toBe(b());
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });
});

describe('P9 the fake router never runs in production', () => {
  it('routerKind is never fake when NODE_ENV is production, whatever the flag says', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), fc.boolean(), (flag, firebase) => {
        const kind = routerKind(
          { NODE_ENV: 'production', ...(flag === undefined ? {} : { NEXT_PUBLIC_FAKE_AI: flag }) },
          firebase,
        );
        expect(kind).toBe(firebase ? 'firebase' : 'none');
      }),
    );
  });

  it('outside production it needs exactly NEXT_PUBLIC_FAKE_AI=1', () => {
    for (const env of ['development', 'test', undefined]) {
      expect(
        routerKind({ ...(env ? { NODE_ENV: env } : {}), NEXT_PUBLIC_FAKE_AI: '1' }, true),
      ).toBe('fake');
      expect(
        routerKind({ ...(env ? { NODE_ENV: env } : {}), NEXT_PUBLIC_FAKE_AI: 'true' }, true),
      ).toBe('firebase');
      expect(routerKind({ ...(env ? { NODE_ENV: env } : {}) }, false)).toBe('none');
    }
  });
});

describe('patchAnswer rules', () => {
  const paths = ['/value', '/label', '/color', '/timing/speed', '/timing/ease', '/timing/fade'];
  const cur = { value: 40, label: 'Revenue grew', color: 'ink', timing: DEFAULTS };

  it('slower, faster and cut change timing', () => {
    expect(patchAnswer('make it slower', cur, paths).patch).toEqual([
      { op: 'replace', path: '/timing/speed', value: 0.8 },
    ]);
    expect(patchAnswer('Faster please', cur, paths).patch[0]).toMatchObject({ value: 1.25 });
    expect(patchAnswer('no fade', cur, paths).patch[0]).toMatchObject({
      path: '/timing/fade',
      value: false,
    });
  });

  it('"change A to B" finds the first path holding A (number or text)', () => {
    expect(patchAnswer('change 40 to 45', cur, paths).patch).toEqual([
      { op: 'replace', path: '/value', value: 45 },
    ]);
    expect(patchAnswer('Change revenue grew to Sales grew', cur, paths).patch).toEqual([
      { op: 'replace', path: '/label', value: 'Sales grew' },
    ]);
    expect(patchAnswer('change 99 to 100', cur, paths)).toMatchObject({
      escalate: true,
      patch: [],
    });
  });

  it('colour words use a colour field when there is one, else escalate', () => {
    expect(patchAnswer('make it orange', cur, paths).patch[0]).toMatchObject({
      path: '/color',
      value: 'orange',
    });
    expect(patchAnswer('make it orange', cur, ['/value', '/timing/speed'])).toMatchObject({
      escalate: true,
    });
  });

  it('anything else escalates with a message', () => {
    const a = patchAnswer('add a map of Europe', cur, paths);
    expect(a.escalate).toBe(true);
    expect(a.message).toMatch(/Generate/);
  });
});

describe('fake router: edit.patch and note.fix', () => {
  it('quick edit "change 40 to 45" answers on the device, free, after 300 ms', async () => {
    const usage: UsageEvent[] = [];
    const { router, slept } = make('', usage);
    const r = await router.run(
      EDIT,
      { ...ctx(), instruction: 'change 40 to 45' },
      { mode: 'ONLY_ON_DEVICE', allowCloud: false },
    );
    expect(r).toMatchObject({ ranOn: 'device', costCredits: 0, attempts: 1 });
    expect(r.output.patch).toEqual([{ op: 'replace', path: '/value', value: 45 }]);
    expect(slept).toEqual([300]);
    expect(usage).toEqual([
      expect.objectContaining({ task: 'edit.patch', ranOn: 'device', ok: true, cloudCost: 1 }),
    ]);
  });

  it('works on a scene score through /content paths, and a note is answered like a quick edit', async () => {
    const { router } = make();
    const r = await router.run(
      EDIT,
      { ...ctx('stat-punch', STAT), instruction: 'change 40 to 45' },
      { mode: 'ONLY_ON_DEVICE' },
    );
    expect(r.output.patch).toEqual([{ op: 'replace', path: '/content/value', value: 45 }]);
    const n = await router.run(NOTE, {
      ...ctx(),
      note: { text: 'make this slower', tMs: 1400, region: { x: 0.5, y: 0.4, w: 0.2, h: 0.2 } },
      regionText: ['40%'],
    });
    expect(n.output.patch).toEqual([{ op: 'replace', path: '/timing/speed', value: 0.8 }]);
  });

  it('runs the real check: an answer that breaks the schema fails like a real one', async () => {
    const { router } = make();
    const long = 'x'.repeat(80);
    await expect(
      router.run(
        EDIT,
        { ...ctx(), instruction: `change Revenue grew to ${long}` },
        { mode: 'ONLY_ON_DEVICE' },
      ),
    ).rejects.toMatchObject({ reason: 'invalid-output' });
  });

  it('?device=off: a device-only call fails, a cloud call runs in the cloud and costs 1', async () => {
    const { router } = make('?device=off');
    await expect(
      router.run(EDIT, { ...ctx(), instruction: 'make it slower' }, { mode: 'ONLY_ON_DEVICE' }),
    ).rejects.toMatchObject({ reason: 'provider' });
    const r = await router.run(
      EDIT,
      { ...ctx(), instruction: 'make it slower' },
      { mode: 'ONLY_IN_CLOUD' },
    );
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 1 });
  });

  it('rejects invalid input and has no answer for tasks it does not know', async () => {
    const { router } = make();
    await expect(router.run(EDIT, { instruction: '' } as never)).rejects.toMatchObject({
      reason: 'invalid-input',
    });
    const other = { ...EDIT, id: 'slots.detect' };
    await expect(router.run(other, { ...ctx(), instruction: 'x' })).rejects.toMatchObject({
      reason: 'provider',
    });
  });
});

describe('fake router: component.fill', () => {
  it('generate uses the scene safe default from the words and costs 3 in the cloud', async () => {
    const { router } = make();
    const r = await router.run(FILL, fillInput());
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 3 });
    expect(r.output.params).toMatchObject({
      variant: expect.any(String),
      content: { value: 40, suffix: '%' },
    });
  });

  it('auto-fill runs on the device for free', async () => {
    const r = await make().router.run(FILL, fillInput({ purpose: 'autofill' }));
    expect(r).toMatchObject({ ranOn: 'device', costCredits: 0 });
  });

  it('falls back to the current params, then the component defaults', () => {
    expect(
      fillAnswer({ componentId: 'big-number', words: 'hello there', currentParams: BIG }).params,
    ).toEqual(BIG);
    expect(fillAnswer({ componentId: 'big-number', words: 'hello there' }).params).toMatchObject({
      label: expect.any(String),
    });
  });
});

describe('fake router: failure switches', () => {
  const edit = (r: ReturnType<typeof make>['router']) =>
    r.run(EDIT, { ...ctx(), instruction: 'make it slower' }, { mode: 'ONLY_ON_DEVICE' });
  const generate = (r: ReturnType<typeof make>['router']) => r.run(FILL, fillInput());

  it.each([
    ['generate', true, false],
    ['edit', false, true],
    ['all', true, true],
  ] as const)(
    '?fakeFail=%s fails generate=%s, edit=%s (after the latency)',
    async (sw, gen, ed) => {
      const usage: UsageEvent[] = [];
      const { router, slept } = make(`?fakeFail=${sw}`, usage);
      if (gen) await expect(generate(router)).rejects.toMatchObject({ reason: 'provider' });
      else await expect(generate(router)).resolves.toBeDefined();
      if (ed) await expect(edit(router)).rejects.toMatchObject({ reason: 'provider' });
      else await expect(edit(router)).resolves.toBeDefined();
      expect(slept.every((ms) => ms === 300)).toBe(true);
      expect(usage.filter((u) => !u.ok).length).toBe((gen ? 1 : 0) + (ed ? 1 : 0));
    },
  );

  it('?fakeFail=note fails notes only', async () => {
    const { router } = make('?fakeFail=note');
    await expect(edit(router)).resolves.toBeDefined();
    await expect(
      router.run(NOTE, {
        ...ctx(),
        note: { text: 'slower', tMs: 0, region: { x: 0, y: 0, w: 0.5, h: 0.5 } },
        regionText: [],
      }),
    ).rejects.toMatchObject({ reason: 'provider' });
  });

  it('?fakeFailRate with a seed fails the same calls every time; 0 never fails and 1 always fails', async () => {
    const pattern = async (search: string) => {
      const { router } = make(search);
      const out: boolean[] = [];
      for (let i = 0; i < 12; i++)
        out.push(
          await edit(router).then(
            () => true,
            () => false,
          ),
        );
      return out;
    };
    const a = await pattern('?fakeFailRate=0.5&fakeSeed=7');
    expect(await pattern('?fakeFailRate=0.5&fakeSeed=7')).toEqual(a);
    expect(a).toContain(true);
    expect(a).toContain(false);
    expect(await pattern('?fakeFailRate=0&fakeSeed=7')).toEqual(Array(12).fill(true));
    expect(await pattern('?fakeFailRate=1&fakeSeed=7')).toEqual(Array(12).fill(false));
    expect(await pattern('?fakeFailRate=0.5&fakeSeed=8')).not.toEqual(a);
  });
});
