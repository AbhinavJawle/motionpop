import type { EditorProject } from '@motionpop/schemas';
import { done, openDb, req, STORES } from '../storage/idb';
import {
  loadFromStored,
  parseStored,
  type LoadResult,
  type ProjectRepository,
  type StoredProject,
} from './repository';

const STORE = STORES.projects;

/** Local persistence until Firestore sync lands (spec 01). One record per project id. */
export class IdbProjectRepository implements ProjectRepository {
  /** `factory` defaults to the browser's `indexedDB`, resolved lazily so SSR can construct this. */
  constructor(private readonly factory?: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    return openDb(this.factory);
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
    await done(tx);
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
