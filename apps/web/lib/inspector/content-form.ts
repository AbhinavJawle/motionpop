import { parseSpokenNumber } from '@motionpop/ai';
import { z } from 'zod';

/**
 * The CONTENT form of the inspector, built from the slot's params schema (spec 09 R2.1, design
 * "Content form"). Pure: the UI renders `Field`s and calls `setField` + the schema to commit.
 *
 * Root: a scene's `content`, or a component's top-level params. Not shown: beats, images, the
 * scene variant, nested objects and arrays other than `{ label, value }` rows. Fields come back
 * in display order: the title field, other texts, then the data table (numbers and short texts,
 * in schema order), enums, booleans, `{ label, value }` rows.
 */
export type Field =
  | {
      kind: 'text';
      path: string;
      label: string;
      value: string;
      max?: number;
      required: boolean;
      title: boolean;
    }
  | {
      kind: 'number';
      path: string;
      label: string;
      value: number | undefined;
      min?: number;
      max?: number;
      int: boolean;
      required: boolean;
      focal: boolean;
    }
  /** ≤ 8 characters: a prefix or a suffix. Shown as a table row. */
  | { kind: 'short'; path: string; label: string; value: string | undefined; max: number }
  | {
      kind: 'enum';
      path: string;
      label: string;
      value: string | undefined;
      options: string[];
      /** Optional enums offer "None" (the value is left out). */
      required: boolean;
    }
  | { kind: 'bool'; path: string; label: string; value: boolean | undefined }
  | {
      kind: 'rows';
      path: string;
      label: string;
      rows: { label: string; value: number; labelPath: string; valuePath: string }[];
    };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Longest text that is a table row, not a field of its own. */
export const SHORT_TEXT_MAX = 8;
/** A text this long or longer can be the title field. */
export const TITLE_MIN = 20;

function jsonOf(schema: z.ZodType): Json {
  return z.toJSONSchema(schema, { target: 'draft-7', io: 'input', unrepresentable: 'any' }) as Json;
}

/** "countFrom" → "Count from", "leftDetail" → "Left detail". */
export function labelOf(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SAFE = /^[A-Za-z0-9_-]+$/;

/** The content root of a schema: its JSON node, its pointer prefix and the params part it reads. */
function rootOf(schema: z.ZodType, params: Json): { node: Json; base: string; value: Json } {
  const root = jsonOf(schema);
  const props = isObj(root['properties']) ? root['properties'] : {};
  const content = props['content'];
  if (isObj(content) && isObj(props['beats'])) {
    const v = params['content'];
    return { node: content, base: '/content', value: isObj(v) ? v : {} };
  }
  return { node: root, base: '', value: params };
}

function isRowsArray(node: Json): boolean {
  if (node['type'] !== 'array' || !isObj(node['items'])) return false;
  const p = node['items']['properties'];
  if (!isObj(p)) return false;
  const label = p['label'];
  const value = p['value'];
  return isObj(label) && label['type'] === 'string' && isObj(value) && value['type'] === 'number';
}

export function contentForm(
  schema: z.ZodType,
  params: Record<string, unknown>,
  focalPath?: string,
): Field[] {
  const { node, base, value } = rootOf(schema, params);
  const props = isObj(node['properties']) ? node['properties'] : {};
  const required = new Set(Array.isArray(node['required']) ? (node['required'] as string[]) : []);

  const texts: Extract<Field, { kind: 'text' }>[] = [];
  const table: Extract<Field, { kind: 'number' | 'short' }>[] = [];
  const enums: Extract<Field, { kind: 'enum' }>[] = [];
  const bools: Extract<Field, { kind: 'bool' }>[] = [];
  const rows: Extract<Field, { kind: 'rows' }>[] = [];

  for (const key of Object.keys(props)) {
    const child = props[key];
    if (!SAFE.test(key) || !isObj(child)) continue;
    if (base === '' && (key === 'beats' || key === 'images')) continue;
    const path = `${base}/${key}`;
    const label = labelOf(key);
    const v = value[key];
    if (Array.isArray(child['enum'])) {
      const options = (child['enum'] as unknown[]).filter(
        (o): o is string => typeof o === 'string',
      );
      if (options.length > 0) {
        enums.push({
          kind: 'enum',
          path,
          label,
          value: typeof v === 'string' ? v : undefined,
          options,
          required: required.has(key),
        });
      }
    } else if (child['type'] === 'string') {
      const max = typeof child['maxLength'] === 'number' ? child['maxLength'] : undefined;
      if (max !== undefined && max <= SHORT_TEXT_MAX) {
        table.push({
          kind: 'short',
          path,
          label,
          value: typeof v === 'string' ? v : undefined,
          max,
        });
      } else {
        texts.push({
          kind: 'text',
          path,
          label,
          value: typeof v === 'string' ? v : '',
          ...(max !== undefined ? { max } : {}),
          required: required.has(key),
          title: false,
        });
      }
    } else if (child['type'] === 'number' || child['type'] === 'integer') {
      table.push({
        kind: 'number',
        path,
        label,
        value: typeof v === 'number' ? v : undefined,
        ...(typeof child['minimum'] === 'number' ? { min: child['minimum'] } : {}),
        ...(typeof child['maximum'] === 'number' ? { max: child['maximum'] } : {}),
        int: child['type'] === 'integer',
        required: required.has(key),
        focal: false,
      });
    } else if (child['type'] === 'boolean') {
      bools.push({ kind: 'bool', path, label, value: typeof v === 'boolean' ? v : undefined });
    } else if (isRowsArray(child)) {
      const list = Array.isArray(v) ? v : [];
      rows.push({
        kind: 'rows',
        path,
        label,
        rows: list.flatMap((item, i) =>
          isObj(item) && typeof item['label'] === 'string' && typeof item['value'] === 'number'
            ? [
                {
                  label: item['label'],
                  value: item['value'],
                  labelPath: `${path}/${i}/label`,
                  valuePath: `${path}/${i}/value`,
                },
              ]
            : [],
        ),
      });
    }
  }

  // The title: the first required text that can hold a headline.
  const title = texts.find((t) => t.required && (t.max === undefined || t.max >= TITLE_MIN));
  if (title) title.title = true;
  const ordered = title ? [title, ...texts.filter((t) => t !== title)] : texts;

  // The focal number gets the ember dot: the given one, else the first number.
  const numbers = table.filter((f): f is Extract<Field, { kind: 'number' }> => f.kind === 'number');
  const focal = numbers.find((f) => f.path === focalPath) ?? numbers[0];
  if (focal) focal.focal = true;

  return [...ordered, ...table, ...enums, ...bools, ...rows];
}

/** A copy of `params` with the value at JSON pointer `path` set; `undefined` removes the key. */
export function setField(
  params: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(params);
  const segs = path.split('/').slice(1);
  const last = segs.pop();
  if (last === undefined) return next;
  let cur: unknown = next;
  for (const seg of segs) {
    const holder = cur as Record<string, unknown> | unknown[];
    const existing = (holder as Record<string, unknown>)[seg];
    if (typeof existing !== 'object' || existing === null) {
      (holder as Record<string, unknown>)[seg] = {};
    }
    cur = (holder as Record<string, unknown>)[seg];
  }
  const target = cur as Record<string, unknown> | unknown[];
  if (value === undefined) {
    if (Array.isArray(target)) target.splice(Number(last), 1);
    else delete target[last];
  } else {
    (target as Record<string, unknown>)[last] = value;
  }
  return next;
}

export type ParsedInput = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * What the user typed in a field, as a value. Numbers accept "1,200", "1.2k", "$140k", "40%"
 * and a leading minus (the spoken-number parser handles the digits); anything else is an error
 * message for the field. Empty optional fields remove the value.
 */
export function parseFieldInput(field: Field, raw: string): ParsedInput {
  const text = raw.trim();
  switch (field.kind) {
    case 'text':
      if (text === '' && field.required) return { ok: false, error: 'This can’t be empty.' };
      return { ok: true, value: text === '' ? undefined : text };
    case 'short':
      return { ok: true, value: text === '' ? undefined : text };
    case 'number': {
      if (text === '') {
        return field.required
          ? { ok: false, error: 'Enter a number.' }
          : { ok: true, value: undefined };
      }
      const negative = text.startsWith('-') || text.startsWith('−');
      const body = negative ? text.slice(1).trim() : text;
      const n = parseSpokenNumber([body], 0);
      if (!n || n.end !== 1) return { ok: false, error: 'Enter a number, like 1,200 or 40%.' };
      return { ok: true, value: negative ? -n.value : n.value };
    }
    case 'enum':
      if (text === '') {
        return field.required
          ? { ok: false, error: 'Pick one of the options.' }
          : { ok: true, value: undefined };
      }
      return field.options.includes(text)
        ? { ok: true, value: text }
        : { ok: false, error: 'Pick one of the options.' };
    case 'bool':
      return { ok: true, value: text === 'true' };
    case 'rows':
      return { ok: false, error: 'Edit a row, not the whole list.' };
  }
}

/** The text a field shows: numbers as the user would type them. */
export function displayValue(field: Field): string {
  if (field.kind === 'number') return field.value === undefined ? '' : String(field.value);
  if (field.kind === 'text') return field.value;
  if (field.kind === 'short' || field.kind === 'enum') return field.value ?? '';
  return '';
}
