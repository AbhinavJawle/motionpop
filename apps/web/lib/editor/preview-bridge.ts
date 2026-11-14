import { msToFrame } from '@motionpop/schemas';

/**
 * The one place that seeks the preview player. The playback loop calls `seekPreview` every
 * animation frame; it only reaches the player when the 30 fps frame changes (spec 04 R5.4).
 * HyperFrames floors its clock to frames, so we seek with `frame / 30` exactly.
 */

interface SeekablePlayer {
  seek(seconds: number): void;
  readonly ready?: boolean;
}

const FPS = 30;
let player: SeekablePlayer | null = null;
let lastFrame = -1;
let wantedMs = 0;

export function attachPreview(p: SeekablePlayer | null): void {
  player = p;
  lastFrame = -1;
}

export function seekPreview(ms: number): void {
  wantedMs = ms;
  const frame = msToFrame(ms, FPS);
  // The custom element may not be upgraded yet (its module loads lazily).
  if (!player || typeof player.seek !== 'function' || frame === lastFrame) return;
  lastFrame = frame;
  player.seek(frame / FPS);
}

/** After a recompile the player reloads: put it back on the current frame. */
export function resyncPreview(): void {
  lastFrame = -1;
  seekPreview(wantedMs);
}
