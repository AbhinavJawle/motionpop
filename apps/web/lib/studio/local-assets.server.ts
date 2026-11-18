import 'server-only';
import { join } from 'node:path';

/**
 * Development-only disk storage for studio uploads (the Next counterpart of Pireel's
 * local-assets Vite plugin). Production uploads go to Cloud Storage (spec 17 task 8).
 */
export const LOCAL_ASSETS_DIR = join(process.cwd(), '.local-assets');
export const LOCAL_ASSETS_MAX_BYTES = 500 * 1024 * 1024;
export const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
};
export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]),
);
export const localAssetsEnabled = () => process.env.NODE_ENV !== 'production';
/** `<sha256>.<ext>` only: no paths, no traversal. */
export const ASSET_NAME = /^[0-9a-f]{64}\.[a-z0-9]{2,5}$/;
