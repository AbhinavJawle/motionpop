import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  DecorIdSchema,
  EnterBehaviourSchema,
  ImageTreatmentSchema,
  JuiceIdSchema,
  LookSchema,
  MarkRoleSchema,
  MaterialIdSchema,
  SLOW_JUICE,
  SurfaceKindSchema,
} from './look';
import { EnergySchema } from './score';
import { StylePackSchema } from './style';

const stylesDir = fileURLToPath(new URL('../../motion/src/styles/', import.meta.url));
const packFiles = readdirSync(stylesDir).filter((f) => f.endsWith('.json'));

/** Modelled on the field-notes example in design.md, using the real schema field names. */
const fieldNotes = () => ({
  id: 'field-notes',
  name: 'Field Notes',
  tagline: 'A reporter’s desk, marker still wet.',
  tags: ['Explainer', 'Documentary'],
  description: 'Paper, tape and a red marker. Things slam down and settle.',
  colors: {
    bg: '#F2EDE4',
    ink: '#151515',
    muted: '#6B6560',
    accent: '#E4473C',
    accent2: '#8B7CFF',
    highlight: '#FFD43B',
    positive: '#2E9D6B',
    negative: '#E4473C',
    chart: ['#B9B0C9', '#8E80B5', '#E4473C'],
  },
  fonts: { display: 'Geist', body: 'Geist', mono: 'Geist Mono', displayWeight: 700, hand: 'Hand' },
  texture: { grain: 0.04, paper: true, vignette: 0.1 },
  motion: {
    enterEase: 'outExpo',
    moveEase: 'inOutCubic',
    enterMs: 520,
    staggerMs: 45,
    holdMs: 1000,
    camera: { pushIn: 1.05 },
  },
  shape: { radius: 4, stroke: 2 },
  allowPlayful: true,
  energy: 'lively',
  personality: {
    preset: 'snappy',
    enter: { text: 'mask', number: 'count', image: 'slam', shape: 'draw' },
    overshoot: 0.06,
    popMax: 0.08,
    exitRatio: 0.6,
    snapMargin: 20,
  },
  camera: { push: [1, 1.06], snap: 0.08, whip: false, parallax: 14 },
  surfaces: {
    card: ['paper', 'torn-edge', 'shadow-soft'],
    photo: ['white-border', 'tape', 'tilt'],
    label: ['plain'],
    strip: ['paper', 'torn-edge'],
  },
  marks: {
    emphasis: 'marker-circle',
    pointer: 'marker-arrow',
    divider: 'torn-rule',
    badge: 'stamp',
  },
  juice: ['decor-draw', 'camera-snap', 'parallax-shift', 'surface-flip', 'camera-push'],
  image: {
    recipe: 'A single {subject}, documentary photograph, soft daylight, centred',
    treatment: ['key', 'white-border', 'shadow-soft'],
    tintStrength: 0.2,
  },
  sound: { enter: 'paper', mark: 'pen', focal: 'thud', snap: 'whoosh' },
  transitions: ['paper-wipe', 'push'],
});
type LookInput = ReturnType<typeof fieldNotes>;

const rejects = (mutate: (l: LookInput) => void) => {
  const l = fieldNotes();
  mutate(l);
  return !LookSchema.safeParse(l).success;
};

describe('LookSchema: existing style packs', () => {
  it('finds the style pack files', () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });
  for (const file of packFiles) {
    it(`${file} parses as a style pack and as a look`, () => {
      const json: unknown = JSON.parse(readFileSync(new URL(file, `file://${stylesDir}`), 'utf8'));
      expect(StylePackSchema.safeParse(json).success).toBe(true);
      const look = LookSchema.safeParse(json);
      expect(look.success).toBe(true);
      expect(look.data?.personality).toBeUndefined();
    });
  }
});

describe('LookSchema: a full look', () => {
  it('parses the field-notes example', () => {
    const r = LookSchema.safeParse(fieldNotes());
    expect(r.success).toBe(true);
    expect(r.data).toEqual(fieldNotes());
  });
  it('rejects unknown keys at the top level and in strict blocks', () => {
    expect(rejects((l) => Object.assign(l, { extra: 1 }))).toBe(true);
    expect(rejects((l) => Object.assign(l.personality, { extra: 1 }))).toBe(true);
    expect(rejects((l) => Object.assign(l.camera, { extra: 1 }))).toBe(true);
    expect(rejects((l) => Object.assign(l.image, { extra: 1 }))).toBe(true);
    expect(rejects((l) => Object.assign(l.fonts, { extra: 'x' }))).toBe(true);
  });
  it('rejects an image recipe without {subject}', () => {
    expect(rejects((l) => (l.image.recipe = 'A documentary photograph'))).toBe(true);
    expect(rejects((l) => (l.image.recipe = 'A {subject} ' + 'x'.repeat(400)))).toBe(true);
  });
  it('rejects low-contrast ink and muted text', () => {
    expect(rejects((l) => (l.colors.ink = '#F0EBE2'))).toBe(true);
    expect(rejects((l) => (l.colors.muted = '#EDE8DF'))).toBe(true);
  });
  it('rejects out-of-range numbers', () => {
    expect(rejects((l) => (l.personality.overshoot = 0.21))).toBe(true);
    expect(rejects((l) => (l.personality.overshoot = -0.01))).toBe(true);
    expect(rejects((l) => (l.personality.popMax = 0.13))).toBe(true);
    expect(rejects((l) => (l.personality.exitRatio = 0.29))).toBe(true);
    expect(rejects((l) => (l.personality.snapMargin = 101))).toBe(true);
    expect(rejects((l) => (l.camera.snap = 0.16))).toBe(true);
    expect(rejects((l) => (l.camera.snap = -0.01))).toBe(true);
    expect(rejects((l) => (l.camera.parallax = 61))).toBe(true);
    expect(rejects((l) => (l.camera.push = [0.9, 1.05]))).toBe(true);
    expect(rejects((l) => (l.camera.push = [1, 1.21]))).toBe(true);
    expect(rejects((l) => (l.image.tintStrength = 1.01))).toBe(true);
    for (const fps of [5, 16, 12.5]) {
      expect(rejects((l) => Object.assign(l.personality, { stepFps: fps }))).toBe(true);
    }
  });
  it('accepts boundary values and stepFps 6..15', () => {
    for (const fps of [6, 12, 15]) {
      expect(rejects((l) => Object.assign(l.personality, { stepFps: fps }))).toBe(false);
    }
    expect(
      rejects((l) => {
        l.personality.overshoot = 0.2;
        l.personality.popMax = 0.12;
        l.personality.exitRatio = 1;
        l.camera.snap = 0.15;
        l.camera.parallax = 60;
      }),
    ).toBe(false);
  });
  it('rejects bad enums and list sizes', () => {
    expect(rejects((l) => Object.assign(l, { energy: 'frantic' }))).toBe(true);
    expect(rejects((l) => Object.assign(l.personality, { preset: 'wobbly' }))).toBe(true);
    expect(rejects((l) => Object.assign(l, { juice: [] }))).toBe(true);
    expect(rejects((l) => Object.assign(l, { juice: ['unknown'] }))).toBe(true);
    expect(rejects((l) => Object.assign(l, { transitions: ['a', 'b', 'c', 'd', 'e'] }))).toBe(true);
    expect(rejects((l) => Object.assign(l.surfaces, { card: Array(6).fill('plain') }))).toBe(true);
    expect(rejects((l) => Object.assign(l.surfaces, { sofa: ['plain'] }))).toBe(true);
    expect(rejects((l) => Object.assign(l, { sound: { boom: 'x' } }))).toBe(true);
  });
  it('SLOW_JUICE holds only valid juice ids', () => {
    for (const j of SLOW_JUICE) expect(JuiceIdSchema.safeParse(j).success).toBe(true);
  });
});

const unit = (max: number) => fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true });
const some = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });
const pick = <T extends string>(options: readonly T[]) => fc.constantFrom(...options);

const personality = fc.record(
  {
    preset: pick(['calm', 'smooth', 'snappy', 'stepped'] as const),
    enter: fc.record(
      {
        text: pick(EnterBehaviourSchema.options),
        number: pick(EnterBehaviourSchema.options),
        image: pick(EnterBehaviourSchema.options),
        shape: pick(EnterBehaviourSchema.options),
      },
      { requiredKeys: [] },
    ),
    overshoot: unit(0.2),
    popMax: unit(0.12),
    exitRatio: fc.double({ min: 0.3, max: 1, noNaN: true }),
    stepFps: fc.integer({ min: 6, max: 15 }),
    snapMargin: fc.integer({ min: 0, max: 100 }),
  },
  { requiredKeys: ['preset', 'enter', 'overshoot', 'popMax', 'exitRatio', 'snapMargin'] },
);
const camera = fc.record({
  push: fc.tuple(
    fc.double({ min: 1, max: 1.2, noNaN: true }),
    fc.double({ min: 1, max: 1.2, noNaN: true }),
  ),
  snap: unit(0.15),
  whip: fc.boolean(),
  parallax: unit(60),
});
const surfaces = fc.record(
  Object.fromEntries(
    SurfaceKindSchema.options.map((k) => [
      k,
      fc.array(pick(MaterialIdSchema.options), { maxLength: 5 }),
    ]),
  ),
  { requiredKeys: [] },
);
const marks = fc.record(
  Object.fromEntries(MarkRoleSchema.options.map((k) => [k, pick(DecorIdSchema.options)])),
  { requiredKeys: [] },
);
const image = fc.record(
  {
    recipe: fc
      .tuple(fc.string({ maxLength: 50 }), fc.string({ maxLength: 50 }))
      .map(([a, b]) => `${a}{subject}${b}`),
    treatment: fc.array(pick(ImageTreatmentSchema.options), { maxLength: 6 }),
    tintStrength: unit(1),
  },
  { requiredKeys: ['recipe', 'treatment'] },
);

const OPTIONAL_BLOCKS = [
  'energy',
  'personality',
  'camera',
  'surfaces',
  'marks',
  'juice',
  'image',
  'sound',
  'transitions',
] as const;

const validLook = fc
  .record(
    {
      energy: pick(EnergySchema.options),
      personality,
      camera,
      surfaces,
      marks,
      juice: fc.array(pick(JuiceIdSchema.options), { minLength: 1, maxLength: 7 }),
      image,
      sound: fc.record(
        { enter: fc.string({ minLength: 1 }), focal: fc.string({ minLength: 1 }) },
        { requiredKeys: [] },
      ),
      transitions: fc.array(fc.string({ minLength: 1 }), { maxLength: 4 }),
      hand: some(fc.string({ minLength: 1 })),
    },
    { requiredKeys: [] },
  )
  .map(({ hand, ...blocks }) => {
    const { fonts, ...plain } = fieldNotes();
    const bare: Record<string, unknown> = { ...plain };
    for (const k of OPTIONAL_BLOCKS) delete bare[k];
    return { ...bare, fonts: hand === undefined ? fonts : { ...fonts, hand }, ...blocks };
  });

describe('LookSchema: properties', () => {
  it('parses every generated valid look, and parse(parse(x)) equals parse(x)', () => {
    fc.assert(
      fc.property(validLook, (l) => {
        const first = LookSchema.parse(l);
        expect(LookSchema.parse(first)).toEqual(first);
        expect(LookSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
      }),
      { numRuns: 200 },
    );
  });
  it('rejects any generated look with an extra top-level key', () => {
    fc.assert(
      fc.property(validLook, fc.string({ minLength: 1 }), (l, key) => {
        fc.pre(!(key in l) && key !== '__proto__');
        expect(LookSchema.safeParse({ ...l, [key]: 1 }).success).toBe(false);
      }),
    );
  });
});
