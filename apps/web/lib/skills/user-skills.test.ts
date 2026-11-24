// @vitest-environment happy-dom
import type { UserSkill } from '@motionpop/schemas';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteUserSkill,
  getUserSkillById,
  getUserSkills,
  mergeSkillLists,
  saveUserSkill,
  USER_SKILLS_STORAGE,
} from './user-skills';

const mkSkill = (over: Partial<UserSkill> = {}): UserSkill => ({
  id: 'blueprint-doc',
  name: 'Blueprint Doc',
  blurb: 'Drafting lines and clean callouts',
  target: 'both',
  baseRecipeId: 'tech-explainer',
  look: 'mono',
  accent: '#2563EB',
  captionStyle: 'seam',
  hookStyle: 'stat',
  music: 'minimal-tech',
  markdown: '# Blueprint Doc\n\nUse crisp architectural hairlines and high-contrast labels.',
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('user-skills store', () => {
  it('saves, reads, updates, and deletes skills in localStorage', async () => {
    expect(getUserSkills()).toEqual([]);

    const saved = await saveUserSkill(mkSkill(), null);
    expect(getUserSkills()).toHaveLength(1);
    expect(getUserSkillById(saved.id)?.name).toBe('Blueprint Doc');
    expect(window.localStorage.getItem(USER_SKILLS_STORAGE)).toContain('Blueprint Doc');

    await saveUserSkill(mkSkill({ name: 'Blueprint v2', updatedAt: 2000 }), null);
    expect(getUserSkills()).toHaveLength(1);
    expect(getUserSkillById('blueprint-doc')?.name).toBe('Blueprint v2');

    await deleteUserSkill('blueprint-doc', null);
    expect(getUserSkills()).toEqual([]);
  });

  it('merges local and remote skills keeping the newest updatedAt per id', () => {
    const local = [
      mkSkill({ id: 'a', name: 'Local Old', updatedAt: 100 }),
      mkSkill({ id: 'b', name: 'Local Only', updatedAt: 300 }),
    ];
    const remote = [
      mkSkill({ id: 'a', name: 'Remote Newer', updatedAt: 500 }),
      mkSkill({ id: 'c', name: 'Remote Only', updatedAt: 200 }),
    ];
    const merged = mergeSkillLists(local, remote);
    expect(merged.map((s) => [s.id, s.name])).toEqual([
      ['a', 'Remote Newer'],
      ['b', 'Local Only'],
      ['c', 'Remote Only'],
    ]);
  });

  it('isolates cached skills strictly per user id on a shared browser', async () => {
    await saveUserSkill(mkSkill({ id: 'user-a-skill', name: 'User A Private' }), 'uid-a');
    expect(getUserSkills('uid-a').map((s) => s.id)).toEqual(['user-a-skill']);
    expect(getUserSkills('uid-b')).toEqual([]);
    expect(getUserSkills(null)).toEqual([]);
  });
});
