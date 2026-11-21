import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type EditorProject, type ReelPlan } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { CommandRejected } from './command';
import { setReel, setReelCaptions, setReelLook } from './reel';

const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [
    {
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      bg: 'light',
      content: { template: 'headline', title: 'Hello' },
    },
    { id: 'r2', startMs: 3000, endMs: 6000, layout: 'speaker', content: { template: 'none' } },
  ],
};

function project(withReel = true): EditorProject {
  return EditorProjectSchema.parse({
    ...fixtureProject({ slots: [], durationMs: 6000 }),
    ...(withReel ? { reel: plan } : {}),
  });
}

describe('reel commands (spec 25)', () => {
  it('switches the look with layouts following, and undoes exactly', () => {
    const p = project();
    const cmd = setReelLook('cream');
    const next = cmd.do(p);
    expect(next.reel?.look).toBe('cream');
    expect(next.reel?.scenes[0]?.layout).toBe('card');
    expect(next.reel?.scenes[1]?.layout).toBe('speaker');
    expect(cmd.undo(next)).toEqual(p);
  });

  it('toggles captions and replaces the plan, each one undo step', () => {
    const p = project();
    const off = setReelCaptions(false);
    const a = off.do(p);
    expect(a.reel?.captions).toBe(false);
    expect(off.undo(a)).toEqual(p);
    const replace = setReel({ ...plan, hook: 'New hook' });
    const b = replace.do(p);
    expect(b.reel?.hook).toBe('New hook');
    expect(replace.undo(b)).toEqual(p);
  });

  it('rejects projects without a reel and invalid plans', () => {
    expect(() => setReelLook('cream').do(project(false))).toThrow(CommandRejected);
    expect(() => setReel({ ...plan, scenes: [] }).do(project())).toThrow(CommandRejected);
  });
});
