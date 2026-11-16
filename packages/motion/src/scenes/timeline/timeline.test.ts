// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS, type StylePack } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer, fieldNotes, paperCollage } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { edgeCases, arbitrary } from './samples';
import { layoutTimeline, timeline, timelineFromWords, type TimelineContent } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = timeline.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const SHOW: TimelineContent = {
  dates: ['1903', '1927', '1969'],
  events: ['First powered flight', 'First solo across the ocean', 'People walk on the moon'],
};

describe('timeline schema and words', () => {
  it('accepts 3 to 6 dated events and every sample, and rejects mismatched lists', () => {
    const ok = (content: unknown) => timeline.params.safeParse({ content }).success;
    expect(ok(SHOW)).toBe(true);
    for (const s of Object.values(edgeCases))
      expect(timeline.params.safeParse(s).success).toBe(true);
    expect(ok({ ...SHOW, events: SHOW.events.slice(0, 2) })).toBe(false);
    expect(ok({ dates: ['1', '2'], events: ['a', 'b'] })).toBe(false);
    expect(ok({ ...SHOW, highlight: 3 })).toBe(false);
  });

  it('reads years and the words that go with them, spoken words only', () => {
    expect(
      timelineFromWords(
        'In 1903 the first plane flew, in 1927 a pilot crossed the ocean, and in 1969 we landed.'.split(
          ' ',
        ),
      ),
    ).toEqual({
      dates: ['1903', '1927', '1969'],
      events: ['The first plane flew', 'A pilot crossed the ocean', 'We landed'],
    });
    // A year that closes its clause takes the words before it.
    expect(
      timelineFromWords(
        'We started in 2016, hired our tenth person in 2019, and opened an office in 2023.'.split(
          ' ',
        ),
      )?.events,
    ).toEqual(['We started', 'Hired our tenth person', 'Opened an office']);
    expect(timelineFromWords('In 1990 and 2000 only.'.split(' '))).toBeNull();
  });
});

describe('timeline layout', () => {
  it('keeps every text box inside the camera-safe area and apart, in every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS)
        for (const count of [3, 4, 5, 6])
          for (const title of [true, false]) {
            const tag = `${variant} ${format} ${count} title=${title}`;
            const events = Array.from({ length: count }, (_, i) =>
              i % 2 ? 'Six words in this event here' : 'Short',
            );
            const L = layoutTimeline(variant, format, height, safe, { events, title });
            const texts = [
              ...(L.title ? [L.title.box] : []),
              ...L.items.flatMap((s) => [s.date.box, s.event.box]),
            ];
            for (const b of texts)
              expect(contains(safe, b, 1), `${tag} ${JSON.stringify(b)}`).toBe(true);
            texts.forEach((a, i) =>
              texts.slice(i + 1).forEach((b) => expect(overlaps(a, b), tag).toBe(false)),
            );
            // Points keep clear of the text.
            for (const s of L.items)
              if (s.point)
                for (const b of texts)
                  expect(
                    overlaps(
                      {
                        x: s.point.x - L.dot,
                        y: s.point.y - L.dot,
                        width: L.dot * 2,
                        height: L.dot * 2,
                      },
                      b,
                    ),
                    tag,
                  ).toBe(false);
          }
    }
  });
});

describe('timeline build', () => {
  it('schedules one cue per event and lands each on its date', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({
      startMs: 200 + i * 320,
      endMs: 450 + i * 320,
    }));
    const root = document.createElement('div');
    document.body.append(root);
    const comp = timeline.build(
      {
        root,
        ...FORMATS['16:9'],
        format: '16:9',
        style: paperCollage,
        look: paperCollage,
        durationMs: timeline.durationMs.ideal,
        keyMomentMs: 1200,
        fps: 30,
        seed: 4,
        warn: () => {},
        words,
      },
      timeline.params.parse({
        variant: 'zigzag',
        content: SHOW,
        beats: [
          { cue: 'e1', word: 1 },
          { cue: 'e2', word: 7 },
          { cue: 'e3', word: 16 },
        ],
      }),
    );
    expect(comp.report.plan.cues.map((q) => q.id)).toEqual(['e1', 'e2', 'e3']);
    for (const [cue, w] of [
      ['e1', 1],
      ['e2', 7],
      ['e3', 16],
    ] as const)
      expect(comp.report.plan.cues.find((q) => q.id === cue)?.landMs).toBe(words[w]!.startMs);
    expect(root.querySelector('[data-focal]')?.getAttribute('data-actor')).toBe('date-1');
    comp.dispose();
    root.remove();
  });

  it('seeks purely for random timelines in every format and look', () => {
    fc.assert(
      fc.property(
        arbitrary,
        fc.constantFrom(...FORMAT_IDS),
        fc.constantFrom<StylePack>(editorialExplainer, fieldNotes, paperCollage),
        (score, format, style) => {
          assertSeekPure(timeline, timeline.params.parse(score), { format, numRuns: 5, style });
        },
      ),
      { numRuns: 20 },
    );
  });
});
