'use client';

import { useCallback, useEffect, useState } from 'react';
import { IdbProjectRepository } from './idb-repository';
import type { ProjectLibrary, ProjectListing } from './repository';

export type ProjectList =
  | { kind: 'loading' }
  | { kind: 'ready'; listing: ProjectListing }
  | { kind: 'error'; message: string };

let shared: ProjectLibrary | undefined;
/** The browser's project library (IndexedDB until the Firestore adapter lands, R1.4). */
export function projectLibrary(): ProjectLibrary {
  shared ??= new IdbProjectRepository();
  return shared;
}

/** The dashboard's list, with a `reload` after a rename, duplicate or delete. */
export function useProjectList(): { list: ProjectList; reload: () => Promise<void> } {
  const [list, setList] = useState<ProjectList>({ kind: 'loading' });

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
  }, []);

  return { list, reload };
}
