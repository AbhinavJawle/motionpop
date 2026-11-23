// Reel engine (spec 37 R2.2): colours and a gradient over a house look. The theme lives on the
// plan, so the preview, the export and AI-written scenes all draw it from the same function.
import type { ReelTheme } from '@motionpop/schemas';
import type { LookTokens, Palette } from './looks';

type Rgb = [number, number, number];

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function luminance(h: string): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb(h);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio of two `#RRGGBB` colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `a` mixed toward `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
}

/**
 * The colour itself when it reads at `min`:1 against `against`, else the least-shifted version
 * that does: darker on a light ground, lighter on a dark one.
 */
export function readable(colour: string, against: string, min: number): string {
  const toward = luminance(against) > 0.4 ? '#000000' : '#FFFFFF';
  for (let i = 0; i <= 20; i++) {
    const c = mix(colour, toward, i / 20);
    if (contrast(c, against) >= min) return c;
  }
  return toward;
}

/** The colour turned `deg` degrees round the hue wheel (a partner when only one is given). */
export function turnHue(colour: string, deg: number): string {
  const [r, g, b] = rgb(colour).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return colour.toUpperCase();
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (((hue * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return hex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

/** Tint strength of the background gradient per setting: [first corner, second corner]. */
const WASH: Record<ReelTheme['background'], [number, number] | null> = {
  plain: null,
  soft: [0.12, 0.16],
  bold: [0.26, 0.32],
};

/** One palette with the theme on it. Accents read at 3:1 on the background. */
export function themedPalette(pal: Palette, theme: ReelTheme, look: LookTokens): Palette {
  if (!HEX.test(theme.accent) || !HEX.test(pal.bg)) return pal;
  const second =
    theme.accent2 && HEX.test(theme.accent2) ? theme.accent2 : turnHue(theme.accent, 48);
  const accent = readable(theme.accent, pal.bg, 3);
  const accent2 = readable(second, pal.bg, 3);
  const wash = WASH[theme.background];
  const out: Palette = { ...pal, accent, accent2, themed: true };
  if (wash) {
    const a = mix(pal.bg, theme.accent, wash[0]);
    const b = mix(pal.bg, second, wash[1]);
    out.bgLayers = [
      `radial-gradient(110% 70% at 0% 0%, ${a} 0%, rgba(0,0,0,0) 62%)`,
      `radial-gradient(110% 70% at 100% 100%, ${b} 0%, rgba(0,0,0,0) 64%)`,
      `linear-gradient(160deg, ${mix(pal.bg, theme.accent, wash[0] / 2)} 0%, ${pal.bg} 50%, ${mix(pal.bg, second, wash[1] / 2)} 100%)`,
    ];
  }
  // Mono's black labels and cards take the accent, shaded so their ink still reads.
  if (look.upper && HEX.test(pal.cardInk)) out.card = readable(theme.accent, pal.cardInk, 4.5);
  return out;
}

/** The look with the theme on every palette; the look itself when there is no theme. */
export function themedLook(look: LookTokens, theme: ReelTheme | undefined): LookTokens {
  if (!theme) return look;
  const palettes = { ...look.palettes };
  for (const k of Object.keys(palettes) as (keyof typeof palettes)[])
    palettes[k] = themedPalette(look.palettes[k], theme, look);
  return { ...look, palettes };
}
