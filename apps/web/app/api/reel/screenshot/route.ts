import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderMode } from '@/lib/renders/mode.server';

/**
 * Website screenshots for reels (spec 26 R3.3), taken by our own headless Chrome. Available where
 * the server has Chrome (local and offline modes, or `MP_SCREENSHOTS=on`); elsewhere it answers
 * 501 and the reel's website scene draws its designed mock page instead.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const QuerySchema = z.string().trim().min(4).max(200);

export async function GET(request: Request) {
  const enabled = process.env['MP_SCREENSHOTS'] === 'on' || renderMode() !== 'cloud';
  if (!enabled) return NextResponse.json({ error: 'Screenshots are off here' }, { status: 501 });
  const parsed = QuerySchema.safeParse(new URL(request.url).searchParams.get('url') ?? '');
  if (!parsed.success) return NextResponse.json({ error: 'Bad url' }, { status: 400 });
  const { screenshotHost, takeScreenshot } = await import('@motionpop/render/screenshot');
  if (!screenshotHost(parsed.data))
    return NextResponse.json({ error: 'Not a public site' }, { status: 400 });
  const png = await takeScreenshot(parsed.data);
  if (!png) return NextResponse.json({ error: 'Could not load that site' }, { status: 502 });
  return new NextResponse(png.slice().buffer, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
  });
}
