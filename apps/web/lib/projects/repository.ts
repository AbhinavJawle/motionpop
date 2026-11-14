import { EditorProjectSchema, type EditorProject } from '@motionpop/schemas';

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

export function parseStored(raw: unknown): { ok: true; project: EditorProject } | { ok: false; issues: string[] } {
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
  return { ok: false, error: 'invalid', issues: r.issues, hasBackup: stored.previous !== undefined };
}

/** In-memory repository for tests and the server render path. */
export class MemoryProjectRepository implements ProjectRepository {
  private readonly data = new Map<string, StoredProject>();

  async load(id: string): Promise<LoadResult> {
    return loadFromStored(this.data.get(id));
  }

  async save(project: EditorProject): Promise<void> {
    const prev = this.data.get(project.id);
    const keep = prev && parseStored(prev.current).ok ? prev.current : prev?.previous;
    this.data.set(project.id, { current: structuredClone(project), previous: keep });
  }

  async restoreBackup(id: string): Promise<LoadResult> {
    const stored = this.data.get(id);
    if (!stored?.previous) return { ok: false, error: 'not-found' };
    this.data.set(id, { current: stored.previous });
    return loadFromStored({ current: stored.previous });
  }

  /** Test hook: write raw data, bypassing validation. */
  putRaw(id: string, stored: StoredProject): void {
    this.data.set(id, stored);
  }
}
