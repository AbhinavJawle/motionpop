import { describe, expect, it } from 'vitest';
import { prosody, stressedCount } from './prosody';

const RATE = 24_000;

/** Words as tone bursts: [text, amplitude, Hz, length ms], separated by `gapMs` of silence. */
function voice(
  spec: [string, number, number, number][],
  gapMs = 80,
  gaps: Record<number, number> = {},
) {
  const words: { text: string; startMs: number; endMs: number }[] = [];
  const chunks: number[] = [];
  let t = 0;
  spec.forEach(([text, amp, hz, ms], i) => {
    const n = Math.round((ms / 1000) * RATE);
    for (let k = 0; k < n; k++) chunks.push(amp * Math.sin((2 * Math.PI * hz * k) / RATE));
    words.push({ text, startMs: t, endMs: t + ms });
    t += ms;
    const gap = gaps[i] ?? gapMs;
    for (let k = 0; k < Math.round((gap / 1000) * RATE); k++) chunks.push(0);
    t += gap;
  });
  return { pcm: Float32Array.from(chunks), words };
}

describe('prosody', () => {
  it('scores a louder, higher, longer word as the most stressed', () => {
    const { pcm, words } = voice([
      ['our', 0.2, 120, 200],
      ['revenue', 0.2, 125, 420],
      ['grew', 0.2, 118, 220],
      ['forty', 0.55, 190, 520],
      ['percent', 0.22, 122, 380],
      ['since', 0.2, 120, 240],
    ]);
    const p = prosody(pcm, RATE, words);
    expect(p.stress).toHaveLength(6);
    expect(Math.max(...p.stress)).toBe(p.stress[3]);
    expect(p.stress[3]).toBeGreaterThanOrEqual(70);
    expect(stressedCount(p)).toBe(1);
    for (const s of p.stress) expect(Number.isInteger(s) && s >= 0 && s <= 100).toBe(true);
  });

  it('finds pauses of 300 ms or longer and ignores short gaps', () => {
    const { pcm, words } = voice(
      [
        ['one', 0.3, 130, 250],
        ['two', 0.3, 130, 250],
        ['three', 0.3, 130, 250],
      ],
      80,
      { 1: 500 },
    );
    const p = prosody(pcm, RATE, words);
    expect(p.pauses).toHaveLength(1);
    const pause = p.pauses[0]!;
    expect(Math.abs(pause.startMs - words[1]!.endMs)).toBeLessThanOrEqual(40);
    expect(Math.abs(pause.endMs - words[2]!.startMs)).toBeLessThanOrEqual(40);
  });

  it('is flat (50) for even delivery, and safe on silence and no words', () => {
    const even = voice([
      ['aa', 0.3, 130, 300],
      ['aa', 0.3, 130, 300],
      ['aa', 0.3, 130, 300],
    ]);
    expect(prosody(even.pcm, RATE, even.words).stress).toEqual([50, 50, 50]);
    const silent = prosody(new Float32Array(RATE), RATE, [{ text: 'x', startMs: 0, endMs: 500 }]);
    expect(silent.stress).toEqual([50]);
    expect(prosody(new Float32Array(0), RATE, [])).toEqual({ v: 1, stress: [], pauses: [] });
  });

  it('is deterministic and does not change its input', () => {
    const { pcm, words } = voice([
      ['a', 0.2, 110, 200],
      ['bigger', 0.5, 180, 400],
    ]);
    const copy = Float32Array.from(pcm);
    expect(prosody(pcm, RATE, words)).toEqual(prosody(pcm, RATE, words));
    expect(pcm).toEqual(copy);
  });
});
