// The real clock and logger of the render job. Service code only, never inside a composition.
import type { Clock, Logger } from './ports';

export const systemClock: Clock = {
  now: () => Date.now(),
  every(ms, fn) {
    const handle = setInterval(fn, ms);
    return () => clearInterval(handle);
  },
};

/** One JSON line per call, in the shape Cloud Logging reads (`severity`). */
export const jsonLogger: Logger = {
  info: (fields) => console.log(JSON.stringify({ severity: 'INFO', ...fields })),
  error: (fields) => console.error(JSON.stringify({ severity: 'ERROR', ...fields })),
};
