import type { Look } from '@motionpop/schemas';
import type { Format, ImageRef, StylePack } from '../contract';
import { eases } from '../core/ease';
import { progress } from '../core/interp';
import { safeArea, type Box } from '../core/safe-area';

/**
 * Images in scenes (spec 07 R4). A scene with an image splits the frame: the image takes one
 * side (16:9) or the top (9:16, 1:1), and the scene builds its text into the rest as if that
 * were its own, smaller frame. Without a ready image the scene keeps the whole frame (its
 * image-free form), so a pending or failed image never breaks a slot.
 */
export interface ImageSplit {
  image: Box;
  /** The text sub-frame, in frame pixels. */
  text: Box;
  /** The format whose layouts suit the sub-frame's shape. */
  textFormat: Format;
}

/** The scene format whose aspect is closest to `w × h`. */
export function closestFormat(w: number, h: number): Format {
  const r = Math.log(w / h);
  const options: [Format, number][] = [
    ['16:9', Math.log(16 / 9)],
    ['1:1', 0],
    ['9:16', Math.log(9 / 16)],
  ];
  return options.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0];
}

/**
 * Split the frame for an image taking `share` of it (0.3–0.65). In 16:9 the side alternates by
 * seed so consecutive image slots don't all lean the same way.
 */
export function splitFrame(
  format: Format,
  w: number,
  h: number,
  share: number,
  seed: number,
): ImageSplit {
  const safe = safeArea(format, w, h);
  const s = Math.max(0.3, Math.min(0.65, share));
  // Room for glyph overhang and a look's tilt, which can reach past a text box by a few pixels.
  const slack = Math.round(Math.min(w, h) * 0.012);
  const r = (b: Box): Box => ({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  });
  if (format === '16:9') {
    const iw = safe.width * s;
    const left = seed % 2 === 0;
    const image = {
      x: left ? safe.x : safe.x + safe.width - iw,
      y: safe.y,
      width: iw,
      height: safe.height,
    };
    // Changed by spec 07c: the text sits between the picture (plus a gap) and the frame's safe
    // edge, and its sub-frame is sized so the scene's own safe area is exactly that box. Before,
    // the sub-frame ran to the frame edge and its smaller margins let text leave the safe area.
    const gap = Math.round(w * 0.03);
    const tx = left ? image.x + iw + gap : safe.x;
    const target = { x: tx, y: safe.y, width: (left ? safe.x + safe.width : image.x - gap) - tx, height: safe.height };
    const sub = frameAround(target, slack);
    return { image: r(image), text: r(sub.box), textFormat: sub.format };
  }
  const ih = safe.height * s;
  // The pair sits a little lower, so a short text block under the picture doesn't leave the
  // whole group above the optical centre.
  const drop = Math.round(h * (format === '1:1' ? 0.05 : 0.015));
  const image = { x: safe.x, y: safe.y + drop, width: safe.width, height: ih };
  const gap = Math.round(h * 0.02);
  const top = image.y + ih + gap;
  const sub = frameAround(
    { x: safe.x, y: top, width: safe.width, height: safe.y + safe.height - top },
    slack,
  );
  return { image: r(image), text: r(sub.box), textFormat: sub.format };
}

/** The safe-area margins `safeArea` uses for a format, as shares of the frame. */
function margins(f: Format): { x: number; top: number; bottom: number } {
  return f === '9:16' ? { x: 0.06, top: 0.12, bottom: 0.2 } : { x: 0.05, top: 0.05, bottom: 0.05 };
}

/**
 * The frame whose safe area is `target`, less `slack` px each side: the inverse of
 * `safeArea`. The format follows the frame's shape, so it is settled in a few rounds.
 */
export function frameAround(target: Box, slack = 1): { box: Box; format: Format } {
  const t = {
    x: target.x + slack,
    y: target.y + slack,
    width: target.width - 2 * slack,
    height: target.height - 2 * slack,
  };
  const around = (f: Format): Box => {
    const m = margins(f);
    const W = t.width / (1 - 2 * m.x);
    const H = t.height / (1 - m.top - m.bottom);
    return { x: t.x - m.x * W, y: t.y - m.top * H, width: W, height: H };
  };
  let format = closestFormat(t.width, t.height);
  for (let i = 0; i < 4; i++) {
    const b = around(format);
    const next = closestFormat(b.width, b.height);
    if (next === format) break;
    format = next;
  }
  // Whatever the shape settled on, the margins are the returned format's.
  const box = around(format);
  // Rounding outward could let the scene's safe area grow by a pixel; round inward instead.
  const x = Math.ceil(box.x);
  const y = Math.ceil(box.y);
  return {
    box: { x, y, width: Math.floor(box.x + box.width) - x, height: Math.floor(box.y + box.height) - y },
    format,
  };
}

export interface ImageLayer {
  el: HTMLElement;
  seek: (tMs: number) => void;
  /** When the image lands (for the effects bed). */
  landMs: number;
}

/** Deterministic small pseudo-random in [-1, 1] from a seed. */
const jitter = (seed: number, salt: number) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/** #RRGGBB → [r, g, b] in 0..1 (SVG filter tables). */
function rgbUnit(hex: string): [string, string, string] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)) as [
    string,
    string,
    string,
  ];
}

/** A rectangle with torn edges as a clip-path polygon, deterministic per seed. */
function tornRect(seed: number): string {
  const pts: string[] = [];
  const n = 14;
  const j = (i: number, s: number) => (1.2 + (jitter(seed + s, i) + 1) * 1.1).toFixed(2);
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${j(i, 1)}%`);
  for (let i = 0; i <= n; i++)
    pts.push(`${(100 - Number(j(i, 2))).toFixed(2)}% ${((i / n) * 100).toFixed(2)}%`);
  for (let i = 0; i <= n; i++)
    pts.push(`${(100 - (i / n) * 100).toFixed(2)}% ${(100 - Number(j(i, 3))).toFixed(2)}%`);
  for (let i = 0; i <= n; i++) pts.push(`${j(i, 4)}% ${(100 - (i / n) * 100).toFixed(2)}%`);
  return `polygon(${pts.join(',')})`;
}

/** Ease that overshoots by roughly `s` and lands exactly at 1. */
const back = (x: number, s: number): number => {
  const p = Math.max(0, Math.min(1, x)) - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
};

/**
 * One image in its box, treated by the look (`look.image.treatment`): a keyed cutout gets a
 * sticker edge and a soft shadow; a photo gets a frame (white border or rounded card), a tilt and
 * tape. It enters in the look's manner (rise, slam or a stepped pop), drifts with a slow push
 * while it holds (never fast motion: the text beside it is being read), and leaves with the
 * scene. `seek` is a pure function of time.
 */
export function buildImageLayer(args: {
  doc: Document;
  parent: HTMLElement;
  box: Box;
  ref: ImageRef;
  style: StylePack;
  look?: Look | undefined;
  seed: number;
  durationMs: number;
  enterAtMs: number;
  exit: 'fade' | 'none';
  frameH: number;
}): ImageLayer {
  const { doc, box, ref, style, look, seed, durationMs, frameH } = args;
  const treat = new Set(look?.image?.treatment ?? ['key', 'shadow-soft']);
  const preset = look?.personality?.preset ?? 'smooth';
  const stepMs = look?.personality?.stepFps ? 1000 / look.personality.stepFps : 0;
  const keyed = ref.keyed && treat.has('key');

  // Fit the image's aspect inside the box (contain), leaving room for the tilt.
  const aspect = ref.width > 0 && ref.height > 0 ? ref.width / ref.height : 1;
  const pad = treat.has('tilt') ? 0.06 : 0.02;
  const bw = box.width * (1 - pad * 2);
  const bh = box.height * (1 - pad * 2);
  // A framed photo may crop a little (cover up to 4:3 ↔ 3:4) rather than leave a thin strip.
  const target = keyed ? aspect : Math.max(0.75, Math.min(1.34, bw / bh));
  const fw = Math.min(bw, bh * target);
  const fh = fw / target;
  const fx = box.x + (box.width - fw) / 2;
  const fy = box.y + (box.height - fh) / 2;

  const outer = doc.createElement('div');
  outer.dataset.actor = 'image';
  outer.className = 'mp-image';
  outer.style.cssText = `position:absolute;left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px;transform-origin:50% 60%;will-change:transform,opacity;`;
  const border = Math.round(Math.min(fw, fh) * 0.035);
  const shadow = treat.has('shadow-soft') || !look?.image;
  const frame = doc.createElement('div');
  const img = doc.createElement('img');
  img.alt = '';
  img.decoding = 'sync';
  img.src = ref.src;
  img.draggable = false;

  if (keyed) {
    frame.style.cssText = 'position:absolute;inset:0;';
    const edge = Math.max(2, Math.round(frameH * 0.004));
    const filters: string[] = [];
    if (treat.has('white-border'))
      for (const [dx, dy] of [
        [edge, 0],
        [-edge, 0],
        [0, edge],
        [0, -edge],
      ])
        filters.push(`drop-shadow(${dx}px ${dy}px 0 #fff)`);
    if (shadow)
      filters.push(
        `drop-shadow(0 ${Math.round(frameH * 0.012)}px ${Math.round(frameH * 0.018)}px rgba(0,0,0,0.28))`,
      );
    img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:contain;${filters.length ? `filter:${filters.join(' ')};` : ''}`;
  } else {
    const white = treat.has('white-border');
    const radius = white ? 2 : style.shape.radius;
    frame.style.cssText = `position:absolute;inset:0;overflow:hidden;border-radius:${radius}px;background:${white ? '#fbfaf6' : style.colors.bg};${white ? `padding:${border}px ${border}px ${Math.round(border * (treat.has('tape') ? 1 : 2.4))}px;box-sizing:border-box;` : ''}${shadow ? `box-shadow:0 ${Math.round(frameH * 0.014)}px ${Math.round(frameH * 0.04)}px rgba(0,0,0,0.26);` : ''}`;
    const inner = doc.createElement('div');
    inner.style.cssText = `position:relative;width:100%;height:100%;overflow:hidden;border-radius:${white ? 1 : radius}px;`;
    img.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 45%;';
    inner.append(img);
    frame.append(inner);
  }
  if (keyed) frame.append(img);
  // Print treatments: duotone maps the picture onto ink and the accent; halftone screens it with
  // a dot pattern (only over the subject: the dots are masked by the cutout's own alpha).
  const filters: string[] = [];
  if (treat.has('duotone')) {
    const id = `mp-duo-${seed}`;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    const [r1, g1, b1] = rgbUnit(style.colors.ink);
    const [r2, g2, b2] = rgbUnit(style.colors.highlight);
    svg.innerHTML = `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${r1} ${r2}"/><feFuncG type="table" tableValues="${g1} ${g2}"/><feFuncB type="table" tableValues="${b1} ${b2}"/></feComponentTransfer></filter>`;
    outer.append(svg);
    filters.push(`url(#${id})`);
  }
  if (treat.has('halftone')) {
    filters.push('contrast(1.18) saturate(0.85)');
    const dots = doc.createElement('div');
    const cell = Math.max(4, Math.round(frameH * 0.0055));
    const mask = keyed
      ? `-webkit-mask-image:url("${ref.src}");mask-image:url("${ref.src}");-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;`
      : '';
    dots.style.cssText = `position:absolute;inset:${keyed ? 0 : border}px;pointer-events:none;background-image:radial-gradient(circle, rgba(20,16,12,0.42) ${(cell * 0.24).toFixed(2)}px, transparent ${(cell * 0.32).toFixed(2)}px);background-size:${cell}px ${cell}px;mix-blend-mode:multiply;${mask}`;
    frame.append(dots);
  }
  if (filters.length) {
    const prev = img.style.filter;
    img.style.filter = `${filters.join(' ')}${prev ? ` ${prev}` : ''}`;
  }
  // Torn edges on a photo: a jagged clip all round.
  if (!keyed && treat.has('torn-edge')) frame.style.clipPath = tornRect(seed);
  // A torn sheet of colour behind a cutout, offset and turned against the picture's tilt.
  if (treat.has('backing')) {
    const back = doc.createElement('div');
    const colour = seed % 2 === 0 ? style.colors.accent : style.colors.accent2;
    back.style.cssText = `position:absolute;left:${(fw * 0.06).toFixed(1)}px;top:${(fh * 0.08).toFixed(1)}px;width:${(fw * 0.92).toFixed(1)}px;height:${(fh * 0.9).toFixed(1)}px;background:${colour};clip-path:${tornRect(seed + 5)};transform:rotate(${(-jitter(seed, 4) * 5 - 3).toFixed(2)}deg);box-shadow:0 2px 6px rgba(0,0,0,0.15);`;
    outer.append(back);
  }
  outer.append(frame);
  if (treat.has('tape')) {
    const tape = doc.createElement('div');
    const tw = fw * 0.32;
    tape.style.cssText = `position:absolute;left:${(fw - tw) / 2}px;top:${-frameH * 0.016}px;width:${tw}px;height:${frameH * 0.036}px;background:rgba(246,238,214,0.72);box-shadow:0 1px 2px rgba(0,0,0,0.12);transform:rotate(${(jitter(seed, 3) * 4).toFixed(2)}deg);`;
    outer.append(tape);
  }
  args.parent.append(outer);

  const tilt = treat.has('tilt') ? jitter(seed, 1) * 3.2 : 0;
  const enterMs = Math.round(style.motion.enterMs * (preset === 'snappy' ? 1.1 : 1.4));
  const exitMs = args.exit === 'none' ? 0 : Math.round(style.motion.enterMs * 0.7);
  const t0 = Math.max(0, Math.min(args.enterAtMs, durationMs - enterMs - exitMs - 200));
  const landMs = t0 + enterMs;
  const exitStart = durationMs - exitMs;
  const ease = eases[style.motion.enterEase];
  const drift = jitter(seed, 2);

  const seek = (raw: number) => {
    const tMs = stepMs > 0 ? Math.floor(raw / stepMs) * stepMs : raw;
    const p = progress(tMs, t0, enterMs);
    let opacity = 1;
    let scale = 1;
    let ty = 0;
    let rot = tilt;
    if (preset === 'snappy') {
      // Slam: drops in large and lands with a small overshoot.
      opacity = Math.min(1, p * 3);
      scale = 1 + (1 - back(p, 1.4)) * 0.22;
      rot = tilt + (1 - ease(p)) * -4;
    } else if (preset === 'stepped') {
      // A cut-out slapped down: pops in with a turn.
      opacity = p > 0 ? 1 : 0;
      scale = back(p, 2) * 0.12 + 0.88;
      rot = tilt + (1 - ease(p)) * 9;
    } else {
      opacity = ease(p);
      ty = (1 - ease(p)) * frameH * 0.05;
      scale = 0.94 + 0.06 * ease(p);
    }
    if (exitMs > 0 && tMs > exitStart) {
      const e = progress(tMs, exitStart, exitMs);
      opacity *= 1 - e;
      scale *= 1 - 0.03 * e;
    }
    // Hold: a slow push across the whole slot (slow juice only; text beside it is being read).
    const hold = progress(tMs, t0, Math.max(1, durationMs - t0));
    outer.style.opacity = opacity.toFixed(3);
    outer.style.transform = `translate(0px,${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(scale * (keyed ? 1 + 0.035 * hold : 1)).toFixed(4)})`;
    if (!keyed) {
      const k = 1.04 + 0.08 * hold;
      img.style.transform = `translate(${(drift * hold * 2).toFixed(2)}%,${(-hold * 1.2).toFixed(2)}%) scale(${k.toFixed(4)})`;
    }
  };
  return { el: outer, seek, landMs };
}
