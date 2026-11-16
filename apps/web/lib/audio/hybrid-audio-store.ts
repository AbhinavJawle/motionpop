import { isSafeId } from '@motionpop/schemas';
import { z } from 'zod';
import { done, openDb, req, STORES } from '../storage/idb';
import { CANONICAL_TYPE, MAX_VOICE_BYTES, hash16, voiceExtFor } from './audio-path';
import { isIdbAudioRef, type AudioPlace, type AudioStore, type KeyedBlobs } from './audio-store';

// Audio that follows the account (spec 11 R1.3, design §2.4). A `put` with a place stores the
// bytes in IndexedDB at once (instant local playback) and queues the upload to
// `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}`; the queue lives in IndexedDB too, so an
// upload that fails, or a tab that closes mid-upload, finishes on the next app start.

export const STORAGE_AUDIO_PREFIX = 'storage:';
export const isStorageAudioRef = (src: string): boolean => src.startsWith(STORAGE_AUDIO_PREFIX);
export const storagePathOf = (ref: string): string => ref.slice(STORAGE_AUDIO_PREFIX.length);

/** Firebase Storage, injected so the queue is tested without it (`firebase-remote-audio.ts`). */
export interface RemoteAudio {
  exists(path: string): Promise<boolean>;
  upload(path: string, blob: Blob, contentType: string): Promise<void>;
  download(path: string): Promise<Blob>;
  remove(path: string): Promise<void>;
}

const QueuedUploadSchema = z.object({
  ref: z.string().startsWith(STORAGE_AUDIO_PREFIX),
  contentType: z.string().min(1),
  attempts: z.number().int().nonnegative(),
});
export type QueuedUpload = z.infer<typeof QueuedUploadSchema>;

/** The persisted upload queue (one entry per ref, so the same bytes queue once). */
export interface UploadQueue {
  all(): Promise<QueuedUpload[]>;
  get(ref: string): Promise<QueuedUpload | null>;
  put(entry: QueuedUpload): Promise<void>;
  remove(ref: string): Promise<void>;
}

export class IdbUploadQueue implements UploadQueue {
  constructor(private readonly factory?: IDBFactory) {}

  async all(): Promise<QueuedUpload[]> {
    const db = await openDb(this.factory);
    const raw: unknown[] = await req(
      db.transaction(STORES.uploads).objectStore(STORES.uploads).getAll(),
    );
    return raw.flatMap((r) => {
      const p = QueuedUploadSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
  }

  async get(ref: string): Promise<QueuedUpload | null> {
    const db = await openDb(this.factory);
    const raw: unknown = await req(
      db.transaction(STORES.uploads).objectStore(STORES.uploads).get(ref),
    );
    const p = QueuedUploadSchema.safeParse(raw);
    return p.success ? p.data : null;
  }

  async put(entry: QueuedUpload): Promise<void> {
    const db = await openDb(this.factory);
    const tx = db.transaction(STORES.uploads, 'readwrite');
    tx.objectStore(STORES.uploads).put(entry, entry.ref);
    await done(tx);
  }

  async remove(ref: string): Promise<void> {
    const db = await openDb(this.factory);
    const tx = db.transaction(STORES.uploads, 'readwrite');
    tx.objectStore(STORES.uploads).delete(ref);
    await done(tx);
  }
}

/** For SSR, where nothing uploads. */
export class MemoryUploadQueue implements UploadQueue {
  private readonly entries = new Map<string, QueuedUpload>();
  async all(): Promise<QueuedUpload[]> {
    return [...this.entries.values()];
  }
  async get(ref: string): Promise<QueuedUpload | null> {
    return this.entries.get(ref) ?? null;
  }
  async put(entry: QueuedUpload): Promise<void> {
    this.entries.set(entry.ref, entry);
  }
  async remove(ref: string): Promise<void> {
    this.entries.delete(ref);
  }
}

/** Storage refused the read (no bucket CORS yet, signed out, or offline) and no local copy. */
export class AudioElsewhereError extends Error {
  constructor(cause?: unknown) {
    super('This voiceover lives on another device', { cause });
    this.name = 'AudioElsewhereError';
  }
}

export interface UploadStatus {
  /** Refs still waiting to upload. */
  pending: ReadonlySet<string>;
  /** Refs whose upload failed three times in this session (then: "Couldn't upload audio"). */
  failing: ReadonlySet<string>;
}

export interface HybridDeps {
  /** The local blob cache: `idb:` refs through `AudioStore`, `storage:` refs under raw keys. */
  local: AudioStore & KeyedBlobs;
  queue: UploadQueue;
  remote: () => Promise<RemoteAudio>;
  /** The signed-in uid, or null (then every ref stays `idb:`, as in local mode). */
  uid: () => string | null;
  /** Retry delays after the 1st, 2nd and 3rd failure; then the next app start (design §2.4). */
  delaysMs?: readonly number[];
  warn?: (msg: string, err: unknown) => void;
}

const DEFAULT_DELAYS = [1_000, 4_000, 15_000] as const;

export class HybridAudioStore implements AudioStore {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly waiting = new Map<string, Promise<void>>();
  private readonly sessionFailures = new Map<string, number>();
  private readonly pendingRefs = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private status: UploadStatus = { pending: new Set(), failing: new Set() };
  private readonly delays: readonly number[];
  private readonly warn: (msg: string, err: unknown) => void;

  constructor(private readonly d: HybridDeps) {
    this.delays = d.delaysMs ?? DEFAULT_DELAYS;
    this.warn = d.warn ?? ((m, e) => console.warn(m, e));
  }

  syncs(): boolean {
    return this.d.uid() !== null;
  }

  /**
   * Returns as soon as the bytes are in IndexedDB; the upload runs behind it. Without an
   * account, a place, or an uploadable type and size, the audio stays a local `idb:` ref.
   */
  async put(blob: Blob, place?: AudioPlace): Promise<string> {
    const uid = this.d.uid();
    const ext = voiceExtFor(blob.type);
    if (
      !place ||
      !uid ||
      !ext ||
      !isSafeId(uid) ||
      !isSafeId(place.projectId) ||
      blob.size <= 0 ||
      blob.size > MAX_VOICE_BYTES
    ) {
      return this.d.local.put(blob);
    }
    const bytes = await blob.arrayBuffer();
    const path = `users/${uid}/audio/${place.projectId}/${place.kind}-${await hash16(bytes)}.${ext}`;
    const ref = STORAGE_AUDIO_PREFIX + path;
    const contentType = CANONICAL_TYPE[ext];
    await this.d.local.putKey(ref, new Blob([bytes], { type: contentType }));
    if (!(await this.d.queue.get(ref))) await this.d.queue.put({ ref, contentType, attempts: 0 });
    this.markPending(ref);
    this.kick(ref);
    return ref;
  }

  /** Local copy first; else the account's copy, cached here for next time. */
  async get(ref: string): Promise<Blob | null> {
    if (!isStorageAudioRef(ref)) return isIdbAudioRef(ref) ? this.d.local.get(ref) : null;
    const cached = await this.d.local.getKey(ref);
    if (cached) return cached;
    let blob: Blob;
    try {
      blob = await (await this.d.remote()).download(storagePathOf(ref));
    } catch (err) {
      throw new AudioElsewhereError(err);
    }
    await this.d.local.putKey(ref, blob).catch((err: unknown) => this.warn('Audio cache', err));
    return blob;
  }

  /** Best effort on both sides; a queued upload of the ref is dropped first. */
  async delete(ref: string): Promise<void> {
    if (!isStorageAudioRef(ref)) return this.d.local.delete(ref);
    await this.d.queue.remove(ref).catch(() => undefined);
    this.markDone(ref);
    await this.d.local.deleteKey(ref).catch(() => undefined);
    // An upload already under way would land after the delete and leave an orphan (a project
    // deleted right after it was duplicated): let it finish, then remove.
    await this.idle([ref]);
    try {
      await (await this.d.remote()).remove(storagePathOf(ref));
    } catch (err) {
      this.warn('Storage audio delete failed', err);
    }
  }

  /** Puts a copy of `ref` under another project (duplicate, R1.9). */
  async copy(ref: string, place: AudioPlace): Promise<string> {
    const blob = await this.get(ref);
    if (!blob) throw new Error(`No audio for ${ref}`);
    return this.put(blob, place);
  }

  /** How many of these refs (or of all refs) still wait to upload. */
  pending(refs?: readonly string[]): number {
    if (!refs) return this.pendingRefs.size;
    return refs.filter((r) => this.pendingRefs.has(r)).length;
  }

  /** Starts every queued upload of the signed-in account (call on app start and after sign-in). */
  async resume(): Promise<void> {
    const uid = this.d.uid();
    if (!uid) return;
    const prefix = `${STORAGE_AUDIO_PREFIX}users/${uid}/`;
    for (const e of await this.d.queue.all()) {
      if (!e.ref.startsWith(prefix)) continue;
      this.sessionFailures.delete(e.ref);
      this.markPending(e.ref);
      this.kick(e.ref);
    }
  }

  /** Resolves when no upload attempt is running (the autosave flush; retries keep their queue). */
  async idle(refs?: readonly string[]): Promise<void> {
    const of = (m: Map<string, Promise<void>>) =>
      [...m].filter(([r]) => !refs || refs.includes(r)).map(([, p]) => p);
    while (of(this.inFlight).length > 0) await Promise.allSettled(of(this.inFlight));
  }

  /** Resolves when every upload has finished or used up this session's retries (tests). */
  async drained(): Promise<void> {
    while (this.inFlight.size > 0 || this.waiting.size > 0) {
      await Promise.allSettled([...this.inFlight.values(), ...this.waiting.values()]);
    }
  }

  uploadStatus(): UploadStatus {
    return this.status;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private kick(ref: string): void {
    if (this.inFlight.has(ref) || this.waiting.has(ref)) return;
    const run = this.attempt(ref).finally(() => this.inFlight.delete(ref));
    this.inFlight.set(ref, run);
  }

  private async attempt(ref: string): Promise<void> {
    const entry = await this.d.queue.get(ref);
    if (!entry) return this.markDone(ref);
    try {
      const blob = await this.d.local.getKey(ref);
      if (!blob) {
        // The bytes are gone from this browser (deleted project): nothing left to upload.
        await this.d.queue.remove(ref);
        return this.markDone(ref);
      }
      const remote = await this.d.remote();
      const path = storagePathOf(ref);
      // The path holds the content hash: an object already there is these bytes.
      if (!(await remote.exists(path))) await remote.upload(path, blob, entry.contentType);
      await this.d.queue.remove(ref);
      this.sessionFailures.delete(ref);
      this.markDone(ref);
    } catch (err) {
      const failures = (this.sessionFailures.get(ref) ?? 0) + 1;
      this.sessionFailures.set(ref, failures);
      await this.d.queue
        .put({ ...entry, attempts: entry.attempts + 1 })
        .catch((e: unknown) => this.warn('Upload queue write failed', e));
      this.warn(`Audio upload failed (attempt ${failures})`, err);
      this.emit();
      const delay = this.delays[failures - 1];
      // Out of retries for this session: the entry waits in IndexedDB for the next app start.
      if (delay === undefined) return;
      const wait = new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() => {
        this.waiting.delete(ref);
        this.kick(ref);
        return this.inFlight.get(ref);
      });
      this.waiting.set(ref, wait);
    }
  }

  private markPending(ref: string): void {
    if (this.pendingRefs.has(ref)) return;
    this.pendingRefs.add(ref);
    this.emit();
  }

  private markDone(ref: string): void {
    this.pendingRefs.delete(ref);
    this.sessionFailures.delete(ref);
    this.emit();
  }

  private emit(): void {
    const failing = new Set(
      [...this.sessionFailures].filter(([, n]) => n >= this.delays.length).map(([r]) => r),
    );
    this.status = { pending: new Set(this.pendingRefs), failing };
    for (const l of this.listeners) l();
  }
}
