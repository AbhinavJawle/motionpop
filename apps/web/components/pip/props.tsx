'use client';

import { motion } from 'motion/react';
import { mulberry32 } from './rng';
import type { PipProp } from './states';

/**
 * Pip's props as SVG groups in the same 100×100 space (they may overflow the viewBox).
 * Artwork colours use tokens where one exists; the cloud/cap tints are brand artwork from the designs.
 * `still` = reduced motion: static pose, no loops, no confetti.
 */

function Nightcap() {
  return (
    <g data-prop="nightcap">
      <path
        d="M33 25C36 15 47 9.5 58 10C66 10.4 72 7 77 3.5C76 10 73 16 71 21C60 17 45 18.5 33 25Z"
        style={{ fill: 'var(--color-violet)' }}
      />
      <path
        d="M31.5 26.5C44 18.5 60 16.8 72.5 21.5L71.6 25.4C59.6 21.2 45 22.6 33.6 29.6Z"
        style={{ fill: 'var(--color-violet-ink)' }}
      />
      <circle cx="78" cy="5" r="4.2" style={{ fill: 'var(--color-violet-ink)' }} />
    </g>
  );
}

function Cloud() {
  return (
    <g data-prop="cloud" transform="translate(0 6)">
      <defs>
        <linearGradient id="pip-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D6D0EC" />
          <stop offset="1" stopColor="#9A92BE" />
        </linearGradient>
      </defs>
      <path
        d="M10 92C3 92 2 83 9 81.5C9 75 17 72 22 75.5C25 69 35 68.5 39 74C44 69.5 53 70 56 76C60 71 70 71.5 72 77.5C77 74 86 76.5 86 82.5C93 82 96 91 89 92.5Z"
        fill="url(#pip-cloud)"
      />
    </g>
  );
}

function Arcs({ still }: { still: boolean }) {
  return (
    <g data-prop="arcs" fill="none" strokeLinecap="round" style={{ stroke: 'var(--color-ember)' }}>
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${87 + i * 5} ${42 - i * 4}Q${92 + i * 6} ${52} ${87 + i * 5} ${62 + i * 4}`}
          strokeWidth={2.6 - i * 0.5}
          initial={false}
          animate={still ? { opacity: 0.9 - i * 0.25 } : { opacity: [0.15, 0.95 - i * 0.2, 0.15] }}
          transition={
            still ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.18 }
          }
        />
      ))}
    </g>
  );
}

const STAR =
  'M0 -5C0.6 -1.2 1.2 -0.6 5 0C1.2 0.6 0.6 1.2 0 5C-0.6 1.2 -1.2 0.6 -5 0C-1.2 -0.6 -0.6 -1.2 0 -5Z';

function Sparkles({ still }: { still: boolean }) {
  const stars = [
    { x: 14, y: 22, s: 1.1 },
    { x: 88, y: 16, s: 0.8 },
    { x: 92, y: 70, s: 0.65 },
  ];
  return (
    <motion.g
      data-prop="sparkles"
      initial={false}
      animate={still ? { rotate: 0 } : { rotate: 360 }}
      transition={still ? { duration: 0 } : { duration: 9, ease: 'linear', repeat: Infinity }}
    >
      {stars.map((st, i) => (
        <motion.path
          key={i}
          d={STAR}
          transform={`translate(${st.x} ${st.y}) scale(${st.s})`}
          style={{ fill: 'var(--color-violet)' }}
          initial={false}
          animate={still ? { opacity: 1 } : { opacity: [0.35, 1, 0.35] }}
          transition={still ? { duration: 0 } : { duration: 1.4, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </motion.g>
  );
}

const CONFETTI_COLORS = [
  'var(--color-ember)',
  'var(--color-violet)',
  'var(--color-mint)',
  'var(--color-warn)',
];

/** Seeded so the burst is identical every time (and in tests). */
export function confettiPieces(seed = 7, count = 16) {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.5;
    const dist = 28 + rnd() * 30;
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist + 18,
      rotate: (rnd() - 0.5) * 540,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? 'var(--color-ember)',
      delay: rnd() * 0.12,
      w: 2.2 + rnd() * 1.8,
    };
  });
}

function Confetti({ still }: { still: boolean }) {
  if (still) return null;
  return (
    <g data-prop="confetti">
      {confettiPieces().map((p) => (
        <motion.rect
          key={p.id}
          x={49}
          y={36}
          width={p.w}
          height={p.w * 1.6}
          rx={0.6}
          style={{ fill: p.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.dx, y: p.dy, rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: 1.4, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </g>
  );
}

function Popcorn() {
  return (
    <g data-prop="popcorn">
      {[
        [8, 66, 4.2],
        [14, 62.5, 4.6],
        [21, 64, 4.4],
        [26, 67.5, 3.8],
        [11, 70, 3.6],
        [18, 68.5, 4],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="#FFF6E2" />
      ))}
      <path d="M4 70H30L27 96H7Z" style={{ fill: 'var(--color-text)' }} />
      {[9, 15.5, 22].map((x) => (
        <path
          key={x}
          d={`M${x} 70H${x + 3.4}L${x + 2.8} 96H${x + 0.8}Z`}
          style={{ fill: 'var(--color-ember)' }}
        />
      ))}
    </g>
  );
}

function Pumpkin() {
  return (
    <g data-prop="pumpkin">
      <path
        d="M86 79Q86.5 75.5 89 74.5"
        fill="none"
        strokeWidth={1.6}
        style={{ stroke: 'var(--color-mint)' }}
      />
      <ellipse cx="86" cy="87" rx="9" ry="7.4" style={{ fill: 'var(--color-ember)' }} />
      <path
        d="M86 80V94M81 81.5Q79 87 81 92.5M91 81.5Q93 87 91 92.5"
        fill="none"
        strokeWidth={0.9}
        stroke="rgb(0 0 0 / 0.18)"
      />
    </g>
  );
}

function Mic() {
  return (
    <g data-prop="mic">
      <rect x="86" y="44" width="7" height="11" rx="3.5" style={{ fill: 'var(--color-text-4)' }} />
      <rect
        x="88.6"
        y="55"
        width="1.8"
        height="8"
        rx="0.9"
        style={{ fill: 'var(--color-text-4)' }}
      />
    </g>
  );
}

export function Zzz({ still }: { still: boolean }) {
  return (
    <g
      data-prop="zzz"
      style={{ fill: 'var(--color-violet-ink-2)' }}
      fontFamily="var(--font-sans)"
      fontWeight={500}
    >
      {[
        { x: 82, y: 22, s: 7 },
        { x: 90, y: 11, s: 9 },
        { x: 99, y: -2, s: 11 },
      ].map((z, i) => (
        <motion.text
          key={i}
          x={z.x}
          y={z.y}
          fontSize={z.s}
          initial={false}
          animate={still ? { opacity: 0.8 } : { opacity: [0, 0.9, 0], y: [z.y + 4, z.y, z.y - 4] }}
          transition={still ? { duration: 0 } : { duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
        >
          z
        </motion.text>
      ))}
    </g>
  );
}

/** Props that sit on Pip's head and follow it (e.g. when lying down). */
export const HEAD_WORN: readonly PipProp[] = ['nightcap'];

/** Props drawn behind the body. */
export const BEHIND: readonly PipProp[] = ['sparkles', 'arcs'];

export function PipPropLayer({ prop, still }: { prop: PipProp; still: boolean }) {
  switch (prop) {
    case 'nightcap':
      return <Nightcap />;
    case 'cloud':
      return <Cloud />;
    case 'arcs':
      return <Arcs still={still} />;
    case 'sparkles':
      return <Sparkles still={still} />;
    case 'confetti':
      return <Confetti still={still} />;
    case 'popcorn':
      return <Popcorn />;
    case 'pumpkin':
      return <Pumpkin />;
    case 'mic':
      return <Mic />;
  }
}
