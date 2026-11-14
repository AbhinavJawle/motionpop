import { EditorProjectSchema, type EditorProject, type Word } from '@motionpop/schemas';

/**
 * The demo project behind `/editor/demo` (spec 04 R1.3). Word timings and slot ranges are
 * measured from `design/screens/editor.png` (ruler: 0 s at x=256, 18 s at x=2310 at 2420 px
 * wide). The voice is synthesized from these timings (`lib/audio/synth-voice.ts`), so the
 * waveform and karaoke line up. Real sample audio replaces it in spec 05.
 *
 * Only `big-number` exists until spec 07, so the ready slots use it. The opening title is
 * still suggested and the map is still generating, so they don't render yet.
 */

export const DEMO_PROJECT_ID = 'demo';
export const DEMO_VOICE_SRC = 'synth:demo';
const DURATION_MS = 18_000;

// [text, startMs, endMs]
const WORDS: ReadonlyArray<readonly [string, number, number]> = [
  ["Let's", 0, 440],
  ['look', 520, 980],
  ['at', 1100, 1360],
  ['the', 1500, 1840],
  ['numbers.', 2050, 2840],
  ['Our', 3550, 3980],
  ['revenue', 4200, 4780],
  ['grew', 4870, 5420],
  ['forty', 5580, 6050],
  ['percent', 6180, 6830],
  ['since', 6950, 7400],
  ['2020.', 7500, 7800],
  ['And', 8650, 9050],
  ['this', 9210, 9600],
  ['is', 9730, 9980],
  ['only', 10120, 10620],
  ['the', 10760, 11080],
  ['beginning.', 11210, 12100],
  ["Here's", 13110, 13700],
  ['what', 13860, 14350],
  ['comes', 14510, 15130],
  ['next.', 15310, 15740],
];

export const demoWords: Word[] = WORDS.map(([text, startMs, endMs], i) => ({
  i,
  text,
  startMs,
  endMs,
  conf: 0.97,
  filler: false,
}));

export function demoProject(now = 0): EditorProject {
  return EditorProjectSchema.parse({
    schemaVersion: 1,
    id: DEMO_PROJECT_ID,
    title: 'Untitled Project',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs: DURATION_MS,
    voiceover: { src: DEMO_VOICE_SRC, durationMs: DURATION_MS },
    transcript: {
      words: demoWords,
      language: 'en',
      ranOn: 'device',
      timingQuality: 'word',
      cleaned: true,
    },
    slots: [
      {
        id: 'slot-1',
        startMs: 520,
        endMs: 2840,
        wordStart: 1,
        wordEnd: 4,
        reason: 'Opening line: a title sets the topic',
        componentId: 'title-card',
        skillId: 'opening-title',
        prompt: 'A bold opening title for a numbers-driven story.',
        params: {},
        status: 'suggested',
      },
      {
        id: 'slot-2',
        startMs: 4200,
        endMs: 7800,
        wordStart: 6,
        wordEnd: 11,
        reason: "You said 'revenue grew forty percent since 2020'",
        componentId: 'big-number',
        skillId: 'data-explainer',
        prompt: 'A big, confident 40% with a warm highlight and an editorial feel.',
        params: { value: 40, suffix: '%', label: 'Revenue grew since 2020', context: 'The bigger picture' },
        status: 'ready',
        currentVersionId: 'v-2-3',
        notes: [
          {
            id: 'note-1',
            tMs: 5600,
            shape: { kind: 'circle', points: [0.62, 0.55, 0.06] },
            text: 'Make this slower',
            status: 'open',
          },
        ],
      },
      {
        id: 'slot-3',
        startMs: 8650,
        endMs: 12100,
        wordStart: 12,
        wordEnd: 17,
        reason: "You said 'this is only the beginning'",
        componentId: 'map-zoom',
        skillId: 'bigger-picture',
        prompt: 'Finding the bigger picture: zoom out to show where this goes next.',
        params: {},
        status: 'generating',
      },
      {
        id: 'slot-4',
        startMs: 13110,
        endMs: 16160,
        wordStart: 18,
        wordEnd: 21,
        reason: "You said 'here's what comes next'",
        componentId: 'big-number',
        skillId: 'takeaway',
        prompt: 'A short takeaway callout that repeats the headline number.',
        params: { value: 40, suffix: '%', label: 'The takeaway' },
        status: 'ready',
      },
    ],
    versions: [1, 2, 3].map((n) => ({
      id: `v-2-${n}`,
      slotId: 'slot-2',
      componentId: 'big-number',
      params: { value: 40, suffix: '%', label: 'Revenue grew since 2020', context: 'The bigger picture' },
      source: n === 1 ? 'ai-device' : 'ai-cloud',
      costCredits: n === 1 ? 0 : 3,
      createdAt: now,
      label: `v${n}`,
    })),
    createdAt: now,
    updatedAt: now,
  });
}
