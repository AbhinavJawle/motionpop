import { z } from 'zod';
import { done, openDb, req, STORES } from '../storage/idb';

/** Where in the account a project's audio or video media goes (spec 11 design §2.4). */
export interface AudioPlace {
  projectId: string;
  kind: 'voice' | 'music' | 'source' | 'clip';
}

/**
 * Where voiceover audio lives (spec 05 R4.1). Refs are opaque strings stored in the project:
 * `idb:<key>` for this browser only, `storage:<path>` for audio mirrored to the account
 * (`HybridAudioStore`, spec 11 task 7). A store without an account ignores `place`.
 */
export interface AudioStore {
  put(blob: Blob, place?: AudioPlace): Promise<string>;
  get(ref: string): Promise<Blob | null>;
  delete(ref: string): Promise<void>;
  /** True when a `put` with a place goes to the account (signed in), so refs are portable. */
  syncs?(): boolean;
}

/** A blob cache under raw keys (the hybrid store keeps `storage:` refs here). */
export interface KeyedBlobs {
  putKey(key: string, blob: Blob): Promise<void>;
  getKey(key: string): Promise<Blob | null>;
  deleteKey(key: string): Promise<void>;
}

export const IDB_AUDIO_PREFIX = 'idb:';
export const isIdbAudioRef = (src: string): boolean => src.startsWith(IDB_AUDIO_PREFIX);

function newKey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `audio-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** In-memory store for tests and SSR. */
export class MemoryAudioStore implements AudioStore, KeyedBlobs {
  private readonly blobs = new Map<string, Blob>();
  async put(blob: Blob): Promise<string> {
    const ref = IDB_AUDIO_PREFIX + newKey();
    this.blobs.set(ref, blob);
    return ref;
  }
  async putKey(key: string, blob: Blob): Promise<void> {
    this.blobs.set(key, blob);
  }
  async getKey(key: string): Promise<Blob | null> {
    return this.blobs.get(key) ?? null;
  }
  async deleteKey(key: string): Promise<void> {
    this.blobs.delete(key);
  }
  async get(ref: string): Promise<Blob | null> {
    return this.blobs.get(ref) ?? null;
  }
  async delete(ref: string): Promise<void> {
    this.blobs.delete(ref);
  }
  get size(): number {
    return this.blobs.size;
  }
}

/** Stored as bytes + type rather than a Blob, which not every IndexedDB build clones. */
const StoredAudioSchema = z.object({
  type: z.string(),
  bytes: z.instanceof(ArrayBuffer),
});

export class IdbAudioStore implements AudioStore, KeyedBlobs {
  constructor(private readonly factory?: IDBFactory) {}

  private key(ref: string): string | null {
    return isIdbAudioRef(ref) ? ref.slice(IDB_AUDIO_PREFIX.length) : null;
  }

  async put(blob: Blob): Promise<string> {
    const key = newKey();
    await this.putKey(key, blob);
    return IDB_AUDIO_PREFIX + key;
  }

  async get(ref: string): Promise<Blob | null> {
    const key = this.key(ref);
    return key ? this.getKey(key) : null;
  }

  async delete(ref: string): Promise<void> {
    const key = this.key(ref);
    if (key) await this.deleteKey(key);
  }

  async putKey(key: string, blob: Blob): Promise<void> {
    // Read the bytes before opening the transaction: awaiting inside it lets the browser
    // auto-commit, and the put then throws TransactionInactiveError (fake-indexeddb doesn't).
    const bytes = await blob.arrayBuffer();
    const db = await openDb(this.factory);
    const tx = db.transaction(STORES.audio, 'readwrite');
    tx.objectStore(STORES.audio).put({ type: blob.type, bytes }, key);
    await done(tx);
  }

  async getKey(key: string): Promise<Blob | null> {
    const db = await openDb(this.factory);
    const raw: unknown = await req(db.transaction(STORES.audio).objectStore(STORES.audio).get(key));
    const parsed = StoredAudioSchema.safeParse(raw);
    return parsed.success ? new Blob([parsed.data.bytes], { type: parsed.data.type }) : null;
  }

  async deleteKey(key: string): Promise<void> {
    const db = await openDb(this.factory);
    const tx = db.transaction(STORES.audio, 'readwrite');
    tx.objectStore(STORES.audio).delete(key);
    await done(tx);
  }
}

let shared: AudioStore | undefined;
/** The app's audio store (IndexedDB in the browser, memory during SSR). */
export function audioStore(): AudioStore {
  shared ??= typeof indexedDB === 'undefined' ? new MemoryAudioStore() : new IdbAudioStore();
  return shared;
}
