import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, JsonPatchOpSchema, costOf } from '@motionpop/schemas';
import { EDIT_PATCH_SYSTEM_V2, editPatchPromptV2 } from '../prompts/edit-patch.v2';
import type { TaskDef } from '../router';
import { checkPatch, patchJsonSchema, type PatchCheckOptions } from './patch-check';

export const EditPatchInputSchema = z.object({
  componentId: z.string().min(1),
  /** One line per editable path (`fieldGuide`). */
  fieldGuide: z.string().max(2500),
  /** The editable JSON pointers; the structured output allows only these. */
  paths: z
    .array(z.string().regex(/^\/[A-Za-z0-9_\-/]*$/))
    .min(1)
    .max(40),
  /** The edit document: the slot's params plus `timing` (`editDoc`). */
  current: z.record(z.string(), z.unknown()),
  instruction: z.string().trim().min(1).max(500),
});
export type EditPatchInput = z.infer<typeof EditPatchInputSchema>;

export const EditPatchOutputSchema = z.object({
  patch: z.array(JsonPatchOpSchema).max(8),
  escalate: z.boolean().optional(),
  message: z.string().max(200).optional(),
});
export type EditPatchOutput = z.infer<typeof EditPatchOutputSchema>;

export { applyParamsPatch, type ParamsResult } from './patch-check';

/**
 * `edit.patch` v2 (quick edits). The model patches the slot's edit document on the listed paths
 * only. Free on the device, 1 credit in the cloud. The app always passes `allowCloud: false` and
 * an explicit ONLY_* mode: escalating to the cloud is a user click (D-035), so `cloudFallback`
 * is off here. An invalid patch is repaired once, then the user is offered the cloud.
 */
export function editPatchTask(
  schemaFor: (componentId: string) => z.ZodType | undefined,
  opts: PatchCheckOptions = {},
): TaskDef<EditPatchInput, EditPatchOutput> {
  return {
    id: 'edit.patch',
    input: EditPatchInputSchema,
    output: EditPatchOutputSchema,
    mode: () => 'PREFER_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: EDIT_PATCH_SYSTEM_V2,
    prompt: editPatchPromptV2,
    cloudCost: () => costOf('edit', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    thinking: 'MINIMAL',
    jsonSchema: (input) => patchJsonSchema(input.paths),
    check: (out, input) => checkPatch(out, input, schemaFor, opts),
  };
}
