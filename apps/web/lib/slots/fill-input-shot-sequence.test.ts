import { shotSequenceOf } from '@motionpop/ai';
import type { Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { sceneFor } from '@/lib/motion/registry';
import { demoProject } from '../projects/fixture';
import { componentFillInput } from './component-fill-input';
import { sceneFillInput } from './scene-fill';

const project = demoProject();
const base = project.slots[0] as Slot;

describe('component.fill input carries the skill’s shot sequence (spec 39 R3.6)', () => {
  it('componentFillInput passes the slot skill’s sequence', () => {
    const slot: Slot = { ...base, skillId: 'shocking-stat-reveal' };
    const input = componentFillInput(project, slot, 'generate');
    expect(input.skill.shotSequence).toBe(shotSequenceOf('shocking-stat-reveal'));
    expect(input.skill.shotSequence).toContain('%');
  });

  it('sceneFillInput passes the slot skill’s sequence', () => {
    const scene = sceneFor('stat-punch');
    if (!scene) throw new Error('stat-punch scene missing');
    const slot: Slot = { ...base, componentId: 'stat-punch', skillId: 'calm-explanation' };
    const input = sceneFillInput(scene, project, slot);
    expect(input.skill.shotSequence).toBe(shotSequenceOf('calm-explanation'));
    expect(input.skill.shotSequence).not.toBe('');
  });

  it('an unknown skill id gives an empty sequence', () => {
    const slot: Slot = { ...base, skillId: 'not-a-skill' };
    expect(componentFillInput(project, slot, 'autofill').skill.shotSequence).toBe('');
  });
});
