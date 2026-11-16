import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAP_FILE_NAMES } from '@motionpop/motion/compiler';

/**
 * Map imagery for the globe in the editor preview (public-domain world images bundled in
 * packages/motion/dist/maps). The preview iframe has an opaque origin and uploads these to
 * WebGL, so they are served with CORS. Only the bundled file names are accepted.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!MAP_FILE_NAMES.includes(file)) return new Response('Not found', { status: 404 });
  try {
    const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist', 'maps');
    const body = await readFile(join(dist, file));
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('Map imagery not built', { status: 503 });
  }
}
