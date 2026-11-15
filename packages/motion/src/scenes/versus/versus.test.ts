// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS, type Look, type StylePack } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer, fieldNotes, paperCollage } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { gateSlot, repairable, safeScore } from '../gate';
import { arbitrary } from './samples';
import {
  dividerFor,
  initialOf,
  layoutVersus,
  versus,
  versusFromWords,
  type SideSlots,
  type VersusContent,
} from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = versus.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const sideBoxes = (s: SideSlots) =>
  [s.initial, s.name, s.detail].flatMap((x) => (x ? [x.box] : []));

const FULL: VersusContent = {
  left: 'Renting',
  leftDetail: 'Flexible, nothing to fix',
  right: 'Buying',
  rightDetail: 'Equity, but a big deposit',
  verdict: 'Over ten years, buying wins',
  winner: 'right',
};

function build(
  content: VersusContent,
  variant: string,
  o: { format?: Format; style?: StylePack | Look; look?: Look; extra?: object } = {},
) {
  const format = o.format ?? '16:9';
  const root = document.createElement('div');
  document.body.append(root);
  const comp = versus.build(
    {
      root,
      ...FORMATS[format],
      format,
      style: o.style ?? editorialExplainer,
      ...(o.look ? { look: o.look } : {}),
      durationMs: versus.durationMs.ideal,
      keyMomentMs: 1400,
      fps: 30,
      seed: 7,
      warn: () => {},
      ...o.extra,
    },
    versus.params.parse({ variant, content }),
  );
  return { root, comp, done: () => (comp.dispose(), root.remove()) };
}

describe('versus layout', () => {
  it('keeps every box inside the camera-safe area and apart, for every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS) {
        for (const detail of [true, false]) {
          for (const verdict of [true, false]) {
            const tag = `${variant} ${format} detail=${detail} verdict=${verdict}`;
            const s = layoutVersus(variant, format, width, height, safe, { detail, verdict });
            const texts = [
              ...sideBoxes(s.left),
              ...sideBoxes(s.right),
              ...(s.verdict ? [s.verdict.box] : []),
            ];
            expect(Boolean(s.left.detail), tag).toBe(detail);
            expect(Boolean(s.verdict), tag).toBe(verdict);
            expect(contains(safe, s.area, 1), tag).toBe(true);
            for (const b of [...texts, ...(s.vs ? [s.vs.box] : [])]) {
              expect(contains(s.area, b, 1), `${tag} ${JSON.stringify(b)}`).toBe(true);
              expect(b.width > 0 && b.height > 0, tag).toBe(true);
            }
            const all = [...texts, ...(s.vs ? [s.vs.box] : [])];
            all.forEach((a, i) =>
              all.slice(i + 1).forEach((b) => expect(overlaps(a, b), tag).toBe(false)),
            );
            // The divider runs between the sides and never through their text.
            const div = dividerFor(s, sideBoxes(s.left), sideBoxes(s.right), s.vs?.box);
            expect(contains(safe, div, 1), `${tag} divider`).toBe(true);
            for (const b of texts) expect(overlaps(div, b), `${tag} divider × text`).toBe(false);
            // Names are the biggest type after the tile initials.
            expect(s.left.name.max, tag).toBeGreaterThan(s.left.detail?.max ?? 0);
            expect(s.left.name.max, tag).toBeGreaterThanOrEqual(s.verdict?.max ?? 0);
          }
        }
      }
    }
  });

  it('gives each variant a different layout in every format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = safeArea(format, width, height);
      const sig = VARIANTS.map((v) =>
        JSON.stringify(
          layoutVersus(v, format, width, height, safe, { detail: true, verdict: true }).left.name
            .box,
        ),
      );
      expect(new Set(sig).size, format).toBe(VARIANTS.length);
    }
  });

  it('gives split and ledger square initial tiles, and face-off none', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = safeArea(format, width, height);
      const has = { detail: true, verdict: true };
      for (const v of ['split', 'ledger']) {
        const t = layoutVersus(v, format, width, height, safe, has).left.initial!.box;
        expect(t.width, `${v} ${format}`).toBe(t.height);
      }
      expect(layoutVersus('face-off', format, width, height, safe, has).left.initial).toBe(
        undefined,
      );
    }
  });
});

describe('versus content', () => {
  it('parses its defaults and rejects long names, unknown ids and images', () => {
    const p = versus.params;
    expect(p.safeParse(versus.defaults).success).toBe(true);
    const base = { content: { left: 'Cats', right: 'Dogs' } };
    expect(p.safeParse(base).success).toBe(true);
    expect(p.safeParse({ content: { left: 'one two three four', right: 'B' } }).success).toBe(
      false,
    );
    expect(p.safeParse({ content: { left: ' ', right: 'B' } }).success).toBe(false);
    expect(p.safeParse({ content: { ...base.content, verdict: 'a '.repeat(9) } }).success).toBe(
      false,
    );
    expect(p.safeParse({ content: { ...base.content, winner: 'both' } }).success).toBe(false);
    expect(p.safeParse({ ...base, variant: 'duel' }).success).toBe(false);
    expect(p.safeParse({ ...base, beats: [{ cue: 'number', word: 0 }] }).success).toBe(false);
    expect(p.safeParse({ ...base, images: [{ role: 'left', subject: 'a cat' }] }).success).toBe(
      false,
    );
  });

  it('reads the two sides from the words around "vs", "versus", "or" and "against"', () => {
    const read = (s: string) => versusFromWords(s.split(' '));
    expect(read('Electric cars versus petrol cars.')).toEqual({
      left: 'Electric cars',
      right: 'Petrol cars',
    });
    expect(read('Should you rent or buy?')).toEqual({ left: 'Rent', right: 'Buy' });
    expect(read('Cats, or dogs, which one?')).toEqual({ left: 'Cats', right: 'Dogs' });
    expect(read('so, um, speed vs. safety')).toEqual({ left: 'Speed', right: 'Safety' });
    expect(read('it was more or less fine')).toBeNull();
    expect(read('this or that')).toBeNull();
    expect(read('no comparison here at all')).toBeNull();
    expect(read('or')).toBeNull();
    // Too long: the words far from the separator go; one word over 24 letters can't be a name.
    expect(read('internationalisation rollout plans vs bikes')).toEqual({
      left: 'Rollout plans',
      right: 'Bikes',
    });
    expect(read('internationalisationization vs bikes')).toBeNull();
  });

  it('takes the first letter or digit as the tile initial', () => {
    expect(initialOf('renting')).toBe('R');
    expect(initialOf('$5 coffee')).toBe('5');
    expect(initialOf('"Old" way')).toBe('O');
    expect(initialOf('…')).toBe('…');
  });
});

describe('versus scene', () => {
  it('lands the second side on the key moment as the focal, then the divider and the verdict', () => {
    for (const format of FORMAT_IDS) {
      for (const variant of VARIANTS) {
        const { root, comp, done } = build(FULL, variant, { format });
        const cues = Object.fromEntries(comp.report.plan.cues.map((c) => [c.id, c]));
        expect(cues['right']!.landMs).toBe(1400);
        expect(cues['left']!.landMs).toBeLessThan(cues['right']!.landMs);
        expect(cues['divider']!.landMs).toBeGreaterThan(cues['right']!.landMs);
        expect(cues['verdict']!.landMs).toBeGreaterThan(cues['divider']!.landMs);
        expect(comp.report.plan.dropped).toEqual([]);
        expect(comp.report.plan.squeezed).toEqual([]);
        comp.seek(1400);
        expect(root.querySelector('[data-focal]')!.textContent).toBe('Buying');
        expect(comp.report.juice.budgetOk).toBe(true);
        done();
      }
    }
  });

  it('lands each side on the word that names it', () => {
    const words = 'Renting or buying which one wins over ten years'
      .split(' ')
      .map((_, i) => ({ startMs: 200 + i * 300, endMs: 450 + i * 300 }));
    const root = document.createElement('div');
    document.body.append(root);
    const comp = versus.build(
      {
        root,
        ...FORMATS['16:9'],
        format: '16:9',
        style: fieldNotes,
        look: fieldNotes,
        durationMs: 6000,
        keyMomentMs: 800,
        fps: 30,
        seed: 2,
        warn: () => {},
        words,
      },
      versus.params.parse({
        content: FULL,
        beats: [
          { cue: 'left', word: 0 },
          { cue: 'right', word: 2 },
          { cue: 'verdict', word: 6 },
        ],
      }),
    );
    const at = (id: string) => comp.report.plan.cues.find((c) => c.id === id)!.landMs;
    expect(at('left')).toBe(words[0]!.startMs);
    expect(at('right')).toBe(words[2]!.startMs);
    expect(at('verdict')).toBe(words[6]!.startMs);
    comp.dispose();
    root.remove();
  });

  it('marks the winner on the verdict, and nothing when no side wins', () => {
    const marks = (c: VersusContent) => {
      const { root, done } = build(c, 'split');
      const n = root.querySelectorAll('[data-mark]').length;
      done();
      return n;
    };
    const draw: VersusContent = { ...FULL };
    delete draw.winner;
    expect(marks(FULL)).toBeGreaterThan(marks(draw));
  });

  it('draws plain tiles in the accents with readable initials, and the look surfaces otherwise', () => {
    const plain = build(FULL, 'split');
    const init = (r: HTMLElement, k: string) =>
      r.querySelector<HTMLElement>(`[data-actor="${k}-init"]`)!;
    expect(init(plain.root, 'left').dataset.on).toBe('accent');
    expect(init(plain.root, 'right').dataset.on).toBe('accent2');
    expect(plain.root.querySelector('[data-actor="vs-text"]')!.getAttribute('data-on')).toBe('ink');
    expect(plain.root.querySelector('[data-surface]')).toBeNull();
    plain.done();

    const notes = build(FULL, 'split', { style: fieldNotes, look: fieldNotes });
    expect(notes.root.querySelectorAll('[data-surface="photo"]')).toHaveLength(2);
    expect(init(notes.root, 'left').dataset.on).toBeUndefined();
    notes.done();

    const collage = build(FULL, 'face-off', { style: paperCollage, look: paperCollage });
    expect(collage.root.querySelectorAll('[data-surface="card"]')).toHaveLength(2);
    expect(collage.root.querySelectorAll('[data-surface="strip"]')).toHaveLength(1);
    collage.done();
  });

  it('keeps the tiles and the disc behind the text they hold', () => {
    const { root, done } = build(FULL, 'split');
    const order = [...root.children].map((el) => (el as HTMLElement).dataset.actor);
    expect(order.indexOf('left-tile')).toBeLessThan(order.indexOf('left-init'));
    expect(order.indexOf('vs-disc')).toBeLessThan(order.indexOf('vs-text'));
    expect(order.indexOf('divider')).toBeLessThan(order.indexOf('vs-disc'));
    done();
  });

  it('builds its safe default from the words, which passes the gates in every format', () => {
    const words = 'Electric cars versus petrol cars, which is cheaper?'.split(' ');
    for (const format of FORMAT_IDS) {
      for (const durationMs of [versus.durationMs.min, versus.durationMs.ideal]) {
        const o = { format, style: fieldNotes, look: fieldNotes, durationMs };
        const s = safeScore(versus, words, o);
        expect(s.content).toMatchObject({ left: 'Electric cars', right: 'Petrol cars' });
        expect(s.variant).toBe('split');
        expect(gateSlot(versus, s, o).filter(repairable)).toEqual([]);
      }
    }
  });

  it('is seek-pure for random content, variants and formats', () => {
    fc.assert(
      fc.property(
        arbitrary,
        fc.constantFrom(...FORMAT_IDS),
        fc.constantFrom<StylePack>(editorialExplainer, fieldNotes),
        (score, format, style) => {
          assertSeekPure(versus, versus.params.parse(score), { format, numRuns: 5, style });
        },
      ),
      { numRuns: 25 },
    );
  });
});
