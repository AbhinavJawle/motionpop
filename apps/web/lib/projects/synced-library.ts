import type { EditorProject, ProjectSummary } from '@motionpop/schemas';
import {
  diffCloud,
  fromCloud,
  summaryFromDoc,
  toCloud,
  type CloudSet,
  type CloudWrite,
  type SubCollection,
} from './cloud-docs';
import type { LoadResult } from './repository';
import type { ProjectLibrary, ProjectListing } from './repository';

/**
 * The cloud side, injected so the sync logic is tested without Firestore (the real one is
 * `firestore-cloud.ts`). Reads return raw documents; `fromCloud` parses them.
 */
export interface CloudStore {
  /** The project document and every sub-document, or null when the project isn't in the cloud. */
  readSet(
    id: string,
  ): Promise<{ project: unknown; subs: Record<SubCollection, Map<string, unknown>> } | null>;
  /** Just the project document (summary + updatedAt), or null. */
  readHead(id: string): Promise<unknown>;
  /** Applies writes in order; batches of at most 450 with the project document in the last. */
  commit(id: string, writes: CloudWrite[], opts?: { isNew?: boolean }): Promise<void>;
  /** The owner's project documents (id → raw doc). */
  listOwned(uid: string): Promise<Array<[string, unknown]>>;
  /** Deletes the project with every sub-collection (server route). */
  remove(id: string): Promise<void>;
  /** Sets `lastOpenedAt` only. */
  touch(id: string, atMs: number): Promise<void>;
}

export interface SyncDeps {
  local: ProjectLibrary;
  cloud: CloudStore;
  /** The signed-in uid, or null (then this is the local library and nothing more). */
  uid: () => string | null;
  /** Resolves when sign-in state is known, so a first load doesn't miss the cloud copy. */
  ready?: () => Promise<void>;
  /** Remote failures are logged, never thrown into the editor (the local save already worked). */
  warn?: (msg: string, err: unknown) => void;
}

/**
 * Local first, cloud mirrored (spec 11 R1.1–R1.4): every save lands in IndexedDB at once and is
 * pushed to Firestore in the background, one push at a time per project, writing only the
 * documents that changed. Opening a project takes whichever copy is newer, so a project made on
 * another device opens here and a project made offline uploads on the next save.
 */
export class SyncedLibrary implements ProjectLibrary {
  private readonly known = new Map<string, CloudSet | null>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly warn: (msg: string, err: unknown) => void;

  constructor(private readonly d: SyncDeps) {
    this.warn = d.warn ?? ((m, e) => console.warn(m, e));
  }

  /** Resolves when every queued push has settled (tests and the autosave flush). */
  async idle(): Promise<void> {
    while (this.queues.size > 0) await Promise.allSettled([...this.queues.values()]);
  }

  async load(id: string): Promise<LoadResult> {
    await this.d.ready?.();
    const local = await this.d.local.load(id);
    const uid = this.d.uid();
    if (!uid) return local;
    let head: unknown;
    try {
      head = await this.d.cloud.readHead(id);
    } catch (err) {
      this.warn('Cloud project head failed; opening the local copy', err);
      return local;
    }
    const remoteUpdated = updatedAtOf(head);
    if (remoteUpdated === null) {
      // Not in the cloud yet: upload what we have (a project made before sign-in or offline).
      if (local.ok && ownedBy(local.project, uid)) this.push(local.project, uid);
      return local;
    }
    if (local.ok && local.project.updatedAt >= remoteUpdated) {
      if (local.project.updatedAt > remoteUpdated) this.push(local.project, uid);
      return local;
    }
    try {
      const set = await this.d.cloud.readSet(id);
      if (!set) return local;
      const r = fromCloud(set.project, set.subs);
      if (!r.ok) {
        this.warn('Cloud project did not parse; opening the local copy', r.issues);
        return local;
      }
      this.known.set(id, toCloud(r.project, uid));
      await this.d.local.save(r.project);
      return { ok: true, project: r.project };
    } catch (err) {
      this.warn('Cloud project read failed; opening the local copy', err);
      return local;
    }
  }

  async save(project: EditorProject): Promise<void> {
    await this.d.local.save(project);
    const uid = this.d.uid();
    if (uid && ownedBy(project, uid)) this.push(project, uid);
  }

  restoreBackup(id: string): Promise<LoadResult> {
    return this.d.local.restoreBackup(id);
  }

  async list(): Promise<ProjectListing> {
    await this.d.ready?.();
    const local = await this.d.local.list();
    const uid = this.d.uid();
    if (!uid) return local;
    let remote: ProjectSummary[] = [];
    try {
      remote = (await this.d.cloud.listOwned(uid))
        .map(([id, raw]) => summaryFromDoc(id, raw))
        .filter((s): s is ProjectSummary => s !== null);
    } catch (err) {
      this.warn('Cloud project list failed; showing this browser only', err);
      return local;
    }
    const byId = new Map<string, ProjectSummary>();
    for (const s of [...local.projects, ...remote]) {
      const had = byId.get(s.id);
      if (!had || s.updatedAt > had.updatedAt) byId.set(s.id, s);
    }
    const projects = [...byId.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
    );
    return { projects, damaged: local.damaged };
  }

  async delete(id: string): Promise<void> {
    const uid = this.d.uid();
    if (uid) {
      await this.queues.get(id)?.catch(() => undefined);
      await this.d.cloud.remove(id);
      this.known.delete(id);
    }
    await this.d.local.delete(id);
  }

  async duplicate(id: string, newTitle: string): Promise<string> {
    const r = await this.load(id);
    if (!r.ok) throw new Error(`Can't duplicate project ${id}: ${r.error}`);
    const copyId = await this.d.local.duplicate(id, newTitle);
    const copy = await this.d.local.load(copyId);
    const uid = this.d.uid();
    if (uid && copy.ok) this.push(copy.project, uid);
    return copyId;
  }

  async markOpened(id: string, atMs: number): Promise<void> {
    await this.d.local.markOpened(id, atMs);
    const uid = this.d.uid();
    if (uid && this.known.get(id)) {
      await this.d.cloud
        .touch(id, atMs)
        .catch((err: unknown) => this.warn('Cloud touch failed', err));
    }
  }

  async rename(id: string, title: string): Promise<void> {
    await this.d.local.rename(id, title);
    const r = await this.d.local.load(id);
    const uid = this.d.uid();
    if (uid && r.ok) this.push(r.project, uid);
  }

  /** Queues a push of `project` behind any running push of the same id. */
  private push(project: EditorProject, uid: string): void {
    const id = project.id;
    const run = (this.queues.get(id) ?? Promise.resolve()).then(async () => {
      try {
        if (!this.known.has(id)) {
          const set = await this.d.cloud.readSet(id);
          const parsed = set ? fromCloud(set.project, set.subs) : null;
          this.known.set(id, parsed?.ok ? toCloud(parsed.project, uid) : null);
          // An unparseable cloud copy: rewrite every doc we hold, and drop the strays we know of.
          if (set && !parsed?.ok) this.known.set(id, strayOnly(set.subs));
        }
        const next = toCloud(project, uid);
        const prev = this.known.get(id) ?? null;
        const writes = diffCloud(prev, next);
        if (writes.length === 0) return;
        await this.d.cloud.commit(id, writes, { isNew: prev === null });
        this.known.set(id, next);
      } catch (err) {
        // Forget what we thought the cloud held, so the next save diffs from a fresh read.
        this.known.delete(id);
        this.warn('Cloud save failed; the project is safe in this browser', err);
      }
    });
    const tracked = run.finally(() => {
      if (this.queues.get(id) === tracked) this.queues.delete(id);
    });
    this.queues.set(id, tracked);
  }
}

function updatedAtOf(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const u = (raw as { updatedAt?: unknown }).updatedAt;
  return typeof u === 'number' && Number.isFinite(u) ? u : null;
}

/** A project that names another owner is never pushed under this account. */
function ownedBy(p: EditorProject, uid: string): boolean {
  return !p.ownerId || p.ownerId === uid;
}

/** A diff base that only knows which sub-documents exist, so the next push deletes strays. */
function strayOnly(subs: Record<SubCollection, Map<string, unknown>>): CloudSet {
  const empty = (m: Map<string, unknown>) => new Map([...m.keys()].map((k) => [k, { json: '' }]));
  return {
    project: null as unknown as CloudSet['project'],
    subs: {
      transcript: empty(subs.transcript),
      slots: empty(subs.slots),
      versions: empty(subs.versions),
    },
  };
}
