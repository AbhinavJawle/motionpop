import {
  critiqueContactSheet,
  type FilmBeatResult,
  type Router,
  type VisionFlaggedBeat,
} from '@motionpop/ai';
import { captionSafeBandForStage } from '@motionpop/motion';
import { FORMATS, stageBoxForMode, type Format, type StylePack } from '@motionpop/schemas';

const QA_TIMEOUT_MS = 18_000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders one beat tile onto a browser canvas cell (spec 23 R8.1):
 * 1. Paints the look canvas and composites the actual speaker keyframe in its true `stageBoxForMode`
 *    rectangle (including arched `split-top-stage` bottom framing!).
 * 2. Draws the REAL executed beat HTML snapshot at `keyMomentMs` (captured after `script` + `mp.*`
 *    kit ran inside `sandbox-critic`), falling back to raw `html + css` only if unavailable.
 * 3. Overlays the reserved live caption rail so Gemini Vision QA catches face & caption collisions.
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

  // 1. Look canvas + speaker keyframe placed in its true choreography box.
  ctx.fillStyle = style.colors.bg;
  ctx.fillRect(x, y, w, h);
  const stageMode = beat.beat.videoStage ?? 'full';
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
        ctx.drawImage(img, sx, sy, sw, sh);
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

  // 2. Render executed beat DOM snapshot (with all `mp.*` kit elements) or static fallback.
  if (beat.params) {
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

  // 2b. Overlay faint caption rail guide so Vision QA catches caption collisions directly.
  const capBand = captionSafeBandForStage(format, frameW, frameH, stageMode);
  const capY = y + (capBand.top / frameH) * h;
  const capH = Math.max(12, ((capBand.bottom - capBand.top) / frameH) * h);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + w * 0.14, capY, w * 0.72, capH);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LIVE CAPTIONS', x + w / 2, capY + capH * 0.65);
  ctx.textAlign = 'left';

  // 3. Crisp beat ID + stage badge in top-left corner so Gemini 4 Neon maps tiles with 100% accuracy.
  const label = `${beat.beat.id} · ${beat.beat.videoStage ?? 'full'}`;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(x + 8, y + 8, Math.min(w - 16, label.length * 7.5 + 18), 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillText(label, x + 16, y + 25);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

/**
 * Renders up to 6 built beats into one compact JPEG contact sheet and runs a single-call
 * `film.vision-critic` pass on `gemini-4-neon` (spec 22 R2.1). Returns only `'fix'`-flagged
 * beats (0..2); never throws and obeys a strict timeout so film delivery is never stalled.
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
  const sample = args.beats.filter((b) => b.params !== null).slice(0, 6);
  if (sample.length === 0) return [];

  const dims = FORMATS[args.format];
  const cols = sample.length <= 2 ? sample.length : 3;
  const rows = Math.ceil(sample.length / cols);
  const tileW = args.format === '9:16' ? 300 : 400;
  const tileH = Math.round((tileW * dims.height) / dims.width);

  const canvas = document.createElement('canvas');
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.fillStyle = '#09090d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < sample.length; i++) {
    const beat = sample[i]!;
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
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
      beats: sample.map((b) => ({
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
  return verdict.flagged.filter((f) => f.severity === 'fix').slice(0, 2);
}
