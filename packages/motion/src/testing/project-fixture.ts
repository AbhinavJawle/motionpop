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

/**
 * A film beat (spec 07b): a custom slot with a tiny script on the film kit. `film` is its handover
 * (tail, over, head). The words sit on the fixture's 700 ms grid.
 */
export function filmBeatSlot(
  id: string,
  startMs: number,
  endMs: number,
  film: { tailMs: number; over: 'out' | 'in'; headMs: number },
  line = `Beat ${id}`,
): Slot {
  const script = [
    'const tl = mp.timeline();',
    'const card = mp.paper({ x: "8%", y: "22%", w: "84%", h: "44%", tilt: -1 });',
    `mp.el("p", {}, ${JSON.stringify(line)}, card.body);`,
    "tl.enter('push', card);",
    'return tl;',
  ].join('\n');
  return {
    id,
    startMs,
    endMs,
    wordStart: Math.floor(startMs / 700),
    wordEnd: Math.min(
      fixtureWords.length - 1,
      Math.max(Math.floor(startMs / 700), Math.floor((endMs - 1) / 700)),
    ),
    reason: 'film beat fixture',
    componentId: 'custom',
    skillId: 'film',
    prompt: line,
    params: {
      title: line.slice(0, 60),
      html: '<div class="frame"></div>',
      css: '.frame { position: absolute; inset: 0; }',
      script,
      keyMomentMs: 0,
      brief: line,
      film,
    },
    status: 'ready',
    notes: [],
  };
}

/**
 * A three-beat film over the fixture words (spec 07b task 10): a push seam, a lift (the first
 * beat's tail stays on under the second), and a cover (the third beat arrives over the second's
 * tail). The last beat ends before the voiceover does, so its tail fits.
 */
export function filmProject(): EditorProject {
  const beats = [
    filmBeatSlot('film-1', 0, 5400, { tailMs: 0, over: 'out', headMs: 0 }, 'First picture'),
    filmBeatSlot('film-2', 5400, 11000, { tailMs: 500, over: 'out', headMs: 0 }, 'Second picture'),
    filmBeatSlot('film-3', 11000, 17500, { tailMs: 500, over: 'in', headMs: 0 }, 'Third picture'),
  ];
  const base = fixtureProject({ slots: beats });
  return EditorProjectSchema.parse({
    ...base,
    film: {
      storyboard: {
        title: 'Three pictures',
        thesis: 'Each beat shows one picture from the narration.',
        world: 'A plain paper ground with ink lines.',
        carrier: 'a small ship that recurs across the beats',
        props: [
          {
            id: 'ship',
            draw: 'A simple side view of a ship on a waterline.',
            width: 100,
            height: 60,
          },
        ],
        beats: [
          storyBeat('b1', 0, 7, 'First picture', 'push'),
          storyBeat('b2', 8, 15, 'Second picture', 'lift'),
          storyBeat('b3', 16, 23, 'Third picture', 'cover'),
        ],
      },
      props: {
        ship: '<svg viewBox="0 0 100 60"><path d="M10 40 L90 40 L75 55 L25 55 Z" fill="#111"/><path d="M50 40 L50 10" stroke="#111"/></svg>',
      },
      madeAt: 1,
    },
  });
}

function storyBeat(
  id: string,
  wordStart: number,
  wordEnd: number,
  text: string,
  kind: 'push' | 'lift' | 'cover',
) {
  return {
    id,
    wordStart,
    wordEnd,
    lead: 'picture' as const,
    idea: `A plain picture for ${text.toLowerCase()}`,
    text: [text],
    landsOn: wordStart,
    staging: 'the picture arrives on the voice',
    seam: { kind, note: 'the picture carries the cut' },
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
