import { detectLocal } from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  EditConfigSchema,
  ReelPlanSchema,
  type EditConfig,
  type ImageAsset,
  type ReelPlan,
  type Word,
} from '@motionpop/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEdit } from '../configure/defaults';
import { LocalCredits } from '../credits/local-credits';
import { directReelPaid } from '../reel/media';
import { MemoryAudioStore } from '../audio/audio-store';
import type { DecodedAudio } from '../audio/decode';
import { INTAKE_MESSAGES } from '../audio/intake';
import { MemoryProjectRepository } from '../projects/repository';
import { validateParams } from '../slots/validate-params';
import type { PipelineDeps, TranscribeOutput } from './run';
import {
  cancel,
  cancelForOtherUser,
  discard,
  dismiss,
  isLive,
  isWatched,
  prepare,
  release,
  resetJobsForTest,
  retry,
  setJobDepsProvider,
  submit,
  useJobs,
  watch,
  type Job,
  type JobDeps,
  type PendingTake,
} from './jobs-store';

const generateVoice = vi.hoisted(() => vi.fn());
// The cloud reel director behind `directReelPaid`: the real function runs, this is its model call.
const aiDirectReel = vi.hoisted(() => vi.fn());
vi.mock('@motionpop/ai', async (orig) => {
  const actual = await orig<typeof import('@motionpop/ai')>();
  return {
    ...actual,
    directReel: (...a: Parameters<typeof actual.directReel>) =>
      aiDirectReel.getMockImplementation() ? aiDirectReel(...a) : actual.directReel(...a),
  };
});
vi.mock('../ai/router-client', () => ({
  getRouter: vi.fn(async () => ({})),
  emitAIUsage: vi.fn(),
}));
const clearPending = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../tts/generate-voice', () => ({ generateVoice }));
const peekPending = vi.hoisted(() => vi.fn<() => unknown>(() => null));
vi.mock('../intake/pending', () => ({ clearPending, peekPending }));

const WORDS: Word[] = [
  { i: 0, text: 'hello', startMs: 0, endMs: 500, conf: 1, filler: false },
  { i: 1, text: 'world', startMs: 600, endMs: 1100, conf: 1, filler: false },
];

const EDIT: EditConfig = EditConfigSchema.parse({
  v: 1,
  recipeId: 'tech-explainer',
  styleId: 'studio-light',
  hookStyle: 'headline',
  captions: { enabled: true, style: 'pop' },
  cta: { enabled: false },
  sound: { cleanup: false, sfx: false, music: 'none' },
  illustrations: false,
});

function pcm(durationMs: number, level = 0.1): DecodedAudio {
  return {
    pcm16k: new Float32Array(1600).fill(level),
    pcm24k: new Float32Array(2400).fill(level),
    durationMs,
  };
}

interface Gate {
  promise: Promise<void>;
  release: () => void;
}
function gate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

/** A repository whose first `failSaves` saves throw. */
class FlakyRepository extends MemoryProjectRepository {
  failSaves = 0;
  override async save(...args: Parameters<MemoryProjectRepository['save']>) {
    if (this.failSaves > 0) {
      this.failSaves--;
      throw new Error('disk full');
    }
    return super.save(...args);
  }
}

interface Harness {
  deps: JobDeps;
  decode: ReturnType<typeof vi.fn<PipelineDeps['decode']>>;
  transcribe: ReturnType<typeof vi.fn<PipelineDeps['transcribe']>>;
  probeVideo: ReturnType<typeof vi.fn<NonNullable<PipelineDeps['probeVideo']>>>;
  detect: ReturnType<typeof vi.fn<PipelineDeps['detect']>>;
  audioStore: MemoryAudioStore;
  repo: FlakyRepository;
  /** While set, `detect` (the pipeline's 'suggest' step) waits: it holds a job in `running`. */
  hold: Gate | null;
  uid: string | null;
  decoded: DecodedAudio;
}

const gates: Gate[] = [];
let h: Harness;
let ids = 0;

function makeHarness(): Harness {
  const self: Harness = {
    hold: null,
    uid: 'u-1',
    decoded: pcm(6000),
    audioStore: new MemoryAudioStore(),
    repo: new FlakyRepository(),
  } as Harness;
  self.decode = vi.fn<PipelineDeps['decode']>(async () => self.decoded);
  self.transcribe = vi.fn<PipelineDeps['transcribe']>(async (_p, _ms, onProgress) => {
    onProgress({ stage: 'loading' });
    onProgress({ stage: 'transcribing', percent: 50 });
    const out: TranscribeOutput = { words: WORDS, ranOn: 'device', timingQuality: 'word' };
    return out;
  });
  self.probeVideo = vi.fn(async () => ({
    width: 1080,
    height: 1920,
    durationMs: 6000,
    format: '9:16' as const,
    frames: [{ atMs: 0, base64: 'AAAA' }],
  }));
  self.detect = vi.fn<PipelineDeps['detect']>(async (words, spans) => {
    await self.hold?.promise;
    return detectLocal(words, spans);
  });
  const pipeline: PipelineDeps = {
    decode: self.decode,
    transcribe: self.transcribe,
    probeVideo: self.probeVideo,
    renderCleaned: async (pcm16, _rate, cuts) => new Float32Array(pcm16.length - cuts.length),
    encodeWav: (samples) => new ArrayBuffer(samples.length),
    audioStore: self.audioStore,
    repo: self.repo,
    now: () => 1_700_000_000_000,
    newId: () => `p-${++ids}`,
    styleId: 'style-test',
    detect: self.detect,
    validateParams,
  };
  self.deps = { pipeline, credits: null, config: APP_CONFIG_DEFAULTS, uid: self.uid };
  return self;
}

/** A pending upload whose blob is already in the audio store. */
async function stash(name = 'my voice.wav', type = 'audio/wav'): Promise<PendingTake> {
  const blob = new Blob(['not really audio'], { type });
  const ref = await h.audioStore.put(blob);
  return {
    blob,
    meta: { ref, source: 'upload', name, cleanup: false },
    draft: { title: 'Untitled Project', format: '16:9' },
  };
}

const job = (id: string): Job => {
  const j = useJobs.getState().jobs[id];
  if (!j) throw new Error(`no job ${id}`);
  return j;
};
const until = (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true), { timeout: 5000 });
const hasBlob = async (ref: string) => (await h.audioStore.get(ref)) !== null;
const statusOf = (id: string) => useJobs.getState().jobs[id]?.status;

beforeEach(() => {
  h = makeHarness();
  ids = 0;
  setJobDepsProvider(() => ({ ...h.deps, uid: h.uid }));
  generateVoice.mockReset();
  aiDirectReel.mockReset();
  clearPending.mockClear();
  peekPending.mockReset();
  peekPending.mockReturnValue(null);
});

afterEach(() => {
  gates.splice(0).forEach((g) => g.release());
  h.hold?.release();
  resetJobsForTest();
  setJobDepsProvider(null);
});

function holdSuggest(): Gate {
  const g = gate();
  gates.push(g);
  h.hold = g;
  return g;
}

describe('prepare', () => {
  it('decodes and transcribes in the background until the job is ready', async () => {
    const id = prepare(await stash());
    expect(job(id)).toMatchObject({ status: 'preparing', kind: 'voiceover', title: 'my voice' });
    await until(() => job(id).prep.stage === 'ready');
    expect(job(id).prep.pct).toBe(100);
    expect(job(id).media.durationMs).toBe(6000);
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(h.repo.failSaves).toBe(0);
    // Nothing paid for or created yet.
    expect(await h.repo.load('p-1')).toEqual({ ok: false, error: 'not-found' });
  });

  it('returns the job already preparing the same stored take', async () => {
    const take = await stash();
    const a = prepare(take);
    expect(prepare(take)).toBe(a);
    await until(() => job(a).prep.stage === 'ready');
    expect(Object.keys(useJobs.getState().jobs)).toEqual([a]);
    expect(h.decode).toHaveBeenCalledTimes(1);
  });

  it('a video is probed once and gets its size and thumbnail', async () => {
    const id = prepare(await stash('clip.mp4', 'video/mp4'));
    expect(job(id).kind).toBe('video');
    await until(() => job(id).prep.stage === 'ready');
    expect(h.probeVideo).toHaveBeenCalledTimes(1);
    expect(job(id).media).toMatchObject({ width: 1080, height: 1920 });
    expect(job(id).media.thumbUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('fails a file that is not audio, without decoding it', async () => {
    const id = prepare(await stash('notes.txt', 'text/plain'));
    await until(() => job(id).prep.stage === 'failed');
    expect(job(id).prep.error).toBe(INTAKE_MESSAGES['not-audio']);
    expect(h.decode).not.toHaveBeenCalled();
    expect(submit(id, EDIT)).toBe(false);
  });

  it('fails a file the browser cannot decode, and a silent one', async () => {
    h.decode.mockRejectedValueOnce(new Error('EncodingError'));
    const bad = prepare(await stash());
    await until(() => job(bad).prep.stage === 'failed');
    expect(job(bad).prep.error).toMatch(/couldn't read/i);

    h.decoded = pcm(6000, 0);
    const silent = prepare(await stash('quiet.wav'));
    await until(() => job(silent).prep.stage === 'failed');
    expect(job(silent).prep.error).toMatch(/couldn't hear anything/i);
  });

  it('a script has nothing to prepare', () => {
    const id = prepare({
      blob: null,
      meta: {
        source: 'tts',
        name: 'Script',
        cleanup: false,
        tts: { voiceId: 'kore', speed: 1, script: 'Hello there.' },
      },
      draft: { title: 'Untitled Project', format: '16:9' },
    });
    expect(job(id)).toMatchObject({ kind: 'voiceover', script: 'Hello there.' });
    expect(job(id).prep).toEqual({ pct: 100, stage: 'ready' });
    expect(h.decode).not.toHaveBeenCalled();
  });
});

describe('submit', () => {
  it('runs the pipeline to a saved project and never repeats prepared work', async () => {
    const take = await stash();
    const id = prepare(take);
    await until(() => job(id).prep.stage === 'ready');
    expect(submit(id, EDIT)).toBe(true);
    await until(() => statusOf(id) === 'done');

    const j = job(id);
    expect(j.projectId).toBe('p-1');
    expect(j.progressPct).toBe(100);
    expect(j.etaMs).toBe(0);
    expect(j.finishedAt).toBeDefined();
    expect(j.recipeLabel).toBe('Tech Explainer');
    expect((await h.repo.load('p-1')).ok).toBe(true);
    // R2.8: decoded once and transcribed once, across preparation and the run.
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    // The job owns the stored take now (the hand-off is cleared, audio kept).
    expect(clearPending).toHaveBeenCalledWith({ keepAudio: true });
  });

  it('Create before preparation finishes picks up where it is, nothing done twice', async () => {
    const id = prepare(await stash());
    expect(submit(id, EDIT)).toBe(true);
    await until(() => statusOf(id) === 'done');
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(h.transcribe).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a second call does nothing and returns false', async () => {
    const id = prepare(await stash());
    await until(() => job(id).prep.stage === 'ready');
    expect(submit(id, EDIT)).toBe(true);
    expect(submit(id, EDIT)).toBe(false);
    await until(() => statusOf(id) === 'done');
    expect(submit(id, EDIT)).toBe(false);
    expect(h.repo.failSaves).toBe(0);
    expect(clearPending).toHaveBeenCalledTimes(1);
    expect((await h.repo.list()).projects.length).toBe(1);
  });

  it('ignores an unknown job', () => {
    expect(submit('j-nope', EDIT)).toBe(false);
  });

  it('reports progress that only goes forward', async () => {
    const seen: number[] = [];
    const unsub = useJobs.subscribe((s) => {
      const j = Object.values(s.jobs)[0];
      if (j && j.status !== 'preparing') seen.push(j.progressPct);
    });
    const id = prepare(await stash());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    unsub();
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(100);
  });
});

describe('the queue', () => {
  it('runs one job at a time and starts the next when the first is done', async () => {
    const g = holdSuggest();
    const a = prepare(await stash('a.wav'));
    const b = prepare(await stash('b.wav'));
    submit(a, EDIT);
    submit(b, EDIT);
    await until(() => statusOf(a) === 'running');
    await until(() => h.detect.mock.calls.length === 1);
    expect(statusOf(b)).toBe('queued');
    h.hold = null;
    g.release();
    await until(() => statusOf(a) === 'done' && statusOf(b) === 'done');
    expect(job(a).projectId).not.toBe(job(b).projectId);
  });

  it('moves on after an error', async () => {
    h.repo.failSaves = 1;
    const a = prepare(await stash('a.wav'));
    const b = prepare(await stash('b.wav'));
    submit(a, EDIT);
    submit(b, EDIT);
    await until(() => statusOf(a) === 'error' && statusOf(b) === 'done');
  });

  it('jobs keep running with no screen mounted (the store is module-level)', async () => {
    const id = prepare(await stash());
    submit(id, EDIT);
    // No subscriber, no component: only the store runs it.
    await until(() => statusOf(id) === 'done');
  });
});

describe('cancel', () => {
  it('aborts only that job and deletes its stored take; the queue moves on', async () => {
    const g = holdSuggest();
    const takeA = await stash('a.wav');
    const takeB = await stash('b.wav');
    const a = prepare(takeA);
    const b = prepare(takeB);
    submit(a, EDIT);
    submit(b, EDIT);
    await until(() => h.detect.mock.calls.length === 1);

    cancel(a);
    expect(statusOf(a)).toBe('cancelled');
    expect(statusOf(b)).toBe('queued');
    h.hold = null;
    g.release();
    await until(() => statusOf(b) === 'done');

    expect(statusOf(a)).toBe('cancelled');
    expect(job(a).projectId).toBeUndefined();
    await vi.waitFor(async () => expect(await hasBlob(takeA.meta.ref!)).toBe(false));
    expect(await hasBlob(takeB.meta.ref!)).toBe(true);
    expect((await h.repo.list()).projects.length).toBe(1);
  });

  it('a queued job can be cancelled before it ever runs', async () => {
    const g = holdSuggest();
    const a = prepare(await stash('a.wav'));
    const b = prepare(await stash('b.wav'));
    submit(a, EDIT);
    submit(b, EDIT);
    await until(() => h.detect.mock.calls.length === 1);
    cancel(b);
    h.hold = null;
    g.release();
    await until(() => statusOf(a) === 'done');
    expect(statusOf(b)).toBe('cancelled');
    expect(h.decode).toHaveBeenCalledTimes(2); // each prepared once, none for the cancelled run
  });

  // Changed by spec 39 task 14 (the pending-ownership gap from review run 7): the hand-off is only
  // cleared when it still points at this job's take, so the mock now says it does.
  it('a job still preparing drops the hand-off and its take', async () => {
    const take = await stash();
    peekPending.mockReturnValue({ meta: { ref: take.meta.ref }, draft: {} });
    const id = prepare(take);
    cancel(id);
    expect(statusOf(id)).toBe('cancelled');
    await until(() => clearPending.mock.calls.length > 0);
    expect(clearPending).toHaveBeenCalledWith({ keepAudio: false });
    expect(submit(id, EDIT)).toBe(false);
  });

  it('does nothing to a finished job', async () => {
    const id = prepare(await stash());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    cancel(id);
    expect(statusOf(id)).toBe('done');
  });
});

describe('retry', () => {
  it('runs a failed job again without decoding or transcribing again', async () => {
    h.repo.failSaves = 1;
    const id = prepare(await stash());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'error');
    expect(job(id).error).toMatch(/couldn't save/i);
    expect(job(id).intakeError).toBeUndefined();

    expect(retry(id)).toBe(true);
    await until(() => statusOf(id) === 'done');
    expect(job(id).error).toBeUndefined();
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(job(id).projectId).toBeDefined();
  });

  it('only a failed job retries', async () => {
    const id = prepare(await stash());
    expect(retry(id)).toBe(false);
    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    expect(retry(id)).toBe(false);
    expect(retry('j-nope')).toBe(false);
  });
});

describe('intake errors', () => {
  it('a file that fails the checks after Create sets intakeError, and cannot be retried', async () => {
    h.decoded = pcm(6000, 0); // silent
    const id = prepare(await stash());
    // Create before preparation has looked at the file.
    expect(submit(id, EDIT)).toBe(true);
    await until(() => statusOf(id) === 'error');
    expect(job(id).intakeError).toBe(true);
    expect(job(id).error).toMatch(/couldn't hear anything/i);
    expect(retry(id)).toBe(false);
    expect(h.transcribe).not.toHaveBeenCalled();
  });
});

describe('script jobs', () => {
  const scriptTake = (): PendingTake => ({
    blob: null,
    meta: {
      source: 'tts',
      name: 'Script',
      cleanup: false,
      tts: { voiceId: 'kore', speed: 1, script: 'Hello world, this is a script.' },
    },
    draft: { title: 'Untitled Project', format: '16:9' },
  });
  const voice = () => ({
    ok: true as const,
    file: new File(['wav'], 'script-voice.wav', { type: 'audio/wav' }),
    durationMs: 6000,
    credits: 2,
    latencyMs: 5,
  });

  it('makes the voice only after Create, then runs the pipeline on it', async () => {
    generateVoice.mockResolvedValue(voice());
    const id = prepare(scriptTake());
    await new Promise((r) => setTimeout(r, 20));
    expect(generateVoice).not.toHaveBeenCalled();

    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    expect(generateVoice).toHaveBeenCalledTimes(1);
    const [, input] = generateVoice.mock.calls[0]!;
    expect(input).toMatchObject({ text: 'Hello world, this is a script.', speed: 1 });
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(job(id).media.durationMs).toBe(6000);
  });

  it('a voice that fails ends the job with the reason', async () => {
    generateVoice.mockResolvedValue({ ok: false, reason: 'Not enough credits', noCredits: true });
    const id = prepare(scriptTake());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'error');
    expect(job(id).error).toBe('Not enough credits');
    expect(h.decode).not.toHaveBeenCalled();
  });

  it('Retry reuses the voice that was already paid for', async () => {
    generateVoice.mockResolvedValue(voice());
    h.repo.failSaves = 1;
    const id = prepare(scriptTake());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'error');
    expect(generateVoice).toHaveBeenCalledTimes(1);

    expect(retry(id)).toBe(true);
    await until(() => statusOf(id) === 'done');
    expect(generateVoice).toHaveBeenCalledTimes(1);
  });

  it('Retry after a failed voice asks again (nothing was paid for)', async () => {
    generateVoice.mockResolvedValueOnce({ ok: false, reason: 'Couldn’t reserve the credits' });
    generateVoice.mockResolvedValue(voice());
    const id = prepare(scriptTake());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'error');
    expect(retry(id)).toBe(true);
    await until(() => statusOf(id) === 'done');
    expect(generateVoice).toHaveBeenCalledTimes(2);
  });
});

describe('dismiss, discard and account changes', () => {
  it('dismiss removes a finished job from the list', async () => {
    const id = prepare(await stash());
    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    dismiss(id);
    expect(useJobs.getState().jobs[id]).toBeUndefined();
    expect(useJobs.getState().order).toEqual([]);
  });

  it('dismiss cancels a live job first, and a failed job loses its stored take', async () => {
    const g = holdSuggest();
    const live = await stash('a.wav');
    const a = prepare(live);
    submit(a, EDIT);
    await until(() => h.detect.mock.calls.length === 1);
    dismiss(a);
    expect(useJobs.getState().jobs[a]).toBeUndefined();
    h.hold = null;
    g.release();
    await vi.waitFor(async () => expect(await hasBlob(live.meta.ref!)).toBe(false));

    h.repo.failSaves = 1;
    const failed = await stash('b.wav');
    const b = prepare(failed);
    submit(b, EDIT);
    await until(() => statusOf(b) === 'error');
    expect(await hasBlob(failed.meta.ref!)).toBe(true); // kept for Retry
    dismiss(b);
    await vi.waitFor(async () => expect(await hasBlob(failed.meta.ref!)).toBe(false));
  });

  it('discard (the configure screen’s Remove) drops the job', async () => {
    const id = prepare(await stash());
    discard(id);
    expect(useJobs.getState().jobs[id]).toBeUndefined();
  });

  it('a job started under another account is cancelled when the account changes', async () => {
    const g = holdSuggest();
    const a = prepare(await stash('a.wav'));
    const b = prepare(await stash('b.wav'));
    const c = prepare(await stash('c.wav')); // still preparing: not started under anyone
    submit(a, EDIT);
    submit(b, EDIT);
    await until(() => h.detect.mock.calls.length === 1);

    cancelForOtherUser('u-1');
    expect(statusOf(a)).toBe('running');
    expect(statusOf(b)).toBe('queued');

    cancelForOtherUser('u-2');
    expect(statusOf(a)).toBe('cancelled');
    expect(statusOf(b)).toBe('cancelled');
    expect(statusOf(c)).toBe('preparing');
    h.hold = null;
    g.release();
  });
});

describe('pending ownership (review run 7)', () => {
  const scriptTake = (script: string): PendingTake => ({
    blob: null,
    meta: {
      source: 'tts',
      name: 'Script',
      cleanup: false,
      tts: { voiceId: 'Kore', speed: 1, script },
    },
    draft: { title: 'Untitled Project', format: '16:9' },
  });

  it('a newer hand-off survives the cancel of an older job; only the job’s own audio goes', async () => {
    const old = await stash('old.wav');
    const id = prepare(old);
    // A newer take replaced the hand-off meanwhile.
    peekPending.mockReturnValue({ meta: { ref: 'newer-ref', source: 'upload' }, draft: {} });
    cancel(id);
    await vi.waitFor(async () => expect(await hasBlob(old.meta.ref!)).toBe(false));
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('clears the hand-off when it is this job’s own', async () => {
    const mine = await stash('mine.wav');
    const id = prepare(mine);
    peekPending.mockReturnValue({ meta: { ref: mine.meta.ref }, draft: {} });
    dismiss(id);
    await until(() => clearPending.mock.calls.length > 0);
    expect(clearPending).toHaveBeenCalledWith({ keepAudio: false });
  });

  it('clears nothing when no hand-off is left, but still deletes the job’s audio', async () => {
    const mine = await stash('mine.wav');
    const id = prepare(mine);
    peekPending.mockReturnValue(null);
    cancel(id);
    await vi.waitFor(async () => expect(await hasBlob(mine.meta.ref!)).toBe(false));
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('a script job matches its hand-off by the script text', async () => {
    const id = prepare(scriptTake('Revenue grew forty percent.'));
    peekPending.mockReturnValue({
      meta: { source: 'tts', tts: { voiceId: 'Kore', speed: 1, script: 'A different script.' } },
      draft: {},
    });
    cancel(id);
    await Promise.resolve();
    expect(clearPending).not.toHaveBeenCalled();

    const mine = prepare(scriptTake('Revenue grew forty percent.'));
    peekPending.mockReturnValue({
      meta: {
        source: 'tts',
        tts: { voiceId: 'Kore', speed: 2, script: 'Revenue grew forty percent.' },
      },
      draft: {},
    });
    cancel(mine);
    await until(() => clearPending.mock.calls.length > 0);
    expect(clearPending).toHaveBeenCalledWith({ keepAudio: false });
  });

  it('a script job never matches a hand-off that has a ref', async () => {
    const id = prepare(scriptTake('Hello.'));
    peekPending.mockReturnValue({ meta: { ref: 'x', source: 'upload' }, draft: {} });
    cancel(id);
    await Promise.resolve();
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('an owned job (after Create) never clears the hand-off again, even if it matches', async () => {
    const take = await stash();
    const id = prepare(take);
    submit(id, EDIT);
    await until(() => statusOf(id) === 'done');
    clearPending.mockClear();
    peekPending.mockReturnValue({ meta: { ref: take.meta.ref }, draft: {} });
    dismiss(id);
    await vi.waitFor(async () => expect(await hasBlob(take.meta.ref!)).toBe(true));
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('a failed owned job loses its audio on dismiss and leaves the hand-off alone', async () => {
    h.repo.failSaves = 1;
    const take = await stash();
    const id = prepare(take);
    submit(id, EDIT);
    await until(() => statusOf(id) === 'error');
    clearPending.mockClear();
    peekPending.mockReturnValue({ meta: { ref: 'newer', source: 'upload' }, draft: {} });
    dismiss(id);
    await vi.waitFor(async () => expect(await hasBlob(take.meta.ref!)).toBe(false));
    expect(clearPending).not.toHaveBeenCalled();
  });
});

describe('release', () => {
  it('drops a job that never reached Create without touching the take or the hand-off', async () => {
    const take = await stash();
    const id = prepare(take);
    release(id);
    expect(useJobs.getState().jobs[id]).toBeUndefined();
    expect(useJobs.getState().order).toEqual([]);
    await Promise.resolve();
    expect(clearPending).not.toHaveBeenCalled();
    expect(await hasBlob(take.meta.ref!)).toBe(true);
    // Preparing again later starts a fresh job for the same take.
    const again = prepare(take);
    expect(again).not.toBe(id);
    await until(() => job(again).prep.stage === 'ready');
  });

  it('stops the preparation: no job is left live to hold the tab open', async () => {
    const id = prepare(await stash());
    release(id);
    await Promise.resolve();
    expect(Object.values(useJobs.getState().jobs).some(isLive)).toBe(false);
  });

  it('does nothing to a job that was created, ran, or is unknown', async () => {
    const id = prepare(await stash());
    submit(id, EDIT);
    release(id);
    expect(useJobs.getState().jobs[id]).toBeDefined();
    await until(() => statusOf(id) === 'done');
    release(id);
    expect(statusOf(id)).toBe('done');
    expect(() => release('j-nope')).not.toThrow();
  });
});

describe('watch', () => {
  it('marks a job watched until released, and releasing twice is harmless', () => {
    expect(isWatched('j-1')).toBe(false);
    const stop = watch('j-1');
    expect(isWatched('j-1')).toBe(true);
    expect(isWatched('j-2')).toBe(false);
    stop();
    stop();
    expect(isWatched('j-1')).toBe(false);
  });

  it('counts watchers: the screen that lets go first does not unwatch the other', () => {
    const configure = watch('j-1');
    const processing = watch('j-1');
    configure();
    expect(isWatched('j-1')).toBe(true);
    configure(); // a second call of the same release must not eat the other's count
    expect(isWatched('j-1')).toBe(true);
    processing();
    expect(isWatched('j-1')).toBe(false);
  });
});

describe('isLive', () => {
  it.each([
    ['preparing', true],
    ['queued', true],
    ['running', true],
    ['done', false],
    ['error', false],
    ['cancelled', false],
  ] as const)('%s → %s', (status, live) => {
    expect(isLive({ status })).toBe(live);
  });
});

describe('credit safety (spec 39 design §10 #2, #3)', () => {
  const VIDEO_EDIT: EditConfig = defaultEdit('video');
  const SIX_WORDS: Word[] = 'Revenue grew forty percent last year'.split(' ').map((text, i) => ({
    i,
    text,
    startMs: i * 500,
    endMs: i * 500 + 400,
    conf: 1,
    filler: false,
  }));
  const video = () => stash('clip.mp4', 'video/mp4');

  /** A reel plan over `ms` that asks for one illustration and carries a music brief. */
  const planOver = (ms: number, withPictures = false): ReelPlan =>
    ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      focus: { x: 0.5, y: 0.32 },
      captions: true,
      ...(withPictures ? { music: { brief: 'Warm lo-fi, soft piano' } } : {}),
      scenes: [
        withPictures
          ? {
              id: 'r1',
              startMs: 0,
              endMs: ms,
              layout: 'full',
              content: { template: 'image', media: { kind: 'illustration', query: 'a rocket' } },
            }
          : { id: 'r1', startMs: 0, endMs: ms, layout: 'speaker', content: { template: 'none' } },
      ],
    });

  const generated = (plan: ReelPlan): { plan: ReelPlan; assets: ImageAsset[] } => ({
    plan,
    assets: [
      {
        id: 'a1',
        hash: 'a'.repeat(64),
        status: 'ready',
        source: 'generated',
        subject: 'a rocket',
        keyed: false,
        width: 8,
        height: 8,
        src: 'media:h.webp',
      },
    ],
  });

  it('a job that failed after directing is retried without directing again', async () => {
    const directReel = vi.fn(async (p: { durationMs: number }) => ({
      plan: planOver(p.durationMs),
      source: 'cloud' as const,
    }));
    h.deps.pipeline.directReel = directReel;
    h.repo.failSaves = 1;
    const id = prepare(await video());
    submit(id, VIDEO_EDIT);
    await until(() => statusOf(id) === 'error');
    expect(directReel).toHaveBeenCalledTimes(1);

    expect(retry(id)).toBe(true);
    await until(() => statusOf(id) === 'done');
    expect(directReel).toHaveBeenCalledTimes(1);
    const saved = await h.repo.load(job(id).projectId!);
    expect(saved.ok && saved.project.reel?.scenes[0]?.id).toBe('r1');
  });

  it('keeps the pictures and the music too, so a retry pays for none of them again', async () => {
    h.deps.pipeline.directReel = vi.fn(async (p: { durationMs: number }) => ({
      plan: planOver(p.durationMs, true),
      source: 'cloud' as const,
    }));
    const resolveReelMedia = vi.fn(async ({ plan }: { plan: ReelPlan }) => generated(plan));
    const resolveReelMusic = vi.fn(async ({ plan }: { plan: ReelPlan }) => ({
      ...plan,
      music: { brief: plan.music!.brief, src: 'idb:music-1' },
    }));
    h.deps.pipeline.resolveReelMedia = resolveReelMedia;
    h.deps.pipeline.resolveReelMusic = resolveReelMusic;
    h.repo.failSaves = 1;
    const id = prepare(await video());
    submit(id, VIDEO_EDIT);
    await until(() => statusOf(id) === 'error');
    retry(id);
    await until(() => statusOf(id) === 'done');
    expect(h.deps.pipeline.directReel).toHaveBeenCalledTimes(1);
    expect(resolveReelMedia).toHaveBeenCalledTimes(1);
    expect(resolveReelMusic).toHaveBeenCalledTimes(1);
    const saved = await h.repo.load(job(id).projectId!);
    expect(saved.ok && saved.project.reel?.music?.src).toBe('idb:music-1');
    expect(saved.ok && saved.project.assets?.map((a) => a.id)).toEqual(['a1']);
  });

  it('a free plan is not kept: a retry may try the cloud director again', async () => {
    const directReel = vi.fn(async (p: { durationMs: number }) => ({
      plan: planOver(p.durationMs),
      source: 'auto' as const,
    }));
    h.deps.pipeline.directReel = directReel;
    h.repo.failSaves = 1;
    const id = prepare(await video());
    submit(id, VIDEO_EDIT);
    await until(() => statusOf(id) === 'error');
    retry(id);
    await until(() => statusOf(id) === 'done');
    expect(directReel).toHaveBeenCalledTimes(2);
  });

  it('cancelling while the reel is directed hands the price back and saves nothing', async () => {
    const credits = new LocalCredits(30);
    const refund = vi.spyOn(credits, 'refund');
    h.transcribe.mockImplementation(async () => ({
      words: SIX_WORDS,
      ranOn: 'device' as const,
      timingQuality: 'word' as const,
    }));
    let release!: () => void;
    aiDirectReel.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ plan: planOver(3000), source: 'cloud' });
        }),
    );
    const directReel = vi.fn((p: Parameters<NonNullable<PipelineDeps['directReel']>>[0]) =>
      directReelPaid(
        { look: p.look, words: p.words, durationMs: p.durationMs, refId: 'reel' },
        { credits },
        p.signal,
      ),
    );
    h.deps.pipeline.directReel = directReel;
    h.deps = { ...h.deps, credits };
    const id = prepare(await video());
    submit(id, VIDEO_EDIT);
    await until(() => aiDirectReel.mock.calls.length > 0);
    expect(credits.balance()).toBeLessThan(30);

    cancel(id);
    await until(() => refund.mock.calls.length > 0);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(credits.balance()).toBe(30);
    expect(statusOf(id)).toBe('cancelled');
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(statusOf(id)).toBe('cancelled');
    expect(refund).toHaveBeenCalledTimes(1);
    expect((await h.repo.list()).projects).toEqual([]);
  });

  it('the voice call gets the job’s signal, and a cancel while it is made ends the job quietly', async () => {
    generateVoice.mockImplementation(
      (_deps: unknown, _input: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('c', 'AbortError'))),
        ),
    );
    const id = prepare({
      blob: null,
      meta: {
        source: 'tts',
        name: 'Script',
        cleanup: false,
        tts: { voiceId: 'kore', speed: 1, script: 'Hello world, this is a script.' },
      },
      draft: { title: 'Untitled Project', format: '16:9' },
    });
    submit(id, EDIT);
    await until(() => generateVoice.mock.calls.length > 0);
    const signal = generateVoice.mock.calls[0]![2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    cancel(id);
    expect(signal.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(statusOf(id)).toBe('cancelled');
    expect(h.decode).not.toHaveBeenCalled();
  });
});
