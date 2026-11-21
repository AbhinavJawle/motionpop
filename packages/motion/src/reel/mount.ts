// Reel engine (spec 25): mounts a reel into a host element and draws any moment from
// `seek(ms)`. The same code runs in the editor preview (native <video>, real-time) and inside the
// HyperFrames composition for export (frame-exact), so the preview is the export.
import type { ReelPlan, ReelScene, ReelWord } from '@motionpop/schemas';
import { clamp, easeOutCubic, lerp, prog, revealAt } from './anim';
import { chunkAt, chunkCaptions, type CaptionChunk } from './captions';
import { css, h } from './dom';
import { graphicArea, LOOKS, STAGE_H, STAGE_W, type LookTokens, type Palette } from './looks';
import { buildTemplate, tagEl, type Tpl } from './templates';

export interface ReelData {
  plan: ReelPlan;
  /** Words on the reel timeline (integer ms). */
  words: ReelWord[];
  durationMs: number;
  /** Intrinsic size of the speaker video. */
  video: { w: number; h: number };
}

export interface ReelHandle {
  seek(ms: number): void;
  ready: Promise<void>;
  destroy(): void;
}

interface SceneView {
  scene: ReelScene;
  host: HTMLElement;
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
    over.append(hookEl);
  }

  let built = false;
  let lastMs = 0;

  const build = () => {
    for (const s of scenes) {
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
        ...(isOverlay ? {} : gridCss(pal)),
      });
      const area = graphicArea(look, layout);
      const cam = h('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: STAGE_W,
        height: area.h,
        transformOrigin: '50% 50%',
      });
      const tpl = buildTemplate(s.content, {
        look,
        pal,
        area,
        startMs: s.startMs,
        endMs: s.endMs,
        layout,
      });
      cam.append(tpl.el);
      sceneHost.append(cam);
      let tag: HTMLElement | undefined;
      if (s.tag && !isOverlay) {
        tag = tagEl({ look, pal, area, startMs: s.startMs, endMs: s.endMs, layout }, s.tag, 22);
        css(tag, { position: 'absolute', left: '50%', top: 40, transform: 'translateX(-50%)' });
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
      views.push({ scene: s, host: sceneHost, tpl, pal, ...(tag ? { tag } : {}) });
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

  const placeVideo = (box: Box | null, s: ReelScene, t: number) => {
    // Opacity, not visibility: HyperFrames sets the clip's own visibility each frame.
    if (!box) {
      vwrap.style.opacity = '0';
      return;
    }
    vwrap.style.opacity = '1';
    css(vwrap, {
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderRadius: box.radius ? `${box.radius}px ${box.radius}px 0 0` : '0',
    });
    // Slow push-in across the scene keeps a static camera alive.
    const span = Math.max(1, s.endMs - s.startMs);
    const push = s.layout === 'speaker' ? 0.06 : 0.025;
    const z = box.zoom * (1 + push * easeOutCubic(clamp((t - s.startMs) / span)));
    const vw = data.video.w || 720;
    const vh = data.video.h || 1280;
    const scale = Math.max(box.w / vw, box.h / vh) * z;
    const dw = vw * scale;
    const dh = vh * scale;
    const fx = plan.focus.x;
    const fy = plan.focus.y;
    const left = clamp(box.w / 2 - fx * dw, box.w - dw, 0);
    const top = clamp(box.h * box.ay - fy * dh, box.h - dh, 0);
    for (const v of videos)
      css(v, {
        width: `${dw.toFixed(1)}px`,
        height: `${dh.toFixed(1)}px`,
        left: `${left.toFixed(1)}px`,
        top: `${top.toFixed(1)}px`,
      });
  };

  const placeCaption = (s: ReelScene, pal: Palette, t: number) => {
    const i = chunkAt(chunks, t);
    const hide = i < 0 || (look.id === 'cream' && s.content.template === 'punch');
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
    views.forEach((v, i) => {
      const on = i === idx;
      // display, not visibility: revealed children set their own visibility.
      v.host.style.display = on ? 'block' : 'none';
      v.host.style.visibility = 'visible';
      if (!on) return;
      v.tpl.seek(t);
      if (v.tag) revealAt(v.tag, t, s.startMs + 40, 320, 0, 8);
      // Gentle camera drift on graphic panels.
      if (s.layout !== 'speaker') {
        const cam = v.host.firstElementChild as HTMLElement;
        const span = Math.max(1, s.endMs - s.startMs);
        const z = lerp(1, 1.018, clamp((t - s.startMs) / span));
        cam.style.transform = `scale(${z.toFixed(4)})`;
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
    placeVideo(boxFor(s), s, t);
    if (hookEl) {
      const first = scenes[0]!;
      const end = Math.min(first.endMs, 3600);
      const on = t < end && first.layout !== 'full';
      hookEl.style.visibility = on ? 'visible' : 'hidden';
      if (on) {
        const box = boxFor(first);
        const bottom = box ? box.y - 12 : STAGE_H / 2 - 12;
        hookEl.style.top = `${bottom - hookEl.offsetHeight}px`;
      }
    }
    placeCaption(s, pal, t);
  };

  const ready = (async () => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      await Promise.all(FONT_PROBES.map((f) => fonts.load(f).catch(() => [])));
      await fonts.ready;
    }
    build();
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
