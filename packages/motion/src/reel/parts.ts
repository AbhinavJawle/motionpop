// Reel engine: shared pieces for the scene templates (context, layout and text helpers).
import type { ReelMedia, ReelTemplate } from '@motionpop/schemas';
import { css, h } from './dom';
import type { Area, LookTokens, Palette } from './looks';

/** A loaded picture (spec 26): composition-relative or blob URL plus intrinsic size. */
export interface ReelImage {
  src: string;
  w: number;
  h: number;
}

export interface TplCtx {
  look: LookTokens;
  pal: Palette;
  area: Area;
  startMs: number;
  endMs: number;
  layout: 'split' | 'card' | 'full' | 'speaker';
  /** The picture for a media request, or null (draw the fallback). */
  img(m: ReelMedia | undefined): ReelImage | null;
  /**
   * Builds an AI-written scene (spec 30) in its own frame. Absent (no custom runtime loaded) the
   * scene shows its title as a headline until it is.
   */
  custom?(p: Extract<ReelTemplate, { template: 'custom' }>, ctx: TplCtx): Tpl;
}

export interface Tpl {
  el: HTMLElement;
  /** Called once after the element is in the document (fonts loaded): measure and fit. */
  mount?(): void;
  seek(t: number): void;
}

export type Of<K extends ReelTemplate['template']> = Extract<ReelTemplate, { template: K }>;

export const ENTER = 80; // ms after scene start before the first element moves

/** Full-area centred column. */
export function column(
  ctx: TplCtx,
  gap: number,
  extra: Record<string, string | number> = {},
): HTMLElement {
  return h('div', {
    position: 'absolute',
    left: ctx.area.x,
    top: ctx.area.y,
    width: ctx.area.w,
    height: ctx.area.h,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap,
    padding: '0 56px',
    boxSizing: 'border-box',
    textAlign: 'center',
    ...extra,
  });
}

/** Shrinks `el`'s font size until it fits `maxW` and at most `maxLines` lines. */
export function fit(
  el: HTMLElement,
  maxW: number,
  maxSize: number,
  minSize: number,
  maxLines = 1,
  lineHeight = 1.05,
): number {
  let size = maxSize;
  el.style.maxWidth = `${maxW}px`;
  for (; size > minSize; size -= 2) {
    el.style.fontSize = `${size}px`;
    const lines = Math.round(el.scrollHeight / (size * lineHeight));
    if (el.scrollWidth <= maxW + 1 && lines <= maxLines) break;
  }
  el.style.fontSize = `${size}px`;
  return size;
}

export function headingStyle(ctx: TplCtx, size: number): Record<string, string | number> {
  return ctx.look.upper
    ? {
        fontFamily: ctx.look.sans,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '-0.015em',
        lineHeight: 1.05,
        textTransform: 'uppercase',
        color: ctx.pal.ink,
      }
    : {
        fontFamily: ctx.look.serif,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '-0.025em',
        lineHeight: 1.02,
        color: ctx.pal.ink,
        fontVariationSettings: "'opsz' 72",
      };
}

export function kickerEl(ctx: TplCtx, text: string): HTMLElement {
  return ctx.look.upper
    ? h(
        'div',
        {
          fontFamily: ctx.look.sans,
          fontWeight: 500,
          fontSize: 28,
          color: ctx.pal.dark ? '#BDBDC2' : '#3A3A3A',
          letterSpacing: '-0.01em',
        },
        [text.toLowerCase()],
      )
    : h(
        'div',
        {
          fontFamily: ctx.look.sans,
          fontWeight: 600,
          fontSize: 17,
          color: ctx.pal.accent,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        },
        [text],
      );
}

/** Black label (mono) or small caps line (cream). */
export function tagEl(ctx: TplCtx, text: string, size = 22): HTMLElement {
  return ctx.look.upper
    ? h(
        'div',
        {
          display: 'inline-block',
          background: ctx.pal.card,
          color: ctx.pal.cardInk,
          fontFamily: ctx.look.sans,
          fontWeight: 700,
          fontSize: size,
          letterSpacing: '0.01em',
          textTransform: 'uppercase',
          padding: '6px 11px 5px',
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
        },
        [text],
      )
    : h(
        'div',
        {
          display: 'inline-block',
          fontFamily: ctx.look.sans,
          fontWeight: 600,
          fontSize: Math.round(size * 0.8),
          color: ctx.pal.accent,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        [text],
      );
}

/** Splits a title into word spans, marking accent words. */
export function words(
  ctx: TplCtx,
  text: string,
  accent?: string,
): { el: HTMLElement; spans: HTMLElement[] } {
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}%$#]/gu, '');
  let acc = new Set((accent ?? '').split(/\s+/).map(norm).filter(Boolean));
  // An accent over every word is no accent (the whole title would go grey).
  if (text.split(/\s+/).every((w) => acc.has(norm(w)))) acc = new Set();
  const el = h('div', {});
  const spans: HTMLElement[] = [];
  text.split(/\s+/).forEach((w, i) => {
    if (i > 0) el.append(document.createTextNode(' '));
    const isAcc = acc.has(w.toLowerCase().replace(/[^\p{L}\p{N}%$#]/gu, ''));
    const s = h('span', { display: 'inline-block', willChange: 'transform, filter, opacity' }, [w]);
    if (isAcc) {
      if (ctx.look.upper) css(s, { color: ctx.pal.themed ? ctx.pal.accent : ctx.pal.muted });
      else
        css(s, {
          fontFamily: ctx.look.italic,
          fontStyle: 'italic',
          fontWeight: 700,
          color: ctx.pal.accent,
          letterSpacing: '-0.02em',
        });
    }
    el.append(s);
    spans.push(s);
  });
  return { el, spans };
}
