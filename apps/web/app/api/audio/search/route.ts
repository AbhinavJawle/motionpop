import { NextResponse } from 'next/server';
import { searchUncommonEar, UncommonEarError } from '@/lib/audio/uncommon-ear.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/audio/search?q=&kind=music|sfx&tag=&cursor=&limit=`
 * Proxies Creative Commons music & SFX search to Uncommon Ear using server-only
 * `UNCOMMON_EAR_API_KEY` (never exposed to the browser).
 */
export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env.UNCOMMON_EAR_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      configured: false,
      tracks: [],
      total: 0,
      cursor: null,
      otherKind: null,
      otherKindTotal: null,
    });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') === 'sfx' ? 'sfx' : 'music';
  const q = searchParams.get('q') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? 12) || 12;

  try {
    const result = await searchUncommonEar({ q, kind, tag, cursor, limit }, apiKey);
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    if (err instanceof UncommonEarError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Audio search failed' }, { status: 502 });
  }
}
