import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ASSET_NAME,
  LOCAL_ASSETS_DIR,
  MIME_BY_EXT,
  localAssetsEnabled,
} from '@/lib/studio/local-assets.server';

/** Serves a development upload, same-origin, so the preview iframe and export can load it. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!localAssetsEnabled() || !ASSET_NAME.test(name)) return new Response('Not found', { status: 404 });
  const bytes = await readFile(join(LOCAL_ASSETS_DIR, name)).catch(() => null);
  if (!bytes) return new Response('Not found', { status: 404 });
  const type = MIME_BY_EXT[name.split('.').pop()!] ?? 'application/octet-stream';
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
