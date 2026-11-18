import type { StudioProjectDto } from '@pireel/studio-engine/project-dto';

/**
 * Studio documents built by Motionpop's pipeline, waiting for the studio to open them (spec 17).
 * The studio adopts a document once; from then on Pireel's own local draft holds the edits, so a
 * taken document is marked and `load` answers null.
 */
const DB = 'motionpop-studio';
const STORE = 'handoff';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

interface Entry {
  dto: StudioProjectDto;
  taken: boolean;
}

export const putStudioDocument = (dto: StudioProjectDto) =>
  tx('readwrite', (s) => s.put({ dto, taken: false } satisfies Entry, dto.id)).then(() => undefined);

export async function hasStudioDocument(id: string): Promise<boolean> {
  return (await tx<Entry | undefined>('readonly', (s) => s.get(id)).catch(() => undefined)) !== undefined;
}

/** The waiting document, once. */
export async function takeStudioDocument(id: string): Promise<StudioProjectDto | null> {
  const entry = await tx<Entry | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
  if (!entry || entry.taken) return null;
  await tx('readwrite', (s) => s.put({ ...entry, taken: true } satisfies Entry, id));
  return entry.dto;
}
