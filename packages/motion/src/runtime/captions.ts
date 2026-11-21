import type { Format } from '../contract';
import type { CaptionGroup, CaptionPresetId } from '../captions/chunk';

/**
 * The captions overlay (spec 12 R5, design §4.2): a rail line on top of the whole frame, never a
 * reserved band. Built once (after fonts load, it measures text), then `seek(t)` sets every
 * property from `t` alone: no timers, transitions or CSS animations (R5.5).
 */
export interface CaptionsConfig {
  presetId: CaptionPresetId;
  groups: CaptionGroup[];
  /** The look's accent colour (hex). */
  accent: string;
  /** CSS font stack (the look's body family). */
  font: string;
  /** Optional video choreography stage windows for dynamic vertical dodging (spec 21 R2). */
  stageWindows?: readonly { startMs: number; endMs: number; mode: string }[];
}

export interface CaptionFrame {
  width: number;
  height: number;
  format: Format;
}

interface Built {
  root: HTMLElement;
  words: HTMLElement[];
  group: CaptionGroup;
}

const ENTER_MS = 120;
const EXIT_MS = 90;
const POP_MS = 80;

const outCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The pop pill: accent with the better-contrast ink, or white with black ink below 4.5:1. */
export function pillColours(accent: string): { bg: string; ink: string } {
  const l = luminance(accent);
  const onBlack = contrast(l, 0);
  const onWhite = contrast(l, 1);
  if (Math.max(onBlack, onWhite) < 4.5) return { bg: '#ffffff', ink: '#000000' };
  return { bg: accent, ink: onBlack >= onWhite ? '#000000' : '#ffffff' };
}

/**
 * The pop line's box (rgba(8,8,12,.66)) over the lightest possible frame, white: the worst case
 * an emphasised word sits on.
 */
const POP_BOX_ON_WHITE = 0x5c5c5f;

/**
 * Emphasised words are drawn in the accent when it reads at 4.5:1 on the caption box, else in
 * the least-lightened accent that does (a deep red or a dark brand colour would vanish).
 */
export function emphasisColour(accent: string): string {
  const n = Number.parseInt(accent.slice(1, 7), 16);
  const box = luminance(`#${POP_BOX_ON_WHITE.toString(16)}`);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const mix = (v: number) => Math.round(v + (255 - v) * t);
    const c = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    if (contrast(luminance(hex), box) >= 4.5) return hex;
  }
  return '#ffffff';
}

/** Line geometry (R5.2): bottom offset, max width and font sizes in frame px. */
export function captionLayout(frame: CaptionFrame, presetId: CaptionPresetId) {
  const ref = Math.min(frame.width, frame.height);
  const scale = ref / 1080;
  const bottom =
    frame.format === '9:16'
      ? Math.round(frame.height * 0.25)
      : Math.round(96 * (frame.height / 1080));
  const maxWidth = Math.min(
    Math.round((frame.format === '16:9' ? 1600 : 900) * scale),
    Math.round(frame.width * 0.88),
  );
  const base = Math.round(ref * (presetId === 'pop' ? 0.07 : 0.055));
  const min = Math.round(ref * 0.04);
  return { bottom, maxWidth, base, min, scale };
}

const NUMERIC_POWER = /\d|%|[$€£]/;

/** Stage-specific caption vertical bottom offset in frame pixels (single source of truth for captions + critic). */
export function captionBottomForMode(
  baseBottom: number,
  frame: CaptionFrame,
  mode?: string,
): number {
  const vertical = frame.format === '9:16';
  if (!vertical) {
    if (mode === 'split-top-broll' || mode === 'screen-showcase') return Math.round(frame.height * 0.06);
    return baseBottom;
  }
  switch (mode) {
    case 'split-top-broll':
      // Sits cleanly along the crisp center seam between top B-roll and bottom speaker.
      return Math.round(frame.height * 0.44);
    case 'screen-showcase':
      // Sits cleanly below the tilted screen window without overlapping speaker PiP.
      return Math.round(frame.height * 0.23);
    case 'split-left':
      // Sits cleanly on the seam between top speaker (4%..45%) and bottom graphic (56%..93%).
      return Math.round(frame.height * 0.48);
    case 'split-right':
      // Sits cleanly on the seam between top graphic (6%..42%) and bottom speaker (55%..96%).
      return Math.round(frame.height * 0.47);
    case 'pip':
      // Sits between upper graphic zone (7%..62%) and bottom-left PiP bubble (76%..95%).
      return Math.round(frame.height * 0.26);
    case 'backdrop':
    case 'cutaway':
      // Sits cleanly below centered graphic zone (8%..64%).
      return Math.round(frame.height * 0.2);
    case 'media-card-pop':
      return Math.round(frame.height * 0.19);
    case 'full':
    default:
      return Math.round(frame.height * 0.18);
  }
}

/** Reserved vertical pixel band `[top, bottom]` where live captions render for a given format + video stage. */
export function captionSafeBandForStage(
  format: Format,
  width: number,
  height: number,
  mode?: string,
): { top: number; bottom: number } {
  const frame: CaptionFrame = { width, height, format };
  const layout = captionLayout(frame, 'pop');
  const bottomOffset = mode ? captionBottomForMode(layout.bottom, frame, mode) : layout.bottom;
  const bandHeight = Math.round(layout.base * 1.85);
  const bottom = Math.max(0, Math.min(height, height - bottomOffset));
  const top = Math.max(0, bottom - bandHeight);
  return { top, bottom };
}

/** Pure stage-aware bottom offset in frame pixels so captions never collide with B-roll splits (spec 21 R2). */
export function captionBottomForStage(
  baseBottom: number,
  frame: CaptionFrame,
  tMs: number,
  stageWindows?: readonly { startMs: number; endMs: number; mode: string }[],
): number {
  if (!stageWindows || stageWindows.length === 0) return baseBottom;
  const targetFor = (mode: string): number => captionBottomForMode(baseBottom, frame, mode);
  const idx = stageWindows.findIndex((s) => tMs >= s.startMs && tMs < s.endMs);
  if (idx < 0) return baseBottom;
  const cur = stageWindows[idx]!;
  const target = targetFor(cur.mode);
  const prev = idx > 0 ? stageWindows[idx - 1] : undefined;
  const glideMs = 220;
  if (prev && tMs - cur.startMs < glideMs) {
    const p = outCubic((tMs - cur.startMs) / glideMs);
    const from = targetFor(prev.mode);
    return Math.round(from + (target - from) * p);
  }
  return target;
}

export function mountCaptions(
  host: HTMLElement,
  cfg: CaptionsConfig,
  frame: CaptionFrame,
): { seek(tMs: number): void } {
  const doc = host.ownerDocument;
  const { bottom, maxWidth, base, min, scale } = captionLayout(frame, cfg.presetId);
  const pill = pillColours(cfg.accent);
  const emphasis = emphasisColour(cfg.accent);
  const rise = 6 * scale;
  host.textContent = '';

  const built: Built[] = cfg.groups.map((group) => {
    const root = doc.createElement('div');
    root.setAttribute('data-caption-group', '');
    root.style.cssText = `position:absolute;left:0;right:0;bottom:${bottom}px;display:flex;justify-content:center;visibility:hidden;opacity:0;`;
    const line = doc.createElement('div');
    line.setAttribute('data-text', '');
    const weight = cfg.presetId === 'pop' ? 800 : 600;
    let lineCss = `font:${weight} ${base}px/1.2 ${cfg.font};color:#fff;text-align:center;white-space:nowrap;letter-spacing:${cfg.presetId === 'pop' ? '-0.015em' : '0'};`;
    if (cfg.presetId === 'pop') {
      lineCss +=
        'background:rgba(8,8,12,.72);border-radius:.35em;padding:.18em .42em;box-shadow:0 8px 28px rgba(0,0,0,.45);';
    } else if (cfg.presetId === 'clean') {
      // The feather sits outside the padded box, so no glyph is on alpha below 0.66 (R5.4).
      lineCss +=
        'background:rgba(8,8,12,.66);border-radius:.6em;padding:.25em .6em;box-shadow:0 0 .6em .3em rgba(8,8,12,.5);';
    } else {
      lineCss += 'background:rgba(8,8,12,.78);border-radius:.35em;padding:.35em .6em;';
    }
    line.style.cssText = lineCss;
    const words = group.words.map((w, i) => {
      const span = doc.createElement('span');
      span.textContent = w.text;
      span.style.cssText = 'display:inline-block;border-radius:.22em;padding:0 .14em;';
      if ((w.emphasis || NUMERIC_POWER.test(w.text)) && cfg.presetId !== 'boxed') {
        span.setAttribute('data-emphasis', '');
      }
      line.appendChild(span);
      if (i < group.words.length - 1) line.appendChild(doc.createTextNode(' '));
      return span;
    });
    root.appendChild(line);
    host.appendChild(root);

    // Fit: shrink until the line fits the max width; below the minimum, wrap instead (R5.2).
    const measured = line.scrollWidth;
    if (measured > maxWidth) {
      const size = Math.max(min, Math.floor((base * maxWidth) / measured));
      line.style.fontSize = `${size}px`;
      if (line.scrollWidth > maxWidth) {
        line.style.whiteSpace = 'normal';
        line.style.maxWidth = `${maxWidth}px`;
      }
    }
    return { root, words, group };
  });

  let shown = -1;
  const reset = (b: Built) => {
    b.root.style.visibility = 'hidden';
    b.root.style.opacity = '0';
  };

  function styleWords(b: Built, tMs: number) {
    let current = -1;
    b.group.words.forEach((w, i) => {
      if (w.startMs <= tMs) current = i;
    });
    b.words.forEach((span, i) => {
      const w = b.group.words[i]!;
      const isCur = i === current;
      const isHighlight = Boolean(w.emphasis) || NUMERIC_POWER.test(w.text);
      if (cfg.presetId === 'pop') {
        const p = isCur ? outCubic((tMs - w.startMs) / POP_MS) : 0;
        span.style.background = isCur ? pill.bg : 'transparent';
        span.style.color = isCur ? pill.ink : isHighlight ? emphasis : '#fff';
        const lift = isCur ? -2 * scale * p : 0;
        span.style.transform = `translateY(${lift.toFixed(2)}px) scale(${(1 + 0.11 * p).toFixed(4)})`;
      } else if (cfg.presetId === 'clean') {
        span.style.color = isCur ? '#fff' : isHighlight ? emphasis : 'rgba(255,255,255,.92)';
        span.style.boxShadow = isCur
          ? `inset 0 -${Math.max(2, Math.round(4 * scale))}px 0 ${cfg.accent}`
          : 'none';
      } else {
        span.style.color = isCur ? '#fff' : 'rgba(255,255,255,.75)';
      }
    });
  }

  return {
    seek(tMs: number) {
      let idx = -1;
      for (let i = 0; i < built.length; i++) {
        const g = built[i]!.group;
        if (tMs >= g.openMs && tMs < g.closeMs) {
          idx = i;
          break;
        }
      }
      if (shown >= 0 && shown !== idx) reset(built[shown]!);
      shown = idx;
      if (idx < 0) return;
      const b = built[idx]!;
      const g = b.group;
      const enter = outCubic((tMs - g.openMs) / ENTER_MS);
      const exit = g.closeMs - tMs < EXIT_MS ? (g.closeMs - tMs) / EXIT_MS : 1;
      const dynamicBottom = captionBottomForStage(bottom, frame, tMs, cfg.stageWindows);
      b.root.style.bottom = `${dynamicBottom}px`;
      b.root.style.visibility = 'visible';
      b.root.style.opacity = (enter * exit).toFixed(4);
      b.root.style.transform = `translateY(${((1 - enter) * rise).toFixed(2)}px)`;
      styleWords(b, tMs);
    },
  };
}
