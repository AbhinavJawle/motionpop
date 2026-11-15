// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Format } from '../contract';
import { editorialExplainer, fieldNotes } from '../styles';
import type { Scene } from './define';
import { exemplarText, exemplarWords, pickExemplars, type Exemplar } from './exemplar';
import { exemplars } from './exemplars';
import { gateSlot, repairable } from './gate';
import { findPhrase } from '../engine/stage';
import { scenes } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const all = Object.entries(exemplars).map(([id, list]) => ({
  scene: (scenes as Record<string, Scene<unknown>>)[id]!,
  list,
}));

describe('example library (every exemplar is gated in CI)', () => {
  it('has an entry for every scene and at least 2 exemplars per variant', () => {
    expect(Object.keys(exemplars).sort()).toEqual(Object.keys(scenes).sort());
    for (const { scene, list } of all) {
      for (const v of scene.variants)
        expect(
          list.filter((e) => e.score.variant === v.id).length,
          `${scene.id} ${v.id}`,
        ).toBeGreaterThanOrEqual(2);
      expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    }
  });

  for (const { scene, list } of all) {
    for (const e of list) {
      it(`${scene.id}/${e.id}: parses, beats name its words, and passes the gates in every format and look`, () => {
        expect(scene.params.safeParse(e.score).success).toBe(true);
        const n = e.text.split(' ').length;
        for (const b of e.score.beats) expect(b.word).toBeLessThan(n);
        const words = exemplarWords(e.text);
        const durationMs = Math.min(
          scene.durationMs.max,
          Math.max(scene.durationMs.min, words[words.length - 1]!.endMs + 1800),
        );
        for (const format of FORMAT_IDS) {
          for (const plain of [true, false]) {
            const reports = gateSlot(scene, e.score, {
              format,
              style: plain ? editorialExplainer : fieldNotes,
              ...(plain ? {} : { look: fieldNotes }),
              durationMs,
              words,
            }).filter(repairable);
            expect(reports, `${format} ${plain ? 'plain' : 'field-notes'}`).toEqual([]);
          }
        }
      });
    }
  }

  it('is honest: every number is spoken, every emphasis is in its line', () => {
    for (const e of exemplars['stat-punch'] as Exemplar<{ value: number }>[]) {
      const spoken = e.text.replace(/,/g, '');
      expect(spoken, e.id).toContain(String(e.score.content.value));
    }
    for (const e of exemplars['hook-statement'] as Exemplar<{
      line: string;
      emphasis?: string;
    }>[]) {
      const { line, emphasis } = e.score.content;
      if (emphasis) expect(findPhrase(line.split(' '), emphasis).length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('pickExemplars', () => {
  const list = exemplars['hook-statement']!;
  it('prefers the span kind, never repeats a variant, and is deterministic', () => {
    const picked = pickExemplars(list, { kind: 'place', wordCount: 12 });
    expect(picked).toHaveLength(2);
    expect(picked[0]!.kind).toBe('place');
    expect(new Set(picked.map((e) => e.score.variant)).size).toBe(2);
    expect(pickExemplars(list, { kind: 'place', wordCount: 12 })).toEqual(picked);
  });

  it('formats a compact input → output pair with indexed words and no schema text', () => {
    const t = exemplarText(list[0]!);
    expect(t).toMatch(/^0:Nobody 1:tells/);
    expect(t).toContain('"emphasis":"real reason"');
    expect(t).not.toMatch(/"properties"|"type":"object"/);
    expect(t.length).toBeLessThan(400);
  });
});
