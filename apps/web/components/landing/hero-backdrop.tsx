import { cn } from '@/lib/cn';
import h from './hero.module.css';

/**
 * The hero's backdrop (spec 36): storyboard paper lit by slowly drifting coloured light, and the
 * voice itself as a wide waveform that breathes behind the editor. Decorative and seeded, so the
 * server and the browser draw the same thing.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pip blue, violet, ember, sun, Pip blue: the colours walk along the voice.
const STOPS: [number, number, number][] = [
  [141, 188, 235],
  [139, 124, 255],
  [255, 106, 61],
  [255, 210, 63],
  [141, 188, 235],
];

function colourAt(t: number): string {
  const x = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(x), STOPS.length - 2);
  const f = x - i;
  const a = STOPS[i]!;
  const b = STOPS[i + 1]!;
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

const BARS = 260;
const WAVE = (() => {
  const r = rng(41);
  const p = [r() * 6, r() * 6, r() * 6];
  return Array.from({ length: BARS }, (_, i) => {
    const t = i / (BARS - 1);
    // speech: phrases (slow), words (medium) and syllables (fast)
    const phrase = 0.5 + 0.5 * Math.sin(t * 9 + p[0]!);
    const word = 0.5 + 0.5 * Math.sin(t * 41 + p[1]!);
    const syl = 0.5 + 0.5 * Math.sin(t * 131 + p[2]!);
    const v = 0.12 + 0.88 * Math.pow(phrase * 0.55 + word * 0.3 + syl * 0.15, 1.6);
    return {
      h: Math.round(12 + v * 124),
      c: colourAt(t),
      d: -(r() * 2.6).toFixed(2),
      s: (1.9 + r() * 1.4).toFixed(2),
    };
  });
})();

/** Light and paper behind the whole hero. */
export function HeroLight({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn(h.light, className)}>
      <span className={h.grid} />
      <span className={cn(h.glow, h.glowPip)} />
      <span className={cn(h.glow, h.glowEmber)} />
      <span className={cn(h.glow, h.glowViolet)} />
    </div>
  );
}

/** The voice the editor was made from, breathing behind it. */
export function Voice({
  className,
  at = 'middle',
}: {
  className?: string;
  at?: 'middle' | 'bottom';
}) {
  return (
    <div aria-hidden className={cn(h.voice, at === 'bottom' && h.voiceBottom, className)}>
      {WAVE.map((b, i) => (
        <span
          key={i}
          className={h.bar}
          style={{
            height: b.h,
            background: b.c,
            animationDelay: `${b.d}s`,
            animationDuration: `${b.s}s`,
          }}
        />
      ))}
    </div>
  );
}
