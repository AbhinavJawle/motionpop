import { IdbAudioStore } from '../audio/audio-store';
import { done, openDb, req, STORES } from '../storage/idb';
import { StoredProjectRepository, type LibraryOptions, type StoredProject } from './repository';

const STORE = STORES.projects;

/** Local persistence until Firestore sync lands (spec 01). One record per project id. */
export class IdbProjectRepository extends StoredProjectRepository {
  /** `factory` defaults to the browser's `indexedDB`, resolved lazily so SSR can construct this. */
  constructor(
    private readonly factory?: IDBFactory,
    opts: LibraryOptions = {},
  ) {
    super({ ...opts, defaultAudio: () => new IdbAudioStore(factory) });
  }

  private open(): Promise<IDBDatabase> {
    return openDb(this.factory);
  }

  protected async get(id: string): Promise<StoredProject | undefined> {
    const db = await this.open();
    // IndexedDB returns structured-clone data; it is validated by `loadFromStored`.
    return (await req(db.transaction(STORE).objectStore(STORE).get(id))) as
      StoredProject | undefined;
  }

  protected async put(id: string, stored: StoredProject): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored, id);
    await done(tx);
  }

  protected async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  }

  protected async entries(): Promise<Array<[string, StoredProject]>> {
    const db = await this.open();
    const store = db.transaction(STORE).objectStore(STORE);
    const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
    // Same structured-clone data as `get`; every value is parsed by `list`.
    return keys.map((k, i) => [String(k), values[i] as StoredProject]);
  }
}
