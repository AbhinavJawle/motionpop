// What the finished file must look like (spec 08 R3.6): the size from the options and the frame
// count from the project's duration.
import { FORMATS, msToFrame, type Format, type Resolution } from '@motionpop/schemas';
import type { MediaProbe } from './ports';

/** Encoded size: 1080p is the authored size, 720p scales the long side to 1280. */
export function expectedSize(
  format: Format,
  resolution: Resolution,
): { width: number; height: number } {
  const { width, height } = FORMATS[format];
  if (resolution === '1080p') return { width, height };
  const k = 720 / Math.min(width, height);
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Problems with the rendered file, empty when it is what we asked for. Frames may be off by one. */
export function outputIssues(
  probe: MediaProbe,
  want: { format: Format; resolution: Resolution; durationMs: number },
): string[] {
  const issues: string[] = [];
  const size = expectedSize(want.format, want.resolution);
  if (probe.videoStreams !== 1) issues.push(`expected 1 video stream, found ${probe.videoStreams}`);
  if (probe.width !== size.width || probe.height !== size.height) {
    issues.push(`size ${probe.width}×${probe.height}, expected ${size.width}×${size.height}`);
  }
  const frames = msToFrame(want.durationMs);
  if (probe.frames === undefined || Math.abs(probe.frames - frames) > 1) {
    issues.push(`${probe.frames ?? 'unknown'} frames, expected ${frames} ± 1`);
  }
  return issues;
}
