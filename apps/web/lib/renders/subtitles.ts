import type { RenderStatus } from '@motionpop/schemas';

export interface SubtitleWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

const pad = (n: number, len = 2) => String(Math.floor(Math.max(0, n))).padStart(len, '0');

/** Formats integer milliseconds as SubRip timestamp `HH:MM:SS,mmm`. */
export function formatSrtTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const hours = Math.floor(safe / 3_600_000);
  const mins = Math.floor((safe % 3_600_000) / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)},${pad(millis, 3)}`;
}

/** Formats integer milliseconds as WebVTT timestamp `HH:MM:SS.mmm`. */
export function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(',', '.');
}

function safeMs(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

function sanitizeCueToken(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/-->/g, '->').trim();
}

/** True when at least one transcript word has non-empty caption text. */
export function hasSubtitleWords(words: readonly SubtitleWord[]): boolean {
  return words.some((w) => sanitizeCueToken(w.text).length > 0);
}

/**
 * Groups word-timed transcript entries into crisp, readable subtitle cues (spec 46 R2.1):
 * - Up to 6 words or 2.8 seconds per cue, breaking early on > 450 ms pauses or terminal punctuation.
 * - Guarantees strictly monotonic, non-overlapping cues with `endMs > startMs`.
 * - Sanitizes newlines and `-->` sequences so cues never corrupt `.srt` or `.vtt` framing.
 */
export function groupWordsForSubtitles(
  words: readonly SubtitleWord[],
  opts: { maxWords?: number; maxDurationMs?: number; maxGapMs?: number } = {},
): SubtitleCue[] {
  const maxWords = Math.max(1, opts.maxWords ?? 6);
  const maxDurationMs = Math.max(400, opts.maxDurationMs ?? 2800);
  const maxGapMs = Math.max(100, opts.maxGapMs ?? 450);

  const cleaned = words
    .map((w) => ({
      text: sanitizeCueToken(w.text),
      startMs: safeMs(w.startMs),
      endMs: safeMs(w.endMs),
    }))
    .filter((w) => w.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const cues: SubtitleCue[] = [];
  let bucket: typeof cleaned = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0]!;
    const maxEnd = bucket.reduce((m, w) => Math.max(m, w.endMs), first.startMs);
    const prevEnd = cues[cues.length - 1]?.endMs ?? 0;
    const startMs = Math.max(prevEnd, first.startMs);
    const endMs = Math.max(startMs + 120, maxEnd);
    cues.push({
      index: cues.length + 1,
      startMs,
      endMs,
      text: bucket.map((w) => w.text).join(' '),
    });
    bucket = [];
  };

  for (const w of cleaned) {
    if (bucket.length > 0) {
      const first = bucket[0]!;
      const prev = bucket[bucket.length - 1]!;
      const gap = w.startMs - prev.endMs;
      const span = Math.max(w.endMs, w.startMs) - first.startMs;
      if (bucket.length >= maxWords || gap > maxGapMs || span > maxDurationMs) {
        flush();
      }
    }
    bucket.push(w);
    if (/[.!?]["')\]”’]*$/.test(w.text)) {
      flush();
    }
  }
  flush();
  return cues;
}

/** Builds a standards-compliant SubRip (`.srt`) file string from timed transcript words. */
export function buildSrt(words: readonly SubtitleWord[]): string {
  const cues = groupWordsForSubtitles(words);
  return cues
    .map(
      (c) =>
        `${c.index}\n${formatSrtTimestamp(c.startMs)} --> ${formatSrtTimestamp(c.endMs)}\n${c.text}`,
    )
    .join('\n\n')
    .concat(cues.length > 0 ? '\n' : '');
}

/** Builds a standards-compliant WebVTT (`.vtt`) file string from timed transcript words. */
export function buildVtt(words: readonly SubtitleWord[]): string {
  const cues = groupWordsForSubtitles(words);
  if (cues.length === 0) return 'WEBVTT\n';
  const body = cues
    .map((c) => `${formatVttTimestamp(c.startMs)} --> ${formatVttTimestamp(c.endMs)}\n${c.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/** Human-readable file size (`420 KB`, `4.6 MB`, `1.2 GB`). Returns null for missing/invalid bytes. */
export function formatFileSize(bytes: number | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export type PipelineStepState = 'done' | 'active' | 'pending';

export interface ExportPipelineStep {
  id: 'prepare' | 'render' | 'composite' | 'finalize';
  label: string;
  hint: string;
  state: PipelineStepState;
}

/**
 * Maps current render status & progress to a 4-stage visual stepper (spec 46 R3.1) so creators
 * can see what is happening during export without adding backend protocol complexity.
 */
export function exportStageSteps(
  status: RenderStatus | undefined,
  progress: number,
  opts: { hasStockLayers?: boolean; transparent?: boolean } = {},
): ExportPipelineStep[] {
  const pct = Math.max(0, Math.min(100, progress));
  let activeIdx = 0;
  if (status === 'done') activeIdx = 4;
  else if (status === 'encoding') activeIdx = pct >= 94 ? 3 : 2;
  else if (status === 'rendering') activeIdx = 1;
  else activeIdx = 0;

  const defs: ReadonlyArray<{ id: ExportPipelineStep['id']; label: string; hint: string }> = [
    {
      id: 'prepare',
      label: 'Prepare & upload media',
      hint: 'Package voice, footage, and timeline assets',
    },
    {
      id: 'render',
      label: 'Render motion frames',
      hint: opts.transparent
        ? 'Capture 30 fps graphics & captions on alpha canvas'
        : 'Capture 30 fps graphics and captions',
    },
    {
      id: 'composite',
      label: opts.transparent
        ? opts.hasStockLayers
          ? 'Composite tracks (VP9 alpha) & mix audio'
          : 'Encode VP9 alpha WebM & mix audio'
        : opts.hasStockLayers
          ? 'Composite tracks & mix audio'
          : 'Encode video & mix audio',
      hint: opts.transparent
        ? opts.hasStockLayers
          ? 'Layer multi-track media over transparent VP9 + Opus'
          : 'Transparent WebM (yuva420p) + voice and sound bed'
        : opts.hasStockLayers
          ? 'Layer multi-track media overlays and SFX/music'
          : 'H.264 video + voice and sound bed',
    },
    {
      id: 'finalize',
      label: 'Loudness (-14 LUFS) & verify',
      hint: 'Normalize audio levels and build cover frame',
    },
  ];

  return defs.map((d, i) => ({
    ...d,
    state: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending',
  }));
}
