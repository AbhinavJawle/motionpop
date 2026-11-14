import type { MouthShape } from './geometry';

export const PIP_STATES = [
  'idle',
  'listening',
  'thinking',
  'done',
  'celebrating',
  'sleeping',
  'waking',
  'catching',
  'caught',
  'waving',
  'empty-pockets',
] as const;
export type PipState = (typeof PIP_STATES)[number];

export const PIP_PROPS = [
  'nightcap',
  'popcorn',
  'cloud',
  'arcs',
  'sparkles',
  'confetti',
  'pumpkin',
  'mic',
] as const;
export type PipProp = (typeof PIP_PROPS)[number];

type Eyes = 'open' | 'closed' | 'wide' | 'happy' | 'wink';
type Arms = 'none' | 'wave' | 'up' | 'open' | 'hug' | 'pockets';

export interface PipStateDef {
  label: string;
  eyes: Eyes;
  /** Pupils offset (viewBox units) on top of cursor follow. */
  gaze: { x: number; y: number };
  mouth: MouthShape;
  arms: Arms;
  /** Props the state always shows, merged with the `props` prop. */
  props: readonly PipProp[];
  /** Body rest pose (used as-is under reduced motion). */
  pose: { rotate: number; scale: number; y: number };
  /** Body silhouette. */
  body?: 'stand' | 'lie';
  /** Moves the face with the head (viewBox units). */
  faceShift?: { x: number; y: number };
  /** Moves head-worn props (nightcap) with the head. */
  headOffset?: { x: number; y: number; scale: number };
  /** Looping or one-shot body motion; skipped under reduced motion. */
  motion?: {
    animate: Record<string, number[]>;
    duration: number;
    repeat: boolean;
  };
  blinks: boolean;
}

/** One row per state (pip-mascot.md → States). Pip animates between rows. */
export const STATES: Record<PipState, PipStateDef> = {
  idle: {
    label: 'Pip',
    eyes: 'open',
    gaze: { x: 0, y: 0 },
    mouth: 'smile',
    arms: 'none',
    props: [],
    pose: { rotate: 0, scale: 1, y: 0 },
    motion: { animate: { y: [0, -4, 0], rotate: [-1.5, 1.5, -1.5] }, duration: 3.2, repeat: true },
    blinks: true,
  },
  listening: {
    label: 'Pip is listening',
    eyes: 'wide',
    gaze: { x: 0.8, y: 0 },
    mouth: 'open',
    arms: 'none',
    props: ['arcs'],
    pose: { rotate: 8, scale: 1.02, y: 0 },
    motion: { animate: { y: [0, -2, 0] }, duration: 1.2, repeat: true },
    blinks: true,
  },
  thinking: {
    label: 'Pip is thinking',
    eyes: 'open',
    gaze: { x: 1.6, y: -2.2 },
    mouth: 'flat',
    arms: 'none',
    props: ['sparkles'],
    pose: { rotate: -3, scale: 1, y: 0 },
    motion: { animate: { y: [0, -3, 0], rotate: [-3, -1, -3] }, duration: 1.6, repeat: true },
    blinks: true,
  },
  done: {
    label: 'Pip is done',
    eyes: 'happy',
    gaze: { x: 0, y: 0 },
    mouth: 'grin',
    arms: 'none',
    props: [],
    pose: { rotate: 0, scale: 1, y: 0 },
    motion: {
      animate: { scaleY: [1, 0.86, 1.08, 0.98, 1], scaleX: [1, 1.1, 0.95, 1.01, 1] },
      duration: 0.6,
      repeat: false,
    },
    blinks: false,
  },
  celebrating: {
    label: 'Pip is celebrating',
    eyes: 'happy',
    gaze: { x: 0, y: -1 },
    mouth: 'grin',
    arms: 'up',
    props: ['confetti'],
    pose: { rotate: 0, scale: 1, y: 0 },
    motion: {
      animate: { y: [0, -14, 0, -8, 0], rotate: [0, -4, 0, 4, 0] },
      duration: 1.1,
      repeat: false,
    },
    blinks: false,
  },
  sleeping: {
    label: 'Pip is sleeping',
    eyes: 'closed',
    gaze: { x: 0, y: 0 },
    mouth: 'smile',
    arms: 'none',
    props: [],
    // Lies down in the cloud, head to the right (projects-empty.png).
    pose: { rotate: 0, scale: 1, y: 0 },
    body: 'lie',
    faceShift: { x: 7, y: 9 },
    headOffset: { x: 13, y: 19, scale: 0.85 },
    motion: { animate: { scale: [1, 1.03, 1] }, duration: 3.6, repeat: true },
    blinks: false,
  },
  waking: {
    label: 'Pip is waking up',
    eyes: 'wink',
    gaze: { x: 0.6, y: 0.6 },
    mouth: 'flat',
    arms: 'up',
    props: [],
    pose: { rotate: -2, scale: 1, y: 0 },
    motion: { animate: { scaleY: [1, 1.1, 1], y: [0, -3, 0] }, duration: 0.9, repeat: false },
    blinks: false,
  },
  catching: {
    label: 'Pip is ready to catch',
    eyes: 'wide',
    gaze: { x: 0, y: -1 },
    mouth: 'open',
    arms: 'open',
    props: [],
    pose: { rotate: 0, scale: 1.04, y: 0 },
    motion: { animate: { rotate: [-5, 5, -5] }, duration: 0.7, repeat: true },
    blinks: false,
  },
  caught: {
    label: 'Pip caught it',
    eyes: 'happy',
    gaze: { x: 0, y: 0 },
    mouth: 'grin',
    arms: 'hug',
    props: [],
    pose: { rotate: 0, scale: 1, y: 0 },
    motion: { animate: { rotate: [0, 360], scale: [1, 0.92, 1] }, duration: 0.7, repeat: false },
    blinks: false,
  },
  waving: {
    label: 'Pip says hi',
    eyes: 'open',
    gaze: { x: 0.6, y: 0 },
    mouth: 'grin',
    arms: 'wave',
    props: [],
    pose: { rotate: 3, scale: 1, y: 0 },
    motion: { animate: { y: [0, -3, 0] }, duration: 1.6, repeat: true },
    blinks: true,
  },
  'empty-pockets': {
    label: 'Pip needs a recharge',
    eyes: 'open',
    gaze: { x: -0.8, y: 1.8 },
    mouth: 'sheepish',
    arms: 'pockets',
    props: [],
    pose: { rotate: -4, scale: 0.98, y: 1 },
    motion: { animate: { rotate: [-4, -1, -4] }, duration: 2.4, repeat: true },
    blinks: true,
  },
};

/** Props a state shows: its own plus the caller's, de-duplicated, in a stable order. */
export function resolveProps(state: PipState, extra: readonly PipProp[] = []): PipProp[] {
  const set = new Set<PipProp>([...STATES[state].props, ...extra]);
  return PIP_PROPS.filter((p) => set.has(p));
}
