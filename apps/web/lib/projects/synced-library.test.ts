import { describe, expect, it, vi } from 'vitest';
import { demoProject } from './fixture';
import {
  canonical,
  diffCloud,
  fromCloud,
  toCloud,
  type CloudWrite,
  type SubCollection,
} from './cloud-docs';
import { MemoryProjectRepository } from './repository';
import { SyncedLibrary, type CloudStore } from './synced-library';

/** Firestore in a Map: `projects/{id}` and `projects/{id}/{sub}/{doc}`. */
function memoryCloud() {
  const docs = new Map<string, unknown>();
  const commits: CloudWrite[][] = [];
  const subsOf = (id: string) => {
    const out = { transcript: new Map(), slots: new Map(), versions: new Map() } as Record<
      SubCollection,
      Map<string, unknown>
    >;
    for (const [k, v] of docs) {
      const m = k.split('/');
      if (m.length === 4 && m[1] === id) out[m[2] as SubCollection].set(m[3] as string, v);
    }
    return out;
  };
  const store: CloudStore = {
    readHead: async (id) => docs.get(`projects/${id}`) ?? null,
    readSet: async (id) =>
      docs.has(`projects/${id}`) ? { project: docs.get(`projects/${id}`), subs: subsOf(id) } : null,
    commit: async (id, writes) => {
      commits.push(writes);
      for (const w of writes) {
        const key = w.path ? `projects/${id}/${w.path.sub}/${w.path.id}` : `projects/${id}`;
        if (w.op === 'set') docs.set(key, structuredClone(w.data));
        else docs.delete(key);
      }
    },
    listOwned: async (uid) =>
      [...docs]
        .filter(([k, v]) => k.split('/').length === 2 && (v as { ownerId: string }).ownerId === uid)
        .map(([k, v]) => [k.split('/')[1] as string, v]),
    remove: async (id) => {
      for (const k of [...docs.keys()])
        if (k === `projects/${id}` || k.startsWith(`projects/${id}/`)) docs.delete(k);
    },
    touch: async (id, atMs) => {
      const d = docs.get(`projects/${id}`) as Record<string, unknown> | undefined;
      if (d) d['lastOpenedAt'] = atMs;
    },
  };
  return { store, docs, commits };
}

function lib(cloud: CloudStore, uid: string | null = 'u1', local = new MemoryProjectRepository()) {
  return { local, sync: new SyncedLibrary({ local, cloud, uid: () => uid, warn: () => {} }) };
}

describe('cloud docs (D-068)', () => {
  it('round-trips the demo project through the cloud shape', () => {
    const p = demoProject(1000);
    const set = toCloud(p, 'u1');
    const r = fromCloud(set.project, set.subs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(canonical(r.project)).toBe(canonical({ ...p, ownerId: 'u1' }));
  });

  it('writes only what changed, the project document last', () => {
    const p = demoProject(1000);
    const before = toCloud(p, 'u1');
    const first = diffCloud(null, before);
    expect(first.at(-1)).toMatchObject({ op: 'set', path: null });
    expect(diffCloud(before, before)).toEqual([]);
    const moved = structuredClone(p);
    moved.slots[0]!.endMs -= 100;
    moved.slots.pop();
    moved.updatedAt += 1;
    const w = diffCloud(before, toCloud(moved, 'u1'));
    expect(w.map((x) => [x.op, x.path?.sub ?? 'project'])).toEqual([
      ['set', 'slots'],
      ['delete', 'slots'],
      ['set', 'project'],
    ]);
  });
});

describe('SyncedLibrary', () => {
  it('saves locally at once and mirrors to the cloud for the owner', async () => {
    const c = memoryCloud();
    const { sync, local } = lib(c.store);
    const p = demoProject(1000);
    await sync.save(p);
    expect((await local.load(p.id)).ok).toBe(true);
    await sync.idle();
    expect(c.docs.get(`projects/${p.id}`)).toMatchObject({
      ownerId: 'u1',
      slotCount: p.slots.length,
    });
    // A second identical save writes nothing.
    await sync.save(p);
    await sync.idle();
    expect(c.commits).toHaveLength(1);
  });

  it('opens a project made on another device and keeps it locally', async () => {
    const c = memoryCloud();
    const a = lib(c.store);
    await a.sync.save(demoProject(1000));
    await a.sync.idle();
    const b = lib(c.store);
    const r = await b.sync.load('demo');
    expect(r.ok && r.project.slots.length).toBe(demoProject().slots.length);
    expect((await b.local.load('demo')).ok).toBe(true);
    const listing = await b.sync.list();
    expect(listing.projects.map((s) => s.id)).toEqual(['demo']);
  });

  it('takes the newer copy and uploads a local project the cloud lacks', async () => {
    const c = memoryCloud();
    const local = new MemoryProjectRepository();
    await local.save({ ...demoProject(1000), updatedAt: 5000 });
    const { sync } = lib(c.store, 'u1', local);
    const r = await sync.load('demo');
    expect(r.ok && r.project.updatedAt).toBe(5000);
    await sync.idle();
    expect(c.docs.has('projects/demo')).toBe(true);
  });

  it('signed out, it is the local library; a cloud failure never breaks a save', async () => {
    const c = memoryCloud();
    const out = lib(c.store, null);
    await out.sync.save(demoProject(1000));
    await out.sync.idle();
    expect(c.docs.size).toBe(0);
    const broken = { ...c.store, readSet: async () => Promise.reject(new Error('offline')) };
    const on = lib(broken);
    await expect(on.sync.save(demoProject(1000))).resolves.toBeUndefined();
    await on.sync.idle();
    expect((await on.local.load('demo')).ok).toBe(true);
  });

  it('never pushes a project that belongs to someone else', async () => {
    const c = memoryCloud();
    const { sync } = lib(c.store);
    await sync.save({ ...demoProject(1000), ownerId: 'u2' });
    await sync.idle();
    expect(c.docs.size).toBe(0);
  });

  it('deletes in the cloud and locally', async () => {
    const c = memoryCloud();
    const { sync, local } = lib(c.store);
    await sync.save(demoProject(1000));
    await sync.idle();
    await sync.delete('demo');
    expect(c.docs.size).toBe(0);
    expect((await local.load('demo')).ok).toBe(false);
  });

  it('skips cloud reads, list entries, renames, and deletes for local projects owned by another uid', async () => {
    const c = memoryCloud();
    const local = new MemoryProjectRepository();
    const readHead = vi.fn(c.store.readHead);
    const readSet = vi.fn(c.store.readSet);
    const remove = vi.fn(c.store.remove);
    const warn = vi.fn();
    const guardedCloud: CloudStore = { ...c.store, readHead, readSet, remove };

    // Account u1 creates a project on this browser; save stamps ownerId: 'u1' locally too.
    const u1 = new SyncedLibrary({ local, cloud: guardedCloud, uid: () => 'u1', warn });
    await u1.save({ ...demoProject(1000), id: 'p-u1' });
    await u1.idle();
    const storedU1 = await local.load('p-u1');
    expect(storedU1.ok && storedU1.project.ownerId).toBe('u1');

    // Also add an unowned local draft (created while signed out).
    await local.save({ ...demoProject(1200), id: 'p-draft' });

    readHead.mockClear();
    readSet.mockClear();
    remove.mockClear();
    warn.mockClear();

    // Account u2 signs in on the same browser.
    const u2 = new SyncedLibrary({ local, cloud: guardedCloud, uid: () => 'u2', warn });

    // Dashboard listing hides u1's project, keeping only u2's projects + unowned local drafts.
    const listing = await u2.list();
    expect(listing.projects.map((p) => p.id)).toEqual(['p-draft']);

    // Direct load of u1's local project returns the local copy without hitting Firestore.
    const loaded = await u2.load('p-u1');
    expect(loaded.ok && loaded.project.id).toBe('p-u1');
    expect(readHead).not.toHaveBeenCalled();
    expect(readSet).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    // Renaming or deleting u1's local copy never calls Firestore/delete route as u2.
    await u2.rename('p-u1', 'Local rename');
    await u2.idle();
    expect(c.docs.get('projects/p-u1')).toMatchObject({ ownerId: 'u1' });
    await u2.delete('p-u1');
    expect(remove).not.toHaveBeenCalled();
    expect(c.docs.has('projects/p-u1')).toBe(true);
  });
});
