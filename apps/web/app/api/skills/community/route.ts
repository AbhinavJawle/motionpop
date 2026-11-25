import { COMMUNITY_SKILLS } from '@motionpop/ai';
import { UserSkillSchema, type UserSkill } from '@motionpop/schemas';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin.server';

export const runtime = 'nodejs';

/**
 * Returns the shared open-source community director skills stored in Firestore (`community_skills`),
 * merged with the bundled `COMMUNITY_SKILLS` defaults so every creator always has instant access
 * even offline or before seeding.
 */
export async function GET() {
  const byId = new Map<string, UserSkill>(COMMUNITY_SKILLS.map((s) => [s.id, s]));
  let source: 'firestore' | 'bundled' = 'bundled';
  try {
    const snap = await adminDb().collection('community_skills').get();
    if (!snap.empty) {
      source = 'firestore';
      for (const doc of snap.docs) {
        const parsed = UserSkillSchema.safeParse({ id: doc.id, ...doc.data(), community: true });
        if (parsed.success) byId.set(parsed.data.id, parsed.data);
      }
    }
  } catch {
    // No Admin SDK credentials in local offline dev or unit tests — serve bundled skills cleanly.
  }

  return NextResponse.json(
    { skills: [...byId.values()], source },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
