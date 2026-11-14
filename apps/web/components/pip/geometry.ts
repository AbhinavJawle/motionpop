/**
 * Pip geometry in a 100×100 viewBox. Percentages come straight from the Figma export
 * ("Pip · Motionpop mark", design/figma-export.css l.33): body box x 20–81, y 12.5–87.5;
 * eyes 7.5×11.25 at (40, 41.25) and (60.3, 39.7); smile x 48.4–59.4, y 58.6–62.5.
 */

export const VIEWBOX = '0 0 100 100';

/** Dome top, slightly leaning left side, two bottom lobes with the right one trailing. */
export const BODY_PATH =
  'M52 12.5C68 12.5 80 24 80.5 42C81 56 81.5 68 81 76C80.5 84 74 88.5 68 87.5C63 86.5 60 82 57 79C53 84 46 88.5 38 87.5C28 86.5 20 83 20 76C20 62 23 46 26 34C29 20 39 12.5 52 12.5Z';

/** Lying down (sleeping, projects-empty.png): head on the right, wispy tail to the left. Same commands as BODY_PATH so they morph. */
export const LYING_BODY_PATH =
  'M62 38C76 38 84 49 84 60C84 72 75 80 62 80C52 80 40 81 30 80.5C22 80 16 77 16.5 72C17 68 21 66 25.5 65C20 62.5 19 57.5 23 55C28 52 36 54 42 51C47 44 53 38 62 38Z';

/** Body gradient, exact Figma stops: linear-gradient(98.93deg, …). Hex is intentional (brand artwork, not chrome). */
export const BODY_STOPS = [
  { offset: 0.0656, color: '#DDD9EF' },
  { offset: 0.3106, color: '#F5F2FA' },
  { offset: 0.5731, color: '#FFFEFA' },
  { offset: 0.8356, color: '#FFFDF7' },
  { offset: 0.9143, color: '#FFE5CE' },
  { offset: 0.9406, color: '#F7BC8C' },
] as const;

/** 98.93° CSS angle → objectBoundingBox gradient vector (sin θ, −cos θ). */
const theta = (98.93 * Math.PI) / 180;
export const BODY_GRADIENT_VECTOR = {
  x1: 0.5 - 0.5 * Math.sin(theta),
  y1: 0.5 + 0.5 * Math.cos(theta),
  x2: 0.5 + 0.5 * Math.sin(theta),
  y2: 0.5 - 0.5 * Math.cos(theta),
};

export const FACE_COLOR = 'var(--color-pip-face)';

export const EYES = {
  left: { cx: 43.75, cy: 46.9, rx: 3.75, ry: 5.6 },
  right: { cx: 64.05, cy: 45.3, rx: 3.75, ry: 5.6 },
} as const;

/** Mouth shapes share one command structure (M … Q …) so `motion` can morph between them. */
export const MOUTHS = {
  smile: 'M48.4 58.6Q53.9 64.6 59.4 58.6',
  grin: 'M47 57.6Q54 67.5 61 57.6',
  flat: 'M49.2 61Q54 60 58.8 61',
  sheepish: 'M49 61.6Q52 59.4 54.4 61Q57 62.6 59.6 60.2',
  open: 'M50.5 59.5Q54 66 57.5 59.5',
} as const;
export type MouthShape = keyof typeof MOUTHS;

/** Closed-eye arcs (sleeping ‿). */
export const CLOSED_EYES = {
  left: 'M40.2 47.4Q43.75 50.8 47.3 47.4',
  right: 'M60.5 45.8Q64.05 49.2 67.6 45.8',
} as const;

/** Small rounded arm stubs. `origin` = shoulder pivot as a fraction of the arm's own box (motion originX/Y). */
export const ARMS = {
  left: { d: 'M23 58Q14 60 12.5 66Q12 69.5 15.5 69Q20.5 67.5 24 64.5Z', origin: [0.92, 0.26] },
  right: { d: 'M79 56Q88 57 90 63Q90.8 66.5 87.2 66.4Q82 65.5 78.4 62.6Z', origin: [0.05, 0.29] },
} as const;
