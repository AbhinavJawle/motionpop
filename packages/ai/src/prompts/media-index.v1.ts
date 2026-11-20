/**
 * `media.index` prompt v1 (spec 20 R2.1): multimodal indexing of user-uploaded B-roll videos,
 * screen recordings, screenshots, and photos. Gemini 4 Neon inspects the attached JPEG keyframes
 * for each clip in order and returns structured summaries, tags, dominant colors, and the best
 * usable moments with Screen-Studio-style normalized `(focusX, focusY, zoom)` targets.
 */
export const MEDIA_INDEX_SYSTEM_V1 = `You are a multimodal video editor and media indexer. You inspect keyframes sampled from user-uploaded B-roll clips, screen recordings, screenshots, and photos so a director can weave them seamlessly into a short-form Reel.
Answer with JSON only, matching the schema.

CLASSIFICATION (kind)
- "screen-recording": screen capture of an app, website, browser, dashboard, terminal, code editor, design tool, or mobile screen.
- "broll": real-world or stylized motion footage (product shots, hands typing, workspace, city, people, hardware, cinematic visuals).
- "screenshot": static capture of a UI, tweet, chart, document, slide, terminal, or code snippet.
- "photo": static photograph or illustration.

MOMENTS (1 to 3 per clip)
- For screen recordings: identify the 1 to 3 clearest UI moments. Pinpoint (focusX, focusY) in 0..1 on the exact button, chart, code block, or metric being shown, and pick zoom between 1.35 and 1.85 so the editor can smoothly auto-zoom into it.
- For B-roll videos: pick the 1 to 3 cleanest 2s-5s windows with strong visual clarity; focusX/focusY on the subject, zoom 1.0 to 1.2.
- For screenshots/photos: return 1 moment with startMs=0, endMs=4000, focusX/focusY on the key headline/metric/subject, zoom 1.05 to 1.35.
- Every clip in the input MUST appear once in the output with the exact same "id".
- Keep summary to one crisp concrete sentence (under 24 words) describing what is visually shown so a director can match it to spoken lines.
- Tags: 3 to 6 short lowercase topic keywords.
- dominantColors: 2 to 3 hex colors (e.g. "#0b0c10").`;

export interface MediaIndexPromptClip {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  frameTimesMs: number[];
}

export function mediaIndexPromptV1(clips: readonly MediaIndexPromptClip[]): string {
  const lines: string[] = [
    `Analyze these ${clips.length} uploaded media ${clips.length === 1 ? 'clip' : 'clips'}. The attached images appear in the exact order listed below:`,
    '',
  ];
  let imgIdx = 1;
  for (const c of clips) {
    const startIdx = imgIdx;
    const endIdx = imgIdx + Math.max(0, c.frameTimesMs.length - 1);
    imgIdx += c.frameTimesMs.length;
    const isVideo = c.mimeType.startsWith('video/');
    const times = c.frameTimesMs.map((t) => `${(t / 1000).toFixed(1)}s`).join(', ');
    lines.push(
      `- id="${c.id}" · file="${c.name}" · ${isVideo ? `video ${((c.durationMs ?? 0) / 1000).toFixed(1)}s` : 'still image'} (${c.width}×${c.height}) · images #${startIdx}${endIdx > startIdx ? `..#${endIdx}` : ''} at [${times}]`,
    );
  }
  lines.push('', 'Return the JSON index for every clip id.');
  return lines.join('\n');
}
