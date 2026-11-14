/** Pure waveform peak helpers (spec 04 task 4, R4.4). No DOM, safe in a worker. */

export const DEFAULT_BUCKET_MS = 10;

const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** Average all channels into one. Output length is the shortest channel; no channels → empty. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first.slice();
  let n = first.length;
  for (const c of channels) n = Math.min(n, c.length);
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (c[i] ?? 0);
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) / channels.length;
  return out;
}

/** Samples per bucket (at least 1). */
export function samplesPerBucket(sampleRate: number, bucketMs: number): number {
  return Math.max(1, Math.round((sampleRate * bucketMs) / 1000));
}

/** Interleaved [min, max] per bucket, clamped to [-1, 1]. The last bucket may be partial. */
export function computePeaks(
  samples: Float32Array,
  sampleRate: number,
  bucketMs = DEFAULT_BUCKET_MS,
): Float32Array<ArrayBuffer> {
  const n = samples.length;
  if (n === 0) return new Float32Array(0);
  const spb = samplesPerBucket(sampleRate, bucketMs);
  const buckets = Math.ceil(n / spb);
  const out = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const from = b * spb;
    const to = Math.min(n, from + spb);
    let min = Infinity;
    let max = -Infinity;
    for (let i = from; i < to; i++) {
      const v = clamp1(samples[i] ?? 0);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

/**
 * Aggregate peaks into `columns` [min, max] pairs covering [startMs, endMs).
 * Each column takes the min of mins and max of maxes of the buckets it overlaps.
 * Columns outside the data are [0, 0].
 */
export function peaksForRange(
  peaks: Float32Array,
  bucketMs: number,
  startMs: number,
  endMs: number,
  columns: number,
): Float32Array {
  const cols = Math.max(0, Math.floor(columns));
  const out = new Float32Array(cols * 2);
  const count = Math.floor(peaks.length / 2);
  if (cols === 0 || count === 0 || !(endMs > startMs) || !(bucketMs > 0)) return out;
  const start = startMs / bucketMs;
  const width = (endMs - startMs) / bucketMs / cols;
  for (let c = 0; c < cols; c++) {
    const lo = start + c * width;
    const hi = start + (c + 1) * width;
    const i0 = Math.max(0, Math.floor(lo));
    const i1 = Math.min(count, Math.max(Math.floor(lo) + 1, Math.ceil(hi)));
    if (i0 >= i1) continue;
    let min = Infinity;
    let max = -Infinity;
    for (let i = i0; i < i1; i++) {
      const a = peaks[i * 2] ?? 0;
      const b = peaks[i * 2 + 1] ?? 0;
      if (a < min) min = a;
      if (b > max) max = b;
    }
    out[c * 2] = min;
    out[c * 2 + 1] = max;
  }
  return out;
}
