// The render job (spec 08 design §8): one render doc in, one MP4 and one thumbnail out. It only
// talks to the ports, so the cloud, the emulators and offline mode run the same code.
import { compileProject, projectCompileInput } from '@motionpop/motion/compiler';
import {
  EditorProjectSchema,
  isSafeId,
  renderPaths,
  voicePathFor,
  type EditorProject,
  type RenderDoc,
  type RenderErrorCode,
  type RenderPaths,
} from '@motionpop/schemas';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareBed } from './bed';
import { contentDisposition } from './headers';
import { outputIssues } from './output';
import { preflightSamples } from './preflight-samples';
import {
  RenderAbortedError,
  RenderTimeoutError,
  type JobStage,
  type RenderDeps,
  type RenderOutcome,
} from './ports';
import { ProgressThrottle, mapProgress } from './progress';
import { THUMB_LONG_SIDE, thumbnailTimeMs } from './thumbnail';

export const HEARTBEAT_MS = 10_000;
/** The longest voice we accept, whatever the project says (design §8 step 2). */
export const MAX_VOICE_MS = 10 * 60_000;
/** A voice may run this much past the project before it is refused. */
export const VOICE_SLACK_MS = 5_000;

/** A failure with its error code and a message that is safe to store on the render doc. */
export class RenderStepError extends Error {
  constructor(
    readonly code: RenderErrorCode,
    readonly safeMessage: string,
    override readonly cause?: unknown,
  ) {
    super(safeMessage);
    this.name = 'RenderStepError';
  }
}

export async function runRender(renderId: string, deps: RenderDeps): Promise<RenderOutcome> {
  const { store, blobs, ffmpeg, clock, log } = deps;
  const startedAt = clock.now();

  if (!isSafeId(renderId)) {
    log.error({ event: 'render', outcome: 'skipped', reason: 'bad-render-id' });
    return 'skipped';
  }

  // 1. Load and claim. Anything but a queued render is a duplicate execution or a swept render.
  const doc = await store.get(renderId);
  if (!doc || doc.status !== 'queued' || !(await store.markStarted(renderId))) {
    log.info({ event: 'render', renderId, outcome: 'skipped', status: doc?.status ?? 'missing' });
    return 'skipped';
  }

  const abort = new AbortController();
  const { signal } = abort;
  const stopHeartbeat = clock.every(HEARTBEAT_MS, () => {
    store.heartbeat(renderId).then(
      (r) => {
        if (r === 'inactive') abort.abort();
      },
      (e: unknown) => log.error({ event: 'heartbeat-failed', renderId, error: errorText(e) }),
    );
  });

  const compDir = join(deps.workDir, 'composition');
  let paths: RenderPaths | undefined;
  let failure: { code: RenderErrorCode; message: string } | undefined;
  let recordError: unknown;
  let sizeBytes: number | undefined;
  let producerMs: number | undefined;
  let perfTotalMs: number | undefined;

  /** Runs one step: no work once aborted, and any plain error becomes `code`. */
  async function step<T>(code: RenderErrorCode, label: string, fn: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new RenderAbortedError();
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RenderStepError || e instanceof RenderAbortedError) throw e;
      throw new RenderStepError(code, `${label} failed`, e);
    }
  }

  try {
    // 2. Inputs. The doc is server-written, but the job's storage grant spans every user, so the
    // paths are re-checked before a single byte is read (R3.9).
    const project = await step('input-missing', 'reading the inputs', async () => {
      paths = expectedPaths(doc, renderId);
      if (doc.inputPath !== paths.input) {
        throw new RenderStepError(
          'input-missing',
          'the project snapshot path is not this render’s',
        );
      }
      if (!voicePathFor(doc.ownerId, doc.projectId).test(doc.voicePath)) {
        throw new RenderStepError('input-missing', 'the voice path is not this project’s');
      }
      await mkdir(join(compDir, 'assets'), { recursive: true });
      const parsed = EditorProjectSchema.safeParse(
        JSON.parse((await blobs.read(doc.inputPath)).toString('utf8')),
      );
      if (!parsed.success)
        throw new RenderStepError('input-missing', 'the project snapshot is invalid');
      if (parsed.data.id !== doc.projectId) {
        throw new RenderStepError('input-missing', 'the snapshot belongs to another project');
      }
      await prepareVoice(parsed.data, doc, deps, compDir);
      return parsed.data;
    });
    if (!paths) throw new RenderStepError('internal', 'no paths');
    const outPaths: RenderPaths = paths;

    // 2b. The sound bed (effects, music). It only adds to the voice, so a failure here logs and
    // the export goes on with the voice alone rather than failing the whole render.
    let bedSrc: string | null = null;
    try {
      bedSrc = await prepareBed(project, compDir);
    } catch (e) {
      log.error({ event: 'bed-failed', renderId, error: errorText(e) });
    }

    // 3. Compile.
    const slots = await step('compile-failed', 'compiling', async () => {
      const input = projectCompileInput(project, {
        mode: 'render',
        format: doc.format,
        background: 'style',
        voiceSrc: 'assets/voice.wav',
        ...(bedSrc ? { bedSrc } : {}),
        // The job computes the caption groups itself from the snapshot (spec 12 R4.5).
        captions: doc.captions,
      });
      if (input.slots.length === 0) {
        throw new RenderStepError('compile-failed', 'nothing in the project can be rendered');
      }
      await writeFile(join(compDir, 'index.html'), compileProject(input, deps.assets));
      return input.slots;
    });

    // 4a. Preflight: a slot that fails to build leaves its clip empty, so catch it before the render.
    const issues = await step('render-failed', 'the preflight', () =>
      deps.preflight.check({
        compDir,
        format: doc.format,
        samplesMs: preflightSamples(slots),
        signal,
      }),
    );
    if (issues.length > 0) {
      log.error({ event: 'slot-errors', renderId, issues: issues.slice(0, 10) });
      throw new RenderStepError(
        'slot-failed',
        `slot ${issues[0]?.slotId ?? '?'} could not be built`,
      );
    }

    // 4b. Produce, with progress through the throttle and the store as the abort switch.
    const out = join(deps.workDir, 'video.mp4');
    const throttle = new ProgressThrottle();
    let writes: Promise<void> = Promise.resolve();
    const onProgress = (p: { stage: JobStage; percent: number }): void => {
      const d = throttle.offer(p.stage, mapProgress(p.stage, p.percent), clock.now());
      if (!d.write) return;
      writes = writes
        .then(async () => {
          if ((await store.progress(renderId, d.stage, d.progress)) === 'inactive') abort.abort();
        })
        .catch((e: unknown) =>
          log.error({ event: 'progress-failed', renderId, error: errorText(e) }),
        );
    };
    const t0 = clock.now();
    const result = await step('render-failed', 'rendering', async () => {
      try {
        return await deps.producer.render({
          compDir,
          outPath: out,
          format: doc.format,
          resolution: doc.resolution,
          signal,
          onProgress,
        });
      } catch (e) {
        if (e instanceof RenderTimeoutError) {
          throw new RenderStepError('timeout', 'the render took too long', e);
        }
        throw e;
      }
    });
    producerMs = clock.now() - t0;
    const total = result.perf?.['totalElapsedMs'];
    if (typeof total === 'number') perfTotalMs = total;
    await writes;
    if (signal.aborted) throw new RenderAbortedError();

    // 5. Check the output against what we asked for (R3.6).
    await step('render-failed', 'checking the output', async () => {
      const probe = await ffmpeg.probe(out, { countFrames: true });
      const problems = outputIssues(probe, {
        format: doc.format,
        resolution: doc.resolution,
        durationMs: project.durationMs,
      });
      if (problems.length > 0) {
        log.error({ event: 'output-check', renderId, problems });
        throw new RenderStepError('render-failed', 'the rendered file is not what was asked for');
      }
    });

    // 6. Thumbnail.
    const thumb = join(deps.workDir, 'thumb.jpg');
    await step('render-failed', 'the thumbnail', async () => {
      await ffmpeg.frame({
        video: out,
        atMs: thumbnailTimeMs(slots, project.durationMs),
        destJpg: thumb,
        longSide: THUMB_LONG_SIDE,
      });
      await stat(thumb);
    });

    // 7. Upload, then `done`.
    const size = await step(
      'upload-failed',
      'reading the file size',
      async () => (await stat(out)).size,
    );
    await step('upload-failed', 'uploading', async () => {
      if ((await store.progress(renderId, 'encoding', 96)) === 'inactive') abort.abort();
      if (signal.aborted) throw new RenderAbortedError();
      await blobs.upload(outPaths.output, out, {
        contentType: 'video/mp4',
        contentDisposition: contentDisposition(doc.title),
        cacheControl: 'private, max-age=0',
      });
      await blobs.upload(outPaths.thumb, thumb, {
        contentType: 'image/jpeg',
        cacheControl: 'private, max-age=0',
      });
    });
    await step('internal', 'finishing', async () => {
      const done = await store.markDone(renderId, {
        outputPath: outPaths.output,
        thumbPath: outPaths.thumb,
        sizeBytes: size,
      });
      if (done === 'inactive') throw new RenderAbortedError();
    });
    sizeBytes = size;
  } catch (e) {
    failure = classify(e);
    log.error({ event: 'render-error', renderId, code: failure.code, error: errorText(e) });
    try {
      await store.fail(renderId, failure.code, failure.message);
    } catch (fe) {
      recordError = fe;
      log.error({ event: 'fail-not-recorded', renderId, error: errorText(fe) });
    }
  } finally {
    // 8. Cleanup, always: the heartbeat, the working folder (it holds the voice) and the snapshot.
    stopHeartbeat();
    await quietly(log, 'workdir', () => rm(deps.workDir, { recursive: true, force: true }));
    if (paths) {
      const p = paths;
      await quietly(log, 'input', () => blobs.deletePrefix(p.inputDir));
      if (failure) {
        await quietly(log, 'output', () => blobs.deletePrefix(p.output));
        await quietly(log, 'thumb', () => blobs.deletePrefix(p.thumb));
      }
    }
    // 9. One structured line per render. No transcript text, no URLs (R6.4, R9.3).
    log.info({
      event: 'render',
      renderId,
      outcome: failure ? 'error' : 'done',
      ...(failure ? { code: failure.code } : {}),
      wallMs: clock.now() - startedAt,
      ...(producerMs !== undefined ? { renderMs: producerMs } : {}),
      ...(perfTotalMs !== undefined ? { perfTotalMs } : {}),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      format: doc.format,
      resolution: doc.resolution,
    });
  }
  // The job exits non-zero only when it could not even record the failure (the sweep catches it).
  if (recordError !== undefined) throw recordError;
  return failure ? 'error' : 'done';
}

function expectedPaths(doc: RenderDoc, renderId: string): RenderPaths {
  try {
    return renderPaths(doc.ownerId, doc.projectId, renderId);
  } catch {
    throw new RenderStepError('input-missing', 'the render ids are not valid');
  }
}

/**
 * Probes the owner's voice and re-encodes it to a WAV inside the composition (R3.9): the upload
 * is untrusted input for ffmpeg and Chrome, so only the re-encoded first audio stream goes on.
 */
async function prepareVoice(
  project: EditorProject,
  doc: RenderDoc,
  deps: RenderDeps,
  compDir: string,
): Promise<void> {
  const { blobs, ffmpeg } = deps;
  const source = join(deps.workDir, 'input', 'voice-source');
  await mkdir(join(deps.workDir, 'input'), { recursive: true });
  await blobs.download(doc.voicePath, source);
  const inputFormat = demuxerFor(doc.voicePath);
  const probe = await ffmpeg.probe(source, { inputFormat });
  if (probe.audioStreams !== 1) {
    throw new RenderStepError('input-missing', 'the voice must have exactly one audio stream');
  }
  const maxMs = Math.min(project.durationMs + VOICE_SLACK_MS, MAX_VOICE_MS);
  // The container may not know its length (a browser recording often doesn't), so the re-encode
  // is cut one second past the limit and the WAV, whose length is exact, is the real check.
  const wav = join(compDir, 'assets', 'voice.wav');
  await ffmpeg.toWav(source, wav, { maxMs: maxMs + 1000, inputFormat });
  const wavProbe = await ffmpeg.probe(wav);
  if (wavProbe.audioStreams !== 1 || wavProbe.durationMs <= 0) {
    throw new RenderStepError('input-missing', 'the voice could not be decoded');
  }
  if (wavProbe.durationMs > maxMs) {
    throw new RenderStepError('input-missing', 'the voice is much longer than the project');
  }
  await rm(source, { force: true });
}

/**
 * The ffmpeg demuxer for the voice's file extension (the path already matched `voicePathFor`).
 * Forcing it means a playlist or `concat` file renamed to `.wav` is read as a broken WAV, not
 * followed to other files.
 */
export function demuxerFor(voicePath: string): string {
  const ext = voicePath.slice(voicePath.lastIndexOf('.') + 1);
  const map: Record<string, string> = {
    wav: 'wav',
    mp3: 'mp3',
    m4a: 'mov',
    webm: 'matroska',
    ogg: 'ogg',
  };
  return map[ext] ?? 'wav';
}

function classify(e: unknown): { code: RenderErrorCode; message: string } {
  if (e instanceof RenderStepError) return { code: e.code, message: e.safeMessage };
  // Swept or failed elsewhere: the store ignores this for a final render.
  if (e instanceof RenderAbortedError)
    return { code: 'stalled', message: 'the render was stopped' };
  return { code: 'internal', message: 'something went wrong' };
}

const errorText = (e: unknown): string =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 500);

async function quietly(
  log: RenderDeps['log'],
  what: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log.error({ event: 'cleanup-failed', what, error: errorText(e) });
  }
}
