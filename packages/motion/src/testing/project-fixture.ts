import { EditorProjectSchema, type EditorProject, type Slot, type Word } from '@motionpop/schemas';

/**
 * A small valid `EditorProject` for compiler tests (spec 08 tasks 4 and 5): 24 words, 500 ms
 * apart, an 18 s voiceover and no slots unless given. Slots must sit inside the voiceover and
 * apart from each other (the schema checks the timeline).
 */
export const FIXTURE_DURATION_MS = 18_000;

export const fixtureWords: Word[] = Array.from({ length: 24 }, (_, i) => ({
  i,
  text: `word${i}`,
  startMs: i * 700,
  endMs: i * 700 + 500,
  conf: 0.97,
  filler: false,
}));

/** A ready `big-number` slot with valid params. */
export function bigNumberSlot(id: string, startMs: number, endMs: number): Slot {
  return {
    id,
    startMs,
    endMs,
    wordStart: Math.floor(startMs / 700),
    wordEnd: Math.max(Math.floor(startMs / 700), Math.floor((endMs - 1) / 700)),
    reason: 'fixture',
    componentId: 'big-number',
    skillId: 'data-explainer',
    prompt: '',
    params: { value: 40, suffix: '%', label: 'Revenue grew', decimals: 0, countFrom: 0 },
    status: 'ready',
    notes: [],
  };
}

/** A ready `stat-punch` scene slot with a valid score. */
export function statPunchSlot(id: string, startMs: number, endMs: number): Slot {
  return {
    ...bigNumberSlot(id, startMs, endMs),
    componentId: 'stat-punch',
    skillId: 'shocking-stat-reveal',
    params: {
      content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
      beats: [{ cue: 'number', word: 2 }],
      images: [],
    },
  };
}

/** A ready `hook-statement` scene slot with a valid score and no beats (the safe default). */
export function hookStatementSlot(id: string, startMs: number, endMs: number): Slot {
  return {
    ...bigNumberSlot(id, startMs, endMs),
    componentId: 'hook-statement',
    skillId: 'opening-hook',
    params: {
      variant: 'center',
      content: {
        eyebrow: 'The problem',
        line: 'Nobody tells you the real reason prices keep going up',
        emphasis: 'real reason',
        subline: 'It starts with one number',
      },
      beats: [],
      images: [],
    },
  };
}

export function fixtureProject(
  overrides: Partial<Pick<EditorProject, 'format' | 'styleId' | 'slots' | 'durationMs'>> = {},
): EditorProject {
  return EditorProjectSchema.parse({
    schemaVersion: 1,
    id: 'fixture',
    title: 'Fixture',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs: FIXTURE_DURATION_MS,
    voiceover: { src: 'synth:demo', durationMs: FIXTURE_DURATION_MS },
    transcript: {
      words: fixtureWords,
      language: 'en',
      ranOn: 'device',
      timingQuality: 'word',
      cleaned: true,
    },
    slots: [],
    versions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}
