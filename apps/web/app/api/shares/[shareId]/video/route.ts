import { Readable } from 'node:stream';
import { loadShare } from '@motionpop/render/store';
import { bucket } from '@/lib/renders/storage.server';
import { renderMode } from '@/lib/renders/mode.server';
import { adminDb } from '@/lib/firebase/admin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/shares/{shareId}/video` (emulator mode only): streams a shared video for the share
 * page, because the Storage emulator can't check signed URLs. The 22-character share id is the
 * capability, as on the page; in cloud mode the page signs a URL instead, so this answers 404.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shareId: string }> },
): Promise<Response> {
  try {
    if (renderMode() !== 'emulator') return new Response('Not found', { status: 404 });
    const { shareId } = await ctx.params;
    const loaded = await loadShare(adminDb(), shareId);
    const path = loaded?.render.outputPath;
    if (!loaded || !path) return new Response('Not found', { status: 404 });
    return new Response(Readable.toWeb(bucket().file(path).createReadStream()) as ReadableStream, {
      headers: { 'content-type': 'video/mp4', 'cache-control': 'private, no-store' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
