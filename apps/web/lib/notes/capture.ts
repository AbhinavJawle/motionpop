/**
 * Frame capture for `note.fix` (spec 09 R8.4, task 19): a JPEG crop of the paused preview, so the
 * on-device model can see the region the user circled. There is no capture API in
 * `@hyperframes/player` (checked 0.9.46), so this redraws the composition ourselves:
 *
 * 1. take the composition document from the same-origin player iframe (D-021; an opaque-origin
 *    sandbox has none, and the capture then returns `undefined`);
 * 2. clone it, drop scripts and media, and turn canvases into images (the seek state lives in
 *    inline styles, so the clone is the frame the user sees);
 * 3. wrap it in an SVG `foreignObject` of the frame size (the `@font-face` data URLs travel with
 *    the document's own `<style>`, nothing is fetched);
 * 4. draw it to a canvas, crop the region, scale to at most 512 px on the longest side, and
 *    encode JPEG at 0.85.
 *
 * It never throws and never touches the network: any failure (a tainted canvas, a decode error,
 * a missing document) returns `undefined` and the note ships with its region text only.
 */

/** A region of the frame, each value 0..1 (the frame's width and height). */
export interface CaptureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureSource {
  /** The same-origin composition document, or null (opaque sandbox, not loaded). */
  document: Document | null;
  /** The composition's frame size in px (`FORMATS[format]`). */
  width: number;
  height: number;
}

export const CAPTURE_MAX_SIDE = 512;
export const CAPTURE_QUALITY = 0.85;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The crop in frame px and the output size: aspect kept, longest side ≤ `maxSide`. */
export function cropGeometry(
  region: CaptureRegion,
  frame: { width: number; height: number },
  maxSide: number = CAPTURE_MAX_SIDE,
): { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number } | null {
  const x0 = clamp01(region.x);
  const y0 = clamp01(region.y);
  const x1 = clamp01(region.x + region.w);
  const y1 = clamp01(region.y + region.h);
  const sw = Math.round((x1 - x0) * frame.width);
  const sh = Math.round((y1 - y0) * frame.height);
  if (!(sw >= 1 && sh >= 1)) return null;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return {
    sx: Math.round(x0 * frame.width),
    sy: Math.round(y0 * frame.height),
    sw,
    sh,
    dw: Math.max(1, Math.round(sw * scale)),
    dh: Math.max(1, Math.round(sh * scale)),
  };
}

/** The composition document as a standalone XHTML string: no scripts, no media, canvases as images. */
export function serializeFrame(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll('script, audio, video, iframe, link[rel="stylesheet"]')) {
    el.remove();
  }
  // Live canvases are not copied by cloneNode: draw each one into an <img> in the same place.
  const live = doc.documentElement.querySelectorAll('canvas');
  const copies = clone.querySelectorAll('canvas');
  copies.forEach((copy, i) => {
    const src = live[i];
    const img = doc.createElement('img');
    try {
      if (src) img.setAttribute('src', src.toDataURL('image/png'));
    } catch {
      // A tainted canvas: leave the image empty rather than fail the whole capture.
    }
    img.setAttribute('style', copy.getAttribute('style') ?? '');
    img.setAttribute('width', String(src?.width ?? 0));
    img.setAttribute('height', String(src?.height ?? 0));
    copy.replaceWith(img);
  });
  return new XMLSerializer().serializeToString(clone);
}

function svgFor(xhtml: string, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`
  );
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'sync';
  img.src = url;
  await img.decode();
  return img;
}

/**
 * A JPEG data URL of `region`, or `undefined` when the frame can't be captured. The data URL is
 * only kept in memory for one `note.fix` call (R8.4: never stored).
 */
export async function captureRegion(
  source: CaptureSource,
  region: CaptureRegion,
): Promise<string | undefined> {
  try {
    const doc = source.document;
    if (!doc) return undefined;
    const geo = cropGeometry(region, source);
    if (!geo) return undefined;
    const svg = svgFor(serializeFrame(doc), source.width, source.height);
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement('canvas');
    canvas.width = geo.dw;
    canvas.height = geo.dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    // JPEG has no alpha: paint the frame's own backdrop first so transparent areas aren't black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, geo.dw, geo.dh);
    ctx.drawImage(img, geo.sx, geo.sy, geo.sw, geo.sh, 0, 0, geo.dw, geo.dh);
    const url = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY);
    return url.startsWith('data:image/jpeg') ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The composition document of a `<hyperframes-player>`, or null when the sandbox hides it. */
export function playerSource(
  player: (HTMLElement & { iframeElement?: HTMLIFrameElement | null }) | null,
  frame: { width: number; height: number },
): CaptureSource {
  let doc: Document | null = null;
  try {
    doc = player?.iframeElement?.contentDocument ?? null;
  } catch {
    doc = null; // a cross-origin or opaque frame throws on access
  }
  return { document: doc, ...frame };
}
