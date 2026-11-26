import { reelMediaOf, type ReelMedia, type ReelPlan } from '@motionpop/schemas';
import type { ReelNotePart } from '@motionpop/ai';
import { cropGeometry, CAPTURE_QUALITY, type CaptureRegion } from '@/lib/notes/capture';

/**
 * What a frame note on the reel preview lands on (spec 29 R1.2, R1.3). The reel is drawn in the
 * page (not an iframe), so this reads the live stage: the parts under the circle (graphic,
 * speaker, caption, tag, hook, from the engine's `data-reel-part` hooks), the texts drawn inside
 * it (grouped by their element, so a word-by-word title reads as one title), the pictures (by
 * `data-reel-asset`, named by their request), the caption line and the hook band. Never throws.
 */

export const REEL_STAGE_W = 720;
export const REEL_STAGE_H = 1280;

export interface ReelTarget {
  parts: ReelNotePart[];
  texts: string[];
  pictures: string[];
  caption?: string;
  hook?: string;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The element's box in stage units (0..1), from screen boxes (the stage is scaled by CSS). */
function boxIn(el: Element, stage: DOMRect): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || stage.width <= 0 || stage.height <= 0) return null;
  return {
    x0: (r.left - stage.left) / stage.width,
    y0: (r.top - stage.top) / stage.height,
    x1: (r.right - stage.left) / stage.width,
    y1: (r.bottom - stage.top) / stage.height,
  };
}

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const overlap = (a: Box, b: Box): number =>
  area({
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  });

/** Hidden: display none, visibility hidden or opacity 0 on it or an ancestor inside the stage. */
function shown(el: Element, stageEl: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let cur: Element | null = el; cur && cur !== stageEl; cur = cur.parentElement) {
    const st = view ? view.getComputedStyle(cur) : (cur as HTMLElement).style;
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (st.opacity !== '' && Number(st.opacity) < 0.05) return false;
  }
  return true;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "Acme logo", "a photo of a bridge", "the example.com page". */
export function describeMedia(m: ReelMedia): string {
  const q = m.query.split('|')[0]!.trim();
  switch (m.kind) {
    case 'logo':
      return `${q} logo`;
    case 'screenshot':
      return `the ${q} page`;
    case 'photo':
      return `photo: ${q}`;
    case 'illustration':
      return `illustration: ${q}`;
  }
}

export function readReelTarget(
  stageEl: HTMLElement,
  region: CaptureRegion,
  plan: Pick<ReelPlan, 'scenes' | 'hook'>,
  sceneId: string,
): ReelTarget {
  const out: ReelTarget = { parts: [], texts: [], pictures: [] };
  try {
    const stage = stageEl.getBoundingClientRect();
    const reg: Box = {
      x0: region.x,
      y0: region.y,
      x1: region.x + region.w,
      y1: region.y + region.h,
    };
    const regArea = Math.max(1e-6, area(reg));
    const sceneHost = stageEl.querySelector<HTMLElement>(
      `[data-reel-scene="${CSS.escape(sceneId)}"]`,
    );

    // Parts: specific overlay elements (caption, tag, hook) first, then graphic vs speaker ordered
    // by how much of the circle they actually cover (not raw element size — in `card` layout the
    // speaker box is smaller than the graphic box and would otherwise win even on a minor edge hit).
    const SPECIFIC = new Set<ReelNotePart>(['caption', 'tag', 'hook']);
    const hits = new Map<ReelNotePart, { size: number; overlap: number }>();
    const record = (part: ReelNotePart, size: number, o: number) => {
      const prev = hits.get(part);
      if (!prev || o > prev.overlap) hits.set(part, { size, overlap: o });
    };
    let speakerBox: Box | null = null;
    for (const el of stageEl.querySelectorAll<HTMLElement>('[data-reel-part]')) {
      const part = el.dataset['reelPart'] as ReelNotePart;
      if (part === 'graphic' || part === 'tag') {
        if (!sceneHost || !sceneHost.contains(el)) continue;
      }
      if (!shown(el, stageEl)) continue;
      const b = boxIn(el, stage);
      if (!b) continue;
      if (part === 'speaker') speakerBox = b;
      const o = overlap(b, reg);
      if (o <= 0 || (o / regArea < 0.1 && o / Math.max(1e-6, area(b)) < 0.5)) continue;
      record(part, area(b), o);
      if (part === 'caption') out.caption = clean(el.textContent).slice(0, 120);
      if (part === 'hook') out.hook = clean(el.textContent).slice(0, 80);
    }
    // In `card` layout the graphic panel extends down to the speaker seam, past `cam`'s bottom
    // margin. Count the visible panel area above the speaker so circles near the bottom of the
    // graphic card still resolve to `graphic` instead of falling through to `speaker`.
    if (sceneHost && shown(sceneHost, stageEl)) {
      const sb = boxIn(sceneHost, stage);
      if (sb) {
        const panelBox: Box =
          speakerBox && speakerBox.y0 > sb.y0 + 0.05
            ? { x0: sb.x0, y0: sb.y0, x1: sb.x1, y1: Math.min(sb.y1, speakerBox.y0) }
            : sb;
        const po = overlap(panelBox, reg);
        if (po > 0 && po / regArea >= 0.1) {
          record('graphic', area(panelBox), po);
        }
      }
    }
    // If the circle is predominantly on the graphic panel and only grazes the speaker edge,
    // drop `speaker` so the model doesn't misread a graphic edit as a speaker-video edit.
    const gHit = hits.get('graphic');
    const sHit = hits.get('speaker');
    if (gHit && sHit && gHit.overlap / regArea >= 0.5 && sHit.overlap / regArea < 0.25) {
      hits.delete('speaker');
    }
    out.parts = [...hits.entries()]
      .sort(([pa, a], [pb, b]) => {
        const sa = SPECIFIC.has(pa) ? 0 : 1;
        const sb = SPECIFIC.has(pb) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        if (sa === 0) return a.size - b.size;
        return b.overlap - a.overlap;
      })
      .map(([part]) => part);

    // Texts of the current scene's graphic inside the circle, grouped by their parent element.
    if (sceneHost) {
      const seen = new Set<Element>();
      const walker = stageEl.ownerDocument.createTreeWalker(sceneHost, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!clean(node.textContent)) continue;
        const el = node.parentElement;
        if (!el || !shown(el, stageEl)) continue;
        const b = boxIn(el, stage);
        if (!b || overlap(b, reg) <= 0) continue;
        // A word-by-word heading reads as the whole heading.
        const group =
          el.parentElement &&
          el.parentElement !== sceneHost &&
          clean(el.parentElement.textContent).length <= 80
            ? el.parentElement
            : el;
        if (seen.has(group)) continue;
        seen.add(group);
        const text = clean(group.textContent).slice(0, 80);
        if (text && !out.texts.includes(text)) out.texts.push(text);
        if (out.texts.length >= 8) break;
      }
      // Pictures by their asset, named by their request in this scene.
      const scene = plan.scenes.find((s) => s.id === sceneId);
      const media = scene ? reelMediaOf({ scenes: [scene] }) : [];
      for (const img of sceneHost.querySelectorAll<HTMLElement>('img[data-reel-asset]')) {
        if (!shown(img, stageEl)) continue;
        const b = boxIn(img, stage);
        if (!b || overlap(b, reg) <= 0) continue;
        const m = media.find((x) => x.asset === img.dataset['reelAsset']);
        const d = m ? describeMedia(m) : 'a picture';
        if (!out.pictures.includes(d)) out.pictures.push(d);
        if (out.pictures.length >= 4) break;
      }
    }
  } catch {
    // Whatever was read stays; the note goes with less context.
  }
  return out;
}

// ----- capture -----------------------------------------------------------------------------------

let fontCss: Promise<string> | null = null;
/** The reel's @font-face rules (data URLs), fetched once, so the capture draws the real fonts. */
function reelFontCss(): Promise<string> {
  fontCss ??= fetch('/api/composition/reel-fonts')
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  return fontCss;
}

function toDataUrl(src: CanvasImageSource, w: number, h: number, type = 'image/jpeg'): string {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

/**
 * A JPEG (data URL) of `region` of the reel stage as it is on screen: the stage is cloned with
 * the speaker video turned into its current frame, pictures inlined and the reel fonts embedded,
 * drawn through an SVG `foreignObject`, then cropped to at most 512 px. Undefined on any failure.
 */
export async function captureReelRegion(
  stageEl: HTMLElement,
  region: CaptureRegion,
): Promise<string | undefined> {
  try {
    const stageW =
      Math.round(parseFloat(stageEl.style.width)) || stageEl.offsetWidth || REEL_STAGE_W;
    const stageH =
      Math.round(parseFloat(stageEl.style.height)) || stageEl.offsetHeight || REEL_STAGE_H;
    const geo = cropGeometry(region, { width: stageW, height: stageH });
    if (!geo) return undefined;
    const clone = stageEl.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.left = '0';
    clone.style.top = '0';
    // Videos → their current frame.
    const liveVideos = stageEl.querySelectorAll('video');
    clone.querySelectorAll('video').forEach((v, i) => {
      const live = liveVideos[i];
      const img = document.createElement('img');
      if (live && live.readyState >= 2 && live.videoWidth > 0) {
        img.setAttribute('src', toDataUrl(live, live.videoWidth, live.videoHeight));
      }
      img.setAttribute('style', v.getAttribute('style') ?? '');
      v.replaceWith(img);
    });
    // Pictures (blob URLs can't load inside an SVG image) → data URLs.
    const liveImgs = stageEl.querySelectorAll('img');
    clone.querySelectorAll('img').forEach((im, i) => {
      const live = liveImgs[i];
      const src = im.getAttribute('src') ?? '';
      if (!src.startsWith('blob:') || !live || !live.naturalWidth) return;
      const k = Math.min(1, 900 / Math.max(live.naturalWidth, live.naturalHeight));
      im.setAttribute(
        'src',
        toDataUrl(live, live.naturalWidth * k, live.naturalHeight * k, 'image/png'),
      );
    });
    clone.querySelectorAll('script').forEach((s) => s.remove());
    const css = await reelFontCss();
    const style = document.createElement('style');
    style.textContent = css;
    clone.prepend(style);
    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${stageW}" height="${stageH}">` +
      `<foreignObject x="0" y="0" width="${stageW}" height="${stageH}">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    img.decoding = 'sync';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = geo.dw;
    canvas.height = geo.dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, geo.dw, geo.dh);
    ctx.drawImage(img, geo.sx, geo.sy, geo.sw, geo.sh, 0, 0, geo.dw, geo.dh);
    const url = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY);
    return url.startsWith('data:image/jpeg') ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The reel stage element in the editor preview, or null. */
export function reelStage(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('[data-reel-stage]');
}

/** Every picture request of a plan's scene, for a quick lookup in tests and the UI. */
export const sceneMedia = (plan: Pick<ReelPlan, 'scenes'>, sceneId: string): ReelMedia[] => {
  const s = plan.scenes.find((x) => x.id === sceneId);
  return s ? reelMediaOf({ scenes: [s] }) : [];
};
