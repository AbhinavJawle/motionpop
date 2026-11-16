import { z } from 'zod';
import { SlotTimingSchema, type SlotTiming } from '@motionpop/schemas';

/**
 * The edit document (spec 09 design, "The edit document"): quick edits and frame notes patch one
 * JSON document per slot, `{ ...params, timing }`, so `/timing/*` paths work without putting
 * timing into scene scores (D-037). Everything here is pure and shared by `edit.patch` and
 * `note.fix`.
 */
export type TimingDefaults = Required<SlotTiming>;
export type EditDoc = Record<string, unknown> & { timing: TimingDefaults };

/** The most paths one call may offer (the structured-output enum limit, ai-tasks.md schema rules). */
export const MAX_EDIT_PATHS = 40;

const TIMING_KEYS = ['speed', 'ease', 'fade'] as const;
const TIMING_PATHS = TIMING_KEYS.map((k) => `/timing/${k}`);
/** A path segment we are willing to put in a prompt and an enum. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
/** Never editable by the model: beats are anchors that code owns (D-032), images are assets. */
const HIDDEN_ROOT_KEYS = new Set(['beats', 'images']);
const MAX_DEPTH = 4;

/** The look's `moveEase` as the inspector's three choices (`inOutCubic` → `inOut`, `outExpo` → `out`). */
export function timingDefaultsFor(look: { moveEase: string }): TimingDefaults {
  const e = look.moveEase;
  const ease = e.startsWith('inOut') ? 'inOut' : e.startsWith('out') ? 'out' : 'linear';
  return { speed: 1, ease, fade: true };
}

/** `{ ...params, timing }` with every timing key filled from the slot's overrides or the defaults. */
export function editDoc(
  params: Record<string, unknown>,
  timing: SlotTiming | undefined,
  defaults: TimingDefaults,
): EditDoc {
  const { timing: _ignored, ...rest } = params;
  void _ignored;
  return {
    ...(structuredClone(rest) as Record<string, unknown>),
    timing: {
      speed: timing?.speed ?? defaults.speed,
      ease: timing?.ease ?? defaults.ease,
      fade: timing?.fade ?? defaults.fade,
    },
  };
}

/** Inverse of `editDoc`: the params without `timing`, and only the timing keys that differ from the defaults. */
export function splitEditDoc(
  doc: Record<string, unknown>,
  defaults: TimingDefaults,
): { params: Record<string, unknown>; timing: SlotTiming | undefined } {
  const { timing: raw, ...params } = doc;
  const t = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of TIMING_KEYS) {
    if (t[k] !== undefined && t[k] !== defaults[k]) out[k] = t[k];
  }
  return {
    params: structuredClone(params) as Record<string, unknown>,
    timing: Object.keys(out).length > 0 ? (out as SlotTiming) : undefined,
  };
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function jsonOf(schema: z.ZodType): Json {
  return z.toJSONSchema(schema, { target: 'draft-7', io: 'input', unrepresentable: 'any' }) as Json;
}

const TIMING_JSON = jsonOf(SlotTimingSchema);
const isLeaf = (n: Json): boolean =>
  Array.isArray(n['enum']) ||
  n['type'] === 'string' ||
  n['type'] === 'number' ||
  n['type'] === 'integer' ||
  n['type'] === 'boolean';

/** The nodes below `node` that a quick edit may change, with their JSON pointers, depth first in schema order. */
function collect(node: Json, value: unknown, base: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH || out.length >= MAX_EDIT_PATHS) return;
  if (isLeaf(node)) {
    out.push(base);
    return;
  }
  if (node['type'] === 'array' && isObj(node['items'])) {
    // Arrays are edited by index, only the items that exist now (nothing to guess).
    const items = Array.isArray(value) ? value : [];
    items.forEach((item, i) =>
      collect(node['items'] as Json, item, `${base}/${i}`, depth + 1, out),
    );
    return;
  }
  if (isObj(node['properties'])) {
    const props = node['properties'];
    const v = isObj(value) ? value : {};
    for (const key of Object.keys(props)) {
      if (!SAFE_SEGMENT.test(key)) continue;
      if (depth === 0 && HIDDEN_ROOT_KEYS.has(key)) continue;
      const child = props[key];
      if (isObj(child)) collect(child, v[key], `${base}/${key}`, depth + 1, out);
    }
  }
}

/**
 * Editable JSON pointers of a slot's params, most useful first, at most 40 including the three
 * `/timing/*` paths. Scenes (a score) offer `/content/*` leaves and `/variant`; components offer
 * their top-level leaves. Optional fields that are not set yet are listed, so `add` works.
 * Never `/beats…` or `/images…`.
 */
export function editablePaths(schema: z.ZodType, params: Record<string, unknown>): string[] {
  const root = jsonOf(schema);
  const props = isObj(root['properties']) ? root['properties'] : {};
  const paths: string[] = [];
  const room = MAX_EDIT_PATHS - TIMING_PATHS.length;
  const content = props['content'];
  if (isObj(content) && isObj(props['beats'])) {
    // A scene score.
    collect(content, params['content'], '/content', 1, paths);
    if (isObj(props['variant']) && paths.length < room) paths.push('/variant');
  } else {
    collect(root, params, '', 0, paths);
  }
  return [...paths.slice(0, room), ...TIMING_PATHS];
}

function nodeAt(root: Json, path: string): Json | undefined {
  let segs = path.split('/').slice(1);
  let node: Json | undefined = root;
  if (segs[0] === 'timing') {
    node = TIMING_JSON;
    segs = segs.slice(1);
  }
  for (const seg of segs) {
    if (!node) return undefined;
    if (node['type'] === 'array') {
      node = isObj(node['items']) ? node['items'] : undefined;
      continue;
    }
    const props: unknown = node['properties'];
    const next: unknown = isObj(props) ? props[seg] : undefined;
    node = isObj(next) ? next : undefined;
  }
  return node;
}

function typeText(n: Json): string {
  if (Array.isArray(n['enum'])) return `one of ${(n['enum'] as unknown[]).map(String).join(' | ')}`;
  const t = n['type'] === 'integer' ? 'whole number' : String(n['type']);
  if (n['type'] === 'string' && typeof n['maxLength'] === 'number') {
    return `${t}, at most ${n['maxLength']} characters`;
  }
  const lo = typeof n['minimum'] === 'number' ? n['minimum'] : undefined;
  const hi = typeof n['maximum'] === 'number' ? n['maximum'] : undefined;
  if (lo !== undefined && hi !== undefined) return `${t} from ${lo} to ${hi}`;
  return t;
}

/** One line per path from the schema's `.describe()` text: "/content/value: number. The number, exactly as spoken". */
export function fieldGuide(schema: z.ZodType, paths: readonly string[]): string {
  const root = jsonOf(schema);
  return paths
    .map((p) => {
      const node = nodeAt(root, p);
      if (!node) return `${p}: value`;
      const desc = typeof node['description'] === 'string' ? ` ${node['description']}` : '';
      return `${p}: ${typeText(node)}.${desc}`.slice(0, 220);
    })
    .join('\n');
}

/** What `edit.patch` and `note.fix` both send: the edit document, its paths and their guide. */
export function editContext(
  schema: z.ZodType,
  componentId: string,
  params: Record<string, unknown>,
  timing: SlotTiming | undefined,
  defaults: TimingDefaults,
): { componentId: string; fieldGuide: string; paths: string[]; current: EditDoc } {
  const paths = editablePaths(schema, params);
  return {
    componentId,
    fieldGuide: fieldGuide(schema, paths),
    paths,
    current: editDoc(params, timing, defaults),
  };
}
