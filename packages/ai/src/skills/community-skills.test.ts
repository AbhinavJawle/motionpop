import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserSkillSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { COMMUNITY_SKILLS, getCommunitySkillById } from './community-skills';
import { builtInSkills } from './registry';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('COMMUNITY_SKILLS open-source director library', () => {
  it('contains unique, schema-valid open-source skills with repo attribution and local thumbnails', () => {
    expect(COMMUNITY_SKILLS.length).toBeGreaterThanOrEqual(16);
    const ids = new Set<string>();
    for (const sk of COMMUNITY_SKILLS) {
      expect(UserSkillSchema.safeParse(sk).success, sk.id).toBe(true);
      expect(ids.has(sk.id), `duplicate id ${sk.id}`).toBe(false);
      ids.add(sk.id);
      expect(sk.community).toBe(true);
      expect(sk.repoSlug, `${sk.id} missing repoSlug`).toBeTruthy();
      expect(sk.sourceUrl, `${sk.id} missing sourceUrl`).toMatch(/^https:\/\/github\.com\//);
      expect(sk.thumbnailUrl, `${sk.id} missing thumbnailUrl`).toMatch(/^\/skills\//);
      expect(
        existsSync(join(root, 'apps/web/public', sk.thumbnailUrl!)),
        `missing thumbnail file ${sk.thumbnailUrl}`,
      ).toBe(true);
      expect(builtInSkills.recipe(sk.baseRecipeId), `${sk.id} invalid baseRecipeId`).toBeDefined();
      expect(getCommunitySkillById(sk.id)).toBe(sk);
    }
  });
});
