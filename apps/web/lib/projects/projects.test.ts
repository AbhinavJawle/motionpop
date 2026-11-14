import { IDBFactory } from 'fake-indexeddb';
import { timelineIssues } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { demoProject, demoWords } from './fixture';
import { IdbProjectRepository } from './idb-repository';
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
    const said = demoWords.slice(s.wordStart, s.wordEnd + 1).map((w) => w.text).join(' ');
    expect(said).toBe('revenue grew forty percent since 2020.');
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
});
