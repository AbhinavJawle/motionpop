// Reel engine (spec 25): the two house looks. All sizes in this engine are logical px on the
// stage (`stageSizeForFormat`); the compiler scales the stage to the output resolution.
import type { Format, ReelBg, ReelLook } from '@motionpop/schemas';

export const STAGE_W = 720;
export const STAGE_H = 1280;

export interface StageSize {
  w: number;
  h: number;
}

/** Logical stage dimensions per aspect ratio (short side is always 720 px so typography scales consistently). */
export function stageSizeForFormat(format?: Format): StageSize {
  switch (format) {
    case '16:9':
      return { w: 1280, h: 720 };
    case '1:1':
      return { w: 720, h: 720 };
    default:
      return { w: STAGE_W, h: STAGE_H };
  }
}

export interface Palette {
  bg: string;
  /** Grid line colour (empty = no grid). */
  grid: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  link: string;
  card: string;
  cardInk: string;
  shadow: string;
  dark: boolean;
  /** Second colour of a theme (spec 37); absent on the house palettes. */
  accent2?: string;
  /** Background image layers under the grid (a theme's gradient). */
  bgLayers?: string[];
  /** True when a creator's theme is on this palette. */
  themed?: boolean;
}

export interface LookTokens {
  id: ReelLook;
  sans: string;
  serif: string;
  italic: string;
  mono: string;
  defaultBg: ReelBg;
  palettes: Record<ReelBg, Palette>;
  /** Speaker card (layout `card`): top edge y and corner radius. */
  cardTop: number;
  cardRadius: number;
  /** Headline style: mono shouts in uppercase sans, cream speaks in serif. */
  upper: boolean;
}

const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Newsreader', Georgia, serif";
const ITALIC = "'Playfair Display Italic', 'Newsreader', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, monospace";

export const LOOKS: Record<ReelLook, LookTokens> = {
  mono: {
    id: 'mono',
    sans: SANS,
    serif: SERIF,
    italic: ITALIC,
    mono: MONO,
    defaultBg: 'light',
    cardTop: 800,
    cardRadius: 0,
    upper: true,
    palettes: {
      light: {
        bg: '#FFFFFF',
        grid: 'rgba(0,0,0,0.045)',
        ink: '#0B0B0C',
        muted: '#9C9C9C',
        faint: '#D9D9D9',
        line: '#E6E6E6',
        accent: '#0B0B0C',
        link: '#5A57F0',
        card: '#0B0B0C',
        cardInk: '#FFFFFF',
        shadow: '0 18px 50px rgba(0,0,0,0.12)',
        dark: false,
      },
      cream: {
        bg: '#F4F1EC',
        grid: 'rgba(0,0,0,0.04)',
        ink: '#111111',
        muted: '#9A958D',
        faint: '#D8D2C8',
        line: '#E2DDD4',
        accent: '#111111',
        link: '#5A57F0',
        card: '#111111',
        cardInk: '#FFFFFF',
        shadow: '0 18px 50px rgba(0,0,0,0.12)',
        dark: false,
      },
      dark: {
        bg: '#0E0E10',
        grid: 'rgba(255,255,255,0.05)',
        ink: '#FFFFFF',
        muted: '#6E6E73',
        faint: '#3A3A3E',
        line: '#2A2A2E',
        accent: '#FFFFFF',
        link: '#8C8AFF',
        card: '#FFFFFF',
        cardInk: '#0B0B0C',
        shadow: '0 18px 50px rgba(0,0,0,0.5)',
        dark: true,
      },
    },
  },
  cream: {
    id: 'cream',
    sans: SANS,
    serif: SERIF,
    italic: ITALIC,
    mono: MONO,
    defaultBg: 'cream',
    cardTop: 790,
    cardRadius: 64,
    upper: false,
    palettes: {
      cream: {
        bg: '#EAE4D9',
        grid: '',
        ink: '#151413',
        muted: '#8E877C',
        faint: '#D5CDBF',
        line: '#D9D2C6',
        accent: '#D4623A',
        link: '#2F6BEA',
        card: '#F7F4EE',
        cardInk: '#151413',
        shadow: '0 22px 60px rgba(60,40,20,0.16)',
        dark: false,
      },
      light: {
        bg: '#FFFFFF',
        grid: '',
        ink: '#151413',
        muted: '#8E8E8E',
        faint: '#DDDDDD',
        line: '#E6E6E6',
        accent: '#D4623A',
        link: '#2F6BEA',
        card: '#FFFFFF',
        cardInk: '#151413',
        shadow: '0 22px 60px rgba(0,0,0,0.12)',
        dark: false,
      },
      dark: {
        bg: '#0A0A0B',
        grid: '',
        ink: '#FFFFFF',
        muted: '#77746F',
        faint: '#34322F',
        line: '#2A2826',
        accent: '#E8744A',
        link: '#7FA6FF',
        card: '#17171A',
        cardInk: '#FFFFFF',
        shadow: '0 22px 60px rgba(0,0,0,0.55)',
        dark: true,
      },
    },
  },
};

/** Graphic area (top-left origin, logical px) for a layout. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function graphicArea(
  look: LookTokens,
  layout: 'split' | 'card' | 'full' | 'speaker',
  stage: StageSize = { w: STAGE_W, h: STAGE_H },
  opts: { noVideo?: boolean; captions?: boolean } = {},
): Area {
  const isDefaultVertical = stage.w === STAGE_W && stage.h === STAGE_H;
  if (opts.noVideo || !isDefaultVertical) {
    // No speaker footage (or non-9:16 format): graphics own the full stage, with breathing room at
    // the bottom when voiceover captions are turned on.
    const capReserve = opts.captions ? (stage.h >= 1000 ? 150 : 108) : 0;
    return { x: 0, y: 0, w: stage.w, h: Math.max(360, stage.h - capReserve) };
  }
  switch (layout) {
    case 'split':
      return { x: 0, y: 0, w: STAGE_W, h: STAGE_H / 2 };
    case 'card':
      return { x: 0, y: 0, w: STAGE_W, h: look.cardTop - 100 };
    case 'full':
      return look.id === 'mono'
        ? { x: 0, y: 0, w: STAGE_W, h: 1060 }
        : { x: 0, y: 0, w: STAGE_W, h: 820 };
    case 'speaker':
      return { x: 0, y: 0, w: STAGE_W, h: STAGE_H };
  }
}
