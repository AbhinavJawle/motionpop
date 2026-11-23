'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { useStill } from '@/lib/motion/use-still';
import h from './hero.module.css';

/**
 * An old film projector shining on Pip (spec 36 follow-up). It sits beside the hero's sign-up
 * button. The SVG uses pixel units with its origin 230 px left of and 230 px above the button's
 * container, so the beam lands on Pip's head (207, 52 in the container). The reels spin, the film
 * runs, the light flickers and dust drifts through the beam; reduced motion stills all of it.
 * Decorative only.
 */

// Above Pip, in the empty space past the end of the headline, like a stage light.
const PIVOT = { x: 296, y: 116 }; // the tripod head
const TILT = 52; // degrees, lens down towards Pip
const SCALE = 0.82;
const PIP = { x: 437, y: 282 };
/** The lens tip (76.5, -22 in the head's own units) after the scale and the tilt. */
const LENS = (() => {
  const t = (TILT * Math.PI) / 180;
  const lx = 76.5 * SCALE;
  const ly = -22 * SCALE;
  return {
    x: PIVOT.x + lx * Math.cos(t) - ly * Math.sin(t),
    y: PIVOT.y + lx * Math.sin(t) + ly * Math.cos(t),
  };
})();

const dir = (() => {
  const dx = PIP.x - LENS.x;
  const dy = PIP.y - LENS.y;
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len, len };
})();
const perp = { x: -dir.y, y: dir.x };
const at = (d: number, w: number) => {
  const cx = LENS.x + dir.x * d;
  const cy = LENS.y + dir.y * d;
  return `${(cx + perp.x * w).toFixed(1)},${(cy + perp.y * w).toFixed(1)}`;
};
const END = dir.len + 26;
const BEAM = [at(0, -12), at(0, 12), at(END, 88), at(END, -88)].join(' ');
/** How far dust drifts down the beam in one pass. */
const DRIFT = { x: (dir.x * 90).toFixed(1), y: (dir.y * 90).toFixed(1) };

/** Dust in the light: start along the beam, a sideways offset, a delay (s) and a size. */
const MOTES: [number, number, number, number][] = [
  [14, -4, 0, 1.6],
  [40, 12, 1.1, 1.2],
  [66, -20, 2.3, 1.8],
  [92, 26, 0.6, 1.1],
  [30, -8, 3.1, 1.3],
  [110, -34, 1.7, 1.5],
  [76, 6, 4.0, 1],
  [124, 40, 2.8, 1.4],
  [52, 28, 4.6, 1.2],
];

/** Spins about its own centre. SMIL, because CSS origins inside nested SVG transforms drift. */
function Spin({ cx, cy, dur, still }: { cx: number; cy: number; dur: number; still: boolean }) {
  if (still) return null;
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      from={`0 ${cx} ${cy}`}
      to={`360 ${cx} ${cy}`}
      dur={`${dur}s`}
      repeatCount="indefinite"
    />
  );
}

function Reel({ cx, cy, r, still }: { cx: number; cy: number; r: number; still: boolean }) {
  const holes = 6;
  return (
    <g>
      {/* the same film speed on both reels: the bigger one turns slower */}
      <Spin cx={cx} cy={cy} dur={r / 9} still={still} />
      <circle cx={cx} cy={cy} r={r} fill="#ff6a3d" stroke="#000" strokeWidth="2.5" />
      {Array.from({ length: holes }, (_, i) => {
        const a = (i / holes) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={cx + Math.cos(a) * r * 0.55}
            cy={cy + Math.sin(a) * r * 0.55}
            r={r * 0.2}
            fill="#fff3ee"
            stroke="#000"
            strokeWidth="1.5"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.17} fill="#000" />
    </g>
  );
}

export function Projector({ className }: { className?: string }) {
  const still = useStill();
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 400"
      width={520}
      height={400}
      className={cn(h.projector, className)}
    >
      <defs>
        <linearGradient
          id="pj-beam"
          gradientUnits="userSpaceOnUse"
          x1={LENS.x}
          y1={LENS.y}
          x2={LENS.x + dir.x * END}
          y2={LENS.y + dir.y * END}
        >
          <stop offset="0" stopColor="#ffd23f" stopOpacity="0.75" />
          <stop offset="0.7" stopColor="#ffd23f" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffd23f" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id="pj-pool">
          <stop offset="0" stopColor="#ffd23f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd23f" stopOpacity="0" />
        </radialGradient>
        <clipPath id="pj-clip">
          <polygon points={BEAM} />
        </clipPath>
        <filter id="pj-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* the light, flickering like a real projector */}
      <g className={h.flicker}>
        <ellipse cx={PIP.x} cy={PIP.y - 6} rx="104" ry="84" fill="url(#pj-pool)" />
        <polygon points={BEAM} fill="url(#pj-beam)" filter="url(#pj-soft)" />
        <g clipPath="url(#pj-clip)">
          {MOTES.map(([d, w, delay, r], i) => {
            const [x, y] = at(d, w).split(',').map(Number);
            return (
              <circle
                key={i}
                className={h.mote}
                cx={x}
                cy={y}
                r={r}
                fill="#fff"
                style={
                  {
                    animationDelay: `${-delay}s`,
                    '--mx': `${DRIFT.x}px`,
                    '--my': `${DRIFT.y}px`,
                  } as CSSProperties
                }
              />
            );
          })}
        </g>
      </g>

      {/* tripod */}
      <ellipse cx={PIVOT.x} cy={PIVOT.y + 74} rx="46" ry="5" fill="#000" opacity="0.1" />
      <path
        d={`M${PIVOT.x} ${PIVOT.y + 6}l-34 66M${PIVOT.x} ${PIVOT.y + 6}l34 66M${PIVOT.x} ${PIVOT.y + 6}v70`}
        stroke="#000"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={PIVOT.x} cy={PIVOT.y + 4} r="6" fill="#000" />

      {/* the projector head, tilted down at Pip; it hums */}
      <g
        transform={`translate(${PIVOT.x} ${PIVOT.y}) rotate(${TILT}) scale(${SCALE}) translate(0 -22)`}
      >
        <g className={h.hum}>
          {/* film running between the reels and into the gate */}
          <path
            className={h.film}
            d="M-30 -66 L18 -84 M-46 -46 L-44 -12 M34 -38 L30 -12"
            stroke="#000"
            strokeWidth="5"
            strokeDasharray="3 3"
            fill="none"
          />
          <Reel cx={-30} cy={-50} r={20} still={still} />
          <Reel cx={20} cy={-60} r={30} still={still} />
          <rect x="-52" y="-24" width="98" height="50" rx="9" fill="#000" />
          <rect x="-44" y="-16" width="30" height="8" rx="4" fill="#fff" opacity="0.18" />
          {/* lens */}
          <path d="M46 -12 L70 -20 V20 L46 12 Z" fill="#000" />
          <ellipse cx="72" cy="0" rx="4.5" ry="20" fill="#ffd23f" stroke="#000" strokeWidth="2" />
          {/* crank */}
          <g>
            <Spin cx={-52} cy={4} dur={1.6} still={still} />
            <circle cx="-52" cy="4" r="9" fill="#000" />
            <path d="M-52 4 L-66 12" stroke="#000" strokeWidth="3" strokeLinecap="round" />
            <circle cx="-66" cy="12" r="3.5" fill="#ff6a3d" stroke="#000" strokeWidth="1.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}
