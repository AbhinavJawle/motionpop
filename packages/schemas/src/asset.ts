import { z } from 'zod';

/**
 * A generated or uploaded image used by a slot (spec 07 R4). `pending` assets show the scene's
 * image-free form in the preview and block rendering; `failed` ones render the image-free form.
 */
export const ImageAssetSchema = z.object({
  id: z.string().min(1),
  /** sha256 of (model, recipe version, subject, aspect); identical requests reuse the asset. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(['pending', 'ready', 'failed']),
  source: z.enum(['generated', 'upload']),
  subject: z.string().min(1).max(120),
  /** True when the background was keyed out; false = shown as a framed photo. */
  keyed: z.boolean(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Storage path or local blob key. Present when `ready`. */
  src: z.string().min(1).optional(),
  error: z.string().optional(),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

/** Rendering may start only when no image is still pending (R4.4). */
export function canRender(assets: readonly Pick<ImageAsset, 'status'>[]): boolean {
  return assets.every((a) => a.status !== 'pending');
}
