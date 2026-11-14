/**
 * Renders the cleaned voiceover from the edit decision list (spec 05 R3.3). Kept segments are
 * placed at their mapped output times; where a segment meets a cut, it is extended by half the
 * crossfade on that side and faded with an equal-power curve, so the crossfade is centred on
 * the seam and word timings stay exactly on `mapTime`.
 */

export const CROSSFADE_MS = 10;

/** Structural, so this module doesn't depend on the EDL implementation. */
export interface Cut {
  startMs: number;
  endMs: number;
}

export interface KeptSegment {
  srcStartMs: number;
  srcEndMs: number;
  outStartMs: number;
  /** Something plays before / after this segment in the output (so it needs a crossfade). */
  joinsPrev: boolean;
  joinsNext: boolean;
}

/** The parts of [0, durationMs] outside the cuts, with their output positions. Pure. */
export function keptSegments(durationMs: number, cuts: ReadonlyArray<Cut>): KeptSegment[] {
  const sorted = [...cuts]
    .map((c) => ({ startMs: Math.max(0, c.startMs), endMs: Math.min(durationMs, c.endMs) }))
    .filter((c) => c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const segs: KeptSegment[] = [];
  let cursor = 0;
  let removed = 0;
  for (const c of sorted) {
    if (c.startMs > cursor) {
      segs.push({
        srcStartMs: cursor,
        srcEndMs: c.startMs,
        outStartMs: cursor - removed,
        joinsPrev: false,
        joinsNext: false,
      });
    }
    // Overlapping or nested cuts only remove what isn't already removed.
    removed += Math.max(0, c.endMs - Math.max(cursor, c.startMs));
    cursor = Math.max(cursor, c.endMs);
  }
  if (cursor < durationMs) {
    segs.push({
      srcStartMs: cursor,
      srcEndMs: durationMs,
      outStartMs: cursor - removed,
      joinsPrev: false,
      joinsNext: false,
    });
  }
  segs.forEach((s, i) => {
    s.joinsPrev = i > 0;
    s.joinsNext = i < segs.length - 1;
  });
  return segs;
}

function curve(kind: 'in' | 'out', points = 32): Float32Array {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * (Math.PI / 2);
    c[i] = kind === 'in' ? Math.sin(t) : Math.cos(t);
  }
  return c;
}

/**
 * The cleaned audio as mono PCM at `sampleRate`. With no cuts the input is returned as is.
 * Browser only (OfflineAudioContext).
 */
export async function renderCleaned(
  pcm: Float32Array,
  sampleRate: number,
  cuts: ReadonlyArray<Cut>,
): Promise<Float32Array> {
  const durationMs = Math.round((pcm.length / sampleRate) * 1000);
  const segs = keptSegments(durationMs, cuts);
  const last = segs[segs.length - 1];
  if (!last || (segs.length === 1 && last.srcStartMs === 0 && last.srcEndMs === durationMs)) {
    return pcm;
  }
  const outMs = last.outStartMs + (last.srcEndMs - last.srcStartMs);
  const ctx = new OfflineAudioContext(
    1,
    Math.max(1, Math.round((outMs * sampleRate) / 1000)),
    sampleRate,
  );
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);

  const half = CROSSFADE_MS / 2;
  for (const s of segs) {
    const len = s.srcEndMs - s.srcStartMs;
    // A very short kept sliver gets a shorter fade, so its fade-in and fade-out never overlap.
    const pad = Math.min(half, len / 2);
    const padL = s.joinsPrev ? pad : 0;
    const padR = s.joinsNext ? pad : 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    const when = (s.outStartMs - padL) / 1000;
    const dur = (len + padL + padR) / 1000;
    if (padL > 0) gain.gain.setValueCurveAtTime(curve('in'), when, (2 * padL) / 1000);
    if (padR > 0)
      gain.gain.setValueCurveAtTime(
        curve('out'),
        when + dur - (2 * padR) / 1000,
        (2 * padR) / 1000,
      );
    src.start(when, (s.srcStartMs - padL) / 1000, dur);
  }
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}
