/** mulberry32: tiny seeded PRNG so Pip's blink timing and confetti are stable in tests. UI only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blink delays in ms, uniformly 3–6 s (pip-mascot.md). */
export function blinkDelays(seed: number, count: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => Math.round(3000 + rnd() * 3000));
}
