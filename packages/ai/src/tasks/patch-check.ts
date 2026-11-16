import { applyPatch, deepClone, validate, type Operation } from 'fast-json-patch';
import { z } from 'zod';
import { SlotTimingSchema, type JsonPatchOp } from '@motionpop/schemas';
import { splitEditDoc, type TimingDefaults } from '../edit/edit-doc';
import type { EditPatchOutput } from './edit-patch';

export type ParamsResult =
  { ok: true; params: Record<string, unknown> } | { ok: false; error: string };

/** Apply a patch to a copy of the params (never mutates). Fails on a bad path or a non-object. */
export function applyParamsPatch(
  params: Record<string, unknown>,
  patch: readonly JsonPatchOp[],
): ParamsResult {
  const doc = deepClone(params) as Record<string, unknown>;
  const ops = deepClone(patch) as Operation[];
  try {
    const error = validate(ops, doc);
    if (error) return { ok: false, error: `${error.name}: ${error.message.split('\n')[0] ?? ''}` };
    const next: unknown = applyPatch(doc, ops, false, false).newDocument;
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      return { ok: false, error: 'params must stay an object' };
    }
    return { ok: true, params: next as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** What the shared check needs from an `edit.patch` or `note.fix` input. */
export interface PatchCheckInput {
  componentId: string;
  paths: readonly string[];
  /** The edit document (params plus timing). */
  current: Record<string, unknown>;
}

export interface PatchCheckOptions {
  /** For scenes: a code-written report when the new params fail a gate, else null. */
  gate?: (componentId: string, params: unknown) => string | null;
  timingDefaults?: TimingDefaults;
}

export const DEFAULT_TIMING: TimingDefaults = { speed: 1, ease: 'inOut', fade: true };

/**
 * The check both `edit.patch` and `note.fix` use (spec 09 task 5). Returns the text fed back to
 * the model for the repair, or null when the patch is usable. In order: only listed paths, the
 * patch applies, the timing parses, the params parse with the component's schema, the optional
 * gate passes. An `escalate` answer is not checked: nothing gets applied.
 */
export function checkPatch(
  out: EditPatchOutput,
  input: PatchCheckInput,
  schemaFor: (componentId: string) => z.ZodType | undefined,
  opts: PatchCheckOptions = {},
): string | null {
  if (out.escalate) return null;
  if (out.patch.length === 0) return 'the patch is empty; change something or set escalate';
  const allowed = new Set(input.paths);
  const bad = out.patch.find((op) => !allowed.has(op.path));
  if (bad) return `the path ${bad.path} is not editable; use only the listed paths`;
  const applied = applyParamsPatch(input.current, out.patch);
  if (!applied.ok) return `the patch does not apply: ${applied.error}`;
  const { params, timing } = splitEditDoc(applied.params, opts.timingDefaults ?? DEFAULT_TIMING);
  if (timing) {
    const t = SlotTimingSchema.safeParse(timing);
    if (!t.success) return `the timing is invalid: ${z.prettifyError(t.error).slice(0, 300)}`;
  }
  const schema = schemaFor(input.componentId);
  if (!schema) return null;
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return `the patched params are invalid: ${z.prettifyError(parsed.error).slice(0, 400)}`;
  }
  return opts.gate?.(input.componentId, parsed.data) ?? null;
}

/** The structured-output schema of a patch answer: `op` and `path` are enums (ai-tasks.md schema rules). */
export function patchJsonSchema(paths: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      patch: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['replace', 'add', 'remove'] },
            path: { type: 'string', enum: [...paths] },
            value: {},
          },
          required: ['op', 'path'],
        },
      },
      escalate: { type: 'boolean' },
      message: { type: 'string' },
    },
    required: ['patch'],
  };
}
