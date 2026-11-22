import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import land110m from 'world-atlas/land-110m.json' with { type: 'json' };
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import type { ImageRef } from '../contract';
import { KIT_ICONS } from './icons.generated';

type Len = number | string;

export interface ReelKitDeps {
  doc: Document;
  W: number;
  H: number;
  u: number;
  videoStage?: string;
  colors: {
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    accent2: string;
    highlight: string;
    positive: string;
    negative: string;
    paper: string;
    chart: readonly string[];
  };
  fonts: { display: string; body: string; mono: string };
  images?: Readonly<Record<string, ImageRef>>;
  px: (v: Len | undefined, total: number, fallback: number) => number;
  getHome: () => Element;
  setHome: (el: Element) => void;
  warn: (msg: string) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function hexLum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.2;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function alphaHex(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const h = m[1]!;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${Math.max(0, Math.min(1, a))})`;
}

const LAND_GEO = feature(
  land110m as unknown as Topology<{ land: GeometryCollection }>,
  (land110m as unknown as Topology<{ land: GeometryCollection }>).objects.land,
) as unknown as FeatureCollection<Polygon | MultiPolygon>;

/**
 * Agency-grade Reel UI, Motion & 3D primitives for `filmKit` (`mp.*`, spec 23 Pillars 4 & 5).
 * Every helper produces deterministic DOM/SVG/Canvas output driven purely by `seek(t)`.
 */
export function createReelKit(d: ReelKitDeps) {
  const { doc, W, H, u, colors, fonts, px, getHome, setHome, warn } = d;
  const isLightLook = hexLum(colors.bg) > 0.55;

  const svgNode = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  const OPAQUE_STAGE_FORBIDDEN = new Set([
    'full',
    'backdrop',
    'top-card',
    'clean',
    'broll-full',
    'split-top-broll',
    'screen-showcase',
    'media-card-pop',
  ]);

  /**
   * 1. `mp.stage(opts)` — Rich styled canvas for top-half splits or full cutaways.
   * Refuses to paint an opaque curtain over full-bleed speaker/B-roll video stages (spec 24 R2.4),
   * and always emits explicit `background-color` + `data-mp-stage-bg` for contrast inspection.
   */
  const stage = (
    o: {
      tone?: 'auto' | 'cream' | 'light' | 'glow-violet' | 'glow-emerald' | 'dark-grid' | 'dark';
      region?: 'full' | 'top-half';
      adopt?: boolean;
    } = {},
  ): HTMLElement => {
    if (d.videoStage && OPAQUE_STAGE_FORBIDDEN.has(d.videoStage)) {
      warn(`stage: ignored on "${d.videoStage}" so live speaker/media stays visible`);
      return getHome() as HTMLElement;
    }
    const tone = o.tone && o.tone !== 'auto' ? o.tone : isLightLook ? 'cream' : 'glow-violet';
    const region = d.videoStage === 'split-top-stage' ? 'full' : (o.region ?? 'full');
    const el = doc.createElement('div');
    el.setAttribute('data-mp-stage', tone);
    const solidMap: Record<string, string> = {
      cream: colors.bg,
      light: '#FFFFFF',
      'glow-violet': '#14102A',
      'glow-emerald': '#081A15',
      'dark-grid': '#0B0C12',
      dark: '#0B0C12',
    };
    const solidBg = solidMap[tone] ?? colors.bg;
    el.setAttribute('data-mp-stage-bg', solidBg);
    const bgMap: Record<string, string> = {
      cream: `radial-gradient(ellipse 90% 80% at 50% 20%, #F5F1E9 0%, ${colors.bg} 78%)`,
      light: `radial-gradient(circle at 50% 15%, #FFFFFF 0%, #F4F6FA 80%)`,
      'glow-violet': `radial-gradient(circle at 50% 34%, #2B1D63 0%, #14102A 54%, #090812 100%)`,
      'glow-emerald': `radial-gradient(circle at 50% 36%, #0D3C2D 0%, #081A15 58%, #050B09 100%)`,
      'dark-grid': `radial-gradient(circle at 50% 25%, #191B26 0%, #0B0C12 85%)`,
      dark: `radial-gradient(circle at 50% 30%, #1A1B24 0%, #0B0C12 82%)`,
    };
    const isDarkStage =
      tone === 'glow-violet' || tone === 'glow-emerald' || tone === 'dark-grid' || tone === 'dark';
    const gridColor = isDarkStage ? 'rgba(255,255,255,0.045)' : 'rgba(23,22,20,0.045)';
    const heightCss = region === 'top-half' ? 'height:50%;bottom:auto;' : 'bottom:0;';
    el.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'top:0',
      heightCss,
      `background-color:${solidBg}`,
      `background-image:${bgMap[tone] ?? bgMap.cream}`,
      `color:${isDarkStage ? '#F8FAFC' : '#171614'}`,
      'overflow:hidden',
    ].join(';');

    if (tone === 'light' || tone === 'dark-grid') {
      const dots = doc.createElement('div');
      dots.style.cssText = `position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(${gridColor} 1.5px, transparent 1.5px);background-size:${Math.round(u * 3.2)}px ${Math.round(u * 3.2)}px;`;
      el.append(dots);
    }

    const host = getHome();
    if (o.adopt !== false) {
      const existing = Array.from(host.childNodes);
      host.prepend(el);
      for (const n of existing) el.append(n);
      setHome(el);
    } else {
      host.prepend(el);
    }
    return el;
  };

  /**
   * 2. `mp.card(opts)` — Elevated studio card (`dark-glass`, `light-elevated`, `cream-soft`, `accent-glow`).
   */
  const card = (
    o: {
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      variant?: 'auto' | 'light-elevated' | 'dark-glass' | 'cream-soft' | 'accent-glow';
      radius?: number;
      padding?: Len;
      parent?: Element;
    } = {},
  ): { el: HTMLElement; body: HTMLElement } => {
    const v =
      o.variant && o.variant !== 'auto' ? o.variant : isLightLook ? 'light-elevated' : 'dark-glass';
    const x = px(o.x, W, W * 0.08);
    const y = px(o.y, H, H * 0.1);
    const w = px(o.w, W, W * 0.84);
    const h = o.h !== undefined ? px(o.h, H, H * 0.24) : null;
    const rad = o.radius ?? Math.round(u * 2.4);
    const pad = px(o.padding, W, Math.round(u * 2.8));

    const el = doc.createElement('div');
    el.setAttribute('data-mp-card', v);
    const styles: Record<string, string> = {
      'light-elevated': `background:#FFFFFF;color:#171614;border:1px solid rgba(23,22,20,0.08);box-shadow:0 ${Math.round(u * 2)}px ${Math.round(u * 5.2)}px rgba(20,18,14,0.11),0 ${Math.round(u * 0.4)}px ${Math.round(u * 1.2)}px rgba(20,18,14,0.05);`,
      'cream-soft': `background:#F7F4ED;color:#171614;border:1px solid rgba(23,22,20,0.09);box-shadow:0 ${Math.round(u * 1.6)}px ${Math.round(u * 4.4)}px rgba(20,18,14,0.09);`,
      'dark-glass': `background:rgba(16,17,24,0.92);color:#FFFFFF;border:1px solid rgba(255,255,255,0.13);box-shadow:0 ${Math.round(u * 2.2)}px ${Math.round(u * 5.6)}px rgba(0,0,0,0.48),inset 0 1px 0 rgba(255,255,255,0.08);backdrop-filter:blur(16px);`,
      'accent-glow': `background:linear-gradient(135deg, ${colors.accent} 0%, ${alphaHex(colors.accent, 0.86)} 100%);color:#FFFFFF;border:1px solid rgba(255,255,255,0.22);box-shadow:0 ${Math.round(u * 1.8)}px ${Math.round(u * 4.8)}px ${alphaHex(colors.accent, 0.36)};`,
    };
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      `width:${w}px`,
      ...(h !== null ? [`height:${h}px`] : []),
      `border-radius:${rad}px`,
      'overflow:hidden',
      'box-sizing:border-box',
      styles[v] ?? styles['light-elevated']!,
    ].join(';');

    const body = doc.createElement('div');
    body.style.cssText = `position:relative;width:100%;height:100%;padding:${pad}px;box-sizing:border-box;`;
    el.append(body);
    (o.parent ?? getHome()).append(el);
    return { el, body };
  };

  /**
   * 3. `mp.window(opts)` — Authentic macOS terminal/code/doc/browser/prompt window (Refs 1, 2, 3).
   */
  const windowBox = (
    o: {
      kind?: 'terminal' | 'code' | 'doc' | 'browser' | 'prompt';
      title?: string;
      badge?: string;
      theme?: 'dark' | 'light';
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      parent?: Element;
    } = {},
  ): { el: HTMLElement; body: HTMLElement; badgeEl: HTMLElement | null } => {
    const kind = o.kind ?? 'terminal';
    const dark = o.theme ? o.theme === 'dark' : kind === 'terminal' || kind === 'code';
    const x = px(o.x, W, W * 0.08);
    const y = px(o.y, H, H * 0.08);
    const w = px(o.w, W, W * 0.84);
    const h = px(o.h, H, H * 0.34);
    const rad = Math.round(u * 2.2);

    const el = doc.createElement('div');
    el.setAttribute('data-mp-window', kind);
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      `width:${w}px`,
      `height:${h}px`,
      `border-radius:${rad}px`,
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
      'box-sizing:border-box',
      dark
        ? `background:#121318;color:#F4F4F6;border:1px solid rgba(255,255,255,0.12);box-shadow:0 ${Math.round(u * 2.4)}px ${Math.round(u * 6)}px rgba(0,0,0,0.42);`
        : `background:#FFFFFF;color:#171614;border:1px solid rgba(23,22,20,0.10);box-shadow:0 ${Math.round(u * 2.2)}px ${Math.round(u * 5.6)}px rgba(20,18,14,0.13);`,
    ].join(';');

    const header = doc.createElement('div');
    const headerH = Math.round(u * 5.2);
    header.style.cssText = [
      `height:${headerH}px`,
      'flex:0 0 auto',
      'display:flex',
      'align-items:center',
      `gap:${Math.round(u * 1.1)}px`,
      `padding:0 ${Math.round(u * 2.2)}px`,
      dark
        ? 'background:#1B1C24;border-bottom:1px solid rgba(255,255,255,0.08);'
        : 'background:#F7F7F9;border-bottom:1px solid rgba(23,22,20,0.07);',
    ].join(';');

    for (const c of ['#FF5F56', '#FFBD2E', '#27C93F']) {
      const dot = doc.createElement('span');
      dot.style.cssText = `width:${Math.round(u * 1.4)}px;height:${Math.round(u * 1.4)}px;border-radius:50%;background:${c};flex:0 0 auto;`;
      header.append(dot);
    }

    const titleEl = doc.createElement('span');
    titleEl.textContent = o.title ?? (kind === 'terminal' ? '~/.workspace' : 'document.md');
    titleEl.style.cssText = `margin-left:${Math.round(u * 1.2)}px;font-family:${fonts.mono};font-size:${Math.round(u * 2.1)}px;font-weight:600;color:${dark ? 'rgba(255,255,255,0.58)' : 'rgba(23,22,20,0.55)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;`;
    header.append(titleEl);

    let badgeEl: HTMLElement | null = null;
    if (o.badge) {
      badgeEl = doc.createElement('span');
      badgeEl.textContent = o.badge;
      badgeEl.style.cssText = `padding:${Math.round(u * 0.45)}px ${Math.round(u * 1.3)}px;border-radius:999px;font-family:${fonts.mono};font-size:${Math.round(u * 1.85)}px;font-weight:700;background:${dark ? 'rgba(255,255,255,0.1)' : '#171614'};color:#FFFFFF;`;
      header.append(badgeEl);
    }

    const body = doc.createElement('div');
    body.style.cssText = `position:relative;flex:1;min-height:0;padding:${Math.round(u * 2.4)}px;box-sizing:border-box;font-family:${kind === 'terminal' || kind === 'code' ? fonts.mono : fonts.body};font-size:${Math.round(u * 2.35)}px;line-height:1.45;overflow:hidden;`;

    el.append(header, body);
    (o.parent ?? getHome()).append(el);
    return { el, body, badgeEl };
  };

  /**
   * 4. `mp.odometer(el, opts)` — Smooth rolling numeric display helper (call `set(p)` inside `tl.fn`).
   */
  const odometer = (
    el: HTMLElement,
    o: { from?: number; to: number; prefix?: string; suffix?: string; decimals?: number },
  ): { set: (p: number) => void } => {
    const from = o.from ?? 0;
    const to = o.to;
    const dec = o.decimals ?? 0;
    const prefix = o.prefix ?? '';
    const suffix = o.suffix ?? '';
    el.style.fontVariantNumeric = 'tabular-nums';
    el.style.display = 'inline-block';
    const format = (v: number) =>
      dec > 0
        ? v.toFixed(dec)
        : Math.round(v)
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const set = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      const val = from + (to - from) * clamped;
      el.textContent = `${prefix}${format(val)}${suffix}`;
      const vel = Math.sin(clamped * Math.PI);
      el.style.filter = vel > 0.25 && clamped < 0.96 ? `blur(${(vel * 1.4).toFixed(2)}px)` : 'none';
      el.style.transform =
        clamped > 0 && clamped < 1
          ? `translateY(${((1 - clamped) * 4 * (to >= from ? -1 : 1)).toFixed(2)}px)`
          : 'none';
    };
    set(0);
    return { set };
  };

  /**
   * 5. `mp.ring(opts)` — Animated circular SVG progress/countdown ring (Ref 1 `200 ms`).
   */
  const ring = (
    o: {
      size?: Len;
      color?: string;
      trackColor?: string;
      strokeWidth?: number;
      parent?: Element;
    } = {},
  ): { el: SVGSVGElement; set: (p: number) => void } => {
    const sz = px(o.size, W, u * 10);
    const sw = o.strokeWidth ?? Math.max(3, Math.round(sz * 0.11));
    const r = sz / 2 - sw;
    const circ = 2 * Math.PI * r;
    const svg = svgNode('svg', {
      width: sz,
      height: sz,
      viewBox: `0 0 ${sz} ${sz}`,
    }) as SVGSVGElement;
    svg.style.display = 'block';
    const track = svgNode('circle', {
      cx: sz / 2,
      cy: sz / 2,
      r,
      fill: 'none',
      stroke: o.trackColor ?? 'rgba(255,255,255,0.16)',
      'stroke-width': sw,
    });
    const arc = svgNode('circle', {
      cx: sz / 2,
      cy: sz / 2,
      r,
      fill: 'none',
      stroke: o.color ?? colors.positive,
      'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-dasharray': circ.toFixed(2),
      'stroke-dashoffset': circ.toFixed(2),
      transform: `rotate(-90 ${sz / 2} ${sz / 2})`,
    });
    svg.append(track, arc);
    (o.parent ?? getHome()).append(svg);
    const set = (p: number) => {
      const c = Math.max(0, Math.min(1, p));
      arc.setAttribute('stroke-dashoffset', (circ * (1 - c)).toFixed(2));
    };
    return { el: svg, set };
  };

  /**
   * 6. `mp.meter(opts)` — Sleek horizontal benchmark progress bar with dashed reference marker (Ref 1/2).
   */
  const meter = (
    o: {
      w?: Len;
      h?: Len;
      color?: string;
      trackColor?: string;
      marker?: number;
      markerLabel?: string;
      parent?: Element;
    } = {},
  ): { el: HTMLElement; set: (p: number) => void } => {
    const w = o.w !== undefined ? `${px(o.w, W, W * 0.7)}px` : '100%';
    const h = px(o.h, H, Math.round(u * 2));
    const el = doc.createElement('div');
    el.style.cssText = `position:relative;width:${w};padding-bottom:${o.markerLabel ? Math.round(u * 3.2) : 0}px;`;
    const track = doc.createElement('div');
    track.style.cssText = `position:relative;width:100%;height:${h}px;border-radius:999px;background:${o.trackColor ?? 'rgba(128,128,128,0.22)'};overflow:hidden;`;
    const fill = doc.createElement('div');
    fill.style.cssText = `height:100%;width:0%;border-radius:999px;background:${o.color ?? colors.accent};`;
    track.append(fill);
    el.append(track);

    if (o.marker !== undefined) {
      const mPct = Math.max(0, Math.min(100, o.marker * 100));
      const dash = doc.createElement('div');
      dash.style.cssText = `position:absolute;left:${mPct}%;top:${-Math.round(h * 0.25)}px;height:${Math.round(h * 1.5)}px;border-left:2px dashed rgba(255,255,255,0.65);`;
      el.append(dash);
      if (o.markerLabel) {
        const lbl = doc.createElement('div');
        lbl.textContent = o.markerLabel;
        lbl.style.cssText = `position:absolute;left:${mPct}%;top:${Math.round(h * 1.45)}px;transform:translateX(-50%);font-family:${fonts.mono};font-size:${Math.round(u * 1.9)}px;font-weight:600;opacity:0.7;white-space:nowrap;`;
        el.append(lbl);
      }
    }
    (o.parent ?? getHome()).append(el);
    const set = (p: number) => {
      fill.style.width = `${(Math.max(0, Math.min(1, p)) * 100).toFixed(2)}%`;
    };
    return { el, set };
  };

  /**
   * 7. `mp.tile(opts)` — Glowing rounded iOS-style concept/app tile (Ref 3).
   */
  const tile = (o: {
    label: string;
    icon?: string;
    color?: string;
    size?: Len;
    x?: Len;
    y?: Len;
    parent?: Element;
  }): HTMLElement => {
    const sz = px(o.size, W, u * 16);
    const col = o.color ?? colors.accent;
    const wrap = doc.createElement('div');
    wrap.style.cssText = [
      o.x !== undefined || o.y !== undefined ? 'position:absolute' : 'position:relative',
      ...(o.x !== undefined ? [`left:${px(o.x, W, 0)}px`] : []),
      ...(o.y !== undefined ? [`top:${px(o.y, H, 0)}px`] : []),
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      `gap:${Math.round(u * 1.3)}px`,
    ].join(';');

    const box = doc.createElement('div');
    box.style.cssText = [
      `width:${sz}px`,
      `height:${sz}px`,
      `border-radius:${Math.round(sz * 0.24)}px`,
      `background:linear-gradient(145deg, ${col} 0%, ${alphaHex(col, 0.72)} 100%)`,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `border:1.5px solid rgba(255,255,255,0.24)`,
      `box-shadow:0 ${Math.round(u * 1.6)}px ${Math.round(u * 4.2)}px ${alphaHex(col, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
    ].join(';');

    const iconKey = o.icon && o.icon in KIT_ICONS ? (o.icon as keyof typeof KIT_ICONS) : null;
    if (iconKey) {
      const ico = svgNode('svg', {
        width: Math.round(sz * 0.52),
        height: Math.round(sz * 0.52),
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: '#FFFFFF',
        'stroke-width': 2.1,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      for (const [tag, attrs] of KIT_ICONS[iconKey] ?? []) {
        ico.append(svgNode(tag, attrs));
      }
      box.append(ico);
    } else {
      const mono = doc.createElement('span');
      mono.textContent = o.label.slice(0, 2).toUpperCase();
      mono.style.cssText = `font-family:${fonts.display};font-weight:800;font-size:${Math.round(sz * 0.36)}px;color:#FFFFFF;`;
      box.append(mono);
    }

    const lbl = doc.createElement('span');
    lbl.textContent = o.label;
    lbl.style.cssText = `font-family:${fonts.body};font-weight:700;font-size:${Math.round(u * 2.5)}px;color:inherit;text-align:center;`;
    wrap.append(box, lbl);
    (o.parent ?? getHome()).append(wrap);
    return wrap;
  };

  /**
   * 8. `mp.flowDots(fromPt, toPt, opts)` — Animated glowing signal dots traveling between 2 points (Ref 3).
   */
  const flowDots = (
    fromPt: [number, number],
    toPt: [number, number],
    o: { count?: number; color?: string; radius?: number; parent?: Element } = {},
  ): { el: SVGSVGElement; set: (p: number) => void } => {
    const count = Math.max(1, Math.min(8, o.count ?? 4));
    const col = o.color ?? colors.positive;
    const rad = o.radius ?? Math.max(4, u * 0.9);
    const svg = svgNode('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }) as SVGSVGElement;
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;';
    const line = svgNode('line', {
      x1: fromPt[0],
      y1: fromPt[1],
      x2: toPt[0],
      y2: toPt[1],
      stroke: alphaHex(col, 0.28),
      'stroke-width': Math.max(2, rad * 0.45),
      'stroke-dasharray': `${Math.round(rad * 1.4)} ${Math.round(rad * 1.4)}`,
    });
    svg.append(line);
    const dots: SVGElement[] = [];
    for (let i = 0; i < count; i++) {
      const c = svgNode('circle', { cx: fromPt[0], cy: fromPt[1], r: rad, fill: col, opacity: 0 });
      svg.append(c);
      dots.push(c);
    }
    (o.parent ?? getHome()).append(svg);
    const set = (p: number) => {
      const prog = Math.max(0, Math.min(1, p));
      dots.forEach((c, i) => {
        const local = Math.max(0, Math.min(1, prog * 1.4 - i * 0.14));
        const x = fromPt[0] + (toPt[0] - fromPt[0]) * local;
        const y = fromPt[1] + (toPt[1] - fromPt[1]) * local;
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('opacity', local > 0.02 && local < 0.98 ? (1 - i * 0.14).toFixed(2) : '0');
      });
    };
    return { el: svg, set };
  };

  /**
   * 9. `mp.chart(opts)` — Crisp editorial SVG line/bar/scatter chart with shaded target zones (Ref 1 & Ref 2).
   */
  const chart = (o: {
    type: 'line' | 'bar' | 'scatter';
    title?: string;
    points: readonly {
      label?: string;
      x?: number;
      y: number;
      color?: string;
      highlight?: boolean;
    }[];
    targetZone?: { fromX?: number; toX?: number; label?: string; color?: string };
    x?: Len;
    y?: Len;
    w?: Len;
    h?: Len;
    theme?: 'light' | 'dark';
    parent?: Element;
  }): { el: HTMLElement; set: (p: number) => void } => {
    const dark = o.theme ? o.theme === 'dark' : !isLightLook;
    const x = px(o.x, W, W * 0.06);
    const y = px(o.y, H, H * 0.07);
    const w = px(o.w, W, W * 0.88);
    const h = px(o.h, H, H * 0.36);

    const wrap = doc.createElement('div');
    wrap.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      `width:${w}px`,
      `height:${h}px`,
      `border-radius:${Math.round(u * 2.2)}px`,
      `padding:${Math.round(u * 2.4)}px`,
      'box-sizing:border-box',
      'display:flex',
      'flex-direction:column',
      dark
        ? `background:rgba(16,17,24,0.92);color:#F8FAFC;border:1px solid rgba(255,255,255,0.12);box-shadow:0 ${Math.round(u * 2)}px ${Math.round(u * 5)}px rgba(0,0,0,0.4);`
        : `background:#FFFFFF;color:#171614;border:1px solid rgba(23,22,20,0.08);box-shadow:0 ${Math.round(u * 1.8)}px ${Math.round(u * 4.8)}px rgba(20,18,14,0.10);`,
    ].join(';');

    if (o.title) {
      const t = doc.createElement('div');
      t.textContent = o.title;
      t.style.cssText = `font-family:${fonts.body};font-weight:700;font-size:${Math.round(u * 2.8)}px;margin-bottom:${Math.round(u * 1.4)}px;`;
      wrap.append(t);
    }

    const vw = 520;
    const vh = 260;
    const padL = 42;
    const padR = 24;
    const padT = 18;
    const padB = 34;
    const pw = vw - padL - padR;
    const ph = vh - padT - padB;
    const svg = svgNode('svg', { viewBox: `0 0 ${vw} ${vh}` }) as SVGSVGElement;
    svg.style.cssText = 'width:100%;flex:1;min-height:0;overflow:visible;';

    const gridCol = dark ? 'rgba(255,255,255,0.1)' : 'rgba(23,22,20,0.1)';
    const lblCol = dark ? 'rgba(255,255,255,0.58)' : 'rgba(23,22,20,0.55)';
    for (let i = 0; i <= 4; i++) {
      const gy = padT + (ph * i) / 4;
      svg.append(
        svgNode('line', {
          x1: padL,
          y1: gy,
          x2: vw - padR,
          y2: gy,
          stroke: gridCol,
          'stroke-width': 1,
        }),
      );
    }

    if (o.targetZone) {
      const fx = padL + pw * (o.targetZone.fromX ?? 0);
      const tx = padL + pw * (o.targetZone.toX ?? 0.42);
      const zc = o.targetZone.color ?? colors.positive;
      svg.append(
        svgNode('rect', {
          x: fx,
          y: padT,
          width: Math.max(4, tx - fx),
          height: ph,
          fill: alphaHex(zc, 0.14),
        }),
      );
      svg.append(
        svgNode('line', {
          x1: tx,
          y1: padT,
          x2: tx,
          y2: padT + ph,
          stroke: zc,
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
        }),
      );
      if (o.targetZone.label) {
        const zt = svgNode('text', {
          x: fx + 8,
          y: padT + 18,
          fill: zc,
          'font-size': 13,
          'font-weight': 700,
          'font-family': fonts.mono,
        });
        zt.textContent = o.targetZone.label;
        svg.append(zt);
      }
    }

    const pts = o.points.length
      ? o.points
      : [
          { label: 'A', y: 40 },
          { label: 'B', y: 85 },
        ];
    const maxY = Math.max(1, ...pts.map((p) => p.y));
    const maxX = Math.max(1, ...pts.map((p, i) => p.x ?? i));
    const coords = pts.map((p, i) => ({
      ...p,
      cx: padL + (pts.length === 1 ? pw / 2 : ((p.x ?? i) / maxX) * pw),
      cy: padT + ph - (p.y / maxY) * ph,
    }));

    const animEls: {
      kind: 'path' | 'bar' | 'dot';
      el: SVGElement;
      len?: number;
      baseY?: number;
      fullH?: number;
    }[] = [];

    if (o.type === 'line') {
      const dStr = coords
        .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
        .join(' ');
      const path = svgNode('path', {
        d: dStr,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 3.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      const approxLen = coords.reduce(
        (acc, c, i) =>
          i === 0 ? 0 : acc + Math.hypot(c.cx - coords[i - 1]!.cx, c.cy - coords[i - 1]!.cy),
        0,
      );
      path.setAttribute('stroke-dasharray', String(Math.max(1, Math.ceil(approxLen))));
      path.setAttribute('stroke-dashoffset', String(Math.max(1, Math.ceil(approxLen))));
      svg.append(path);
      animEls.push({ kind: 'path', el: path, len: Math.max(1, Math.ceil(approxLen)) });
      for (const c of coords) {
        const dot = svgNode('circle', {
          cx: c.cx,
          cy: c.cy,
          r: c.highlight ? 7 : 4.5,
          fill: c.color ?? colors.accent,
          stroke: dark ? '#121318' : '#FFFFFF',
          'stroke-width': 2,
          opacity: 0,
        });
        svg.append(dot);
        animEls.push({ kind: 'dot', el: dot });
      }
    } else if (o.type === 'bar') {
      const bw = Math.min(58, (pw / Math.max(1, coords.length)) * 0.58);
      coords.forEach((c, i) => {
        const bx = padL + ((i + 0.5) / coords.length) * pw - bw / 2;
        const bh = Math.max(6, padT + ph - c.cy);
        const rect = svgNode('rect', {
          x: bx,
          y: padT + ph,
          width: bw,
          height: 0,
          rx: 7,
          fill: c.color ?? (c.highlight ? colors.accent : alphaHex(colors.ink, dark ? 0.28 : 0.2)),
        });
        svg.append(rect);
        animEls.push({ kind: 'bar', el: rect, baseY: padT + ph, fullH: bh });
      });
    } else {
      for (const c of coords) {
        const dot = svgNode('circle', {
          cx: c.cx,
          cy: c.cy,
          r: c.highlight ? 9 : 6,
          fill: c.color ?? (c.highlight ? colors.accent : colors.accent2),
          opacity: 0,
        });
        svg.append(dot);
        animEls.push({ kind: 'dot', el: dot });
        if (c.label) {
          const lt = svgNode('text', {
            x: c.cx + 12,
            y: c.cy + 4,
            fill: dark ? '#F8FAFC' : '#171614',
            'font-size': 12.5,
            'font-weight': c.highlight ? 700 : 600,
            'font-family': fonts.body,
          });
          lt.textContent = c.label;
          svg.append(lt);
        }
      }
    }

    // X-axis labels
    coords.forEach((c, i) => {
      if (!c.label || o.type === 'scatter') return;
      const lx = o.type === 'bar' ? padL + ((i + 0.5) / coords.length) * pw : c.cx;
      const lt = svgNode('text', {
        x: lx,
        y: vh - 8,
        'text-anchor': 'middle',
        fill: lblCol,
        'font-size': 12,
        'font-family': fonts.mono,
      });
      lt.textContent = c.label;
      svg.append(lt);
    });

    wrap.append(svg);
    (o.parent ?? getHome()).append(wrap);

    const set = (p: number) => {
      const prog = Math.max(0, Math.min(1, p));
      animEls.forEach((item, idx) => {
        if (item.kind === 'path' && item.len) {
          item.el.setAttribute('stroke-dashoffset', (item.len * (1 - prog)).toFixed(1));
        } else if (item.kind === 'bar' && item.baseY !== undefined && item.fullH !== undefined) {
          const local = Math.max(0, Math.min(1, prog * 1.35 - idx * 0.1));
          const ch = item.fullH * local;
          item.el.setAttribute('y', (item.baseY - ch).toFixed(1));
          item.el.setAttribute('height', ch.toFixed(1));
        } else if (item.kind === 'dot') {
          const local = Math.max(0, Math.min(1, prog * 1.5 - idx * 0.08));
          item.el.setAttribute('opacity', local.toFixed(2));
        }
      });
    };
    return { el: wrap, set };
  };

  /**
   * 10. `mp.stamp(text, opts)` — Bold angled rubber-stamp slam (`OLD WAY`, Ref 3).
   */
  const stamp = (
    text: string,
    o: { color?: string; angle?: number; x?: Len; y?: Len; parent?: Element } = {},
  ): HTMLElement => {
    const col = o.color ?? colors.negative;
    const angle = o.angle ?? -9;
    const el = doc.createElement('div');
    el.textContent = text.toUpperCase();
    el.style.cssText = [
      'position:absolute',
      `left:${o.x !== undefined ? `${px(o.x, W, W * 0.5)}px` : '50%'}`,
      `top:${o.y !== undefined ? `${px(o.y, H, H * 0.3)}px` : '28%'}`,
      `transform:translate(-50%,-50%) rotate(${angle}deg)`,
      `padding:${Math.round(u * 1.4)}px ${Math.round(u * 3.4)}px`,
      `border:${Math.max(4, Math.round(u * 0.85))}px solid ${col}`,
      `border-radius:${Math.round(u * 1.4)}px`,
      `color:${col}`,
      `background:${alphaHex(col, 0.12)}`,
      `font-family:${fonts.display}`,
      'font-weight:900',
      `font-size:${Math.round(u * 7.2)}px`,
      'letter-spacing:0.08em',
      'white-space:nowrap',
      `box-shadow:0 ${Math.round(u * 1.2)}px ${Math.round(u * 3.2)}px ${alphaHex(col, 0.25)}`,
    ].join(';');
    (o.parent ?? getHome()).append(el);
    return el;
  };

  /**
   * 11. `mp.strike(target, opts)` — Bold diagonal red slash across a card/element (Ref 2 `0:31`).
   */
  const strike = (
    target: Element,
    o: { color?: string; width?: number } = {},
  ): { el: SVGSVGElement; set: (p: number) => void } => {
    const col = o.color ?? colors.negative;
    const sw = o.width ?? Math.max(6, Math.round(u * 1.3));
    const svg = svgNode('svg', {
      viewBox: '0 0 100 100',
      preserveAspectRatio: 'none',
    }) as SVGSVGElement;
    svg.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
    const ln = svgNode('line', {
      x1: 92,
      y1: 8,
      x2: 8,
      y2: 92,
      stroke: col,
      'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-dasharray': '125',
      'stroke-dashoffset': '125',
    });
    svg.append(ln);
    target.append(svg);
    const set = (p: number) => {
      ln.setAttribute('stroke-dashoffset', (125 * (1 - Math.max(0, Math.min(1, p)))).toFixed(1));
    };
    return { el: svg, set };
  };

  /**
   * 12. `mp.chapter(num, title, opts)` — Editorial Ref 2 lower-third chapter stamp (`skill no #1 / find skills`).
   */
  const chapter = (
    label: string,
    title: string,
    o: { y?: Len; parent?: Element } = {},
  ): HTMLElement => {
    const el = doc.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'left:8%',
      'right:8%',
      `top:${o.y !== undefined ? `${px(o.y, H, H * 0.62)}px` : '62%'}`,
      'text-align:center',
      'pointer-events:none',
    ].join(';');
    const kicker = doc.createElement('div');
    kicker.textContent = label;
    kicker.style.cssText = `font-family:${fonts.display};font-style:italic;font-weight:700;font-size:${Math.round(u * 5.2)}px;line-height:1.1;color:#FFFFFF;text-shadow:0 4px 20px rgba(0,0,0,0.82),0 1px 4px rgba(0,0,0,0.95);`;
    const main = doc.createElement('div');
    main.textContent = title;
    main.style.cssText = `margin-top:${Math.round(u * 0.6)}px;font-family:${fonts.body};font-weight:800;font-size:${Math.round(u * 7.2)}px;line-height:1.06;letter-spacing:-0.025em;color:#FFFFFF;text-shadow:0 4px 24px rgba(0,0,0,0.85),0 1px 4px rgba(0,0,0,0.96);`;
    el.append(kicker, main);
    (o.parent ?? getHome()).append(el);
    return el;
  };

  /**
   * 13. `mp.image(assetId, opts)` — Renders a pre-inlined AI cutout, illustration, or stock photo from `ctx.images`.
   * Zero external network calls; respects opaque-origin security boundary (D-021).
   */
  const image = (
    assetId: string,
    o: {
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      fit?: 'contain' | 'cover';
      radius?: number;
      shadow?: boolean;
      parent?: Element;
    } = {},
  ): HTMLElement => {
    const ref = d.images?.[assetId];
    // Inside a parent, places and sizes are relative to that parent (CSS %, so it holds whether
    // or not the parent is laid out yet) and the picture fills it by default ("the logo in this
    // slot"); otherwise they are frame pixels.
    const rel = (v: Len | undefined, total: number, fallback: string): string =>
      v === undefined
        ? fallback
        : typeof v === 'string' && v.trim().endsWith('%')
          ? v.trim()
          : `${px(v, total, 0)}px`;
    const box = o.parent
      ? {
          x: rel(o.x, W, '0px'),
          y: rel(o.y, H, '0px'),
          w: rel(o.w, W, '100%'),
          h: rel(o.h, H, '100%'),
        }
      : {
          x: `${px(o.x, W, W * 0.14)}px`,
          y: `${px(o.y, H, H * 0.08)}px`,
          w: `${px(o.w, W, W * 0.72)}px`,
          h: `${px(o.h, H, H * 0.36)}px`,
        };
    // The picture is placed inside its parent, so a static parent becomes its containing block.
    const pe = o.parent as HTMLElement | undefined;
    if (pe?.style && !pe.style.position && doc.defaultView) {
      const pos = doc.defaultView.getComputedStyle(pe).position;
      if (pos === 'static' || pos === '') pe.style.position = 'relative';
    }
    const wrap = doc.createElement('div');
    wrap.setAttribute('data-mp-image', assetId);
    wrap.style.cssText = [
      'position:absolute',
      `left:${box.x}`,
      `top:${box.y}`,
      `width:${box.w}`,
      `height:${box.h}`,
      `border-radius:${o.radius ?? (ref?.keyed ? 0 : Math.round(u * 2))}px`,
      ref?.keyed ? 'overflow:visible;' : 'overflow:hidden;',
      o.shadow !== false && !ref?.keyed
        ? `box-shadow:0 ${Math.round(u * 2)}px ${Math.round(u * 5.2)}px rgba(0,0,0,0.22);`
        : '',
    ].join(';');

    if (!ref) {
      warn(`image: asset "${assetId}" is not loaded`);
    } else {
      const img = doc.createElement('img');
      img.src = ref.src;
      img.alt = '';
      img.style.cssText = [
        'width:100%',
        'height:100%',
        `object-fit:${o.fit ?? (ref.keyed ? 'contain' : 'cover')}`,
        'display:block',
        ref.keyed && o.shadow !== false
          ? `filter:drop-shadow(0 ${Math.round(u * 1.4)}px ${Math.round(u * 2.8)}px rgba(0,0,0,0.38));`
          : '',
      ].join(';');
      wrap.append(img);
    }
    (o.parent ?? getHome()).append(wrap);
    return wrap;
  };

  /**
   * 14. `mp.card3d(opts)` — True CSS 3D perspective stage rig for tilted devices, floating cards & depth parallax (Pillar 5).
   */
  const card3d = (
    o: {
      x?: Len;
      y?: Len;
      w?: Len;
      h?: Len;
      rotateX?: number;
      rotateY?: number;
      perspective?: number;
      variant?: 'dark-glass' | 'light-elevated' | 'cream-soft';
      parent?: Element;
    } = {},
  ): {
    el: HTMLElement;
    body: HTMLElement;
    setTilt: (rx: number, ry: number, scale?: number) => void;
  } => {
    const persp = o.perspective ?? 1200;
    const { el, body } = card({
      ...(o.x !== undefined ? { x: o.x } : {}),
      ...(o.y !== undefined ? { y: o.y } : {}),
      ...(o.w !== undefined ? { w: o.w } : {}),
      ...(o.h !== undefined ? { h: o.h } : {}),
      ...(o.variant ? { variant: o.variant } : {}),
      ...(o.parent ? { parent: o.parent } : {}),
    });
    el.style.transformStyle = 'preserve-3d';
    const setTilt = (rx: number, ry: number, sc = 1) => {
      el.style.transform = `perspective(${persp}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    };
    setTilt(o.rotateX ?? 6, o.rotateY ?? -10, 1);
    return { el, body, setTilt };
  };

  /**
   * 15. `mp.globe(opts)` — Deterministic 3D orthographic Earth sphere with shaded atmosphere & live spin (Pillar 5, Ref 4).
   */
  const globe = (
    o: {
      x?: Len;
      y?: Len;
      size?: Len;
      style?: 'night' | 'satellite' | 'editorial';
      lon?: number;
      lat?: number;
      parent?: Element;
    } = {},
  ): { el: HTMLCanvasElement; set: (lon: number, lat?: number, scale?: number) => void } => {
    const sz = Math.round(px(o.size, W, W * 0.68));
    const x = px(o.x, W, (W - sz) / 2);
    const y = px(o.y, H, H * 0.08);
    const style = o.style ?? (isLightLook ? 'editorial' : 'night');
    const canvas = doc.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    canvas.setAttribute('data-mp-globe', style);
    canvas.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;`;
    (o.parent ?? getHome()).append(canvas);

    const ctx2d = canvas.getContext('2d');
    const graticule = geoGraticule10();
    const set = (lon: number, lat = o.lat ?? 20, zoom = 1) => {
      if (!ctx2d) return;
      ctx2d.clearRect(0, 0, sz, sz);
      const r = sz * 0.43 * Math.max(0.5, Math.min(1.8, zoom));
      const cx = sz / 2;
      const cy = sz / 2;

      // Atmosphere glow
      const halo = ctx2d.createRadialGradient(cx, cy, r * 0.88, cx, cy, r * 1.18);
      if (style === 'editorial') {
        halo.addColorStop(0, alphaHex(colors.accent, 0.16));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        halo.addColorStop(0, 'rgba(72,149,255,0.42)');
        halo.addColorStop(1, 'rgba(72,149,255,0)');
      }
      ctx2d.fillStyle = halo;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
      ctx2d.fill();

      // Ocean sphere with 3D specular shading
      const ocean = ctx2d.createRadialGradient(cx - r * 0.32, cy - r * 0.28, r * 0.1, cx, cy, r);
      if (style === 'editorial') {
        ocean.addColorStop(0, '#F7F3EA');
        ocean.addColorStop(0.75, '#DDD5C7');
        ocean.addColorStop(1, '#BEB4A3');
      } else if (style === 'satellite') {
        ocean.addColorStop(0, '#2B6CB0');
        ocean.addColorStop(0.68, '#13315C');
        ocean.addColorStop(1, '#071326');
      } else {
        ocean.addColorStop(0, '#1E2A5E');
        ocean.addColorStop(0.72, '#0D132B');
        ocean.addColorStop(1, '#040610');
      }
      ctx2d.fillStyle = ocean;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
      ctx2d.fill();

      const proj = geoOrthographic()
        .translate([cx, cy])
        .scale(r)
        .rotate([-lon, -lat])
        .clipAngle(90);
      const path = geoPath(proj, ctx2d);

      // Graticule
      ctx2d.beginPath();
      path(graticule);
      ctx2d.strokeStyle = style === 'editorial' ? 'rgba(23,22,20,0.09)' : 'rgba(130,175,255,0.14)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();

      // Continents
      ctx2d.beginPath();
      path(LAND_GEO);
      ctx2d.fillStyle =
        style === 'editorial' ? colors.ink : style === 'satellite' ? '#38A169' : '#334878';
      ctx2d.fill();
      ctx2d.strokeStyle =
        style === 'editorial' ? 'rgba(255,255,255,0.25)' : 'rgba(147,197,253,0.3)';
      ctx2d.lineWidth = 0.9;
      ctx2d.stroke();

      // 3D rim terminator shadow
      const shade = ctx2d.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.4, cx, cy, r);
      shade.addColorStop(0, 'rgba(255,255,255,0.10)');
      shade.addColorStop(0.65, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx2d.fillStyle = shade;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
      ctx2d.fill();
    };
    set(o.lon ?? -25, o.lat ?? 22, 1);
    return { el: canvas, set };
  };

  /**
   * 16. `mp.mesh3d(opts)` — Deterministic procedural 3D geometric props (stacked 3D coins, glowing 3D cube/chip, 3D bars, Ref 3).
   */
  const mesh3d = (o: {
    kind: 'coins' | 'cube' | 'bars';
    count?: number;
    color?: string;
    x?: Len;
    y?: Len;
    w?: Len;
    h?: Len;
    parent?: Element;
  }): { el: SVGSVGElement; set: (p: number) => void } => {
    const x = px(o.x, W, W * 0.2);
    const y = px(o.y, H, H * 0.1);
    const w = px(o.w, W, W * 0.6);
    const h = px(o.h, H, H * 0.32);
    const col = o.color ?? colors.accent;
    const svg = svgNode('svg', { viewBox: '0 0 240 200' }) as SVGSVGElement;
    svg.setAttribute('data-mp-mesh3d', o.kind);
    svg.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:visible;`;
    (o.parent ?? getHome()).append(svg);

    const set = (p: number) => {
      const prog = Math.max(0, Math.min(1, p));
      svg.textContent = '';
      if (o.kind === 'coins') {
        const total = Math.max(2, Math.min(18, o.count ?? 10));
        const visible = Math.max(1, Math.round(total * prog));
        for (let i = 0; i < visible; i++) {
          const cy = 172 - i * 8.5;
          const g = svgNode('g');
          g.append(
            svgNode('ellipse', { cx: 120, cy: cy + 4, rx: 46, ry: 13, fill: alphaHex(col, 0.7) }),
          );
          g.append(
            svgNode('rect', { x: 74, y: cy, width: 92, height: 4, fill: alphaHex(col, 0.7) }),
          );
          g.append(
            svgNode('ellipse', {
              cx: 120,
              cy,
              rx: 46,
              ry: 13,
              fill: col,
              stroke: 'rgba(255,255,255,0.45)',
              'stroke-width': 1.2,
            }),
          );
          svg.append(g);
        }
      } else if (o.kind === 'cube') {
        const yaw = (prog - 0.5) * 1.1;
        const dx = Math.sin(yaw) * 26;
        const cx = 120;
        const cy = 100 - Math.sin(prog * Math.PI) * 8;
        const s = 54;
        // Isometric shaded 3D chip/cube
        svg.append(
          svgNode('polygon', {
            points: `${cx},${cy - s * 0.75} ${cx + s + dx * 0.3},${cy - s * 0.25} ${cx},${cy + s * 0.25} ${cx - s + dx * 0.3},${cy - s * 0.25}`,
            fill: col,
            stroke: 'rgba(255,255,255,0.35)',
            'stroke-width': 1.5,
          }),
        );
        svg.append(
          svgNode('polygon', {
            points: `${cx - s + dx * 0.3},${cy - s * 0.25} ${cx},${cy + s * 0.25} ${cx},${cy + s * 0.95} ${cx - s + dx * 0.3},${cy + s * 0.45}`,
            fill: alphaHex(col, 0.72),
          }),
        );
        svg.append(
          svgNode('polygon', {
            points: `${cx + s + dx * 0.3},${cy - s * 0.25} ${cx},${cy + s * 0.25} ${cx},${cy + s * 0.95} ${cx + s + dx * 0.3},${cy + s * 0.45}`,
            fill: alphaHex(col, 0.48),
          }),
        );
      } else {
        const n = Math.max(2, Math.min(6, o.count ?? 4));
        for (let i = 0; i < n; i++) {
          const frac = (i + 1) / n;
          const local = Math.max(0, Math.min(1, prog * 1.4 - i * 0.12));
          const bh = (28 + frac * 110) * local;
          const bx = 36 + i * (170 / n);
          const by = 178 - bh;
          svg.append(
            svgNode('rect', {
              x: bx,
              y: by,
              width: 24,
              height: bh,
              rx: 4,
              fill: i === n - 1 ? col : alphaHex(col, 0.55),
            }),
          );
          svg.append(
            svgNode('polygon', {
              points: `${bx + 24},${by} ${bx + 32},${by - 6} ${bx + 32},${172} ${bx + 24},${178}`,
              fill: alphaHex(col, 0.35),
            }),
          );
          svg.append(
            svgNode('polygon', {
              points: `${bx},${by} ${bx + 8},${by - 6} ${bx + 32},${by - 6} ${bx + 24},${by}`,
              fill: 'rgba(255,255,255,0.35)',
            }),
          );
        }
      }
    };
    set(0);
    return { el: svg, set };
  };

  return {
    stage,
    card,
    window: windowBox,
    odometer,
    ring,
    meter,
    tile,
    flowDots,
    chart,
    stamp,
    strike,
    chapter,
    image,
    card3d,
    globe,
    mesh3d,
  };
}
