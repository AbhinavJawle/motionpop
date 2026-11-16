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
  source: z.enum(['generated', 'upload', 'openverse']),
  subject: z.string().min(1).max(120),
  /** True when the background was keyed out; false = shown as a framed photo. */
  keyed: z.boolean(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Storage path or local blob key. Present when `ready`. */
  src: z.string().min(1).optional(),
  error: z.string().optional(),
  /** Credit line for a CC-BY picture (title, creator, licence), shown with it and kept with the project. */
  attribution: z.string().max(240).optional(),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

/** Where an asset's bytes live: `media:{hash}.webp` (this browser, mirrored to the account's Storage). */
export const mediaRef = (hash: string): string => `media:${hash}.webp`;
export const mediaHashOf = (ref: string): string | null => {
  const m = /^media:([0-9a-f]{64})\.webp$/.exec(ref);
  return m ? (m[1] as string) : null;
};
/** The account's Storage path for an asset (owner-only rule `users/{uid}/media/**`). */
export const mediaStoragePath = (uid: string, hash: string): string =>
  `users/${uid}/media/${hash}.webp`;

/** Rendering may start only when no image is still pending (R4.4). */
export function canRender(assets: readonly Pick<ImageAsset, 'status'>[]): boolean {
  return assets.every((a) => a.status !== 'pending');
}
