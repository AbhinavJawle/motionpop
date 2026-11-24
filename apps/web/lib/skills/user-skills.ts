'use client';

import { UserSkillSchema, type UserSkill } from '@motionpop/schemas';
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { firebaseEnabled, getDb } from '@/lib/firebase/client';

/**
 * Modular user skill repository (Spec 43):
 * - Instant local persistence in `localStorage` (`mp:user-skills-v1`), cross-tab synced.
 * - Automatic bidirectional sync with Firestore `users/{uid}/skills/{id}` when signed in.
 * - Every read and write is strictly validated with `UserSkillSchema`.
 */

export const USER_SKILLS_STORAGE = 'mp:user-skills-v1';

export function storageKeyForUser(uid: string | null): string {
  return uid ? `${USER_SKILLS_STORAGE}:${uid}` : USER_SKILLS_STORAGE;
}

const EMPTY: readonly UserSkill[] = [];
const listeners = new Set<() => void>();
let storageBound = false;
let cacheKey: string | undefined;
let cacheRaw: string | null | undefined;
let cached: readonly UserSkill[] = EMPTY;
let activeCloudUid: string | null = null;
let cloudUnsub: (() => void) | null = null;

function sortSkills(list: readonly UserSkill[]): UserSkill[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readLocal(uid: string | null = activeCloudUid): readonly UserSkill[] {
  if (typeof window === 'undefined') return EMPTY;
  const key = storageKeyForUser(uid);
  try {
    const raw = window.localStorage.getItem(key);
    if (key === cacheKey && raw === cacheRaw) return cached;
    cacheKey = key;
    cacheRaw = raw;
    if (!raw) {
      cached = EMPTY;
      return cached;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      cached = EMPTY;
      return cached;
    }
    const valid: UserSkill[] = [];
    for (const item of parsed) {
      const r = UserSkillSchema.safeParse(item);
      if (r.success) valid.push(r.data);
    }
    cached = sortSkills(valid);
    return cached;
  } catch {
    cached = EMPTY;
    return cached;
  }
}

function writeLocal(next: readonly UserSkill[], uid: string | null = activeCloudUid): void {
  const sorted = sortSkills(next);
  const key = storageKeyForUser(uid);
  if (uid === activeCloudUid) {
    cached = sorted;
    cacheKey = key;
  }
  if (typeof window !== 'undefined') {
    try {
      const json = JSON.stringify(sorted);
      if (uid === activeCloudUid) cacheRaw = json;
      window.localStorage.setItem(key, json);
    } catch {
      // Storage blocked or full; keep in-memory cache alive for this session.
    }
  }
  listeners.forEach((fn) => fn());
}

function bindStorage(): void {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (e) => {
    const activeKey = storageKeyForUser(activeCloudUid);
    if (e.key === null || e.key === activeKey) {
      cacheRaw = undefined;
      readLocal(activeCloudUid);
      listeners.forEach((fn) => fn());
    }
  });
}

export function getUserSkills(uid: string | null = activeCloudUid): readonly UserSkill[] {
  return readLocal(uid);
}

export function getUserSkillById(
  id: string | undefined,
  uid: string | null = activeCloudUid,
): UserSkill | undefined {
  if (!id) return undefined;
  return readLocal(uid).find((s) => s.id === id);
}

async function persistSkillToCloud(uid: string, skill: UserSkill): Promise<void> {
  if (!firebaseEnabled()) return;
  try {
    const [db, { doc, setDoc }] = await Promise.all([getDb(), import('firebase/firestore')]);
    // Strip undefined optional fields so Firestore never rejects the write.
    const clean = Object.fromEntries(Object.entries(skill).filter(([, v]) => v !== undefined));
    await setDoc(doc(db, 'users', uid, 'skills', skill.id), clean);
  } catch (err) {
    console.warn('[user-skills] cloud save failed; kept locally', err);
  }
}

async function deleteSkillFromCloud(uid: string, id: string): Promise<void> {
  if (!firebaseEnabled()) return;
  try {
    const [db, { deleteDoc, doc }] = await Promise.all([getDb(), import('firebase/firestore')]);
    await deleteDoc(doc(db, 'users', uid, 'skills', id));
  } catch (err) {
    console.warn('[user-skills] cloud delete failed; removed locally', err);
  }
}

/** Saves or updates a custom skill locally and syncs to Firestore `users/{uid}/skills/{id}`. */
export async function saveUserSkill(
  raw: UserSkill,
  uid: string | null = activeCloudUid,
): Promise<UserSkill> {
  const skill = UserSkillSchema.parse(raw);
  const current = readLocal(uid).filter((s) => s.id !== skill.id);
  writeLocal([skill, ...current], uid);
  if (uid) await persistSkillToCloud(uid, skill);
  return skill;
}

/** Deletes a custom skill locally and from Firestore `users/{uid}/skills/{id}`. */
export async function deleteUserSkill(
  id: string,
  uid: string | null = activeCloudUid,
): Promise<void> {
  writeLocal(
    readLocal(uid).filter((s) => s.id !== id),
    uid,
  );
  if (uid) await deleteSkillFromCloud(uid, id);
}

/** Merges cloud skills with local cache (newest `updatedAt` wins per id). */
export function mergeSkillLists(
  local: readonly UserSkill[],
  remote: readonly UserSkill[],
): UserSkill[] {
  const map = new Map<string, UserSkill>();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) {
    const existing = map.get(s.id);
    if (!existing || s.updatedAt >= existing.updatedAt) {
      map.set(s.id, s);
    }
  }
  return sortSkills([...map.values()]);
}

function subscribeLocal(fn: () => void): () => void {
  bindStorage();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Reactive list of the user's custom Markdown skills, automatically syncing with Firestore
 * `users/{uid}/skills` when signed in.
 */
export function useUserSkills(): {
  skills: readonly UserSkill[];
  cloudSynced: boolean;
  save: (skill: UserSkill) => Promise<UserSkill>;
  remove: (id: string) => Promise<void>;
} {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const skills = useSyncExternalStore(subscribeLocal, readLocal, () => EMPTY);

  useEffect(() => {
    const uidChanged = activeCloudUid !== uid;
    activeCloudUid = uid;
    if (uidChanged) {
      cacheKey = undefined;
      cacheRaw = undefined;
      readLocal(uid);
      listeners.forEach((fn) => fn());
    }
    if (!uid || !firebaseEnabled()) {
      cloudUnsub?.();
      cloudUnsub = null;
      return;
    }
    let live = true;
    void (async () => {
      try {
        const [db, { collection, onSnapshot }] = await Promise.all([
          getDb(),
          import('firebase/firestore'),
        ]);
        if (!live) return;
        cloudUnsub?.();
        cloudUnsub = onSnapshot(
          collection(db, 'users', uid, 'skills'),
          (snap) => {
            const remote: UserSkill[] = [];
            snap.forEach((docSnap) => {
              const r = UserSkillSchema.safeParse({ id: docSnap.id, ...docSnap.data() });
              if (r.success) remote.push(r.data);
            });
            const removedIds = new Set<string>();
            for (const change of snap.docChanges()) {
              if (change.type === 'removed') removedIds.add(change.doc.id);
            }
            const baseLocal =
              removedIds.size > 0
                ? readLocal(uid).filter((s) => !removedIds.has(s.id))
                : readLocal(uid);
            writeLocal(mergeSkillLists(baseLocal, remote), uid);
          },
          (err) => {
            console.warn('[user-skills] cloud listener error', err);
          },
        );
      } catch (err) {
        console.warn('[user-skills] cloud sync unavailable', err);
      }
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  return {
    skills,
    cloudSynced: Boolean(uid && firebaseEnabled()),
    save: (skill) => saveUserSkill(skill, uid),
    remove: (id) => deleteUserSkill(id, uid),
  };
}
