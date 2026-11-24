import { NextResponse } from 'next/server';
import { fetchUncommonEarTrackAudio, UncommonEarError } from '@/lib/audio/uncommon-ear.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/audio/download?id=<trackId>&quality=preview|original`
 * Downloads one Uncommon Ear track by catalog ID so the browser can decode it into the local
 * audio store (IndexedDB) or save it without CORS or SSRF issues.
 */
export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env.UNCOMMON_EAR_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'UNCOMMON_EAR_API_KEY not configured' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim();
  const preferOriginal = searchParams.get('quality') === 'original';
  if (!id) {
    return NextResponse.json({ error: 'Missing track id' }, { status: 400 });
  }
  try {
    const audio = await fetchUncommonEarTrackAudio(id, apiKey, preferOriginal);
    return new NextResponse(audio.bytes, {
      status: 200,
      headers: {
        'Content-Type': audio.contentType,
        'Content-Disposition': `inline; filename="${audio.filename}"`,
        'Cache-Control': 'private, max-age=86400',
        'X-Credit-Line': encodeURIComponent(audio.creditLine),
      },
    });
  } catch (err) {
    if (err instanceof UncommonEarError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Audio download failed' }, { status: 502 });
  }
}
