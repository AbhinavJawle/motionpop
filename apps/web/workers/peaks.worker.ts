/// <reference lib="webworker" />
import { computePeaks, DEFAULT_BUCKET_MS, mixToMono } from '../lib/audio/peaks';
import { PeaksRequestSchema, type PeaksResponse } from '../lib/audio/peaks-messages';

/** Waveform peaks off the main thread (spec 04 task 4). */
declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = PeaksRequestSchema.safeParse(event.data);
  if (!parsed.success) {
    const id =
      typeof event.data === 'object' && event.data !== null && 'id' in event.data
        ? String((event.data as { id: unknown }).id)
        : 'unknown';
    const msg: PeaksResponse = {
      type: 'error',
      id,
      message: `bad request: ${parsed.error.message}`,
    };
    self.postMessage(msg);
    return;
  }
  const req = parsed.data;
  try {
    const bucketMs = req.bucketMs ?? DEFAULT_BUCKET_MS;
    const peaks = computePeaks(mixToMono(req.channels), req.sampleRate, bucketMs);
    const msg: PeaksResponse = { type: 'peaks', id: req.id, bucketMs, peaks };
    self.postMessage(msg, [peaks.buffer]);
  } catch (err) {
    const msg: PeaksResponse = {
      type: 'error',
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
});
