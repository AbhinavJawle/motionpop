import { EditorProjectSchema, type EditorProject, type Word } from '@motionpop/schemas';

/**
 * The demo project behind `/editor/demo` (spec 04 R1.3). Word timings and slot ranges are
 * measured from the editor frame in `design/figma-export.css` (ruler: 0 s at x=152, 68 px per
 * second; slot 2 = 0:04.2 – 0:07.8 as in the inspector). The voice is synthesized from these timings (`lib/audio/synth-voice.ts`), so the
 * waveform and karaoke line up. Real sample audio replaces it in spec 05.
 *
 * Only `big-number` exists until spec 07, so the ready slots use it. The opening title is
 * still suggested and the map is still generating, so they don't render yet.
 */

export const DEMO_PROJECT_ID = 'demo';
export const DEMO_VOICE_SRC = 'synth:demo';

/** Sample rate for a synthesized fixture voice (`synth:*`), or null for real audio. */
export function synthRate(src: string): number | null {
  if (src === 'synth:demo') return 22_050;
  if (src === 'synth:perf') return 8_000; // 16 minutes: keep the WAV small
  return null;
}
const DURATION_MS = 18_000;

// [text, startMs, endMs]
const WORDS: ReadonlyArray<readonly [string, number, number]> = [
  ["Let's", 0, 440],
  ['look', 530, 980],
  ['at', 1100, 1360],
  ['the', 1500, 1840],
  ['numbers.', 2050, 2840],
  ['Our', 3550, 3980],
  ['revenue', 4200, 4780],
  ['grew', 4980, 5480],
  ['forty', 5580, 6050],
  ['percent', 6180, 6830],
  ['since', 6950, 7400],
  ['2020.', 7500, 7800],
  ['And', 8650, 9050],
  ['this', 9200, 9600],
  ['is', 9720, 9980],
  ['only', 10120, 10620],
  ['the', 10750, 11080],
  ['beginning.', 11200, 12020],
  ["Here's", 13100, 13700],
  ['what', 13850, 14350],
  ['comes', 14500, 15130],
  ['next.', 15300, 15740],
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
        startMs: 590,
        endMs: 3180,
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
        params: { value: 40, suffix: '%', label: 'Revenue grew', context: 'The bigger picture' },
        status: 'ready',
        currentVersionId: 'v-2-3',
        sfx: [{ id: 'pop', atMs: 0 }],
        notes: [
          {
            id: 'note-1',
            // Relative to the slot start (4200): shows at project time 5600 (D-048).
            tMs: 1400,
            shape: { kind: 'circle', points: [0.62, 0.55, 0.06] },
            text: 'Make this slower',
            status: 'open',
          },
        ],
      },
      {
        id: 'slot-3',
        startMs: 8700,
        endMs: 12020,
        wordStart: 12,
        wordEnd: 17,
        reason: "You said 'this is only the beginning'",
        componentId: 'map-zoom',
        skillId: 'bigger-picture',
        prompt: 'Finding the bigger picture: zoom out to show where this goes next.',
        params: {},
        status: 'generating',
        sfx: [{ id: 'whoosh', atMs: 0 }],
      },
      {
        id: 'slot-4',
        startMs: 13100,
        endMs: 16160,
        wordStart: 18,
        wordEnd: 21,
        reason: "You said 'here's what comes next'",
        componentId: 'big-number',
        skillId: 'takeaway',
        prompt: 'A short takeaway callout that repeats the headline number.',
        params: { value: 40, suffix: '%', label: 'The takeaway' },
        status: 'ready',
        sfx: [{ id: 'pop', atMs: 0 }],
      },
    ],
    versions: [1, 2, 3].map((n) => ({
      id: `v-2-${n}`,
      slotId: 'slot-2',
      componentId: 'big-number',
      params: { value: 40, suffix: '%', label: 'Revenue grew', context: 'The bigger picture' },
      source: n === 1 ? 'ai-device' : 'ai-cloud',
      costCredits: n === 1 ? 0 : 3,
      createdAt: now,
      label: `v${n}`,
    })),
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * What `/editor/demo` opens: the demo project with today's scenes in place of the legacy
 * `big-number` and `title-card` (which clip in 9:16). `demoProject` stays as it is because many
 * tests pin its shape.
 */
export function showcaseProject(now = 0): EditorProject {
  const p = demoProject(now);
  const stat = {
    variant: 'hero',
    content: {
      value: 40,
      suffix: '%',
      decimals: 0,
      label: 'Revenue grew',
      context: 'SINCE 2020',
      countFrom: 0,
    },
    beats: [],
    images: [],
  };
  const hook = (line: string) => ({ content: { line }, beats: [], images: [] });
  const slots = p.slots.map((s) => {
    if (s.id === 'slot-1') {
      return {
        ...s,
        componentId: 'hook-statement',
        params: hook("Let's look at the numbers"),
        status: 'ready' as const,
      };
    }
    if (s.id === 'slot-2') return { ...s, componentId: 'stat-punch', params: stat };
    if (s.id === 'slot-4') {
      return { ...s, componentId: 'hook-statement', params: hook("Here's what comes next") };
    }
    return s;
  });
  const versions = p.versions.map((v) => ({ ...v, componentId: 'stat-punch', params: stat }));
  return EditorProjectSchema.parse({ ...p, slots, versions });
}
