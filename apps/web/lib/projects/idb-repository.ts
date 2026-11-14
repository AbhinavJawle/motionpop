import type { EditorProject } from '@motionpop/schemas';
import {
  loadFromStored,
  parseStored,
  type LoadResult,
  type ProjectRepository,
  type StoredProject,
} from './repository';

const DB_NAME = 'motionpop';
const DB_VERSION = 1;
const STORE = 'projects';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

/** Local persistence until Firestore sync lands (spec 01). One record per project id. */
export class IdbProjectRepository implements ProjectRepository {
  private db: Promise<IDBDatabase> | undefined;

  /** `factory` defaults to the browser's `indexedDB`, resolved lazily so SSR can construct this. */
  constructor(private readonly factory?: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const r = (this.factory ?? indexedDB).open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB open failed'));
    });
    return this.db;
  }

  private async get(id: string): Promise<StoredProject | undefined> {
    const db = await this.open();
    // IndexedDB returns structured-clone data; it is validated by `loadFromStored`.
    return (await req(db.transaction(STORE).objectStore(STORE).get(id))) as
      StoredProject | undefined;
  }

  private async put(id: string, stored: StoredProject): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored, id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  }

  async load(id: string): Promise<LoadResult> {
    return loadFromStored(await this.get(id));
  }

  async save(project: EditorProject): Promise<void> {
    const prev = await this.get(project.id);
    const keep = prev && parseStored(prev.current).ok ? prev.current : prev?.previous;
    await this.put(project.id, { current: project, previous: keep });
  }

  async restoreBackup(id: string): Promise<LoadResult> {
    const stored = await this.get(id);
    if (!stored?.previous) return { ok: false, error: 'not-found' };
    await this.put(id, { current: stored.previous });
    return loadFromStored({ current: stored.previous });
  }
}
