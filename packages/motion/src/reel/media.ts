// Reel engine (spec 26): templates built around real pictures (logos, photos, illustrations,
// website screenshots). Every one has a designed fallback, so a missing picture never shows as a
// broken image: logos fall back to a lettered tile, the others are swapped for a text template by
// `buildTemplate` before they get here.
import type { ReelMedia } from '@motionpop/schemas';
import {
  applyReveal,
  blurRise,
  clamp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  prog,
  revealAt,
} from './anim';
import { css, h, svg } from './dom';
import { STAGE_H } from './looks';
import {
  column,
  ENTER,
  fit,
  headingStyle,
  kickerEl,
  type Of,
  type ReelImage,
  type Tpl,
  type TplCtx,
} from './parts';

// ----- logo tile --------------------------------------------------------------------------------

/** Fallback tile colours (a name always maps to the same one). */
const TILE_COLORS = ['#1F6FEB', '#E5484D', '#12A594', '#8E4EC6', '#F76B15', '#0B0B0C', '#D6409F'];

function hashName(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? '?').slice(0, 1).toUpperCase();
}

export function imgEl(pic: ReelImage, style: Record<string, string | number>): HTMLElement {
  return h('img', { display: 'block', maxWidth: 'none', userSelect: 'none', ...style }, [], {
    src: pic.src,
    alt: '',
    decoding: 'sync',
    draggable: 'false',
  });
}

export interface TileHandle {
  el: HTMLElement;
  /** 0..1 pop-in (scale with overshoot + fade). */
  draw(p: number): void;
}

/**
 * A rounded white tile holding a brand logo, or the name's initials on a colour when the logo
 * is missing. Sized `size` px square.
 */
export function logoTile(
  ctx: TplCtx,
  m: ReelMedia | undefined,
  name: string,
  size: number,
): TileHandle {
  const pic = ctx.img(m);
  const r = Math.round(size * 0.24);
  const el = h('div', {
    position: 'relative',
    flex: 'none',
    width: size,
    height: size,
    borderRadius: r,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    willChange: 'transform, opacity, filter',
  });
  if (pic) {
    css(el, {
      background: '#FFFFFF',
      border: ctx.pal.dark ? 'none' : `1.5px solid ${ctx.pal.line}`,
      boxShadow: ctx.look.upper ? '0 6px 18px rgba(0,0,0,0.06)' : ctx.pal.shadow,
    });
    const inner = Math.round(size * 0.62);
    const k = Math.min(inner / pic.w, inner / pic.h);
    el.append(imgEl(pic, { width: Math.round(pic.w * k), height: Math.round(pic.h * k) }));
  } else {
    css(el, {
      background: TILE_COLORS[hashName(name.toLowerCase()) % TILE_COLORS.length]!,
      color: '#FFFFFF',
      fontFamily: ctx.look.sans,
      fontWeight: 800,
      fontSize: Math.round(size * (initials(name).length > 1 ? 0.36 : 0.46)),
      letterSpacing: '-0.03em',
    });
    el.append(document.createTextNode(initials(name)));
  }
  return {
    el,
    draw(p) {
      const q = clamp(p);
      el.style.opacity = clamp(q * 2.2).toFixed(3);
      el.style.visibility = q <= 0 ? 'hidden' : 'visible';
      el.style.transform = `scale(${lerp(0.55, 1, easeOutBack(q)).toFixed(4)})`;
      el.style.filter = q < 1 ? `blur(${((1 - easeOutCubic(q)) * 8).toFixed(2)}px)` : 'none';
    },
  };
}

function nameStyle(ctx: TplCtx, size: number): Record<string, string | number> {
  return ctx.look.upper
    ? {
        fontFamily: ctx.look.sans,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '-0.01em',
        textTransform: 'uppercase',
        color: ctx.pal.ink,
        whiteSpace: 'nowrap',
      }
    : {
        fontFamily: ctx.look.serif,
        fontWeight: 500,
        fontSize: size * 1.12,
        letterSpacing: '-0.025em',
        color: ctx.pal.ink,
        whiteSpace: 'nowrap',
      };
}

// ----- logo: one brand, big ----------------------------------------------------------------------

export function logo(p: Of<'logo'>, ctx: TplCtx): Tpl {
  const col = column(ctx, ctx.look.upper ? 30 : 26);
  const size = ctx.area.h < 700 ? 210 : 250;
  const holder = h('div', { position: 'relative', width: size, height: size });
  const ring = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.24),
    border: `2px solid ${ctx.look.upper ? ctx.pal.ink : ctx.pal.accent}`,
    boxSizing: 'border-box',
    opacity: 0,
  });
  const tile = logoTile(ctx, p.media, p.name, size);
  holder.append(ring, tile.el);
  // The name lands letter by letter.
  const name = h('div', { ...nameStyle(ctx, 64), display: 'flex' });
  const letters = [...p.name].map((ch) => {
    const s = h('span', { display: 'inline-block', whiteSpace: 'pre' }, [ch]);
    name.append(s);
    return s;
  });
  const sub = p.sub
    ? h(
        'div',
        {
          fontFamily: ctx.look.sans,
          fontWeight: 500,
          fontSize: 26,
          lineHeight: 1.3,
          color: ctx.pal.muted,
          maxWidth: 560,
          textTransform: ctx.look.upper ? 'lowercase' : 'none',
        },
        [p.sub],
      )
    : null;
  col.append(holder, name);
  if (sub) col.append(sub);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      fit(name, 620, 64, 30, 1);
    },
    seek(tt) {
      tile.draw(prog(tt, t0, 560));
      // One soft ring pulse as the tile settles.
      const pr = prog(tt, t0 + 260, 700);
      ring.style.opacity = pr > 0 && pr < 1 ? ((1 - pr) * 0.5).toFixed(3) : '0';
      ring.style.transform = `scale(${lerp(1, 1.35, easeOutCubic(pr)).toFixed(4)})`;
      const l0 = t0 + 300;
      const step = Math.min(45, 520 / Math.max(1, letters.length));
      letters.forEach((s, i) => revealAt(s, tt, l0 + i * step, 300, 18, 10));
      if (sub) revealAt(sub, tt, l0 + letters.length * step + 120, 420, 12, 8);
    },
  };
}

// ----- logos: brands building on their words ------------------------------------------------------

export function logos(p: Of<'logos'>, ctx: TplCtx): Tpl {
  const col = column(ctx, ctx.look.upper ? 34 : 30);
  const n = p.items.length;
  const perRow = n <= 3 ? n : n === 4 ? 2 : 3;
  const tight = ctx.area.h < 700;
  const size = n <= 3 ? (tight ? 150 : 170) : tight ? (n === 4 ? 116 : 112) : 140;
  const title = p.title ? h('div', headingStyle(ctx, ctx.look.upper ? 54 : 62), [p.title]) : null;
  const grid = h('div', {
    display: 'grid',
    gridTemplateColumns: `repeat(${perRow}, ${size + 40}px)`,
    columnGap: 18,
    rowGap: tight ? 14 : 26,
    justifyContent: 'center',
  });
  const cells = p.items.map((it) => {
    const tile = logoTile(ctx, it.media, it.name, size);
    const label = h(
      'div',
      {
        marginTop: 12,
        fontFamily: ctx.look.sans,
        fontWeight: 700,
        fontSize: n <= 3 ? 22 : 18,
        textTransform: ctx.look.upper ? 'uppercase' : 'none',
        letterSpacing: ctx.look.upper ? '0.01em' : '-0.01em',
        color: ctx.pal.ink,
        whiteSpace: 'nowrap',
        textAlign: 'center',
      },
      [it.name],
    );
    const cell = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center' }, [
      tile.el,
      label,
    ]);
    grid.append(cell);
    return { tile, label, at: it.at };
  });
  if (title) col.append(title);
  col.append(grid);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      if (title) fit(title, 620, ctx.look.upper ? 54 : 62, 28, 2);
      cells.forEach((c) => fit(c.label, size + 36, n <= 3 ? 22 : 18, 12, 1));
    },
    seek(tt) {
      if (title) revealAt(title, tt, t0, 420, 22, 14);
      const ats = cells.map((c, i) => Math.max(c.at, t0 + (title ? 220 : 0) + i * 150));
      cells.forEach((c, i) => {
        c.tile.draw(prog(tt, ats[i]!, 520));
        revealAt(c.label, tt, ats[i]! + 120, 360, 10, 8);
      });
    },
  };
}

// ----- image: photo or illustration ------------------------------------------------------------

/** Text over or around a picture, in the look's display type. */
function displayText(ctx: TplCtx, text: string, size: number, onImage: boolean): HTMLElement {
  const base = ctx.look.upper
    ? {
        fontFamily: ctx.look.sans,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '-0.015em',
        textTransform: 'uppercase',
        lineHeight: 1.02,
      }
    : {
        fontFamily: ctx.look.italic,
        fontStyle: 'italic',
        fontWeight: 700,
        fontSize: size * 1.08,
        letterSpacing: '-0.03em',
        lineHeight: 1.0,
      };
  return h(
    'div',
    {
      ...base,
      color: onImage ? '#FFFFFF' : ctx.pal.ink,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      ...(onImage ? { textShadow: '0 4px 28px rgba(0,0,0,0.45)' } : {}),
    },
    [text],
  );
}

export function image(p: Of<'image'>, ctx: TplCtx, pic: ReelImage): Tpl {
  // Illustrations are drawn on plain paper: under a dark scrim they read as grey, so on light
  // panels they always float, big, on the paper instead of bleeding.
  const paper = p.media.kind === 'illustration' && !ctx.pal.dark;
  return p.fit === 'bleed' && !paper ? imageBleed(p, ctx, pic) : imageFrame(p, ctx, pic);
}

function kenBurns(img: HTMLElement, tt: number, ctx: TplCtx, from = 1.1, to = 1.0): void {
  const span = Math.max(1, ctx.endMs - ctx.startMs);
  const q = easeInOutCubic(prog(tt, ctx.startMs, span));
  const z = lerp(from, to, q);
  const dx = lerp(-10, 10, q);
  img.style.transform = `translate3d(${dx.toFixed(2)}px, 0, 0) scale(${z.toFixed(4)})`;
}

function imageFrame(p: Of<'image'>, ctx: TplCtx, pic: ReelImage): Tpl {
  const gap = ctx.look.upper ? 20 : 18;
  const col = column(ctx, gap);
  // Top slot: kicker/title, or the first word when there are two or more. Bottom: the rest.
  const ws = p.words.slice(0, p.title ? 1 : 2);
  const topText = p.title ?? (ws.length >= 2 ? ws.shift()!.text : undefined);
  const topAt = p.title ? undefined : p.words.length >= 2 ? p.words[0]!.at : undefined;
  void topAt;
  const kick = p.kicker ? kickerEl(ctx, p.kicker) : null;
  const top = topText ? displayText(ctx, topText, 60, false) : null;
  const bottoms = ws.map((w) => ({ el: displayText(ctx, w.text, 60, false), at: w.at }));
  // Text heights plus the column gaps between every element (the card included).
  const parts = (kick ? 1 : 0) + (top ? 1 : 0) + bottoms.length;
  const textH = (kick ? 40 : 0) + (top ? 74 : 0) + bottoms.length * 72 + parts * gap;
  // Room for the seam tag above (mono) and breathing space below.
  const availH = ctx.area.h - (ctx.look.upper ? 170 : 120) - textH;
  const float = p.media.kind === 'illustration' && !ctx.pal.dark;
  const aspect = pic.w / pic.h;
  let w = Math.min(float ? 640 : 600, availH * aspect);
  let hh = w / aspect;
  if (hh > availH) {
    hh = availH;
    w = hh * aspect;
  }
  w = Math.round(Math.max(200, w));
  hh = Math.round(Math.max(160, hh));
  const card = h('div', {
    position: 'relative',
    width: w,
    height: hh,
    overflow: 'hidden',
    flex: 'none',
    ...(float
      ? // Illustrations float on the panel: their paper is made transparent when they are stored
        // (trimPaper, media recipe v2), so the panel's colour and grid show through.
        { background: 'transparent' }
      : {
          // Drawings are stored with transparent paper: on a dark panel they get their paper back.
          ...(p.media.kind === 'illustration' ? { background: '#FBFAF7' } : {}),
          borderRadius: ctx.look.upper ? 18 : 26,
          boxShadow: ctx.pal.dark ? '0 30px 80px rgba(0,0,0,0.55)' : '0 26px 60px rgba(0,0,0,0.16)',
          border: ctx.look.upper && !ctx.pal.dark ? `1.5px solid ${ctx.pal.line}` : 'none',
        }),
  });
  const k = Math.max(w / pic.w, hh / pic.h);
  const img = imgEl(pic, {
    position: 'absolute',
    left: `${((w - pic.w * k) / 2).toFixed(1)}px`,
    top: `${((hh - pic.h * k) / 2).toFixed(1)}px`,
    width: `${(pic.w * k).toFixed(1)}px`,
    height: `${(pic.h * k).toFixed(1)}px`,
    transformOrigin: '50% 50%',
  });
  card.append(img);
  if (kick) col.append(kick);
  if (top) col.append(top);
  col.append(card);
  for (const b of bottoms) col.append(b.el);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      if (top) fit(top, 640, 60, 28, 1);
      bottoms.forEach((b) => fit(b.el, 640, 60, 28, 1));
    },
    seek(tt) {
      if (kick) revealAt(kick, tt, t0, 360);
      if (top) revealAt(top, tt, Math.max(topAt ?? 0, t0 + 60), 420, 24, 14);
      const pc = prog(tt, t0 + 120, 620);
      const r = blurRise(pc, 34, 16);
      r.scale = lerp(0.92, 1, easeOutCubic(pc));
      applyReveal(card, r);
      kenBurns(img, tt, ctx, 1.12, 1.0);
      bottoms.forEach((b, i) =>
        revealAt(b.el, tt, Math.max(b.at, t0 + 420 + i * 160), 420, 24, 14),
      );
    },
  };
}

function imageBleed(p: Of<'image'>, ctx: TplCtx, pic: ReelImage): Tpl {
  const W = ctx.area.w;
  const H =
    ctx.layout === 'card'
      ? ctx.look.cardTop + ctx.look.cardRadius + 20
      : ctx.layout === 'full'
        ? STAGE_H
        : ctx.area.h;
  const root = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: W,
    height: H,
    overflow: 'hidden',
    // Drawings keep their paper behind them (their own paper is transparent).
    background: p.media.kind === 'illustration' && ctx.pal.dark ? '#FBFAF7' : ctx.pal.bg,
  });
  const k = Math.max(W / pic.w, H / pic.h);
  const img = imgEl(pic, {
    position: 'absolute',
    left: `${((W - pic.w * k) / 2).toFixed(1)}px`,
    top: `${((H - pic.h * k) / 2).toFixed(1)}px`,
    width: `${(pic.w * k).toFixed(1)}px`,
    height: `${(pic.h * k).toFixed(1)}px`,
    transformOrigin: '50% 50%',
  });
  // Text sits clear of the captions: above the seam label (split), the card caption (card) or
  // the bottom caption line (full).
  const textBottom =
    ctx.layout === 'card'
      ? ctx.look.cardTop - 130
      : ctx.layout === 'full'
        ? ctx.look.upper
          ? 1070
          : 840
        : H - 70;
  const scrim = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: W,
    height: H,
    background: `linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) ${Math.round(((textBottom - 260) / H) * 100)}%, rgba(0,0,0,0.62) ${Math.round((textBottom / H) * 100)}%, rgba(0,0,0,0.7) 100%)`,
  });
  const stackEl = h('div', {
    position: 'absolute',
    left: 0,
    width: W,
    bottom: H - textBottom,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  });
  // At most two big lines over a picture; a title that would make three becomes the kicker.
  const lines: { el: HTMLElement; at: number }[] = [];
  const t0 = ctx.startMs + ENTER;
  const ws = p.words.slice(-2);
  const titleAsKicker = !!p.title && ws.length >= 2;
  if (p.title && !titleAsKicker)
    lines.push({ el: displayText(ctx, p.title, 64, true), at: t0 + 200 });
  for (const w of ws) lines.push({ el: displayText(ctx, w.text, 64, true), at: w.at });
  const kickText = titleAsKicker ? p.title : p.kicker;
  for (const l of lines) stackEl.append(l.el);
  const kick = kickText
    ? h(
        'div',
        {
          position: 'absolute',
          left: 0,
          top: ctx.layout === 'split' ? 80 : 120,
          width: W,
          display: 'flex',
          justifyContent: 'center',
        },
        [
          // A dark chip: readable over a bright sky as well as a dark street.
          h(
            'div',
            {
              fontFamily: ctx.look.sans,
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
              background: 'rgba(10,10,12,0.72)',
              padding: '9px 16px 8px',
              borderRadius: ctx.look.upper ? 4 : 999,
            },
            [kickText],
          ),
        ],
      )
    : null;
  root.append(img, scrim, stackEl);
  if (kick) root.append(kick);
  return {
    el: root,
    mount() {
      lines.forEach((l) => fit(l.el, 640, 64, 28, 1));
    },
    seek(tt) {
      // Snaps in sharp-ish (never a fade from black) and settles out of a blur.
      const pi = prog(tt, ctx.startMs, 520);
      img.style.opacity = clamp(pi * 4).toFixed(3);
      img.style.filter = pi < 1 ? `blur(${((1 - easeOutCubic(pi)) * 14).toFixed(2)}px)` : 'none';
      kenBurns(img, tt, ctx, 1.14, 1.02);
      scrim.style.opacity = clamp(pi * 1.4).toFixed(3);
      if (kick) revealAt(kick, tt, t0 + 120, 380, 10, 8);
      lines.forEach((l, i) => revealAt(l.el, tt, Math.max(l.at, t0 + 160 + i * 140), 440, 28, 16));
    },
  };
}

// ----- website: a real page in a browser frame ----------------------------------------------------

export function website(p: Of<'website'>, ctx: TplCtx, pic: ReelImage): Tpl {
  const col = column(ctx, 22);
  const dark = ctx.pal.dark;
  const head = p.headline
    ? h('div', headingStyle(ctx, ctx.look.upper ? 48 : 56), [p.headline])
    : null;
  const W = 610;
  const barH = 44;
  const viewH = Math.round(
    Math.min(ctx.area.h - 120 - (head ? 80 : 0), ctx.layout === 'split' ? 470 : 600) - barH,
  );
  const win = h('div', {
    position: 'relative',
    width: W,
    borderRadius: 16,
    background: dark ? '#141418' : '#FFFFFF',
    border: `1.5px solid ${dark ? '#2C2C31' : '#E2E2E2'}`,
    boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.55)' : '0 30px 70px rgba(0,0,0,0.16)',
    overflow: 'hidden',
    flex: 'none',
  });
  const bar = h('div', {
    height: barH,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 7,
    borderBottom: `1px solid ${dark ? '#26262B' : '#EFEFEF'}`,
    background: dark ? '#18181C' : '#FAFAFA',
  });
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c) =>
    bar.append(h('div', { width: 11, height: 11, borderRadius: 6, background: c })),
  );
  bar.append(
    h(
      'div',
      {
        marginLeft: 14,
        flex: '1',
        height: 26,
        borderRadius: 8,
        background: dark ? '#202026' : '#EFEFEF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: ctx.look.sans,
        fontSize: 13,
        fontWeight: 500,
        color: dark ? '#8A8A90' : '#666',
      },
      [p.url],
    ),
  );
  const view = h('div', { position: 'relative', width: W, height: viewH, overflow: 'hidden' });
  const k = W / pic.w;
  const imgH = pic.h * k;
  const img = imgEl(pic, {
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${W}px`,
    height: `${imgH.toFixed(1)}px`,
  });
  view.append(img);
  win.append(bar, view);
  let slash: SVGElement | null = null;
  if (p.strikeAt !== undefined) {
    const s = svg('svg', { viewBox: '0 0 600 400', preserveAspectRatio: 'none' });
    css(s as unknown as HTMLElement, {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
    });
    slash = svg('line', {
      x1: 40,
      y1: 380,
      x2: 560,
      y2: 30,
      stroke: '#E5484D',
      'stroke-width': 9,
      'stroke-linecap': 'round',
      pathLength: 1,
      'stroke-dasharray': '1 1',
      'stroke-dashoffset': 1,
    });
    s.append(slash);
    win.append(s);
  }
  if (head) col.append(head);
  col.append(win);
  const t0 = ctx.startMs + ENTER;
  const scrollMax = Math.max(0, Math.min(imgH - viewH, viewH * 0.9));
  return {
    el: col,
    mount() {
      if (head) fit(head, 620, ctx.look.upper ? 48 : 56, 26, 2);
    },
    seek(tt) {
      if (head) revealAt(head, tt, t0, 420, 22, 14);
      const pw = prog(tt, t0 + (head ? 120 : 0), 560);
      const r = blurRise(pw, 40, 14);
      r.scale = lerp(0.92, 1, easeOutCubic(pw));
      applyReveal(win, r);
      // The page scrolls slowly once the window has settled, like someone browsing it.
      const s0 = t0 + 900;
      const span = Math.max(600, ctx.endMs - s0 - 200);
      const y = scrollMax * easeInOutCubic(prog(tt, s0, span));
      img.style.transform = `translate3d(0, ${(-y).toFixed(1)}px, 0)`;
      if (slash && p.strikeAt !== undefined)
        slash.setAttribute(
          'stroke-dashoffset',
          (1 - easeOutCubic(prog(tt, Math.max(p.strikeAt, t0 + 500), 260))).toFixed(4),
        );
    },
  };
}
