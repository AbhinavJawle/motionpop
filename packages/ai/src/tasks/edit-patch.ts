import { applyPatch, deepClone, validate, type Operation } from 'fast-json-patch';
import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, JsonPatchOpSchema, costOf } from '@motionpop/schemas';
import { EDIT_PATCH_SYSTEM_V1, editPatchPromptV1 } from '../prompts/edit-patch.v1';
import type { TaskDef } from '../router';

export const EditPatchInputSchema = z.object({
  componentId: z.string().min(1),
  paramsSchemaSummary: z.string(),
  currentParams: z.record(z.string(), z.unknown()),
  instruction: z.string().trim().min(1).max(500),
});
export type EditPatchInput = z.infer<typeof EditPatchInputSchema>;

export const EditPatchOutputSchema = z.object({
  patch: z.array(JsonPatchOpSchema).max(20),
  escalate: z.boolean().optional(),
  message: z.string().max(200).optional(),
});
export type EditPatchOutput = z.infer<typeof EditPatchOutputSchema>;

export type ParamsResult =
  { ok: true; params: Record<string, unknown> } | { ok: false; error: string };

/** Apply a patch to a copy of the params (never mutates). Fails on a bad path or a non-object. */
export function applyParamsPatch(
  params: Record<string, unknown>,
  patch: readonly z.infer<typeof JsonPatchOpSchema>[],
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

/** Compact JSON Schema of a component's params for the prompt (fits Nano's small context). */
export function paramsSchemaSummary(schema: z.ZodType): string {
  const json: Record<string, unknown> = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
  delete json['$schema'];
  return JSON.stringify(json);
}

/**
 * `edit.patch` (quick edits). On-device first, free; 1 credit if it ends in the cloud. Built per
 * component schema so the router's check can prove the patched params stay valid: an invalid
 * patch is repaired once, then retried in the cloud (spec 00 R5.4, ai-tasks.md §4).
 */
export function editPatchTask(
  paramsSchema: (componentId: string) => z.ZodType | undefined,
): TaskDef<EditPatchInput, EditPatchOutput> {
  return {
    id: 'edit.patch',
    input: EditPatchInputSchema,
    output: EditPatchOutputSchema,
    mode: () => 'PREFER_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: EDIT_PATCH_SYSTEM_V1,
    prompt: editPatchPromptV1,
    cloudCost: () => costOf('edit', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: true,
    thinking: 'MINIMAL',
    check: (out, input) => {
      if (out.escalate) return null;
      if (out.patch.length === 0) return 'the patch is empty; change something or set escalate';
      const applied = applyParamsPatch(input.currentParams, out.patch);
      if (!applied.ok) return `the patch does not apply: ${applied.error}`;
      const schema = paramsSchema(input.componentId);
      if (!schema) return null;
      const parsed = schema.safeParse(applied.params);
      return parsed.success
        ? null
        : `the patched params are invalid: ${z.prettifyError(parsed.error).slice(0, 400)}`;
    },
  };
}
