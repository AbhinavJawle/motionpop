import { describe, expect, it } from 'vitest';
import { expectedSize, outputIssues } from './output';
import type { MediaProbe } from './ports';

describe('expectedSize', () => {
  it('is the authored size at 1080p and the 720 scale at 720p', () => {
    expect(expectedSize('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(expectedSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(expectedSize('1:1', '1080p')).toEqual({ width: 1080, height: 1080 });
    expect(expectedSize('16:9', '720p')).toEqual({ width: 1280, height: 720 });
    expect(expectedSize('9:16', '720p')).toEqual({ width: 720, height: 1280 });
    expect(expectedSize('1:1', '720p')).toEqual({ width: 720, height: 720 });
  });
});

describe('outputIssues', () => {
  const want = { format: '16:9', resolution: '1080p', durationMs: 18_000 } as const;
  const good: MediaProbe = {
    durationMs: 18_000,
    audioStreams: 1,
    videoStreams: 1,
    width: 1920,
    height: 1080,
    frames: 540,
  };

  it('accepts the exact file and a frame either way', () => {
    expect(outputIssues(good, want)).toEqual([]);
    expect(outputIssues({ ...good, frames: 539 }, want)).toEqual([]);
    expect(outputIssues({ ...good, frames: 541 }, want)).toEqual([]);
  });

  it('reports a wrong size, a wrong length, a missing count and no video', () => {
    expect(outputIssues({ ...good, width: 1280, height: 720 }, want)).toHaveLength(1);
    expect(outputIssues({ ...good, frames: 538 }, want)).toHaveLength(1);
    const { frames: _f, ...noCount } = good;
    void _f;
    expect(outputIssues(noCount, want)).toHaveLength(1);
    expect(
      outputIssues({ durationMs: 0, audioStreams: 1, videoStreams: 0 }, want).length,
    ).toBeGreaterThan(1);
  });
});
