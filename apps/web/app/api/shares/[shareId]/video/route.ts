import { Readable } from 'node:stream';
import { loadShare } from '@motionpop/render/store';
import { renderContainerFor, renderMimeType } from '@motionpop/schemas';
import { parseByteRange } from '@/lib/renders/byte-range';
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
  req: Request,
  ctx: { params: Promise<{ shareId: string }> },
): Promise<Response> {
  try {
    if (renderMode() !== 'emulator') return new Response('Not found', { status: 404 });
    const { shareId } = await ctx.params;
    const loaded = await loadShare(adminDb(), shareId);
    const path = loaded?.render.outputPath;
    if (!loaded || !path) return new Response('Not found', { status: 404 });
    const mime = renderMimeType(renderContainerFor(loaded.render));
    const file = bucket().file(path);
    const [meta] = await file.getMetadata();
    const total = Number(meta.size ?? 0);
    if (total > 0) {
      const range = parseByteRange(req.headers.get('range'), total);
      if (range === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: {
            'content-range': `bytes */${total}`,
            'accept-ranges': 'bytes',
            'cache-control': 'private, no-store',
          },
        });
      }
      if (range) {
        return new Response(
          Readable.toWeb(file.createReadStream({ start: range.start, end: range.end })) as ReadableStream,
          {
            status: 206,
            headers: {
              'content-type': mime,
              'accept-ranges': 'bytes',
              'content-range': `bytes ${range.start}-${range.end}/${total}`,
              'content-length': String(range.end - range.start + 1),
              'cache-control': 'private, no-store',
            },
          },
        );
      }
    }
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, {
      headers: {
        'content-type': mime,
        'accept-ranges': 'bytes',
        ...(total > 0 ? { 'content-length': String(total) } : {}),
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
