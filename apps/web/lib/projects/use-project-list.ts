'use client';

import { useCallback, useEffect, useState } from 'react';
import { appAudioStore } from '../audio/app-audio-store';
import { useAuth } from '../auth/auth-provider';
import { authSettled, currentUid } from '../auth/auth-store';
import { firebaseEnabled } from '../firebase/client';
import { useJobs } from '../pipeline/jobs-store';
import { firestoreCloud } from './firestore-cloud';
import { IdbProjectRepository } from './idb-repository';
import type { ProjectLibrary, ProjectListing } from './repository';
import { SyncedLibrary } from './synced-library';

export type ProjectList =
  | { kind: 'loading' }
  | { kind: 'ready'; listing: ProjectListing }
  | { kind: 'error'; message: string };

let shared: ProjectLibrary | undefined;
/**
 * The browser's project library (R1.4): IndexedDB, mirrored to Firestore for the signed-in owner
 * when Firebase is configured (D-068). Editor, Processing, the pipeline and the dashboard share it.
 */
export function projectLibrary(): ProjectLibrary {
  shared ??= firebaseEnabled()
    ? new SyncedLibrary({
        local: new IdbProjectRepository(undefined, { audio: appAudioStore() }),
        cloud: firestoreCloud(),
        uid: currentUid,
        ready: () => authSettled(),
      })
    : new IdbProjectRepository(undefined, { audio: appAudioStore() });
  return shared;
}

/** The dashboard's list, with a `reload` after a rename, duplicate or delete. */
export function useProjectList(): { list: ProjectList; reload: () => Promise<void> } {
  const [list, setList] = useState<ProjectList>({ kind: 'loading' });
  // Signing in (or out) changes which projects exist, so the list loads again.
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;

  const reload = useCallback(async () => {
    try {
      setList({ kind: 'ready', listing: await projectLibrary().list() });
    } catch (e) {
      setList({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    let live = true;
    projectLibrary()
      .list()
      .then(
        (listing) => live && setList({ kind: 'ready', listing }),
        (e: unknown) =>
          live && setList({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      live = false;
    };
  }, [uid]);

  // A background job that finishes has just saved a project: show it without a manual refresh
  // (spec 39 R6.6). Jobs already done when the list mounts were loaded with it.
  useEffect(() => {
    const done = new Set<string>();
    const first = useJobs.getState();
    for (const id of first.order) if (first.jobs[id]?.status === 'done') done.add(id);
    return useJobs.subscribe((s) => {
      let fresh = false;
      for (const id of s.order) {
        if (s.jobs[id]?.status === 'done' && !done.has(id)) {
          done.add(id);
          fresh = true;
        }
      }
      if (fresh) void reload();
    });
  }, [reload]);

  return { list, reload };
}
