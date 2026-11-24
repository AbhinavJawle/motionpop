import { describe, expect, it } from 'vitest';
import { parseByteRange } from './byte-range';

describe('parseByteRange (inline <video> HTTP 206 support)', () => {
  it('parses closed, open-ended, and suffix byte ranges', () => {
    expect(parseByteRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange('bytes=250-500', 1000)).toEqual({ start: 250, end: 500 });
    expect(parseByteRange('bytes=250-5000', 1000)).toEqual({ start: 250, end: 999 });
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('rejects unsatisfiable ranges and ignores non-byte headers', () => {
    expect(parseByteRange('bytes=1000-1005', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=500-200', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-', 1000)).toBe('unsatisfiable');
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange('items=0-5', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1', 0)).toBeNull();
  });
});
