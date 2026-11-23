import { PipModelOutputSchema, ResolvedRecipeSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { reelDirectJsonSchema } from './reel/director';
import { reelEditJsonSchema, ReelEditOutputSchema } from './reel/edit';
import { reelNoteJsonSchema, ReelNoteOutputSchema } from './reel/note';
import { pipPlanJsonSchema, type PipPlanInput } from './tasks/pip-plan';
import { recipeResolveJsonSchema } from './tasks/recipe-resolve';

/**
 * String caps on the hand-written structured-output schemas (spec 39 AI QA). Without a cap the
 * model sometimes escaped a closing quote and wrote the rest of its answer inside one string.
 * Every free-text string (no `enum`, no `pattern`) must carry a numeric `maxLength`.
 * Note: any new constraint on these schemas must also pass `scripts/schema-live-check.ts`
 * against the real endpoint (Vertex refused a version of `reel.direct`, see director.test.ts).
 */

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Paths of string nodes with no enum, no pattern and no numeric maxLength. */
function uncapped(node: unknown, path = '$'): string[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => uncapped(n, `${path}[${i}]`));
  if (!isObj(node)) return [];
  const own =
    node.type === 'string' &&
    node.enum === undefined &&
    node.pattern === undefined &&
    typeof node.maxLength !== 'number'
      ? [path]
      : [];
  return [...own, ...Object.entries(node).flatMap(([k, v]) => uncapped(v, `${path}.${k}`))];
}

/** Follows `path` through `properties` / `items` of a JSON schema. */
function at(schema: Json, ...path: string[]): Json {
  let node: unknown = schema;
  for (const key of path) {
    if (!isObj(node)) throw new Error(`no node at ${path.join('.')}`);
    node = key === '[]' ? node.items : (node.properties as Json | undefined)?.[key];
  }
  if (!isObj(node)) throw new Error(`no node at ${path.join('.')}`);
  return node;
}

/** The zod max length of a string field, through optional / default / catch / pipe wrappers. */
function zodMax(schema: z.ZodType): number | null {
  let s: unknown = schema;
  for (let k = 0; k < 8; k++) {
    const maxLength = (s as { maxLength?: number | null }).maxLength;
    if (typeof maxLength === 'number') return maxLength;
    const def = (s as { _zod?: { def?: { innerType?: unknown; in?: unknown } } })._zod?.def;
    const inner = def?.innerType ?? def?.in;
    if (!inner) return null;
    s = inner;
  }
  return null;
}

const PIP_INPUT: PipPlanInput = {
  scope: 'video',
  project: {
    format: '9:16',
    styleId: 'plain',
    styles: [{ id: 'plain', name: 'Plain' }],
    captions: { enabled: true, preset: 'pop' },
    slots: [
      {
        ref: 's1',
        componentId: 'stat-punch',
        name: 'Stat',
        title: 'Forty percent',
        status: 'ready',
        startMs: 0,
        endMs: 3000,
      },
    ],
    words: [
      [0, 'Revenue'],
      [1, 'grew'],
    ],
    components: [{ id: 'stat-punch', name: 'Stat punch', useWhen: 'a number' }],
  },
  history: [],
  message: 'Make it pop',
};

const SCHEMAS: Record<string, Json> = {
  'reel.direct': reelDirectJsonSchema(),
  'reel.note': reelNoteJsonSchema(),
  'reel.edit': reelEditJsonSchema(),
  'recipe.resolve': recipeResolveJsonSchema(),
  'pip.plan': pipPlanJsonSchema(PIP_INPUT),
};

describe('structured-output string caps (spec 39 AI QA)', () => {
  for (const [task, schema] of Object.entries(SCHEMAS)) {
    it(`${task}: every free-text string has a maxLength`, () => {
      expect(uncapped(schema)).toEqual([]);
    });
  }

  it('the walker finds an uncapped string (self-check)', () => {
    expect(uncapped({ type: 'object', properties: { a: { type: 'string' } } })).toEqual([
      '$.properties.a',
    ]);
    expect(
      uncapped({ type: 'object', properties: { a: { type: 'string', enum: ['x'] } } }),
    ).toEqual([]);
  });

  it('each cap equals the zod limit of the same field', () => {
    const cases: [Json, z.ZodType, number][] = [
      // reel.note
      [at(SCHEMAS['reel.note']!, 'message'), ReelNoteOutputSchema.shape.message, 300],
      [at(SCHEMAS['reel.note']!, 'tag'), ReelNoteOutputSchema.shape.tag, 80],
      [at(SCHEMAS['reel.note']!, 'hook'), ReelNoteOutputSchema.shape.hook, 120],
      [
        at(SCHEMAS['reel.note']!, 'brands', '[]', 'name'),
        ReelNoteOutputSchema.shape.brands.unwrap().element.shape.name,
        60,
      ],
      [
        at(SCHEMAS['reel.note']!, 'brands', '[]', 'domain'),
        ReelNoteOutputSchema.shape.brands.unwrap().element.shape.domain,
        80,
      ],
      [
        at(SCHEMAS['reel.note']!, 'captions', '[]', 'find'),
        ReelNoteOutputSchema.shape.captions.unwrap().element.shape.find,
        80,
      ],
      [
        at(SCHEMAS['reel.note']!, 'captions', '[]', 'replace'),
        ReelNoteOutputSchema.shape.captions.unwrap().element.shape.replace,
        80,
      ],
      // reel.edit
      [
        at(SCHEMAS['reel.edit']!, 'cut', '[]', 'reason'),
        ReelEditOutputSchema.shape.cut.element.shape.reason,
        120,
      ],
      // pip.plan
      [at(SCHEMAS['pip.plan']!, 'reply'), PipModelOutputSchema.shape.reply, 240],
      [
        at(SCHEMAS['pip.plan']!, 'steps', '[]', 'instruction'),
        PipModelOutputSchema.shape.steps.element.shape.instruction,
        200,
      ],
      [
        at(SCHEMAS['pip.plan']!, 'steps', '[]', 'label'),
        PipModelOutputSchema.shape.steps.element.shape.label,
        120,
      ],
      // recipe.resolve
      [
        at(SCHEMAS['recipe.resolve']!, 'directorNotes'),
        ResolvedRecipeSchema.shape.directorNotes,
        400,
      ],
    ];
    for (const [json, zod, expected] of cases) {
      expect(json.maxLength).toBe(expected);
      expect(zodMax(zod)).toBe(expected);
    }
    // `compose` has no zod max; it is sliced to 1 200 characters, the same as its cap.
    expect(at(SCHEMAS['reel.note']!, 'compose').maxLength).toBe(1200);
    expect(
      ReelNoteOutputSchema.parse({ action: 'compose', compose: 'x'.repeat(1300) }).compose,
    ).toHaveLength(1200);
  });
});
