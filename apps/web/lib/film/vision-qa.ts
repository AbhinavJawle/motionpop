import {
  critiqueContactSheet,
  type FilmBeatResult,
  type Router,
  type VisionFlaggedBeat,
} from '@motionpop/ai';
import { captionSafeBandForStage } from '@motionpop/motion';
import {
  FORMATS,
  clampSpeakerFocusY,
  stageBoxForMode,
  type Format,
  type StylePack,
} from '@motionpop/schemas';

const QA_TIMEOUT_MS = 22_000;
const BATCH_SIZE = 6;
const MAX_TOTAL_FIXES = 4;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Draws an image into destination rect `(dx, dy, dw, dh)` using exact face-centered cover-crop
 * geometry matching `preview-player.tsx` and `video-ffmpeg.ts` (spec 24 R4.3).
 */
function drawCoverCentered(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  focusX: number,
  focusY: number,
): void {
  const sw = Math.max(1, img.naturalWidth || img.width);
  const sh = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.max(dw / sw, dh / sh);
  const cropW = dw / scale;
  const cropH = dh / scale;
  const sx = Math.max(0, Math.min(sw - cropW, sw * focusX - cropW / 2));
  const sy = Math.max(0, Math.min(sh - cropH, sh * focusY - cropH / 2));
  ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, dw, dh);
}

/**
 * Renders one beat tile onto a browser canvas cell (spec 23 + 24 R4.3):
 * 1. Paints the look canvas and composites the speaker keyframe in its true `stageBoxForMode`
 *    rectangle using exact face-centered cover-crop math.
 * 2. Draws the REAL executed beat HTML snapshot at `keyMomentMs` (with clipped stage box & grid).
 * 3. Overlays the realistic studio black caption ribbon so Vision QA catches caption/contrast/empty-box defects.
 */
async function drawBeatTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  beat: FilmBeatResult,
  style: StylePack,
  format: Format,
  frameW: number,
  frameH: number,
  bgFrameBase64?: string,
  executedHtml?: string,
): Promise<void> {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // 1. Look canvas + speaker keyframe placed in its true choreography box with face-centered cover crop.
  ctx.fillStyle = style.colors.bg;
  ctx.fillRect(x, y, w, h);
  const stageMode = beat.beat.videoStage ?? 'split-top-stage';
  const stageBox = stageBoxForMode(stageMode, frameW, frameH);
  if (bgFrameBase64 && stageBox.opacity > 0.05) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const sx = x + stageBox.x * w;
        const sy = y + stageBox.y * h;
        const sw = stageBox.w * w;
        const sh = stageBox.h * h;
        ctx.save();
        ctx.beginPath();
        const r = Math.min(sw, sh) * stageBox.radiusFrac;
        if (r > 1) {
          const br = stageBox.topRadiusOnly ? 0 : r;
          ctx.roundRect(sx, sy, sw, sh, [r, r, br, br]);
        } else {
          ctx.rect(sx, sy, sw, sh);
        }
        ctx.clip();
        drawCoverCentered(
          ctx,
          img,
          sx,
          sy,
          sw,
          sh,
          beat.beat.focusX ?? 0.5,
          clampSpeakerFocusY(beat.beat.focusY),
        );
        if (stageBox.dim > 0.02) {
          ctx.fillStyle = `rgba(0,0,0,${stageBox.dim.toFixed(2)})`;
          ctx.fillRect(sx, sy, sw, sh);
        }
        ctx.restore();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `data:image/jpeg;base64,${bgFrameBase64}`;
    });
  }

  // 2. Render executed beat DOM snapshot (with all `mp.*` kit elements and clipped stage bounds).
  if (beat.params && (beat.params.html.trim().length > 0 || executedHtml)) {
    const u = Math.min(frameW, frameH) / 100;
    const vars = [
      `--u:${u}px`,
      `--bg:${style.colors.bg}`,
      `--ink:${style.colors.ink}`,
      `--muted:${style.colors.muted}`,
      `--accent:${style.colors.accent}`,
      `--accent2:${style.colors.accent2}`,
      `--highlight:${style.colors.highlight}`,
      `--positive:${style.colors.positive}`,
      `--negative:${style.colors.negative}`,
      `--paper:${style.colors.bg}`,
      `--display:Georgia,serif`,
      `--body:system-ui,-apple-system,sans-serif`,
      `--mono:ui-monospace,monospace`,
    ].join(';');
    const rawMarkup = executedHtml ?? `<style>${escapeXml(beat.params.css)}</style>${beat.params.html}`;
    const xhtml = rawMarkup.replace(/<(br|hr|img|input)([^>]*?)(?<!\/)>/gi, '<$1$2/>');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameW}" height="${frameH}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${frameW}px;height:${frameH}px;overflow:hidden;${vars}">
          ${xhtml}
        </div>
      </foreignObject>
    </svg>`;
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, x, y, w, h);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }

  // 2b. Overlay realistic studio black caption ribbon so Vision QA sees exact caption placement.
  const capBand = captionSafeBandForStage(format, frameW, frameH, stageMode);
  const capY = y + (capBand.top / frameH) * h;
  const capH = Math.max(16, ((capBand.bottom - capBand.top) / frameH) * h * 0.55);
  const capTop = capY + (((capBand.bottom - capBand.top) / frameH) * h - capH) / 2;
  ctx.fillStyle = '#0A0A0E';
  ctx.fillRect(x + w * 0.24, capTop, w * 0.52, capH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LIVE CAPTIONS', x + w / 2, capTop + capH * 0.7);
  ctx.textAlign = 'left';

  // 3. Crisp beat ID + stage badge in top-left corner so Gemini 4 Neon maps tiles with 100% accuracy.
  const label = `${beat.beat.id} · ${beat.beat.videoStage ?? 'split-top-stage'}`;
  ctx.fillStyle = 'rgba(10,10,14,0.82)';
  ctx.fillRect(x + 8, y + 8, Math.min(w - 16, label.length * 7.5 + 18), 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(label, x + 16, y + 24);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

async function runSingleBatch(args: {
  router: Router;
  batch: readonly FilmBeatResult[];
  format: Format;
  style: StylePack;
  frames?: readonly { timeMs: number; base64: string }[];
  executedSnapshots?: Readonly<Record<string, string>>;
  model?: string;
}): Promise<VisionFlaggedBeat[]> {
  const { batch } = args;
  if (batch.length === 0) return [];
  const dims = FORMATS[args.format];
  const cols = batch.length <= 2 ? batch.length : 3;
  const rows = Math.ceil(batch.length / cols);
  const tileW = args.format === '9:16' ? 360 : 440;
  const tileH = Math.round((tileW * dims.height) / dims.width);

  const canvas = document.createElement('canvas');
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.fillStyle = '#09090d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < batch.length; i++) {
    const beat = batch[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const midMs = (beat.beat.startMs + beat.beat.endMs) / 2;
    const nearestFrame = args.frames?.length
      ? [...args.frames].sort((a, b) => Math.abs(a.timeMs - midMs) - Math.abs(b.timeMs - midMs))[0]
          ?.base64
      : undefined;
    await drawBeatTile(
      ctx,
      col * tileW,
      row * tileH,
      tileW,
      tileH,
      beat,
      args.style,
      args.format,
      dims.width,
      dims.height,
      nearestFrame,
      args.executedSnapshots?.[beat.beat.id],
    );
  }

  let base64 = '';
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const comma = dataUrl.indexOf(',');
    if (comma <= 0) return [];
    base64 = dataUrl.slice(comma + 1);
  } catch {
    return [];
  }

  const qaPromise = critiqueContactSheet(
    args.router,
    {
      format: args.format,
      lookName: args.style.name,
      beats: batch.map((b) => ({
        id: b.beat.id,
        ...(b.beat.videoStage ? { videoStage: b.beat.videoStage } : {}),
        ...(b.beat.archetype ? { archetype: b.beat.archetype } : {}),
        text: b.beat.text,
      })),
      contactSheetBase64: base64,
    },
    args.model ? { model: args.model } : undefined,
  );

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), QA_TIMEOUT_MS));
  const verdict = await Promise.race([qaPromise, timeoutPromise]);
  if (!verdict || verdict.pass) return [];
  return verdict.flagged.filter((f) => f.severity === 'fix');
}

/**
 * Full-Reel Multimodal Vision QA (spec 24 R4.3): renders ALL built non-empty visual beats into
 * parallel 6-tile contact sheets (360px tiles with face-centered speaker framing, clipped stage
 * containers, and studio seam captions) and critiques every single beat on `gemini-4-neon`.
 * Returns up to 4 `'fix'`-flagged beats across the reel; never throws.
 */
export async function runVisionQaPass(args: {
  router: Router;
  beats: readonly FilmBeatResult[];
  format: Format;
  style: StylePack;
  frames?: readonly { timeMs: number; base64: string }[];
  executedSnapshots?: Readonly<Record<string, string>>;
  model?: string;
}): Promise<VisionFlaggedBeat[]> {
  if (typeof document === 'undefined') return [];
  // Inspect every built visual beat (skip pure zero-graphic `clean` breathing beats).
  const visualBeats = args.beats.filter(
    (b) =>
      b.params !== null &&
      !(b.beat.videoStage === 'clean' && b.params.html.trim().length === 0 && b.beat.text.length === 0),
  );
  if (visualBeats.length === 0) return [];

  const batches: FilmBeatResult[][] = [];
  for (let i = 0; i < visualBeats.length; i += BATCH_SIZE) {
    batches.push(visualBeats.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      runSingleBatch({
        router: args.router,
        batch,
        format: args.format,
        style: args.style,
        ...(args.frames ? { frames: args.frames } : {}),
        ...(args.executedSnapshots ? { executedSnapshots: args.executedSnapshots } : {}),
        ...(args.model ? { model: args.model } : {}),
      }).catch(() => []),
    ),
  );

  const seen = new Set<string>();
  const allFixes: VisionFlaggedBeat[] = [];
  for (const group of results) {
    for (const flag of group) {
      if (seen.has(flag.beatId)) continue;
      seen.add(flag.beatId);
      allFixes.push(flag);
      if (allFixes.length >= MAX_TOTAL_FIXES) return allFixes;
    }
  }
  return allFixes;
}
