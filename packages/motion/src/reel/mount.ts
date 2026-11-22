// Reel engine (spec 25): mounts a reel into a host element and draws any moment from
// `seek(ms)`. The same code runs in the editor preview (native <video>, real-time) and inside the
// HyperFrames composition for export (frame-exact), so the preview is the export.
import type { ReelMedia, ReelPlan, ReelScene, ReelWord } from '@motionpop/schemas';
import { clamp, easeInOutCubic, easeOutCubic, lerp, prog, revealAt } from './anim';
import { chunkAt, chunkCaptions, type CaptionChunk } from './captions';
import { css, h } from './dom';
import { graphicArea, LOOKS, STAGE_H, STAGE_W, type LookTokens, type Palette } from './looks';
import type { ReelImage } from './parts';
import { carriedInPlace, carryOrigins } from './carry';
import {
  focusAt,
  framingChanges,
  punchLevelAt,
  sentenceStarts,
  transKind,
  transLength,
  type TransKind,
} from './motion';
import { buildTemplate, tagEl, type Tpl } from './templates';

export interface ReelData {
  plan: ReelPlan;
  /** Words on the reel timeline (integer ms). */
  words: ReelWord[];
  durationMs: number;
  /** Intrinsic size of the speaker video. */
  video: { w: number; h: number };
  /** Pictures by `project.assets` id (spec 26): composition-relative or blob URLs. */
  images?: Record<string, ReelImage>;
  /** Reel-time jump cuts in the speaker video (spec 27 R1.2): the framing alternates on them. */
  cuts?: readonly number[];
}

export interface ReelHandle {
  seek(ms: number): void;
  ready: Promise<void>;
  destroy(): void;
}

interface SceneView {
  scene: ReelScene;
  host: HTMLElement;
  /** The scene's own background (graphic layouts), faded separately during a hand-over. */
  bg?: HTMLElement;
  cam: HTMLElement;
  tpl: Tpl;
  pal: Palette;
  tag?: HTMLElement;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** Where the face should land inside the box (0..1). */
  ay: number;
  zoom: number;
}

const FONT_PROBES = [
  "800 64px 'Inter'",
  "500 24px 'Inter'",
  "500 64px 'Newsreader'",
  "italic 700 48px 'Playfair Display Italic'",
  "400 20px 'Geist Mono'",
];

function sceneBg(look: LookTokens, s: ReelScene): Palette {
  return look.palettes[s.bg ?? look.defaultBg];
}

function gridCss(pal: Palette): Record<string, string> {
  if (!pal.grid) return { background: pal.bg };
  return {
    backgroundColor: pal.bg,
    backgroundImage: `linear-gradient(to right, ${pal.grid} 1px, transparent 1px), linear-gradient(to bottom, ${pal.grid} 1px, transparent 1px)`,
    backgroundSize: '36px 36px',
    backgroundPosition: '-1px -1px',
  };
}

/**
 * Builds the stage inside `host` (which must be 720 × 1280 logical px; scale it from outside).
 * `videos` are the speaker <video> elements to place (all get the same framing; in the export
 * there is one per kept segment).
 */
export function mountReel(
  host: HTMLElement,
  data: ReelData,
  videos: HTMLVideoElement[],
): ReelHandle {
  const { plan } = data;
  const look = LOOKS[plan.look];
  css(host, {
    position: 'relative',
    width: STAGE_W,
    height: STAGE_H,
    overflow: 'hidden',
    background: '#000',
    fontKerning: 'normal',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'geometricPrecision',
  });

  const bgLayer = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
  });
  const panel = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
  });
  // The export's HTML already holds the wrapper with its timed <video> clips; HyperFrames tracks
  // those nodes, so they are never moved. The preview passes loose videos instead.
  const existing = host.querySelector<HTMLElement>('[data-reel-vwrap]');
  const vwrap = existing ?? h('div', {});
  css(vwrap, {
    position: 'absolute',
    left: 0,
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
    overflow: 'hidden',
    background: '#111',
  });
  // Hooks for frame notes (spec 29): what a circle on the preview lands on. Inert at render.
  vwrap.setAttribute('data-reel-part', 'speaker');
  const over = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
    pointerEvents: 'none',
  });
  const capLayer = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
    pointerEvents: 'none',
  });
  if (existing) {
    host.insertBefore(bgLayer, existing);
    host.insertBefore(panel, existing);
    host.append(over, capLayer);
  } else {
    host.append(bgLayer, panel, vwrap, over, capLayer);
  }
  for (const v of videos) {
    css(v, { position: 'absolute', left: 0, top: 0, maxWidth: 'none', objectFit: 'fill' });
    if (v.parentElement !== vwrap) vwrap.append(v);
  }

  const scenes =
    plan.look === 'cream'
      ? plan.scenes.map((s) => ({ ...s, content: sentenceCase(s.content) }))
      : plan.scenes;
  const views: SceneView[] = [];
  const chunks: CaptionChunk[] = plan.captions ? chunkCaptions(data.words, plan.look) : [];

  // Caption element (one, restyled per frame).
  const cap = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'nowrap',
    visibility: 'hidden',
  });
  cap.setAttribute('data-reel-part', 'caption');
  capLayer.append(cap);

  // Hook band (mono): the title over the first seconds.
  let hookEl: HTMLElement | null = null;
  if (plan.hook && look.id === 'mono') {
    hookEl = h(
      'div',
      {
        position: 'absolute',
        left: 0,
        width: STAGE_W,
        top: 0,
        boxSizing: 'border-box',
        padding: '14px 40px 16px',
        background: 'rgba(38,38,40,0.86)',
        color: '#FFFFFF',
        fontFamily: look.sans,
        fontWeight: 800,
        fontSize: 52,
        lineHeight: 1.04,
        letterSpacing: '-0.01em',
        textTransform: 'uppercase',
        textAlign: 'center',
        visibility: 'hidden',
      },
      [plan.hook],
    );
    hookEl.setAttribute('data-reel-part', 'hook');
    over.append(hookEl);
  }

  let built = false;
  let lastMs = 0;

  const images = data.images ?? {};
  const img = (m: ReelMedia | undefined): ReelImage | null =>
    m?.asset ? (images[m.asset] ?? null) : null;
  // A carried scene (spec 26 R1.5) continues the last graphic with the same template across a
  // speaker cut: it is built as if it started with that graphic, so items already revealed stay
  // revealed and nothing replays its entrance.
  const origins = carryOrigins(scenes);
  const originOf = (s: ReelScene): number => origins.get(s) ?? s.startMs;

  const build = () => {
    for (const s0 of scenes) {
      const origin = originOf(s0);
      const s = origin === s0.startMs ? s0 : { ...s0, startMs: origin };
      const pal = sceneBg(look, s);
      const layout = s.layout;
      const isOverlay = layout === 'speaker';
      const sceneHost = h('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: STAGE_W,
        height: layout === 'split' ? STAGE_H / 2 : STAGE_H,
        overflow: 'hidden',
        visibility: 'hidden',
      });
      sceneHost.setAttribute('data-reel-scene', s0.id);
      const bg = isOverlay
        ? undefined
        : h('div', {
            position: 'absolute',
            left: 0,
            top: 0,
            width: STAGE_W,
            height: '100%',
            ...gridCss(pal),
          });
      if (bg) sceneHost.append(bg);
      const area = graphicArea(look, layout);
      const cam = h('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: STAGE_W,
        height: area.h,
        transformOrigin: '50% 50%',
      });
      const tpl = buildTemplate(firstCueEarly(s), {
        look,
        pal,
        area,
        startMs: s.startMs,
        endMs: s.endMs,
        layout,
        img,
      });
      cam.setAttribute('data-reel-part', 'graphic');
      cam.append(tpl.el);
      sceneHost.append(cam);
      let tag: HTMLElement | undefined;
      if (s.tag && !isOverlay) {
        tag = tagEl(
          { look, pal, area, startMs: s.startMs, endMs: s.endMs, layout, img },
          s.tag,
          22,
        );
        css(tag, { position: 'absolute', left: '50%', top: 40, transform: 'translateX(-50%)' });
        tag.setAttribute('data-reel-part', 'tag');
        const tagWrap = h('div', {
          position: 'absolute',
          left: 0,
          top: 0,
          width: STAGE_W,
          height: 0,
        });
        tagWrap.append(tag);
        sceneHost.append(tagWrap);
      }
      (isOverlay ? over : panel).append(sceneHost);
      views.push({
        scene: s0,
        host: sceneHost,
        cam,
        tpl,
        pal,
        ...(bg ? { bg } : {}),
        ...(tag ? { tag } : {}),
      });
    }
    // Frame notes (spec 29) name the picture a circle lands on: tag each <img> with its asset id.
    const bySrc = new Map(Object.entries(images).map(([id, pic]) => [pic.src, id]));
    for (const im of host.querySelectorAll('img')) {
      const id = bySrc.get(im.getAttribute('src') ?? '');
      if (id) im.setAttribute('data-reel-asset', id);
    }
    // Measure with everything laid out but invisible.
    for (const v of views) {
      v.host.style.visibility = 'visible';
      v.host.style.opacity = '0';
      v.tpl.mount?.();
      v.host.style.opacity = '';
      v.host.style.display = 'none';
    }
    built = true;
  };

  const sceneIndexAt = (t: number): number => {
    for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i]!.startMs) return i;
    return 0;
  };

  const boxFor = (s: ReelScene): Box | null => {
    switch (s.layout) {
      case 'split':
        return { x: 0, y: STAGE_H / 2, w: STAGE_W, h: STAGE_H / 2, radius: 0, ay: 0.4, zoom: 1 };
      case 'card':
        return {
          x: 0,
          y: look.cardTop,
          w: STAGE_W,
          h: STAGE_H - look.cardTop,
          radius: look.id === 'mono' ? 28 : look.cardRadius,
          ay: 0.44,
          zoom: 1.05,
        };
      case 'speaker':
        return { x: 0, y: 0, w: STAGE_W, h: STAGE_H, radius: 0, ay: 0.36, zoom: 1 };
      case 'full':
        return null;
    }
  };

  // Jump cuts flip the framing between two zoom levels (spec 27 R1.2).
  const punches = framingChanges(data.cuts ?? [], sentenceStarts(data.words));
  // Footage without a face is shown whole; a talking head follows its face keys (spec 27 R2.2).
  const footage = plan.footage;
  const contain = footage?.kind === 'screen' || footage?.kind === 'scene';
  const focusKeys = footage?.focus ?? [];

  const placeVideo = (box: Box | null, s: ReelScene, t: number, opacity = 1) => {
    // Opacity, not visibility: HyperFrames sets the clip's own visibility each frame.
    if (!box || opacity <= 0.001) {
      vwrap.style.opacity = '0';
      return;
    }
    vwrap.style.opacity = opacity >= 0.999 ? '1' : opacity.toFixed(3);
    css(vwrap, {
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderRadius: box.radius ? `${box.radius}px ${box.radius}px 0 0` : '0',
      background: contain ? '#0B0B0C' : '#111',
    });
    // Slow push-in across the scene keeps a static camera alive.
    const span = Math.max(1, s.endMs - s.startMs);
    const push = s.layout === 'speaker' ? 0.06 : 0.025;
    const punch = punchLevelAt(punches, t) ? (s.layout === 'speaker' ? 1.09 : 1.05) : 1;
    const z = box.zoom * punch * (1 + push * easeOutCubic(clamp((t - s.startMs) / span)));
    const vw = data.video.w || 720;
    const vh = data.video.h || 1280;
    let dw: number;
    let dh: number;
    let left: number;
    let top: number;
    if (contain) {
      // Whole frame, centred a little above the middle, gently pushed in.
      const scale = Math.min(box.w / vw, box.h / vh) * (1 + (z - box.zoom * punch) * 0.5);
      dw = vw * scale;
      dh = vh * scale;
      left = (box.w - dw) / 2;
      top = (box.h - dh) * (s.layout === 'speaker' ? 0.44 : 0.5);
    } else {
      const f = focusAt(focusKeys, t, plan.focus);
      // Zoom in far enough that the face can sit where the box wants it (a speaker off to one
      // side of a wide shot), never more than 2.4× the plain cover crop.
      const cover = Math.max(box.w / vw, box.h / vh);
      const needW = box.w / 2 / Math.max(0.05, Math.min(f.x, 1 - f.x));
      const needH = Math.max(
        (box.h * box.ay) / Math.max(0.05, f.y),
        (box.h * (1 - box.ay)) / Math.max(0.05, 1 - f.y),
      );
      const fill = Math.min(2.4, Math.max(1, needW / (vw * cover), needH / (vh * cover)));
      const scale = cover * fill * z;
      dw = vw * scale;
      dh = vh * scale;
      left = clamp(box.w / 2 - f.x * dw, box.w - dw, 0);
      top = clamp(box.h * box.ay - f.y * dh, box.h - dh, 0);
    }
    for (const v of videos)
      css(v, {
        width: `${dw.toFixed(1)}px`,
        height: `${dh.toFixed(1)}px`,
        left: `${left.toFixed(1)}px`,
        top: `${top.toFixed(1)}px`,
      });
  };

  /** The hand-over in progress at `t` (spec 27 R1.1), if any. */
  const handoverAt = (
    idx: number,
    t: number,
  ): { prev: number; kind: TransKind; p: number } | null => {
    if (idx <= 0) return null;
    const s = scenes[idx]!;
    const kind = transKind(scenes[idx - 1]!, s, carriedInPlace(scenes, idx));
    const len = transLength(kind);
    if (len <= 0) return null;
    const p = (t - s.startMs) / len;
    return p >= 0 && p < 1 ? { prev: idx - 1, kind, p } : null;
  };

  const placeCaption = (s: ReelScene, pal: Palette, t: number, settling = false) => {
    const i = chunkAt(chunks, t);
    // Captions step aside for the CTA card (both looks) and for cream punchlines.
    const hide =
      i < 0 ||
      // While the layout is changing the caption waits for its new place.
      settling ||
      s.content.template === 'cta' ||
      (look.id === 'cream' && s.content.template === 'punch');
    if (hide) {
      cap.style.visibility = 'hidden';
      return;
    }
    const c = chunks[i]!;
    if (cap.textContent !== c.text) cap.textContent = c.text;
    let y: number;
    if (look.id === 'mono') {
      y =
        s.layout === 'split'
          ? STAGE_H / 2
          : s.layout === 'card'
            ? look.cardTop
            : s.layout === 'full'
              ? 1133
              : 1010;
      css(cap, {
        background: '#0A0A0A',
        color: '#FFFFFF',
        fontFamily: look.sans,
        fontWeight: 700,
        fontSize: 25,
        letterSpacing: '0.01em',
        lineHeight: 1.18,
        padding: '5px 10px 4px',
        textShadow: 'none',
      });
    } else {
      const onSpeaker = s.layout === 'speaker';
      y =
        s.layout === 'split'
          ? STAGE_H / 2 - 52
          : s.layout === 'card'
            ? look.cardTop - 64
            : s.layout === 'full'
              ? 900
              : 960;
      css(cap, {
        background: 'transparent',
        color: onSpeaker ? '#FFFFFF' : pal.ink,
        fontFamily: look.sans,
        fontWeight: 700,
        fontSize: 52,
        letterSpacing: '-0.045em',
        lineHeight: 1.05,
        padding: '0',
        textShadow: onSpeaker ? '0 2px 18px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)' : 'none',
      });
    }
    // A short settle per chunk (cream only; mono labels swap hard like the reference).
    const pIn = look.id === 'cream' ? prog(t, c.startMs, 140) : 1;
    const e = easeOutCubic(pIn);
    cap.style.visibility = 'visible';
    cap.style.opacity = String(clamp(pIn * 2));
    cap.style.filter = pIn < 1 ? `blur(${((1 - e) * 5).toFixed(2)}px)` : 'none';
    cap.style.transform = `translate(-50%, -50%) translate3d(0, ${((1 - e) * 6).toFixed(2)}px, 0)`;
    cap.style.left = `${STAGE_W / 2}px`;
    cap.style.top = `${y}px`;
  };

  const draw = (t: number) => {
    if (!built) return;
    const idx = sceneIndexAt(t);
    const s = scenes[idx]!;
    const ho = handoverAt(idx, t);
    views.forEach((v, i) => {
      const incoming = i === idx;
      const outgoing = !!ho && i === ho.prev;
      const on = incoming || outgoing;
      // display, not visibility: revealed children set their own visibility.
      v.host.style.display = on ? 'block' : 'none';
      v.host.style.visibility = 'visible';
      if (!on) return;
      const sc = scenes[i]!;
      // The hook is already on screen at frame 0 (the thumbnail and the first swipe-stop).
      const lt = i === 0 ? t + HOOK_LEAD_MS : t;
      v.tpl.seek(lt);
      const o = originOf(sc);
      if (v.tag) revealAt(v.tag, lt, o + 40, 320, 0, 8);
      // Gentle camera drift on graphic panels, composed with the hand-over motion.
      let scale = 1;
      if (sc.layout !== 'speaker') {
        const span = Math.max(1, sc.endMs - o);
        scale = lerp(1, 1.018, clamp((t - o) / span));
      }
      let ty = 0;
      let op = 1;
      let blur = 0;
      let hostOp = 1;
      let bgOp = 1;
      let z = 0;
      if (ho && outgoing) {
        // Leaves with an ease-in, still half there while the new graphic starts to land.
        const e = clamp(ho.p * 1.5) ** 2;
        if (ho.kind === 'push') {
          // One direction of travel: the old graphic accelerates up and out of the panel
          // (fading only at the end), the new one rises into its place.
          const ep = clamp(ho.p * 1.25) ** 2;
          ty = -300 * ep;
          op = 1 - clamp((ep - 0.45) / 0.55);
          blur = 5 * ep;
          // It flies over the new scene: drawn on top, its own background gone at once.
          z = 2;
          bgOp = 1 - clamp(ho.p * 4);
        } else if (ho.kind === 'morph') {
          if (sc.layout === 'speaker') op = 1 - clamp(ho.p * 2.4);
          else {
            ty = -110 * e;
            op = 1 - 0.7 * e;
          }
        } else if (ho.kind === 'reveal') {
          op = 1 - e;
          scale *= 1 + 0.05 * e;
        } else if (ho.kind === 'overlay') {
          op = 1 - clamp(ho.p * 2.4);
        }
      } else if (ho && incoming) {
        const e = easeOutCubic(ho.p);
        if (ho.kind === 'push') {
          ty = 150 * (1 - e);
        } else if (ho.kind === 'reveal') {
          // Zoom-through: the full frame is there almost at once and settles out of a blur.
          hostOp = clamp(ho.p * 2.6);
          scale *= 1.1 - 0.1 * e;
          blur = 10 * (1 - e);
        }
      }
      v.host.style.opacity = hostOp >= 0.999 ? '' : hostOp.toFixed(3);
      v.host.style.zIndex = z ? String(z) : '';
      if (v.bg) v.bg.style.opacity = bgOp >= 0.999 ? '' : bgOp.toFixed(3);
      v.cam.style.transform =
        ty || scale !== 1 ? `translate3d(0, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(4)})` : '';
      v.cam.style.opacity = op >= 0.999 ? '' : Math.max(0, op).toFixed(3);
      v.cam.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      if (v.tag) {
        // The old scene label gives way to the new one at once.
        if (outgoing && ho) v.tag.style.opacity = (1 - clamp(ho.p * 4)).toFixed(3);
      }
    });
    // Background behind everything: the scene palette for card/full, black for speaker/split.
    const pal = views[idx]?.pal ?? look.palettes[look.defaultBg];
    css(
      bgLayer,
      s.layout === 'card' || s.layout === 'full'
        ? gridCss(pal)
        : { background: '#000', backgroundImage: 'none' },
    );
    // The speaker's box: morphs between layouts, fades under/over full-frame graphics.
    let box = boxFor(s);
    let vOp = 1;
    if (ho) {
      const pb = boxFor(scenes[ho.prev]!);
      if (ho.kind === 'morph' && pb && box) box = lerpBox(pb, box, easeInOutCubic(ho.p));
      else if (ho.kind === 'reveal') {
        const q = clamp(ho.p * 2.6);
        if (pb && !box) {
          box = pb;
          vOp = 1 - q;
        } else if (!pb && box) vOp = q;
      }
    }
    placeVideo(box, s, t, vOp);
    if (hookEl) {
      const first = scenes[0]!;
      const end = Math.min(first.endMs, 3600);
      const on = t < end && first.layout !== 'full';
      hookEl.style.visibility = on ? 'visible' : 'hidden';
      if (on) {
        const fb = boxFor(first);
        const bottom = fb ? fb.y - 12 : STAGE_H / 2 - 12;
        hookEl.style.top = `${bottom - hookEl.offsetHeight}px`;
      }
    }
    placeCaption(
      s,
      pal,
      t,
      !!ho && ((ho.kind === 'morph' && ho.p < 0.7) || (ho.kind === 'reveal' && ho.p < 0.4)),
    );
  };

  const ready = (async () => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      await Promise.all(FONT_PROBES.map((f) => fonts.load(f).catch(() => [])));
      await fonts.ready;
    }
    build();
    // Every picture is decoded before the first frame is drawn (the export waits on `ready`).
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map((im) =>
        im.decode ? im.decode().catch(() => undefined) : undefined,
      ),
    );
    draw(lastMs);
  })();

  return {
    ready,
    seek(ms: number) {
      lastMs = ms;
      draw(ms);
    },
    destroy() {
      for (const el of [bgLayer, panel, over, capLayer]) el.remove();
      if (!existing) vwrap.remove();
    },
  };
}

function lerpBox(a: Box, b: Box, e: number): Box {
  return {
    x: lerp(a.x, b.x, e),
    y: lerp(a.y, b.y, e),
    w: lerp(a.w, b.w, e),
    h: lerp(a.h, b.h, e),
    radius: lerp(a.radius, b.radius, e),
    ay: lerp(a.ay, b.ay, e),
    zoom: lerp(a.zoom, b.zoom, e),
  };
}

/** A graphic never waits on an empty panel: its first cued item lands by scene start + 450 ms. */
function firstCueEarly(s: ReelScene): ReelScene['content'] {
  const c = s.content as Record<string, unknown>;
  const latest = s.startMs + 450;
  for (const key of ['items', 'words', 'rows', 'lines', 'steps']) {
    const arr = c[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0] as { at?: number };
      if (typeof first.at === 'number' && first.at > latest) {
        return { ...c, [key]: [{ ...first, at: latest }, ...arr.slice(1)] } as ReelScene['content'];
      }
    }
  }
  return s.content;
}

/** How far into its reveal the first scene starts. */
const HOOK_LEAD_MS = 650;

const KEEP = new Set([
  'template',
  'icon',
  'leftIcon',
  'rightIcon',
  'url',
  'unit',
  'prefix',
  'suffix',
  'kind',
  'winner',
]);

/** Cream speaks in sentence case: an ALL-CAPS string from the director is softened. */
function sentenceCase<T>(v: T, key = ''): T {
  if (typeof v === 'string') {
    if (KEEP.has(key) || !/[A-Z]{2}/.test(v) || v !== v.toUpperCase()) return v;
    // A single short all-caps token is an acronym (CSS, GIF, MP4): keep it.
    if (!/\s/.test(v.trim()) && v.trim().length <= 5) return v;
    const lower = v.toLowerCase();
    return (lower.charAt(0).toUpperCase() + lower.slice(1)).replace(/\bi\b/g, 'I') as T;
  }
  if (Array.isArray(v)) return v.map((x) => sentenceCase(x, key)) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = sentenceCase(x, k);
    return out as T;
  }
  return v;
}

export { STAGE_W, STAGE_H };
