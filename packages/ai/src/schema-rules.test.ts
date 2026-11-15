import { components } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { TaskDef } from './router';
import type { SlotWord, TaggedSpan } from './slots/types';
import { componentFillTask } from './tasks/component-fill';
import { editPatchTask, paramsSchemaSummary } from './tasks/edit-patch';
import { slotsDetect, slotsDetectInput } from './tasks/slots-detect';
import { transcribeCloud } from './tasks/transcribe-cloud';

/**
 * Schema rules (spec 07 R9.4, ai-tasks.md "Schema rules"). The rules are checked strictly by
 * `violationsOf`. Tasks that do not meet them yet are listed in KNOWN_VIOLATIONS: the test
 * requires the list to match reality exactly, so it can neither go stale nor hide a new problem.
 */

const MAX_DEPTH = 3;
const MAX_ENUM = 40;
const MAX_OPTIONAL = 6;

type Rule = 'depth' | 'enum-size' | 'optional-count' | 'schema-in-system' | 'schema-in-prompt';
type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Walk {
  depth: number;
  maxEnum: number;
  maxOptional: number;
  cyclic: boolean;
}

/** Walks a draft-7 JSON Schema, following local `$ref`s. Object nesting counts through `properties`, `items`, `additionalProperties` and unions. */
function walk(root: Json): Walk {
  const out: Walk = { depth: 0, maxEnum: 0, maxOptional: 0, cyclic: false };
  const resolve = (ref: string): Json | undefined => {
    if (!ref.startsWith('#/')) return undefined;
    let cur: unknown = root;
    for (const part of ref.slice(2).split('/')) cur = isObj(cur) ? cur[part] : undefined;
    return isObj(cur) ? cur : undefined;
  };
  const visit = (node: unknown, depth: number, seen: readonly string[]): void => {
    if (!isObj(node)) return;
    if (typeof node['$ref'] === 'string') {
      if (seen.includes(node['$ref'])) {
        out.cyclic = true;
        return;
      }
      visit(resolve(node['$ref']), depth, [...seen, node['$ref']]);
      return;
    }
    if (Array.isArray(node['enum'])) out.maxEnum = Math.max(out.maxEnum, node['enum'].length);
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const list = node[key];
      if (Array.isArray(list)) for (const n of list) visit(n, depth, seen);
    }
    const props = node['properties'];
    const extra = node['additionalProperties'];
    const isObject = node['type'] === 'object' || isObj(props) || isObj(extra);
    const here = isObject ? depth + 1 : depth;
    out.depth = Math.max(out.depth, here);
    if (isObj(props)) {
      const required = new Set(Array.isArray(node['required']) ? node['required'] : []);
      const optional = Object.keys(props).filter((k) => !required.has(k)).length;
      out.maxOptional = Math.max(out.maxOptional, optional);
      for (const child of Object.values(props)) visit(child, here, seen);
    }
    if (isObj(extra)) visit(extra, here, seen);
    const items = node['items'];
    if (Array.isArray(items)) for (const n of items) visit(n, here, seen);
    else visit(items, here, seen);
  };
  visit(root, 0, []);
  return out;
}

const looksLikeSchema = (text: string): boolean => {
  const compact = text.replace(/\s+/g, '');
  return compact.includes('"type":"object"') || compact.includes('"properties"');
};

interface Measured {
  violations: Partial<Record<Rule, string>>;
  systemChars: number;
  promptChars: number;
}

function measure<I, O>(task: TaskDef<I, O>, sample: I): Measured {
  const schema = z.toJSONSchema(task.output, { target: 'draft-7' }) as Json;
  const w = walk(schema);
  const prompt = task.prompt(sample);
  const violations: Partial<Record<Rule, string>> = {};
  if (w.cyclic || w.depth > MAX_DEPTH) {
    violations.depth = w.cyclic
      ? 'recursive schema'
      : `${w.depth} object levels (max ${MAX_DEPTH})`;
  }
  if (w.maxEnum > MAX_ENUM) violations['enum-size'] = `${w.maxEnum} values (max ${MAX_ENUM})`;
  if (w.maxOptional > MAX_OPTIONAL) {
    violations['optional-count'] =
      `${w.maxOptional} optional properties in one object (max ${MAX_OPTIONAL})`;
  }
  if (looksLikeSchema(task.system))
    violations['schema-in-system'] = 'system prompt contains schema text';
  if (looksLikeSchema(prompt))
    violations['schema-in-prompt'] = 'sample prompt contains schema text';
  return { violations, systemChars: task.system.length, promptChars: prompt.length };
}

// --- The tasks, built the way the app builds them -------------------------------------------

const registry = components as Record<string, { params: z.ZodType }>;
const paramsSchema = (id: string) => registry[id]?.params;
const BIG_NUMBER = registry['big-number']!.params;

const TEXT = ['Um,', 'our', 'revenue', 'grew', 'forty', 'percent', 'since', '2020.'];
const WORDS: SlotWord[] = TEXT.map((text, i) => ({
  text,
  startMs: i * 600,
  endMs: i * 600 + 450,
  filler: i === 0,
}));
const SPANS: TaggedSpan[] = [
  { wordStart: 4, wordEnd: 5, kind: 'number', text: 'forty percent', value: 40, unit: '%' },
  { wordStart: 7, wordEnd: 7, kind: 'year', text: '2020.', value: 2020 },
];
const summary = paramsSchemaSummary(BIG_NUMBER);

interface Case {
  id: string;
  run: () => Measured;
}
const CASES: Case[] = [
  { id: 'slots.detect', run: () => measure(slotsDetect, slotsDetectInput(WORDS, SPANS)) },
  {
    id: 'edit.patch',
    run: () =>
      measure(editPatchTask(paramsSchema), {
        componentId: 'big-number',
        paramsSchemaSummary: summary,
        currentParams: { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew' },
        instruction: 'make it dollars',
      }),
  },
  {
    id: 'component.fill',
    run: () =>
      measure(componentFillTask(paramsSchema), {
        purpose: 'autofill',
        componentId: 'big-number',
        paramsSchemaSummary: summary,
        words: 'Our revenue grew forty percent since 2020.',
        prompt: 'A bold number with an editorial feel.',
        currentParams: { value: 40, suffix: '%', label: 'Our revenue grew' },
        styleId: 'editorial-explainer',
        skill: {
          shotSequence: '0-15% context, 15-55% count up',
          emphasis: 'final value in accent',
        },
      }),
  },
  {
    id: 'transcribe.cloud',
    run: () =>
      measure(transcribeCloud, {
        audio: { mimeType: 'audio/wav', base64: 'AAAA' },
        durationMs: 60_000,
        language: 'en',
      }),
  },
];

/** Real violations today: task id → rule → why. Claude Code fixes these when scenes are wired in. */
const PARAMS_SCHEMA_IN_PROMPT = 'sample prompt contains schema text';
const KNOWN_VIOLATIONS: Record<string, Partial<Record<Rule, string>>> = {
  // The prompt pastes `paramsSchemaSummary` (the component params as a JSON Schema) after "params schema:".
  'edit.patch': { 'schema-in-prompt': PARAMS_SCHEMA_IN_PROMPT },
  'component.fill': { 'schema-in-prompt': PARAMS_SCHEMA_IN_PROMPT },
};

// --- Tests ------------------------------------------------------------------------------------

describe('walk (the rule checker itself)', () => {
  const schemaOf = (s: z.ZodType) => walk(z.toJSONSchema(s, { target: 'draft-7' }) as Json);
  it('counts object nesting through properties, arrays and records', () => {
    expect(schemaOf(z.object({ a: z.string() })).depth).toBe(1);
    expect(schemaOf(z.object({ a: z.object({ b: z.object({ c: z.string() }) }) })).depth).toBe(3);
    expect(
      schemaOf(z.object({ a: z.array(z.object({ b: z.object({ c: z.object({}) }) })) })).depth,
    ).toBe(4);
    expect(schemaOf(z.object({ a: z.record(z.string(), z.object({ b: z.string() })) })).depth).toBe(
      3,
    );
  });
  it('counts enum sizes and optional properties', () => {
    const values = Array.from({ length: 41 }, (_, i) => `v${i}`) as [string, ...string[]];
    expect(schemaOf(z.object({ e: z.enum(values) })).maxEnum).toBe(41);
    const opt = z.object({ a: z.string().optional(), b: z.string().optional(), c: z.string() });
    expect(schemaOf(opt).maxOptional).toBe(2);
  });
  it('flags schema text but not ordinary JSON', () => {
    expect(looksLikeSchema('{ "type": "object", "x": 1 }')).toBe(true);
    expect(looksLikeSchema('{"properties":{}}')).toBe(true);
    expect(looksLikeSchema('{"value":40,"label":"Revenue grew"}')).toBe(false);
  });
});

describe('task schema rules (ai-tasks.md)', () => {
  const results = CASES.map((c) => ({ id: c.id, ...c.run() }));

  it('covers every task the package exports', () => {
    expect(results.map((r) => r.id).sort()).toEqual(
      ['component.fill', 'edit.patch', 'slots.detect', 'transcribe.cloud'].sort(),
    );
  });

  it('reports prompt sizes (system + sample prompt) as a first on-device context measure', () => {
    for (const r of results) {
      console.log(
        `prompt size ${r.id}: system ${r.systemChars} + prompt ${r.promptChars} = ${r.systemChars + r.promptChars} chars`,
      );
    }
    for (const r of results) expect(r.systemChars + r.promptChars).toBeGreaterThan(0);
  });

  for (const r of results) {
    it(`${r.id}: violations match the known list exactly`, () => {
      expect(r.violations).toEqual(KNOWN_VIOLATIONS[r.id] ?? {});
    });
  }

  it('KNOWN_VIOLATIONS only names tasks that exist', () => {
    const ids = new Set(results.map((r) => r.id));
    for (const id of Object.keys(KNOWN_VIOLATIONS)) expect(ids.has(id)).toBe(true);
  });
});
