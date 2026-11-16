// @vitest-environment happy-dom
import type { EditorProject } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { demoProject, demoWords } from '../projects/fixture';
import { slotAtPlayhead } from './add-graphic';

const empty = (): EditorProject => ({ ...demoProject(), slots: [], versions: [] });
const at = (text: string) => demoWords.find((w) => w.text === text)!.startMs;

describe('Add graphic (founder 2026-11-16)', () => {
  it('drafts a ready graphic over the sentence at the playhead, typed from its words', () => {
    const s = slotAtPlayhead(empty(), at('revenue'), 'n1', document);
    expect(s).toMatchObject({ id: 'n1', status: 'ready', componentId: 'stat-punch' });
    expect(demoWords[s!.wordStart]!.text).toBe('Our');
    expect(Object.keys(s!.params).length).toBeGreaterThan(0);
  });

  it('moves on to the next sentence with room when the playhead one has a graphic', () => {
    const p = empty();
    const first = slotAtPlayhead(p, at('revenue'), 'n1', document)!;
    const next = slotAtPlayhead({ ...p, slots: [first] }, at('revenue'), 'n2', document);
    expect(next).not.toBeNull();
    expect(next!.startMs).toBeGreaterThanOrEqual(first.endMs);
  });

  it('says no when every part already has a graphic', () => {
    let p = empty();
    for (let k = 0; k < 10; k++) {
      const s = slotAtPlayhead(p, 0, `n${k}`, document);
      if (!s) break;
      p = { ...p, slots: [...p.slots, s].sort((a, b) => a.startMs - b.startMs) };
    }
    expect(slotAtPlayhead(p, 0, 'last', document)).toBeNull();
    // Never overlapping.
    p.slots.forEach((s, i) => {
      if (i > 0) expect(s.startMs).toBeGreaterThanOrEqual(p.slots[i - 1]!.endMs);
    });
  });
});
