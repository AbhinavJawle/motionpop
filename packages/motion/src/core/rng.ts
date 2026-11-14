/**
 * Seeded randomness. Pure and engine-independent: integer maths only.
 */

/** mulberry32: returns a generator of floats in [0, 1). The seed is coerced with `>>> 0`. */
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

/** FNV-1a, 32 bit, over UTF-16 code units. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator for one named use of a slot seed, independent of other keys. */
export function rngFor(seed: number, key: string): () => number {
  return mulberry32((seed ^ hashString(key)) >>> 0);
}
