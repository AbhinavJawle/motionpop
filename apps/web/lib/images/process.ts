import { keyOut } from './key';

/** Longest side of a stored picture: 1K is what the model returns and plenty at 1080p. */
const MAX_SIDE = 1024;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  keyed: boolean;
}

function canvasOf(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function toWebp(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/webp', quality: 0.88 });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/webp', 0.88),
  );
}

/**
 * Bytes from the model or an upload → a stored WebP (≤ 1024 px). With `tryKey`, the colour-key
 * cutout runs; when its guard says the backdrop isn't a clean key colour the picture is kept as
 * a framed photo (`keyed: false`), which every image scene supports.
 */
export async function processImage(
  blob: Blob,
  tryKey: boolean,
  maxSide = MAX_SIDE,
): Promise<ProcessedImage> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = canvasOf(w, h);
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let keyed = false;
  if (tryKey) {
    const data = g.getImageData(0, 0, w, h);
    const r = keyOut(data.data, w, h);
    if (r.keyed) {
      g.putImageData(new ImageData(r.rgba, w, h), 0, 0);
      keyed = true;
    }
  }
  return { blob: await toWebp(c), width: w, height: h, keyed };
}

/** sha256 hex of a string or bytes (asset identity). */
export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
