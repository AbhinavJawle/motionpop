import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, costOf } from '@motionpop/schemas';
import { NOTE_FIX_SYSTEM_V1, noteFixPromptV1 } from '../prompts/note-fix.v1';
import type { TaskDef } from '../router';
import { EditPatchOutputSchema, type EditPatchOutput } from './edit-patch';
import { checkPatch, patchJsonSchema, type PatchCheckOptions } from './patch-check';

const Unit = z.number().min(0).max(1);

export const NoteFixInputSchema = z.object({
  componentId: z.string().min(1),
  fieldGuide: z.string().max(2500),
  paths: z
    .array(z.string().regex(/^\/[A-Za-z0-9_\-/]*$/))
    .min(1)
    .max(40),
  /** The edit document: the slot's params plus `timing` (`editDoc`). */
  current: z.record(z.string(), z.unknown()),
  note: z.object({
    text: z.string().trim().min(1).max(300),
    /** Milliseconds from the slot start. */
    tMs: z.number().int().nonnegative(),
    region: z.object({
      x: Unit,
      y: Unit,
      w: z.number().min(0.01).max(1),
      h: z.number().min(0.01).max(1),
    }),
  }),
  /** Texts of the graphic's elements inside the region (`data-text` hooks), at most 8 of 80 characters. */
  regionText: z.array(z.string().max(80)).max(8),
  /** JPEG crop of the region, base64, longest side at most 512 px. Absent when capture is unavailable. */
  image: z.string().max(400_000).optional(),
});
export type NoteFixInput = z.infer<typeof NoteFixInputSchema>;

/** Same answer as `edit.patch`: the note is marked fixed when the patch applies. */
export const NoteFixOutputSchema = EditPatchOutputSchema;
export type NoteFixOutput = EditPatchOutput;

/**
 * `note.fix` (frame notes, ai-tasks.md §4b). Routed, checked and repaired like `edit.patch`
 * (they share `checkPatch`); the picture goes to the model as inline JPEG only when there is one.
 * Gemini Nano takes JPEG and PNG with text in one single-turn prompt (AI Logic hybrid docs,
 * Context7, 2026-11-16). Free on the device, 1 credit in the cloud, never an automatic fallback.
 */
export function noteFixTask(
  schemaFor: (componentId: string) => z.ZodType | undefined,
  opts: PatchCheckOptions = {},
): TaskDef<NoteFixInput, NoteFixOutput> {
  return {
    id: 'note.fix',
    maxOutputTokens: 1024,
    input: NoteFixInputSchema,
    output: NoteFixOutputSchema,
    mode: () => 'PREFER_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: NOTE_FIX_SYSTEM_V1,
    prompt: (i) => noteFixPromptV1({ ...i, hasImage: i.image !== undefined }),
    cloudCost: () => costOf('edit', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    thinking: 'MINIMAL',
    jsonSchema: (input) => patchJsonSchema(input.paths),
    media: (i) => (i.image ? { mimeType: 'image/jpeg', base64: i.image } : undefined),
    check: (out, input) => checkPatch(out, input, schemaFor, opts),
  };
}
