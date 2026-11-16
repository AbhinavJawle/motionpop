import { describe, expect, it } from 'vitest';
import { fromCloud, toCloud } from '../projects/cloud-docs';
import { demoProject } from '../projects/fixture';
import { codePlan, NO_BRAND_YET } from '../pip/plan';
import { CommandRejected, setBrand } from './index';

const BRAND = { accent: '#1E5AA8', accent2: '#1F6B47' };

describe('setBrand', () => {
  it('sets, replaces and removes the brand, and undo restores each step', () => {
    const p0 = demoProject(0);
    const c1 = setBrand(BRAND);
    const p1 = c1.do(p0);
    expect(p1.brand).toEqual(BRAND);
    const c2 = setBrand(null);
    const p2 = c2.do(p1);
    expect(p2.brand).toBeUndefined();
    expect(c2.undo(p2).brand).toEqual(BRAND);
    expect(c1.undo(p1).brand).toBeUndefined();
  });

  it('rejects colours that are not #RRGGBB', () => {
    expect(() => setBrand({ accent: 'blue' }).do(demoProject(0))).toThrow(CommandRejected);
  });

  it('survives the cloud round trip', () => {
    const p = setBrand(BRAND).do(demoProject(0));
    const set = toCloud(p, 'u1');
    const r = fromCloud(set.project, set.subs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.brand).toEqual(BRAND);
  });
});

describe("Pip's brand chip", () => {
  it('without a saved brand kit: says so and plans nothing', () => {
    const plan = codePlan('brand', demoProject(0));
    expect(plan.reply).toBe(NO_BRAND_YET);
    expect(plan.steps).toEqual([]);
  });

  it('with a saved kit: one free setBrand step carrying those colours', () => {
    const plan = codePlan('brand', demoProject(0), undefined, BRAND);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ action: 'setBrand', brand: BRAND, credits: 0 });
  });

  it('when the video already uses the saved kit: nothing to do', () => {
    const p = setBrand(BRAND).do(demoProject(0));
    expect(
      codePlan('brand', p, undefined, { accent: '#1e5aa8', accent2: '#1f6b47' }).steps,
    ).toEqual([]);
  });
});
