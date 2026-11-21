import { generateMusicClip, MusicBriefSchema } from '@motionpop/ai/music';
import { decodeWavStereo16, encodeWavStereo16, loopReelMusic } from '@motionpop/motion/reel';
import { applicationDefault } from 'firebase-admin/app';
import { z } from 'zod';
import { HttpError, errorResponse, verifyRequest } from '@/lib/firebase/verify.server';

/**
 * `POST /api/reel/music` (spec 27 R3.2): the reel's soundtrack. Generates a clip from the
 * director's brief with the cloud music model (server credentials, Vertex AI), loops it to the
 * reel's length with a long crossfade and returns a 16-bit stereo WAV. The browser stores it as
 * the project's music. Signed-in callers only (ID token + App Check).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BodySchema = z.object({
  brief: MusicBriefSchema,
  durationMs: z.number().int().min(1000).max(10 * 60_000),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
});

// A light per-instance guard against loops: each account gets a handful of soundtracks a minute.
const recent = new Map<string, number[]>();
function allow(uid: string): boolean {
  const now = Date.now();
  const list = (recent.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 6) return false;
  list.push(now);
  recent.set(uid, list);
  return true;
}

function projectId(): string {
  const id =
    process.env['MP_GCP_PROJECT'] ??
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
  if (!id) throw new HttpError(503, 'Music is not configured here');
  return id;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const body = BodySchema.parse(await req.json().catch(() => ({})));
    if (!allow(caller.uid)) throw new HttpError(429, 'Too many soundtracks at once');
    const token = await applicationDefault().getAccessToken();
    const clip = await generateMusicClip(body.brief, {
      projectId: projectId(),
      accessToken: token.access_token,
      ...(body.seed !== undefined ? { seed: body.seed } : {}),
    });
    const pcm = decodeWavStereo16(clip.wav);
    if (!pcm || pcm.left.length < pcm.sampleRate * 4)
      throw new HttpError(502, 'The music came back unreadable');
    const wav = encodeWavStereo16(loopReelMusic(pcm, body.durationMs));
    return new Response(wav, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, no-store',
        'X-Music-Model': clip.model,
        'X-Music-Latency': String(clip.latencyMs),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: 'Bad request' }, { status: 400 });
    if (!(err instanceof HttpError)) console.warn('reel music failed', err);
    return errorResponse(err);
  }
}
