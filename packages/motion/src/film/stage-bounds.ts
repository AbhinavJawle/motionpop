import type { Format } from '@motionpop/schemas';

export interface ClippedStageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  clipped: boolean;
  /** True when the runtime owns an opaque studio stage background for this slot. */
  opaqueSurface: boolean;
}

/**
 * Deterministic graphic container bounds for choreographed video beats (spec 24 R2.1–R2.2).
 * Physically clips `split-top-stage` to the top 50% (9:16) / left 52% (16:9) and `top-card`
 * to the top 28% (9:16) so generated graphics can never intrude on the speaker's face.
 */
export function clippedStageBounds(
  format: Format,
  frameWidth: number,
  frameHeight: number,
  videoStage?: string,
): ClippedStageBounds {
  if (videoStage === 'split-top-stage') {
    if (format === '9:16') {
      return {
        x: 0,
        y: 0,
        width: frameWidth,
        height: Math.round(frameHeight * 0.5),
        clipped: true,
        opaqueSurface: true,
      };
    }
    if (format === '16:9') {
      return {
        x: 0,
        y: 0,
        width: Math.round(frameWidth * 0.52),
        height: frameHeight,
        clipped: true,
        opaqueSurface: true,
      };
    }
  }
  if (videoStage === 'top-card' && format === '9:16') {
    return {
      x: 0,
      y: 0,
      width: frameWidth,
      height: Math.round(frameHeight * 0.28),
      clipped: true,
      opaqueSurface: false,
    };
  }
  return {
    x: 0,
    y: 0,
    width: frameWidth,
    height: frameHeight,
    clipped: false,
    opaqueSurface: videoStage === 'cutaway',
  };
}
