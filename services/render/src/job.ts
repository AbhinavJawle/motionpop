// The container entry of the render job (spec 08 design §8, "job.ts"): reads `RENDER_ID`, builds
// the Firestore and Storage deps, runs `runRender` and exits.
//
// Exit codes: 0 after any handled outcome (done, a recorded failure, or a duplicate execution),
// so Cloud Run never retries a render (`--max-retries 0`). 1 only when the failure could not even
// be recorded, or the job could not start; the stalled-render sweep catches those renders.
import { isSafeId } from '@motionpop/schemas';
import { pathToFileURL } from 'node:url';
import type { Logger, RenderDeps } from './ports';
import { runRender } from './run-render';

export type JobEnv = Readonly<Record<string, string | undefined>>;

/** Runs one render and returns the process exit code. */
export async function runJob(
  env: JobEnv,
  makeDeps: (renderId: string) => Promise<RenderDeps>,
  log: Logger,
): Promise<0 | 1> {
  const renderId = env['RENDER_ID'];
  if (!renderId || !isSafeId(renderId)) {
    log.error({ event: 'job', outcome: 'bad-render-id' });
    return 1;
  }
  try {
    const deps = await makeDeps(renderId);
    await runRender(renderId, deps);
    return 0;
  } catch (e) {
    // `runRender` rethrows only when `store.fail` itself failed (or the deps could not be built).
    log.error({
      event: 'job',
      renderId,
      outcome: 'unrecorded',
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
    return 1;
  }
}

async function main(): Promise<void> {
  // Loaded here so that importing `runJob` (tests, the offline launcher) does not load Chrome.
  const [{ buildCloudDeps }, { jsonLogger }] = await Promise.all([
    import('./job-deps'),
    import('./clock'),
  ]);
  const code = await runJob(process.env, (id) => buildCloudDeps(id, process.env), jsonLogger);
  process.exit(code);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) void main();
