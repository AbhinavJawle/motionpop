import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IdbAudioStore, MemoryAudioStore, type AudioStore } from '../audio/audio-store';
import { demoProject } from './fixture';
import { IdbProjectRepository } from './idb-repository';
import { MemoryProjectRepository, type ProjectLibrary } from './repository';

/** Spec 11 task 3: list, delete, duplicate and markOpened, where data could be lost. */

let n = 0;
const ids = () => `p-${++n}`;

const makers: Array<[string, () => { repo: ProjectLibrary; audio: AudioStore }]> = [
  [
    'memory',
    () => {
      const audio = new MemoryAudioStore();
      return { repo: new MemoryProjectRepository({ audio, newId: ids, now: () => 500 }), audio };
    },
  ],
  [
    'indexeddb',
    () => {
      const factory = new IDBFactory();
      const audio = new IdbAudioStore(factory);
      return {
        repo: new IdbProjectRepository(factory, { audio, newId: ids, now: () => 500 }),
        audio,
      };
    },
  ],
];

const wav = (b: number) => new Blob([new Uint8Array([b, b, b])], { type: 'audio/wav' });
const bytes = async (blob: Blob | null) =>
  blob ? [...new Uint8Array(await blob.arrayBuffer())] : null;

/** The demo project with real stored audio, so delete and duplicate have something to own. */
async function seeded(audio: AudioStore, id = 'a', updatedAt = 10) {
  const original = await audio.put(wav(1));
  const cleaned = await audio.put(wav(2));
  const p = { ...demoProject(updatedAt), id, title: `Project ${id}`, updatedAt };
  p.voiceover = { ...p.voiceover, src: cleaned, originalSrc: original };
  return p;
}

describe.each(makers)('%s library', (_, make) => {
  it('lists summaries newest first and reports damaged saves', async () => {
    const { repo, audio } = make();
    await repo.save(await seeded(audio, 'old', 10));
    await repo.save(await seeded(audio, 'new', 20));
    const bad = structuredClone(await seeded(audio, 'bad', 30));
    bad.slots[1]!.startMs = 2000; // overlaps slot 1
    await repo.save(bad);

    const { projects, damaged } = await repo.list();
    expect(projects.map((p) => p.id)).toEqual(['new', 'old']);
    expect(projects[0]).toMatchObject({ title: 'Project new', slotCount: 4, lastOpenedAt: 20 });
    expect(projects[0]!.readySlotCount).toBeLessThanOrEqual(projects[0]!.slotCount);
    expect(damaged).toEqual([expect.objectContaining({ id: 'bad', title: 'Project bad' })]);
  });

  it('deletes the project, its backup and its audio, and nothing else', async () => {
    const { repo, audio } = make();
    const a = await seeded(audio, 'a');
    const b = await seeded(audio, 'b');
    await repo.save(a);
    await repo.save({ ...a, title: 'Edited' });
    await repo.save(b);

    await repo.delete('a');
    expect(await repo.load('a')).toEqual({ ok: false, error: 'not-found' });
    expect(await repo.restoreBackup('a')).toEqual({ ok: false, error: 'not-found' });
    expect(await audio.get(a.voiceover.src)).toBeNull();
    expect(await audio.get(a.voiceover.originalSrc!)).toBeNull();
    expect(await bytes(await audio.get(b.voiceover.src))).toEqual([2, 2, 2]);
    expect((await repo.list()).projects.map((p) => p.id)).toEqual(['b']);
  });

  it('duplicates with its own audio: deleting either copy leaves the other playable', async () => {
    const { repo, audio } = make();
    const a = await seeded(audio, 'a');
    await repo.save(a);

    const copyId = await repo.duplicate('a', 'Project a (copy)');
    const copy = await repo.load(copyId);
    if (!copy.ok) throw new Error('copy did not load');
    expect(copy.project).toMatchObject({ title: 'Project a (copy)', createdAt: 500 });
    expect(copy.project.slots).toEqual(a.slots);
    expect(copy.project.voiceover.src).not.toBe(a.voiceover.src);

    await repo.delete(copyId);
    expect(await bytes(await audio.get(a.voiceover.src))).toEqual([2, 2, 2]);
    expect(await bytes(await audio.get(a.voiceover.originalSrc!))).toEqual([1, 1, 1]);

    const second = await repo.duplicate('a', 'Again');
    await repo.delete('a');
    const left = await repo.load(second);
    if (!left.ok) throw new Error('second copy did not load');
    expect(await bytes(await audio.get(left.project.voiceover.src))).toEqual([2, 2, 2]);
    expect(await bytes(await audio.get(left.project.voiceover.originalSrc!))).toEqual([1, 1, 1]);
  });

  it('markOpened changes lastOpenedAt only and keeps the backup', async () => {
    const { repo, audio } = make();
    const a = await seeded(audio, 'a', 10);
    await repo.save(a);
    await repo.save({ ...a, title: 'Edited' });
    await repo.markOpened('a', 99);

    const r = await repo.load('a');
    expect(r.ok && r.project).toMatchObject({ title: 'Edited', updatedAt: 10, lastOpenedAt: 99 });
    expect((await repo.list()).projects[0]?.lastOpenedAt).toBe(99);
    const restored = await repo.restoreBackup('a');
    expect(restored.ok && restored.project.title).toBe('Project a');
  });
});
