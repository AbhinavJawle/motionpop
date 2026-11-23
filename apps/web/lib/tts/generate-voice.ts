import {
  speakWithFirebase,
  ttsMinutes,
  type PartCache,
  type SpeakInput,
  type UsageEvent,
} from '@motionpop/ai';
import { idbPartCache } from './part-cache';
import { isAbortError, raceAbort, throwIfAborted } from '@/lib/abort';
import { emitAIUsage } from '@/lib/ai/router-client';
import { APP_CONFIG_DEFAULTS, costOf, type AppConfig } from '@motionpop/schemas';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { getAILogic } from '@/lib/firebase/client';
import { encodeWav } from '@/lib/audio/wav';

/**
 * Script → voice (spec 11 R6): Gemini TTS through AI Logic, charged per started minute before the
 * call (the price is on the button) and refunded when it fails. Returns a WAV file that goes
 * through the same intake as an upload, so processing never knows the difference.
 */
export type VoiceOutcome =
  | { ok: true; file: File; durationMs: number; credits: number; latencyMs: number }
  | { ok: false; reason: string; noCredits?: boolean };

export interface VoiceDeps {
  credits: CreditsClient | null;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits' | 'modelTts'>;
  /** Injected in tests. */
  speak?: typeof speakWithFirebase;
  /** Where the usage event goes (Settings' usage chart); the router's listeners by default. */
  onUsage?: (e: UsageEvent) => void;
  /** Progress through a long script, part by part. */
  onPart?: (done: number, total: number) => void;
  /** Audio of parts already generated (spec 13b R4.2). Default: the browser's IndexedDB store. */
  partCache?: PartCache | null;
}

export function voiceCost(text: string, speed: number, cfg = APP_CONFIG_DEFAULTS): number {
  return costOf('tts', ttsMinutes(text, speed), cfg);
}

export function pcmToWavFile(pcm: Int16Array, sampleRate: number, name: string): File {
  const f = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) f[i] = (pcm[i] ?? 0) / 32768;
  return new File([encodeWav(f, sampleRate)], name, { type: 'audio/wav' });
}

/**
 * `signal` cancels the job that asked for the voice (spec 39 R6.9): nothing is spent when it has
 * already fired, and a cancel after the spend hands the price back and throws an `AbortError`
 * instead of returning a voice.
 */
export async function generateVoice(
  deps: VoiceDeps,
  input: SpeakInput,
  signal?: AbortSignal,
): Promise<VoiceOutcome> {
  throwIfAborted(signal);
  const text = input.text.trim();
  if (!text) return { ok: false, reason: 'Write a script first' };
  if (!deps.credits) return { ok: false, reason: 'Sign in to generate a voice' };
  const cfg = { ...APP_CONFIG_DEFAULTS, ...deps.config };
  const minutes = ttsMinutes(text, input.speed ?? 1);
  const spent = await spendWithUi(
    deps.credits,
    { action: 'tts', units: minutes, key: newSpendKey(), refId: 'script' },
    cfg,
  );
  if (!spent) return { ok: false, reason: 'Not enough credits', noCredits: true };
  if (!spent.ok) {
    return spent.reason === 'insufficient'
      ? { ok: false, reason: 'Not enough credits', noCredits: true }
      : { ok: false, reason: 'Couldn’t reserve the credits' };
  }
  // TTS calls the model directly (audio out is not a router task), so it reports its own usage.
  const report = deps.onUsage ?? emitAIUsage;
  const cost = costOf('tts', minutes, cfg);
  const t0 = performance.now();
  try {
    // Cancelled while the spend was in flight: hand it back before any call is made.
    throwIfAborted(signal);
    const r = await raceAbort(
      (deps.speak ?? speakWithFirebase)(
        getAILogic,
        cfg.modelTts,
        { ...input, text },
        undefined,
        deps.onPart,
        deps.partCache === undefined ? idbPartCache() : (deps.partCache ?? undefined),
      ),
      signal,
    );
    // Cancelled just as the voice arrived: it is dropped, never returned.
    throwIfAborted(signal);
    const file = pcmToWavFile(r.pcm, r.sampleRate, 'script-voice.wav');
    report({
      task: 'tts.generate',
      ranOn: 'cloud',
      model: cfg.modelTts,
      credits: cost,
      cloudCost: cost,
      latencyMs: Math.round(r.latencyMs),
      ok: true,
    });
    return {
      ok: true,
      file,
      durationMs: Math.round((r.pcm.length / r.sampleRate) * 1000),
      credits: costOf('tts', minutes, cfg),
      latencyMs: r.latencyMs,
    };
  } catch (err) {
    const cancelled = isAbortError(err) || signal?.aborted === true;
    if (!cancelled) console.warn('Voice generation failed', err);
    report({
      task: 'tts.generate',
      ranOn: 'cloud',
      model: cfg.modelTts,
      credits: 0,
      cloudCost: cost,
      latencyMs: Math.round(performance.now() - t0),
      ok: false,
    });
    await deps.credits.refund(spent.txId).catch(() => {});
    if (cancelled) throw isAbortError(err) ? err : new DOMException('Cancelled', 'AbortError');
    return { ok: false, reason: 'Couldn’t generate the voice. Credits returned.' };
  }
}
