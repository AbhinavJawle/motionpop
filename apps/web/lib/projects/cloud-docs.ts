import {
  EditorProjectSchema,
  FormatSchema,
  type EditorProject,
  type ProjectSummary,
} from '@motionpop/schemas';
import { z } from 'zod';
import { summarise } from './summary';

/**
 * The Firestore shape of a project (spec 11 R1, design §2.1, simplified in D-068):
 *
 *   projects/{id}                  summary fields (for the dashboard query) + `bodyJson`
 *   projects/{id}/transcript/main  { json }   (and `original` when the project keeps one)
 *   projects/{id}/slots/{slotId}   { json, startMs }
 *   projects/{id}/versions/{vid}   { json }
 *
 * Bodies are JSON strings instead of field-per-field documents: Firestore refuses nested arrays
 * and `undefined`, and component params are free-form, so a string is the one shape that always
 * round-trips. The split still keeps each document far below 1 MB and lets a save write only what
 * changed. Every read is parsed with zod, then the whole project with `EditorProjectSchema`.
 */
export const CLOUD_SCHEMA_VERSION = 1;

const IntMs = z.number().int().nonnegative();

export const CloudProjectDocSchema = z.object({
  schemaVersion: z.literal(CLOUD_SCHEMA_VERSION),
  ownerId: z.string().min(1),
  title: z.string().min(1).max(80),
  format: FormatSchema,
  styleId: z.string().min(1),
  durationMs: IntMs,
  status: z.enum(['draft', 'processing', 'ready']),
  slotCount: IntMs,
  readySlotCount: IntMs,
  slotStates: z.array(z.enum(['ready', 'pending'])).max(12),
  graphicsGenerated: IntMs,
  lastOpenedAt: IntMs,
  createdAt: IntMs,
  updatedAt: IntMs,
  bodyJson: z.string().max(900_000),
});
export type CloudProjectDoc = z.infer<typeof CloudProjectDocSchema>;

export const CloudSubDocSchema = z.object({ json: z.string().max(900_000) });
export type CloudSubDoc = z.infer<typeof CloudSubDocSchema> & { startMs?: number };

export type SubCollection = 'transcript' | 'slots' | 'versions';
export const SUB_COLLECTIONS: readonly SubCollection[] = ['transcript', 'slots', 'versions'];

export interface CloudSet {
  project: CloudProjectDoc;
  subs: Record<SubCollection, Map<string, CloudSubDoc>>;
}

export type CloudWrite =
  | { op: 'set'; path: { sub: SubCollection; id: string } | null; data: object }
  | { op: 'delete'; path: { sub: SubCollection; id: string } };

/** Stable JSON: sorted keys, so equal values always compare equal (diffs and tests). */
export function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : x,
  );
}

export function toCloud(p: EditorProject, ownerId: string): CloudSet {
  const { slots, versions, transcript, originalTranscript, ...rest } = p;
  const s: ProjectSummary = summarise(p);
  const transcripts = new Map<string, CloudSubDoc>([['main', { json: canonical(transcript) }]]);
  if (originalTranscript) transcripts.set('original', { json: canonical(originalTranscript) });
  return {
    project: {
      schemaVersion: CLOUD_SCHEMA_VERSION,
      ownerId,
      title: s.title,
      format: s.format,
      styleId: s.styleId,
      durationMs: s.durationMs,
      status: s.status,
      slotCount: s.slotCount,
      readySlotCount: s.readySlotCount,
      slotStates: s.slotStates,
      graphicsGenerated: s.graphicsGenerated,
      lastOpenedAt: s.lastOpenedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      bodyJson: canonical({ ...rest, ownerId }),
    },
    subs: {
      transcript: transcripts,
      slots: new Map(slots.map((x) => [x.id, { json: canonical(x), startMs: x.startMs }])),
      versions: new Map(versions.map((v) => [v.id, { json: canonical(v) }])),
    },
  };
}

export type CloudParse = { ok: true; project: EditorProject } | { ok: false; issues: string[] };

const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
};

/** Parses every part, then the whole project with the refined schema (timeline issues run). */
export function fromCloud(
  project: unknown,
  subs: Record<SubCollection, Map<string, unknown>>,
): CloudParse {
  const head = CloudProjectDocSchema.safeParse(project);
  if (!head.success) return { ok: false, issues: ['project: ' + head.error.issues[0]?.message] };
  const body = parseJson(head.data.bodyJson);
  const part = (sub: SubCollection, id: string): unknown => {
    const d = CloudSubDocSchema.safeParse(subs[sub].get(id));
    return d.success ? parseJson(d.data.json) : undefined;
  };
  const list = (sub: SubCollection) =>
    [...subs[sub].keys()].map((id) => part(sub, id)).filter((x) => x !== undefined);
  const slots = list('slots') as Array<{ startMs?: number }>;
  slots.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  const original = subs.transcript.has('original') ? part('transcript', 'original') : undefined;
  const r = EditorProjectSchema.safeParse({
    ...(typeof body === 'object' && body !== null ? body : {}),
    transcript: part('transcript', 'main'),
    ...(original !== undefined ? { originalTranscript: original } : {}),
    slots,
    versions: list('versions'),
  });
  if (r.success) return { ok: true, project: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/**
 * The writes that turn `prev` (what the cloud holds, or null for a new project) into `next`:
 * changed or new documents are set, missing ones deleted, and the project document always comes
 * last so a reader never sees a summary ahead of its slots.
 */
export function diffCloud(prev: CloudSet | null, next: CloudSet): CloudWrite[] {
  const out: CloudWrite[] = [];
  for (const sub of SUB_COLLECTIONS) {
    const before = prev?.subs[sub] ?? new Map<string, CloudSubDoc>();
    const after = next.subs[sub];
    for (const [id, doc] of after) {
      if (before.get(id)?.json !== doc.json) out.push({ op: 'set', path: { sub, id }, data: doc });
    }
    for (const id of before.keys()) {
      if (!after.has(id)) out.push({ op: 'delete', path: { sub, id } });
    }
  }
  if (out.length > 0 || !prev || canonical(prev.project) !== canonical(next.project)) {
    out.push({ op: 'set', path: null, data: next.project });
  }
  return out;
}

/** The dashboard summary straight from a project document (no sub-collection reads). */
export function summaryFromDoc(id: string, raw: unknown): ProjectSummary | null {
  const d = CloudProjectDocSchema.safeParse(raw);
  if (!d.success) return null;
  const { ownerId, bodyJson, schemaVersion, ...summary } = d.data;
  void ownerId;
  void bodyJson;
  void schemaVersion;
  return { id, ...summary };
}
