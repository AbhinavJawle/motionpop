// `@hyperframes/producer` behind the `Producer` port (spec 08 design §8 step 4).
import {
  RenderCancelledError,
  createRenderJob,
  executeRenderJob,
  type RenderPerfSummary,
} from '@hyperframes/producer';
import { outputResolutionFor } from '@motionpop/schemas';
import { stageOf } from './progress';
import { RenderAbortedError, RenderTimeoutError, type Producer } from './ports';

/** Measured in spec 08 task 1: `high` quality with 2 workers beat the alternatives. */
export const PRODUCER_SETTINGS = { fps: 30, quality: 'high', workers: 2 } as const;
// An eight-minute export (exportMaxMs) with maps renders at about 11x real time, so about 90 min.
// The cap leaves room for that, inside the job's 150 min task timeout (deploy.sh). D-072.
export const MAX_RENDER_MS = 140 * 60_000;

export function createHyperframesProducer(opts: { maxRenderMs?: number } = {}): Producer {
  return {
    async render({ compDir, outPath, format, resolution, container, signal, onProgress }) {
      const preset = outputResolutionFor(format, resolution);
      const job = createRenderJob({
        ...PRODUCER_SETTINGS,
        format: container ?? 'mp4',
        maxRenderMs: opts.maxRenderMs ?? MAX_RENDER_MS,
        ...(preset ? { outputResolution: preset } : {}),
      });
      try {
        await executeRenderJob(
          job,
          compDir,
          outPath,
          (j) => onProgress({ stage: stageOf(j.status), percent: j.progress }),
          signal,
        );
      } catch (e) {
        if (e instanceof RenderCancelledError) {
          if (e.reason === 'timeout') throw new RenderTimeoutError(e.message);
          throw new RenderAbortedError(e.message);
        }
        throw e;
      }
      const perf: RenderPerfSummary | undefined = job.perfSummary;
      return perf ? { perf: perf as unknown as Record<string, unknown> } : {};
    },
  };
}
