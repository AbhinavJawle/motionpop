'use client';

import { COMMUNITY_SKILLS, getCommunitySkillById } from '@motionpop/ai';
import { UserSkillSchema, type UserSkill } from '@motionpop/schemas';
import { useEffect, useState } from 'react';
import { getUserSkillById } from './user-skills';

let cachedSkills: readonly UserSkill[] = COMMUNITY_SKILLS;
let fetchedOnce = false;
let inFlight: Promise<readonly UserSkill[]> | null = null;

async function fetchCommunitySkills(): Promise<readonly UserSkill[]> {
  if (inFlight) return inFlight;
  inFlight = fetch('/api/skills/community')
    .then(async (res) => {
      if (!res.ok) return cachedSkills;
      const body = (await res.json()) as { skills?: unknown };
      if (!Array.isArray(body.skills)) return cachedSkills;
      const valid: UserSkill[] = [];
      for (const item of body.skills) {
        const parsed = UserSkillSchema.safeParse(item);
        if (parsed.success) valid.push(parsed.data);
      }
      if (valid.length > 0) cachedSkills = valid;
      fetchedOnce = true;
      return cachedSkills;
    })
    .catch(() => cachedSkills)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Shared open-source community director skills (backed by Firestore `community_skills` via
 * `/api/skills/community`, with instant zero-latency hydration from bundled `COMMUNITY_SKILLS`).
 */
export function useCommunitySkills(): {
  skills: readonly UserSkill[];
  loaded: boolean;
} {
  const [skills, setSkills] = useState<readonly UserSkill[]>(cachedSkills);
  const [loaded, setLoaded] = useState(fetchedOnce);

  useEffect(() => {
    if (fetchedOnce) return;
    let live = true;
    void fetchCommunitySkills().then((next) => {
      if (!live) return;
      setSkills(next);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return { skills, loaded };
}

/** Looks up a skill by id across both the user's personal library and shared community skills. */
export function getAnySkillById(id: string | undefined): UserSkill | undefined {
  if (!id) return undefined;
  return (
    getUserSkillById(id) ??
    cachedSkills.find((s) => s.id === id) ??
    getCommunitySkillById(id)
  );
}
