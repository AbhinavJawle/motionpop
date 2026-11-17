import { describe, expect, it } from 'vitest';
import {
  FILM_BEAT_SEPARATOR,
  filmBeatV1,
  filmBuildPromptV1,
  filmSharedV1,
  type FilmBuildPromptInput,
} from './film-build.v1';

const beats = [
  { lead: 'number', idea: 'Revenue doubles', text: ['40%'], landsOn: 'forty' },
  { lead: 'map', idea: 'Ships leave the port', text: [], landsOn: 'ships' },
  { lead: 'type', idea: 'A title card', text: ['Since 2020'], landsOn: '2020' },
];

/** One beat of one film, as `buildInputFor` makes it (only the fields the prompt reads). */
function inputFor(index: number): FilmBuildPromptInput {
  const b = beats[index]!;
  return {
    film: { title: 'Growth', thesis: 'Growth came late.', world: 'A dark desk', carrier: 'a coin' },
    props: [{ id: 'ship', draw: 'a container ship', width: 120, height: 60 }],
    beat: {
      index,
      count: beats.length,
      lead: b.lead,
      idea: b.idea,
      text: b.text,
      staging: 'centre, hold',
      landsOn: b.landsOn,
      keyMomentMs: 900 + index * 100,
    },
    // The spoken words differ per beat, as they do in a real film.
    words: [{ text: `word${index}`, startMs: index * 1000 }],
    durationMs: 3000,
    tailMs: 200,
    headMs: 200,
    seamIn: index === 0 ? null : { kind: 'push', note: 'slide in', from: beats[index - 1]!.idea },
    seamOut:
      index === beats.length - 1
        ? null
        : { kind: 'push', note: 'slide out', to: beats[index + 1]!.idea },
    beats,
    format: '16:9',
    look: { name: 'Clean', description: 'Flat and quiet.' },
    example: { html: '<div></div>', css: '.x{}', script: 'ctx.noop()' },
  };
}

describe('film builder prompt (spec 13b R3.4)', () => {
  it('two beats of one film give byte-identical shared text', () => {
    const first = filmSharedV1(inputFor(0));
    const middle = filmSharedV1(inputFor(1));
    const last = filmSharedV1(inputFor(2));
    expect(middle).toBe(first);
    expect(last).toBe(first);
  });

  it('the full prompt of each beat starts with the shared text, then the separator, then the beat', () => {
    for (const index of [0, 1, 2]) {
      const i = inputFor(index);
      const prompt = filmBuildPromptV1(i);
      const shared = filmSharedV1(i);
      expect(prompt.startsWith(shared)).toBe(true);
      const rest = prompt.slice(shared.length);
      expect(rest).toContain(FILM_BEAT_SEPARATOR);
      expect(rest.indexOf(FILM_BEAT_SEPARATOR)).toBeLessThan(rest.indexOf(filmBeatV1(i)));
      expect(prompt).toContain(filmBeatV1(i));
    }
  });

  it('keeps beat-specific text out of the shared part and in the beat part', () => {
    const i = inputFor(1);
    const shared = filmSharedV1(i);
    const beat = filmBeatV1(i);
    expect(beat).toContain('YOUR BEAT: 2 of 3');
    expect(beat).toContain('word1@1000');
    expect(shared).not.toContain('YOUR BEAT');
    expect(shared).not.toContain('word1@1000');
    // The whole storyboard is in the shared part, every beat with its index.
    expect(shared).toContain('1. number: Revenue doubles');
    expect(shared).toContain('3. type: A title card');
  });

  it('a repair goes into the beat part, after the shared text', () => {
    const i = { ...inputFor(0), fix: { html: 'h', css: 'c', script: 's', problems: 'too big' } };
    const prompt = filmBuildPromptV1(i);
    expect(prompt.startsWith(filmSharedV1(i))).toBe(true);
    expect(prompt.indexOf('Problems:')).toBeGreaterThan(prompt.indexOf(FILM_BEAT_SEPARATOR));
  });
});
