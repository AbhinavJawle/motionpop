// Reel engine (spec 25): tiny DOM builders for the browser runtime.
import { KIT_ICONS } from '../film/icons.generated';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Style = Partial<Record<string, string | number>>;

const PX_PROPS = new Set([
  'width',
  'height',
  'left',
  'top',
  'right',
  'bottom',
  'fontSize',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'borderRadius',
  'gap',
  'lineHeightPx',
  'maxWidth',
  'minWidth',
  'borderWidth',
  'columnGap',
  'rowGap',
]);

export function css(el: HTMLElement | SVGElement, style: Style): void {
  const s = el.style as unknown as Record<string, string>;
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined) continue;
    s[k] = typeof v === 'number' && PX_PROPS.has(k) ? `${v}px` : String(v);
  }
}

export function h(
  tag: string,
  style: Style = {},
  children: (Node | string | null | undefined | false)[] = [],
  attrs: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement(tag);
  css(el, style);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function svg(
  tag: string,
  attrs: Record<string, string | number> = {},
  children: SVGElement[] = [],
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

export interface IconHandle {
  el: SVGElement;
  /** 0..1 stroke draw-on. */
  draw(p: number): void;
}

/** A lucide icon drawn with `pathLength=1` strokes so it can draw on. */
export function icon(
  name: string | undefined,
  size: number,
  color: string,
  stroke = 2,
): IconHandle {
  const shapes = (name && KIT_ICONS[name]) || KIT_ICONS['circle-dashed'] || [];
  const root = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  root.style.overflow = 'visible';
  const parts: SVGElement[] = [];
  for (const [tag, attrs] of shapes) {
    const p = svg(tag, { ...attrs, pathLength: 1 });
    p.setAttribute('stroke-dasharray', '1 1');
    root.append(p);
    parts.push(p);
  }
  return {
    el: root,
    draw(p: number) {
      const n = parts.length;
      parts.forEach((part, i) => {
        // Stagger sub-paths slightly so multi-part icons sketch in order.
        const local = Math.max(0, Math.min(1, p * (1 + (n - 1) * 0.25) - i * 0.25));
        part.setAttribute('stroke-dashoffset', (1 - local).toFixed(4));
      });
    },
  };
}

/** A check mark that draws on. */
export function check(size: number, color: string, stroke = 2.6): IconHandle {
  const root = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  const p = svg('path', { d: 'M4.5 12.5l5 5L19.5 6.5', pathLength: 1, 'stroke-dasharray': '1 1' });
  root.append(p);
  return {
    el: root,
    draw(t: number) {
      p.setAttribute('stroke-dashoffset', (1 - Math.max(0, Math.min(1, t))).toFixed(4));
    },
  };
}

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
