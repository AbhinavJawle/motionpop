import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { renderMode } from '@/lib/renders/mode.server';

/**
 * Website screenshots for reels (spec 26 R3.3), taken by our own headless Chrome. Available where
 * the server has Chrome (local and offline modes, or `MP_SCREENSHOTS=on`); elsewhere it answers
 * 501 and the reel's website scene draws its designed mock page instead.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const QuerySchema = z.string().trim().min(4).max(200);
const MAX_CONCURRENT = 2;
const MAX_PER_MINUTE = 6;
let inFlight = 0;
const recentByUid = new Map<string, number[]>();

function allowCaller(uid: string): boolean {
  const now = Date.now();
  for (const [k, times] of recentByUid) {
    const fresh = times.filter((t) => now - t < 60_000);
    if (fresh.length === 0) recentByUid.delete(k);
    else recentByUid.set(k, fresh);
  }
  const list = recentByUid.get(uid) ?? [];
  if (list.length >= MAX_PER_MINUTE) return false;
  list.push(now);
  recentByUid.set(uid, list);
  return true;
}

export async function GET(request: Request) {
  const mode = renderMode();
  const enabled = process.env['MP_SCREENSHOTS'] === 'on' || mode !== 'cloud';
  if (!enabled) return NextResponse.json({ error: 'Screenshots are off here' }, { status: 501 });
  let callerKey = 'offline';
  if (mode !== 'offline') {
    try {
      const caller = await verifyRequest(request);
      callerKey = caller.uid;
    } catch (err) {
      return errorResponse(err);
    }
  }
  if (!allowCaller(callerKey) || inFlight >= MAX_CONCURRENT) {
    return NextResponse.json({ error: 'Too many screenshot requests' }, { status: 429 });
  }
  const parsed = QuerySchema.safeParse(new URL(request.url).searchParams.get('url') ?? '');
  if (!parsed.success) return NextResponse.json({ error: 'Bad url' }, { status: 400 });
  const { screenshotHost, takeScreenshot } = await import('@motionpop/render/screenshot');
  if (!screenshotHost(parsed.data))
    return NextResponse.json({ error: 'Not a public site' }, { status: 400 });
  inFlight++;
  try {
    const png = await takeScreenshot(parsed.data);
    if (!png) return NextResponse.json({ error: 'Could not load that site' }, { status: 502 });
    return new NextResponse(png.slice().buffer, {
      headers: {
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
}
