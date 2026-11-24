/** Parses a single HTTP `Range: bytes=start-end` header against a file of `total` bytes. */
export function parseByteRange(
  header: string | null,
  total: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header || total <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return 'unsatisfiable';
  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total || start > end) {
      return 'unsatisfiable';
    }
    end = Math.min(total - 1, end);
  }
  return { start, end };
}
