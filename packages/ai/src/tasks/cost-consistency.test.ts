import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG_DEFAULTS, costOf } from '@motionpop/schemas';
import { GENERATE_COST } from './component-fill';
import { editPatchTask } from './edit-patch';
import { promptPrefill } from './prompt-prefill';
import { recipeResolveTask } from './recipe-resolve';
import { slotsDetectCost } from './slots-detect';
import { transcribeCloudCost } from './transcribe-cloud';

// Property C8 (spec 13): the cost a task shows before the action is the cost the server charges,
// because both come from `costOf`. There is no `note.fix` task in this package yet; when it lands
// its `cloudCost` joins this list.
describe('task costs equal costOf (C8)', () => {
  it('generate and cloud edit', () => {
    expect(GENERATE_COST).toBe(costOf('generate', 1, APP_CONFIG_DEFAULTS));
    expect(editPatchTask(() => undefined).cloudCost({} as never)).toBe(
      costOf('edit', 1, APP_CONFIG_DEFAULTS),
    );
  });

  it('prompt.prefill is always free', () => {
    expect(promptPrefill.cloudCost({} as never)).toBe(0);
    expect(promptPrefill.cloudFallback).toBe(false);
  });

  it('recipe.resolve is always free and never reaches the cloud (spec 39 review #1)', () => {
    expect(recipeResolveTask.cloudCost({} as never)).toBe(0);
    expect(recipeResolveTask.cloudFallback).toBe(false);
    expect(recipeResolveTask.mode({} as never, {} as never)).toBe('ONLY_ON_DEVICE');
  });

  it('slots.detect is one credit per started 200 words', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (words) => {
        const units = Math.max(1, Math.ceil(words / 200));
        expect(slotsDetectCost(words)).toBe(costOf('slots-detect', units, APP_CONFIG_DEFAULTS));
      }),
    );
    expect([0, 1, 200, 201, 400, 401].map(slotsDetectCost)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it('transcribe is one credit per started minute', () => {
    expect([0, 1, 60_000, 60_001, 180_000].map(transcribeCloudCost)).toEqual([1, 1, 1, 2, 3]);
  });

  it('an 18 s 1080p export is free by default and costs 5 on the paid table (spec 13b R1)', () => {
    const opts = { resolution: '1080p', durationMs: 18_000 } as const;
    expect(costOf('export', 1, APP_CONFIG_DEFAULTS, opts)).toBe(0);
    const paid = { ...APP_CONFIG_DEFAULTS, exportCredits: { '720p': 3, '1080p': 5 } };
    expect(costOf('export', 1, paid, opts)).toBe(5);
  });
});
