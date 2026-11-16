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

export function mountCaptions(
  host: HTMLElement,
  cfg: CaptionsConfig,
  frame: CaptionFrame,
): { seek(tMs: number): void } {
  const doc = host.ownerDocument;
  const { bottom, maxWidth, base, min, scale } = captionLayout(frame, cfg.presetId);
  const pill = pillColours(cfg.accent);
  const rise = 6 * scale;
  host.textContent = '';

  const built: Built[] = cfg.groups.map((group) => {
    const root = doc.createElement('div');
    root.setAttribute('data-caption-group', '');
    root.style.cssText = `position:absolute;left:0;right:0;bottom:${bottom}px;display:flex;justify-content:center;visibility:hidden;opacity:0;`;
    const line = doc.createElement('div');
    line.setAttribute('data-text', '');
    const weight = cfg.presetId === 'pop' ? 800 : 600;
    let lineCss = `font:${weight} ${base}px/1.2 ${cfg.font};color:#fff;text-align:center;white-space:nowrap;letter-spacing:${cfg.presetId === 'pop' ? '-0.01em' : '0'};`;
    if (cfg.presetId === 'pop') {
      lineCss += 'background:rgba(8,8,12,.66);border-radius:.3em;padding:.15em .35em;';
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
      span.style.cssText = 'display:inline-block;border-radius:.2em;padding:0 .12em;';
      if (w.emphasis && cfg.presetId !== 'boxed') span.setAttribute('data-emphasis', '');
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
      if (cfg.presetId === 'pop') {
        const p = isCur ? outCubic((tMs - w.startMs) / POP_MS) : 0;
        span.style.background = isCur ? pill.bg : 'transparent';
        span.style.color = isCur ? pill.ink : w.emphasis ? cfg.accent : '#fff';
        span.style.transform = `scale(${(1 + 0.06 * p).toFixed(4)})`;
      } else if (cfg.presetId === 'clean') {
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
      b.root.style.visibility = 'visible';
      b.root.style.opacity = (enter * exit).toFixed(4);
      b.root.style.transform = `translateY(${((1 - enter) * rise).toFixed(2)}px)`;
      styleWords(b, tMs);
    },
  };
}
