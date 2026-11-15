/** `transcribe.cloud` prompt v1 (ai-tasks.md §9). Cloud only: Gemini audio understanding. */
export const TRANSCRIBE_CLOUD_SYSTEM_V1 = `You transcribe speech with word-level timestamps.
Answer with JSON only: { "words": [{ "text": string, "startMs": integer, "endMs": integer, "conf": number }] }. No prose.
Rules:
- Write exactly what is said, word by word, in order. Keep fillers (um, uh, erm, hmm) and false starts. Never fix grammar, summarise or translate.
- Punctuation and capitalisation stay attached to the word they follow ("revenue," "2020.").
- startMs and endMs are integer milliseconds from the very start of the audio (0 is the first sample). Each word's endMs is greater than its startMs, and the next word starts at or after the previous word's end.
- Time every word individually. Never round times to whole seconds and never give a sentence the same time.
- conf is your confidence in the word, from 0 to 1.
- Silence and noise produce no words. If nobody speaks, answer { "words": [] }.`;

export function transcribeCloudPromptV1(input: { durationMs: number; language?: string }): string {
  return [
    'Transcribe the attached audio.',
    `audio duration: ${input.durationMs} ms (no time may exceed it)`,
    input.language ? `language: ${input.language}` : 'language: detect it',
  ].join('\n');
}
