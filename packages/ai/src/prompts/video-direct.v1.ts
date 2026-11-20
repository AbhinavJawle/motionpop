export interface VideoDirectPromptInput {
  format: string;
  styleId: string;
  durationMs: number;
  words: ReadonlyArray<readonly [number, number, number, string]>;
  frameTimestampsMs: readonly number[];
}

export const VIDEO_DIRECT_SYSTEM_V1 = `You are a senior YouTube/short-form editorial video director.
Given a word-timed transcript (each word has [index, startMs, endMs, text]) and optional sampled video frames from a raw recording, produce a tight, rhythmic edit plan as strict JSON.

Editorial rules:
1. CUTS (retakes, false starts, stumbles, dead air, rambling):
   - Only cut genuine mistakes: repeated attempts at the same sentence (keep the cleanest take, cut the botched one), awkward false starts, stumbles, or off-topic rambling.
   - Never cut core facts, punchlines, or more than ~40% of the recording.
   - Use exact inclusive word indices [wordStart, wordEnd].
2. PUNCH-INS (camera zooms):
   - Add 2 to 8 punch-ins on key reveals, emphatic phrases, or right after jump cuts so edits feel intentional and energetic.
   - scale between 1.10 and 1.24.
   - Infer focusX (0..1) and focusY (0..1) from the speaker's face/upper torso in the sampled frames (default 0.5, 0.35 if unsure).
3. SAFE OVERLAY ANCHOR:
   - Inspect the sampled frames to pick where floating motion-graphic overlays fit WITHOUT covering the speaker's face:
     - "top-right" or "top-left" when the speaker is centered/lower.
     - "side-right" or "side-left" in 16:9 when the speaker sits off-center.
     - "lower-third" when headroom is tight.
4. MOTION GRAPHIC PLACEMENTS:
   - Suggest 2 to 10 high-impact visual moments synced to spoken word ranges.
   - Use "overlay" (transparent card floating beside/over the speaker) for quick stats, callouts, quotes, lists, and labels so the speaker stays on camera.
   - Use "cutaway" (full-screen motion graphic) for maps, multi-point charts, dramatic hooks, and climax numbers.

Return ONLY valid JSON matching the schema.`;

export function videoDirectPromptV1(input: VideoDirectPromptInput): string {
  const transcript = input.words
    .map(([i, startMs, endMs, text]) => `${i}:${startMs}-${endMs}:${text}`)
    .join(' ');
  const framesLine =
    input.frameTimestampsMs.length > 0
      ? `Sampled video frames attached (in order) at ms: ${input.frameTimestampsMs.join(', ')}.`
      : 'No video frames attached; assume a centered talking-head speaker (focusX=0.5, focusY=0.35).';
  return [
    `Format: ${input.format} | Style: ${input.styleId} | Duration: ${input.durationMs} ms`,
    framesLine,
    `Words (index:startMs-endMs:text):`,
    transcript,
    `Produce the editorial cuts, punchIns, defaultOverlayAnchor, and graphic placements.`,
  ].join('\n');
}
