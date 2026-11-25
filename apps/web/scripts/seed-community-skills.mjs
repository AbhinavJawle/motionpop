#!/usr/bin/env node
/**
 * Seeds the curated open-source community director skills (`COMMUNITY_SKILLS`) into Firestore
 * `community_skills/{id}` using Firebase Admin SDK credentials from `apps/web/.env.local`.
 *
 * Usage:
 *   pnpm --filter @motionpop/web exec node scripts/seed-community-skills.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COMMUNITY_SKILLS } from '../../../packages/ai/src/skills/community-skills.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(here, '../.env.local'),
  path.resolve(here, '.env.local'),
  path.resolve(process.cwd(), 'apps/web/.env.local'),
  path.resolve(process.cwd(), '.env.local'),
];
const envPath = envCandidates.find((p) => fs.existsSync(p));
if (envPath) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

const app =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });

const db = getFirestore(app);
const col = db.collection('community_skills');
const batch = db.batch();

for (const skill of COMMUNITY_SKILLS) {
  const clean = Object.fromEntries(Object.entries(skill).filter(([, v]) => v !== undefined));
  batch.set(col.doc(skill.id), clean, { merge: true });
}

await batch.commit();
console.log(
  `Seeded ${COMMUNITY_SKILLS.length} open-source community skills into Firestore (${projectId ?? 'default'}/community_skills):`,
);
for (const s of COMMUNITY_SKILLS) {
  console.log(`  ✓ ${s.id} (${s.repoSlug ?? 'local'})`);
}
