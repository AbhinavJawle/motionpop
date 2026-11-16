import { EditorProjectSchema, type EditorProject, type ProjectSummary } from '@motionpop/schemas';
import { MemoryAudioStore, type AudioStore } from '../audio/audio-store';
import { audioRefsOf, summarise } from './summary';

/**
 * Where editor projects live (spec 04 R1.3). The IndexedDB implementation ships now;
 * Firestore implements the same interface once Firebase is set up (spec 01).
 * Every read is parsed with zod, which also checks the timeline invariants.
 */

export type LoadResult =
  | { ok: true; project: EditorProject }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'invalid'; issues: string[]; hasBackup: boolean };

export interface ProjectRepository {
  load(id: string): Promise<LoadResult>;
  /** Saves the project and keeps the previous good save as a backup. */
  save(project: EditorProject): Promise<void>;
  /** Replaces a corrupt current save with the backup. Returns the restored project. */
  restoreBackup(id: string): Promise<LoadResult>;
}

/** What a repository stores per project id. */
export interface StoredProject {
  current: unknown;
  previous?: unknown;
}

export function parseStored(
  raw: unknown,
): { ok: true; project: EditorProject } | { ok: false; issues: string[] } {
  const r = EditorProjectSchema.safeParse(raw);
  if (r.success) return { ok: true, project: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

export function loadFromStored(stored: StoredProject | undefined): LoadResult {
  if (!stored) return { ok: false, error: 'not-found' };
  const r = parseStored(stored.current);
  if (r.ok) return r;
  return {
    ok: false,
    error: 'invalid',
    issues: r.issues,
    hasBackup: stored.previous !== undefined,
  };
}

/** A save that failed zod, listed so the dashboard can offer Open and Delete (design §10). */
export interface DamagedProject {
  id: string;
  title: string;
  issues: string[];
}

export interface ProjectListing {
  /** Most recently edited first. */
  projects: ProjectSummary[];
  damaged: DamagedProject[];
}

/** The dashboard's view of the repository (spec 11 R1.4–R1.6, R1.9). */
export interface ProjectLibrary extends ProjectRepository {
  list(): Promise<ProjectListing>;
  /** Removes the project, its backup and every audio object it references. */
  delete(id: string): Promise<void>;
  /** A copy with a new id and its own copy of the audio. Returns the new id. */
  duplicate(id: string, newTitle: string): Promise<string>;
  /** Sets `lastOpenedAt` only: no backup rotation, `updatedAt` unchanged. */
  markOpened(id: string, atMs: number): Promise<void>;
  /** A new title as a normal save (the previous save stays the backup). */
  rename(id: string, title: string): Promise<void>;
}

export interface LibraryOptions {
  audio?: AudioStore;
  now?: () => number;
  newId?: () => string;
}

const randomId = (): string => crypto.randomUUID();

/**
 * The shared logic of the local repositories over a key-value backend. Subclasses only say how
 * a record is read, written, removed and enumerated.
 */
export abstract class StoredProjectRepository implements ProjectLibrary {
  protected readonly audio: AudioStore;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(opts: LibraryOptions & { defaultAudio: () => AudioStore }) {
    this.audio = opts.audio ?? opts.defaultAudio();
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? randomId;
  }

  protected abstract get(id: string): Promise<StoredProject | undefined>;
  protected abstract put(id: string, stored: StoredProject): Promise<void>;
  protected abstract remove(id: string): Promise<void>;
  protected abstract entries(): Promise<Array<[string, StoredProject]>>;

  async load(id: string): Promise<LoadResult> {
    return loadFromStored(await this.get(id));
  }

  async save(project: EditorProject): Promise<void> {
    const prev = await this.get(project.id);
    const keep = prev && parseStored(prev.current).ok ? prev.current : prev?.previous;
    await this.put(project.id, { current: structuredClone(project), previous: keep });
  }

  async restoreBackup(id: string): Promise<LoadResult> {
    const stored = await this.get(id);
    if (!stored?.previous) return { ok: false, error: 'not-found' };
    await this.put(id, { current: stored.previous });
    return loadFromStored({ current: stored.previous });
  }

  async list(): Promise<ProjectListing> {
    const projects: ProjectSummary[] = [];
    const damaged: DamagedProject[] = [];
    for (const [id, stored] of await this.entries()) {
      const r = parseStored(stored.current);
      if (r.ok) projects.push(summarise(r.project));
      else damaged.push({ id, title: looseTitle(stored.current), issues: r.issues });
    }
    projects.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return { projects, damaged };
  }

  async delete(id: string): Promise<void> {
    const stored = await this.get(id);
    if (!stored) return;
    // The record goes first: a project that points at missing audio would be worse than
    // orphaned audio, and a failed audio delete is retried by nobody but harmless.
    await this.remove(id);
    const refs = new Set([...audioRefsOf(stored.current), ...audioRefsOf(stored.previous)]);
    await Promise.all([...refs].map((ref) => this.audio.delete(ref).catch(() => undefined)));
  }

  async duplicate(id: string, newTitle: string): Promise<string> {
    const r = await this.load(id);
    if (!r.ok) throw new Error(`Can't duplicate project ${id}: ${r.error}`);
    const source = r.project;
    const copied = new Map<string, string>();
    try {
      for (const ref of audioRefsOf(source)) {
        const blob = await this.audio.get(ref);
        // Fixture voices (`synth:…`) are not stored blobs; the copy points at the same recipe.
        copied.set(ref, blob ? await this.audio.put(blob) : ref);
      }
      const now = this.now();
      const copy: EditorProject = structuredClone(source);
      copy.id = this.newId();
      copy.title = newTitle.slice(0, 80);
      copy.createdAt = now;
      copy.updatedAt = now;
      delete copy.lastOpenedAt;
      copy.voiceover.src = copied.get(source.voiceover.src) ?? source.voiceover.src;
      if (source.voiceover.originalSrc) {
        copy.voiceover.originalSrc =
          copied.get(source.voiceover.originalSrc) ?? source.voiceover.originalSrc;
      }
      await this.put(copy.id, { current: copy });
      return copy.id;
    } catch (err) {
      // Nothing is duplicated when an audio copy fails (design §10).
      await Promise.all(
        [...copied]
          .filter(([from, to]) => from !== to)
          .map(([, to]) => this.audio.delete(to).catch(() => undefined)),
      );
      throw err;
    }
  }

  async markOpened(id: string, atMs: number): Promise<void> {
    const stored = await this.get(id);
    if (!stored) return;
    const r = parseStored(stored.current);
    if (!r.ok) return;
    await this.put(id, { ...stored, current: { ...r.project, lastOpenedAt: atMs } });
  }

  async rename(id: string, title: string): Promise<void> {
    const next = title.trim().slice(0, 80);
    const r = await this.load(id);
    if (!r.ok) throw new Error(`Can't rename project ${id}: ${r.error}`);
    if (!next || next === r.project.title) return;
    await this.save({ ...r.project, title: next, updatedAt: this.now() });
  }
}

function looseTitle(raw: unknown): string {
  const t = typeof raw === 'object' && raw !== null ? (raw as { title?: unknown }).title : null;
  return typeof t === 'string' && t.trim().length > 0 ? t : 'Untitled Project';
}

/** In-memory repository for tests and the server render path. */
export class MemoryProjectRepository extends StoredProjectRepository {
  private readonly data = new Map<string, StoredProject>();

  constructor(opts: LibraryOptions = {}) {
    super({ ...opts, defaultAudio: () => new MemoryAudioStore() });
  }

  protected async get(id: string): Promise<StoredProject | undefined> {
    return this.data.get(id);
  }
  protected async put(id: string, stored: StoredProject): Promise<void> {
    this.data.set(id, stored);
  }
  protected async remove(id: string): Promise<void> {
    this.data.delete(id);
  }
  protected async entries(): Promise<Array<[string, StoredProject]>> {
    return [...this.data.entries()];
  }

  /** Test hook: write raw data, bypassing validation. */
  putRaw(id: string, stored: StoredProject): void {
    this.data.set(id, stored);
  }
}
