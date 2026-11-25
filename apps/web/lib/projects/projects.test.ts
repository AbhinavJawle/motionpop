import { IDBFactory } from 'fake-indexeddb';
import { timelineIssues } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { MemoryAudioStore } from '../audio/audio-store';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { demoProject, demoWords } from './fixture';
import { IdbProjectRepository } from './idb-repository';
import { PERF_SLOTS, PERF_WORDS, perfProject } from './perf-fixture';
import { MemoryProjectRepository, type ProjectRepository } from './repository';

describe('demo fixture', () => {
  it('parses and satisfies the timeline invariants', () => {
    const p = demoProject();
    expect(timelineIssues(p)).toEqual([]);
    expect(p.slots.map((s) => s.status)).toEqual(['suggested', 'ready', 'generating', 'ready']);
  });

  it('matches the design inspector for slot 2 (0:04.2 – 0:07.8, "revenue grew forty percent since 2020")', () => {
    const s = demoProject().slots[1]!;
    expect([s.startMs, s.endMs]).toEqual([4200, 7800]);
    const said = demoWords
      .slice(s.wordStart, s.wordEnd + 1)
      .map((w) => w.text)
      .join(' ');
    expect(said).toBe('revenue grew forty percent since 2020.');
  });

  it('stores the demo note relative to its slot and finds it at playhead 5600 (D-048)', () => {
    const p = demoProject();
    const slot = p.slots[1]!;
    const note = slot.notes[0]!;
    expect(note.tMs).toBe(1400);
    const playhead = 5600;
    expect(playhead).toBeGreaterThanOrEqual(slot.startMs);
    expect(playhead).toBeLessThan(slot.endMs);
    expect(slot.notes.find((n) => n.tMs === playhead - slot.startMs)?.id).toBe('note-1');
    // No other slot carries it.
    expect(p.slots.filter((s) => s.notes.some((n) => n.id === 'note-1'))).toHaveLength(1);
  });

  it('keeps every word inside the voiceover and in order', () => {
    for (let i = 0; i < demoWords.length; i++) {
      const w = demoWords[i]!;
      expect(w.endMs).toBeGreaterThan(w.startMs);
      if (i > 0) expect(w.startMs).toBeGreaterThanOrEqual(demoWords[i - 1]!.endMs);
    }
    expect(demoWords.at(-1)!.endMs).toBeLessThanOrEqual(demoProject().durationMs);
  });
});

describe('synthetic voice', () => {
  const words = demoWords.slice(0, 5);
  it('is deterministic for a seed and silent between words', () => {
    const a = synthVoice(words, 3000, 7);
    const b = synthVoice(words, 3000, 7);
    expect(a).toEqual(b);
    const rate = 22_050;
    const gap = a.subarray(Math.floor(0.45 * rate), Math.floor(0.51 * rate));
    expect(Math.max(...gap.map(Math.abs))).toBe(0);
    const inWord = a.subarray(Math.floor(0.6 * rate), Math.floor(0.9 * rate));
    expect(Math.max(...inWord.map(Math.abs))).toBeGreaterThan(0.1);
  });

  it('encodes a valid 16-bit mono WAV header', () => {
    const wav = new DataView(encodeWav(new Float32Array(100)));
    expect(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4))).toBe('RIFF');
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.byteLength).toBe(44 + 200);
  });
});

const repos: Array<[string, () => ProjectRepository]> = [
  ['memory', () => new MemoryProjectRepository()],
  ['indexeddb', () => new IdbProjectRepository(new IDBFactory())],
];

describe.each(repos)('%s repository', (_, make) => {
  it('round-trips a project', async () => {
    const repo = make();
    expect(await repo.load('demo')).toEqual({ ok: false, error: 'not-found' });
    const p = demoProject(123);
    await repo.save(p);
    expect(await repo.load('demo')).toEqual({ ok: true, project: p });
  });

  it('keeps the previous good save and restores it', async () => {
    const repo = make();
    const v1 = demoProject(1);
    const v2 = { ...demoProject(2), title: 'Second' };
    await repo.save(v1);
    await repo.save(v2);
    const restored = await repo.restoreBackup('demo');
    expect(restored).toEqual({ ok: true, project: v1 });
  });

  it('rejects an invalid save on load (overlapping slots) with a typed error', async () => {
    const repo = make();
    const good = demoProject(1);
    await repo.save(good);
    const bad = structuredClone(good);
    bad.slots[1]!.startMs = 2000; // overlaps slot 1
    await repo.save(bad);
    const r = await repo.load('demo');
    expect(r.ok).toBe(false);
    if (!r.ok && r.error === 'invalid') {
      expect(r.hasBackup).toBe(true);
      expect(r.issues.join('\n')).toMatch(/overlap/);
    } else {
      throw new Error(`expected invalid, got ${JSON.stringify(r)}`);
    }
    expect(await repo.restoreBackup('demo')).toEqual({ ok: true, project: good });
  });

  it('duplicate() remaps stock/video/mediaBin/music blobs and delete() frees all of them (H11)', async () => {
    const audio = new MemoryAudioStore();
    const repo = new MemoryProjectRepository({ audio });
    const voiceRef = await audio.put(new Blob(['voice'], { type: 'audio/wav' }));
    const ovRef = await audio.put(new Blob(['overlay'], { type: 'video/mp4' }));
    const auRef = await audio.put(new Blob(['sfx'], { type: 'audio/mpeg' }));
    const base = demoProject(1);
    const orig = {
      ...base,
      voiceover: { ...base.voiceover, src: voiceRef },
      stockOverlays: [
        {
          id: 'ov1',
          name: 'Clip',
          src: ovRef,
          kind: 'video' as const,
          mimeType: 'video/mp4',
          startMs: 0,
          endMs: 2000,
          layout: 'card' as const,
          provider: 'upload' as const,
        },
      ],
      stockAudio: [
        {
          id: 'sa1',
          name: 'Whoosh',
          src: auRef,
          kind: 'sfx' as const,
          mimeType: 'audio/mpeg',
          startMs: 0,
          endMs: 1000,
          volume: 0.9,
          provider: 'upload' as const,
        },
      ],
    };
    await repo.save(orig);
    const copyId = await repo.duplicate(orig.id, 'Copy');
    const loaded = await repo.load(copyId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const copyOvRef = loaded.project.stockOverlays![0]!.src;
    const copyAuRef = loaded.project.stockAudio![0]!.src;
    expect(copyOvRef).not.toBe(ovRef);
    expect(copyAuRef).not.toBe(auRef);

    // Deleting the original must not break the duplicate's blobs.
    await repo.delete(orig.id);
    expect(await audio.get(ovRef)).toBeNull();
    expect(await audio.get(auRef)).toBeNull();
    expect(await audio.get(copyOvRef)).not.toBeNull();
    expect(await audio.get(copyAuRef)).not.toBeNull();

    // Deleting the duplicate frees its own blobs.
    await repo.delete(copyId);
    expect(await audio.get(copyOvRef)).toBeNull();
    expect(await audio.get(copyAuRef)).toBeNull();
  });
});

describe('perfProject', () => {
  it('is a valid 3,000-word, 50-slot project', () => {
    const p = perfProject();
    expect(p.transcript.words).toHaveLength(PERF_WORDS);
    expect(p.slots).toHaveLength(PERF_SLOTS);
    expect(timelineIssues(p)).toEqual([]);
    expect(perfProject()).toEqual(p); // deterministic
  });
});
