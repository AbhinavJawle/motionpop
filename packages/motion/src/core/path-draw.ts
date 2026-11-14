const lengths = new WeakMap<SVGGeometryElement, number>();

/** Measure once at build time (layout read). Later `pathDraw` calls only write styles. */
export function measurePath(path: SVGGeometryElement): number {
  let len = lengths.get(path);
  if (len === undefined) {
    len = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
    lengths.set(path, len);
  }
  return len;
}

/** Stroke reveal: progress 0 = hidden, 1 = fully drawn. Pure given the cached length. */
export function pathDraw(path: SVGGeometryElement, progress: number): void {
  const len = measurePath(path);
  const p = Math.min(1, Math.max(0, progress));
  path.style.strokeDasharray = `${len} ${len}`;
  path.style.strokeDashoffset = `${len * (1 - p)}`;
}
