// Film lab: word timings for the Suez voiceover, with the product's own transcription prompt.
// Usage: node scripts/run-film-lab.ts transcribe <audio.wav> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import {
  TRANSCRIBE_CLOUD_SYSTEM_V1,
  transcribeCloudPromptV1,
} from '../../../ai/src/prompts/transcribe-cloud.v1';
import { generate, parseJson } from './gemini';

const [audio, out] = process.argv.slice(2);
if (!audio || !out) throw new Error('usage: transcribe <audio.wav> <out.json>');
const buf = readFileSync(audio);
// 16-bit mono 24 kHz WAV from the TTS call: 48,000 bytes a second after the 44-byte header.
const durationMs = Math.round(((buf.length - 44) / 48_000) * 1000);
const res = await generate({
  model: 'gemini-3.8-flash',
  system: TRANSCRIBE_CLOUD_SYSTEM_V1,
  prompt: transcribeCloudPromptV1({ durationMs, language: 'en' }),
  media: [{ mimeType: 'audio/wav', base64: buf.toString('base64') }],
  thinking: 'LOW',
  jsonSchema: {
    type: 'object',
    properties: {
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            startMs: { type: 'integer' },
            endMs: { type: 'integer' },
            conf: { type: 'number' },
          },
          required: ['text', 'startMs', 'endMs', 'conf'],
        },
      },
    },
    required: ['words'],
  },
});
const parsed = parseJson(res.text) as { words: { text: string; startMs: number; endMs: number }[] };
writeFileSync(
  out,
  JSON.stringify(
    {
      durationMs,
      words: parsed.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs })),
    },
    null,
    1,
  ),
);
console.log(`${parsed.words.length} words, ${durationMs} ms, ${res.latencyMs} ms`);
