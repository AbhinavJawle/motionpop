// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { findPhrase, revealTimes, WORD_PACE_MS } from '../../engine/stage';
import { editorialExplainer, fieldNotes } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { hookStatement, layoutHookStatement, type HookStatementContent } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = hookStatement.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// "Nobody tells you the real reason prices keep going up": one word every 300 ms from 200 ms.
const LINE = 'Nobody tells you the real reason prices keep going up';
const WORDS = LINE.split(' ').map((_, i) => ({ startMs: 200 + i * 300, endMs: 440 + i * 300 }));

function build(content: HookStatementContent, variant: string, extra: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const comp = hookStatement.build(
    {
      root,
      ...FORMATS['16:9'],
      format: '16:9',
      style: fieldNotes,
      look: fieldNotes,
      durationMs: 6000,
      keyMomentMs: 600,
      fps: 30,
      seed: 3,
      warn: () => {},
      words: WORDS,
      ...extra,
    },
    hookStatement.params.parse({ variant, content, beats: [{ cue: 'line', word: 0 }] }),
  );
  return { root, comp };
}

describe('word-by-word helpers', () => {
  it('finds a phrase ignoring case and punctuation', () => {
    expect(findPhrase(['Why', 'this', 'matters.'], 'MATTERS')).toEqual([2]);
    expect(findPhrase(['the', 'real', 'reason'], 'real reason')).toEqual([1, 2]);
    expect(findPhrase(['the', 'real'], 'fake')).toEqual([]);
  });

  it('reveals each word on its spoken word, at a steady pace past the transcript, and compresses to a limit', () => {
    expect(revealTimes(WORDS, 0, 200, 3)).toEqual([200, 500, 800]);
    expect(revealTimes(WORDS, 9, 2900, 3)).toEqual([
      2900,
      2900 + WORD_PACE_MS,
      2900 + 2 * WORD_PACE_MS,
    ]);
    expect(revealTimes(undefined, null, 100, 2)).toEqual([100, 100 + WORD_PACE_MS]);
    const t = revealTimes(WORDS, 0, 200, 10, 1100);
    expect(t[0]).toBe(200);
    expect(t[9]).toBe(1100);
    t.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(t[i]!));
  });
});

describe('hook-statement layout', () => {
  it('keeps every box inside the camera-safe area and apart, for every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS) {
        for (const eyebrow of [true, false]) {
          const { bar, ...slots } = layoutHookStatement(variant, format, height, safe, {
            eyebrow,
            subline: true,
          });
          const boxes = Object.values(slots).map((s) => s.box);
          if (bar) boxes.push(bar);
          for (const b of boxes) expect(contains(safe, b, 1), `${variant} ${format}`).toBe(true);
          boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
          );
        }
      }
    }
  });
});

describe('hook-statement scene', () => {
  it('rejects lines over 14 words and unknown cues', () => {
    const p = hookStatement.params;
    expect(p.safeParse(hookStatement.defaults).success).toBe(true);
    expect(p.safeParse({ content: { line: 'a '.repeat(15).trim() } }).success).toBe(false);
    expect(
      p.safeParse({ content: { line: 'Hi' }, beats: [{ cue: 'number', word: 0 }] }).success,
    ).toBe(false);
  });

  it('shows each word only once it is spoken, and lands the emphasis on its word', () => {
    const { root, comp } = build({ line: LINE, emphasis: 'real reason' }, 'center');
    const spans = [...root.querySelectorAll<HTMLElement>('[data-by-word] span')];
    expect(spans).toHaveLength(10);
    comp.seek(1000); // words 0–2 spoken (200, 500, 800), word 3 at 1100
    expect(Number(spans[2]!.style.opacity)).toBe(1);
    expect(Number(spans[5]!.style.opacity)).toBe(0);
    comp.seek(4000);
    expect(spans.every((s) => Number(s.style.opacity) === 1)).toBe(true);
    const emph = comp.report.plan.cues.find((c) => c.id === 'emphasis')!;
    expect(emph.landMs).toBe(WORDS[4]!.startMs);
    expect(spans[4]!.dataset.emphasis).toBe('');
    comp.dispose();
    root.remove();
  });

  it('starts the subline only after the whole line has been revealed', () => {
    const { root, comp } = build({ line: LINE, subline: 'It starts with one number' }, 'left');
    const sub = comp.report.plan.cues.find((c) => c.id === 'subline')!;
    expect(sub.startMs).toBeGreaterThan(WORDS[9]!.startMs);
    comp.dispose();
    root.remove();
  });

  it('picks the most stressed spoken word when the score names no emphasis', () => {
    const stress = WORDS.map((_, i) => (i === 6 ? 95 : 50));
    const { root, comp } = build({ line: LINE }, 'center', { stress });
    const spans = [...root.querySelectorAll<HTMLElement>('[data-by-word] span')];
    expect(spans[6]!.dataset.emphasis).toBe('');
    comp.dispose();
    root.remove();
  });

  it('falls back from punch to center when the emphasis opens the line', () => {
    const { root, comp } = build({ line: LINE, emphasis: 'Nobody' }, 'punch');
    expect(root.querySelector('[data-actor="big"]')).toBeNull();
    comp.dispose();
    root.remove();
  });

  it('is seek-pure for random content, variants and formats', () => {
    const word = fc.constantFrom('why', 'money', 'moves', 'this', 'changes', 'everything');
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 14 }),
        fc.nat(13),
        fc.constantFrom(...VARIANTS),
        fc.constantFrom(...FORMAT_IDS),
        (ws, pick, variant, format) => {
          const parsed = hookStatement.params.parse({
            variant,
            content: { line: ws.join(' '), emphasis: ws[pick % ws.length] },
          });
          assertSeekPure(hookStatement, parsed, { format, numRuns: 5, style: editorialExplainer });
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('scene catalogue', () => {
  it('lists every scene with its variants and cues, and no JSON Schema text', async () => {
    const { catalogueSummary, scenes } = await import('../index');
    const text = catalogueSummary(Object.values(scenes) as never);
    for (const s of Object.values(scenes)) {
      expect(text).toContain(`${s.id}: use when`);
      for (const v of s.variants) expect(text).toContain(v.id);
    }
    expect(text).toContain('center* (');
    expect(text).toContain('eyebrow? (');
    expect(text).not.toMatch(/"type"|\$schema|properties/);
    expect(text.length).toBeLessThan(2500);
  });
});
