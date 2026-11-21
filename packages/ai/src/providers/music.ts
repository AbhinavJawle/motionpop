// Reel music (spec 27 R3.2): the cloud music model on Vertex AI, called from our server only (the
// caller passes an access token from the server's own credentials; nothing here runs in the
// browser). The answer is validated with zod and returned as WAV bytes.
import { z } from 'zod';

export const MUSIC_MODEL = 'lyria-002';
/** What one generated clip costs us (USD), for usage logs. */
export const MUSIC_CLIP_USD = 0.06;

export const MusicBriefSchema = z
  .string()
  .trim()
  .min(3)
  .max(300);

const MusicResponseSchema = z.object({
  predictions: z
    .array(
      z.object({
        bytesBase64Encoded: z.string().min(1000),
        mimeType: z.string().optional(),
      }),
    )
    .min(1),
});

export interface MusicRequestOptions {
  projectId: string;
  /** The music model is served from a regional endpoint. */
  location?: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  /** Same seed, same brief → the same music (the model is deterministic with a seed). */
  seed?: number;
  timeoutMs?: number;
}

/** The text the model gets: the director's brief plus the rules every reel soundtrack follows. */
export function musicPrompt(brief: string): string {
  return `${brief.trim().replace(/[.\s]+$/, '')}. Instrumental background score for a short spoken video: clean modern mix, steady groove, consistent energy from start to end, no vocals.`;
}

export async function generateMusicClip(
  brief: string,
  o: MusicRequestOptions,
): Promise<{ wav: Uint8Array; model: string; latencyMs: number }> {
  const text = MusicBriefSchema.parse(brief);
  const location = o.location ?? 'us-central1';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(o.projectId)}/locations/${location}/publishers/google/models/${MUSIC_MODEL}:predict`;
  const t0 = Date.now();
  const res = await (o.fetchFn ?? fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [
        {
          prompt: musicPrompt(text),
          negative_prompt: 'vocals, singing, choir, speech, lyrics, distortion, abrupt ending',
          ...(o.seed !== undefined ? { seed: o.seed } : {}),
        },
      ],
      parameters: o.seed !== undefined ? {} : { sample_count: 1 },
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`music model ${res.status}: ${detail}`);
  }
  const parsed = MusicResponseSchema.parse(await res.json());
  const b64 = parsed.predictions[0]!.bytesBase64Encoded;
  const wav = Uint8Array.from(Buffer.from(b64, 'base64'));
  return { wav, model: MUSIC_MODEL, latencyMs: Date.now() - t0 };
}
