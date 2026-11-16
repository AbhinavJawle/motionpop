import { getGenerativeModel, InferenceMode, type AI } from 'firebase/ai';
import { SCRIPT_MAX_CHARS } from '@motionpop/schemas';
import { z } from 'zod';

/**
 * `tts.generate` (spec 11 R6, hybrid-ai.md: cloud only, audio is not supported on-device). Gemini
 * TTS through Firebase AI Logic: `responseModalities: ['AUDIO']` with a prebuilt voice; the answer
 * is raw 16-bit PCM (24 kHz mono) as inline data. Checked against `@firebase/ai` 3.1.0 types
 * (`SpeechConfig`, `ResponseModality.AUDIO`, both beta) on 2026-11-16.
 */
export const TTS_VOICES = [
  { id: 'Kore', label: 'Warm', about: 'Calm and clear' },
  { id: 'Puck', label: 'Bright', about: 'Upbeat and friendly' },
  { id: 'Charon', label: 'Deep', about: 'Low and steady' },
  { id: 'Aoede', label: 'Breezy', about: 'Light and easy' },
  { id: 'Fenrir', label: 'Bold', about: 'Energetic' },
] as const;
export type TtsVoiceId = (typeof TTS_VOICES)[number]['id'];

export const SpeakInputSchema = z.object({
  text: z.string().trim().min(1).max(SCRIPT_MAX_CHARS),
  voice: z.enum(TTS_VOICES.map((v) => v.id) as [TtsVoiceId, ...TtsVoiceId[]]),
  /** 0.8–1.2; told to the model as a delivery note (the API has no rate control). */
  speed: z.number().min(0.8).max(1.2).default(1),
});
export type SpeakInput = z.input<typeof SpeakInputSchema>;

export interface SpeakResult {
  pcm: Int16Array;
  sampleRate: number;
  latencyMs: number;
  model: string;
}

/** `audio/L16;codec=pcm;rate=24000` → 24000; default 24 kHz. */
export function rateFromMime(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime ?? '');
  const r = m ? Number(m[1]) : 24_000;
  return Number.isFinite(r) && r >= 8000 && r <= 48_000 ? r : 24_000;
}

export function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length - (bin.length % 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  // PCM from the API is little-endian, like every browser.
  return new Int16Array(bytes.buffer);
}

/** Started minutes of speech for the price (tts is priced per started minute; ~150 words a minute). */
export function ttsMinutes(text: string, speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / (150 * speed)));
}

/**
 * The delivery note before the script, in the "Say <style>:" form the TTS docs use. At the
 * natural pace there is none: a hosted test (2026-11-16) spoke "Read naturally:" aloud.
 */
export const deliveryNote = (speed: number): string =>
  speed < 0.95 ? 'Say slowly and clearly: ' : speed > 1.05 ? 'Say briskly, with energy: ' : '';

/** Longest text sent in one TTS call: a short paragraph, well inside one model answer. */
export const TTS_PART_CHARS = 1200;

/**
 * Splits a script into parts of at most `max` characters on sentence ends (then commas, then
 * spaces), so a long script becomes several short TTS calls instead of one that may time out.
 * Joining the parts with single spaces gives back the script's words in order.
 */
export function splitScript(text: string, max = TTS_PART_CHARS): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const pieces: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) {
      pieces.push(s);
      continue;
    }
    // A run-on sentence: break at commas, then at spaces.
    let rest = s;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '));
      const at = cut > max * 0.4 ? cut + 1 : window.lastIndexOf(' ');
      const end = at > 0 ? at : max;
      pieces.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest) pieces.push(rest);
  }
  const parts: string[] = [];
  for (const p of pieces) {
    const last = parts[parts.length - 1];
    if (last !== undefined && last.length + 1 + p.length <= max)
      parts[parts.length - 1] = `${last} ${p}`;
    else parts.push(p);
  }
  return parts;
}

/** Silence between parts, like a breath at a paragraph break. */
const PART_GAP_MS = 220;

/**
 * The whole script as one voice: each part is one TTS call, in order, joined with a short pause.
 * `onPart(done, total)` reports progress for the button.
 */
export async function speakWithFirebase(
  getAI: () => Promise<AI>,
  model: string,
  raw: SpeakInput,
  now: () => number = () => performance.now(),
  onPart?: (done: number, total: number) => void,
): Promise<SpeakResult> {
  const input = SpeakInputSchema.parse(raw);
  const started = now();
  const parts = splitScript(input.text);
  const audio: Int16Array[] = [];
  let rate = 24_000;
  onPart?.(0, parts.length);
  for (let i = 0; i < parts.length; i++) {
    const r = await speakPart(getAI, model, { ...input, text: parts[i] ?? '' });
    rate = r.sampleRate;
    if (i > 0) audio.push(new Int16Array(Math.round((rate * PART_GAP_MS) / 1000)));
    audio.push(r.pcm);
    onPart?.(i + 1, parts.length);
  }
  const total = audio.reduce((n, c) => n + c.length, 0);
  const pcm = new Int16Array(total);
  let o = 0;
  for (const c of audio) {
    pcm.set(c, o);
    o += c.length;
  }
  return { pcm, sampleRate: rate, latencyMs: Math.round(now() - started), model };
}

/** One TTS call for one part of the script. */
async function speakPart(
  getAI: () => Promise<AI>,
  model: string,
  input: z.output<typeof SpeakInputSchema>,
): Promise<{ pcm: Int16Array; sampleRate: number }> {
  const ai = await getAI();
  const gm = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } } },
      },
    },
  });
  const result = await gm.generateContent([
    { type: 'text', text: `${deliveryNote(input.speed)}${input.text}` },
  ]);
  const parts = result.response.candidates?.[0]?.content.parts ?? [];
  const chunks: Int16Array[] = [];
  let rate = 24_000;
  for (const p of parts) {
    const data = 'inlineData' in p ? p.inlineData : undefined;
    if (data?.data && data.mimeType?.startsWith('audio/')) {
      rate = rateFromMime(data.mimeType);
      chunks.push(base64ToInt16(data.data));
    }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total < rate / 4) throw new Error('The voice came back empty');
  const pcm = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    pcm.set(c, o);
    o += c.length;
  }
  return { pcm, sampleRate: rate };
}
