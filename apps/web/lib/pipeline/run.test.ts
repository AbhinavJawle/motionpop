import { EditorProjectSchema, timelineIssues, type Word } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { detectLocal } from '@motionpop/ai';
import { MemoryAudioStore, type AudioStore } from '../audio/audio-store';
import type { DecodedAudio } from '../audio/decode';
import { INTAKE_LIMITS, INTAKE_MESSAGES } from '../audio/intake';
import { MemoryProjectRepository, type ProjectRepository } from '../projects/repository';
import { validateParams } from '../slots/validate-params';
import { cleanupSummary, PipelineError, transcriptSummary, type PipelineEvent } from './events';
import {
  rulesOnly,
  runPipeline,
  type PipelineDeps,
  type PipelineInput,
  type TranscribeOutput,
} from './run';
import { sampleInput } from './sample';

const PROJECT_ID = 'p-test';

function w(i: number, text: string, startMs: number, endMs: number): Word {
  return { i, text, startMs, endMs, conf: 1, filler: text === 'um' || text === 'uh' };
}

/**
 * 6 s of audio. One filler (1000-1300) and one long pause (1800-4000), so cleanup cuts
 * [1000,1300] and [1950,3850]: 2200 ms (37 %), leaving 3800 ms.
 */
const CUT_WORDS: Word[] = [
  w(0, 'hello', 500, 900),
  w(1, 'um', 1000, 1300),
  w(2, 'world', 1400, 1800),
  w(3, 'again', 4000, 5600),
];
const CUT_DURATION = 6000;
const CLEANED_DURATION = 3800;

/** Gaps all under 700 ms, nothing to cut. */
const CLEAN_WORDS: Word[] = [w(0, 'hello', 0, 500), w(1, 'world', 600, 1100)];

/** One huge trailing gap: the cuts would be well over 40 %. */
const TOO_MUCH_WORDS: Word[] = [w(0, 'hello', 0, 500), w(1, 'world', 600, 900)];

function pcm(durationMs: number, level = 0.1): DecodedAudio {
  return {
    pcm16k: new Float32Array(1600).fill(level),
    pcm24k: new Float32Array(2400).fill(level),
    durationMs,
  };
}

function audioFile(type = 'audio/wav'): Blob {
  return new Blob(['not really audio'], { type });
}

function makeInput(over: Partial<PipelineInput> = {}): PipelineInput {
  return { file: audioFile(), name: 'my voice.wav', source: 'upload', ...over };
}

interface Harness {
  deps: PipelineDeps;
  decode: ReturnType<typeof vi.fn<PipelineDeps['decode']>>;
  transcribe: ReturnType<typeof vi.fn<PipelineDeps['transcribe']>>;
  renderCleaned: ReturnType<typeof vi.fn<PipelineDeps['renderCleaned']>>;
  audioStore: MemoryAudioStore;
  repo: MemoryProjectRepository;
  events: PipelineEvent[];
  onEvent: (e: PipelineEvent) => void;
}

function makeHarness(
  opts: {
    words?: Word[];
    durationMs?: number;
    decoded?: DecodedAudio;
    audioStore?: MemoryAudioStore;
    repo?: MemoryProjectRepository;
  } = {},
): Harness {
  const words = opts.words ?? CUT_WORDS;
  const durationMs = opts.durationMs ?? CUT_DURATION;
  const audioStore = opts.audioStore ?? new MemoryAudioStore();
  const repo = opts.repo ?? new MemoryProjectRepository();
  const decode = vi.fn<PipelineDeps['decode']>(async () => opts.decoded ?? pcm(durationMs));
  const transcribe = vi.fn<PipelineDeps['transcribe']>(async (_pcm, _ms, onProgress) => {
    onProgress({ stage: 'loading' });
    onProgress({ stage: 'transcribing', percent: 50 });
    const out: TranscribeOutput = { words, ranOn: 'device', timingQuality: 'word' };
    return out;
  });
  const renderCleaned = vi.fn<PipelineDeps['renderCleaned']>(
    async (_pcm, sampleRate, cuts) =>
      new Float32Array(
        Math.round(
          ((durationMs - cuts.reduce((s, c) => s + c.endMs - c.startMs, 0)) * sampleRate) / 1000,
        ),
      ),
  );
  const events: PipelineEvent[] = [];
  const deps: PipelineDeps = {
    decode,
    transcribe,
    renderCleaned,
    encodeWav: (samples) => new ArrayBuffer(samples.length),
    audioStore,
    repo,
    now: () => 1_700_000_000_000,
    newId: () => PROJECT_ID,
    styleId: 'style-test',
    detect: (words, spans) => Promise.resolve(detectLocal(words, spans)),
    validateParams,
  };
  return {
    deps,
    decode,
    transcribe,
    renderCleaned,
    audioStore,
    repo,
    events,
    onEvent: (e) => events.push(e),
  };
}

async function expectNothingStored(h: Harness): Promise<void> {
  expect(h.audioStore.size).toBe(0);
  expect(await h.repo.load(PROJECT_ID)).toEqual({ ok: false, error: 'not-found' });
}

const lastError = (events: PipelineEvent[]) =>
  events.find((e): e is Extract<PipelineEvent, { type: 'error' }> => e.type === 'error');

describe('runPipeline: normal upload', () => {
  it('emits the events in order', async () => {
    const h = makeHarness();
    const result = await runPipeline(makeInput(), h.deps, h.onEvent);
    expect(result).toEqual({ projectId: PROJECT_ID });

    const retimed = [
      { ...CUT_WORDS[0]!, i: 0, startMs: 500, endMs: 900 },
      { ...CUT_WORDS[2]!, i: 1, startMs: 1100, endMs: 1500 },
      { ...CUT_WORDS[3]!, i: 2, startMs: 1800, endMs: 3400 },
    ];
    expect(h.events).toEqual([
      { type: 'step', step: 'transcribe', state: 'active' },
      { type: 'progress', step: 'transcribe', stage: 'loading' },
      { type: 'progress', step: 'transcribe', stage: 'transcribing', percent: 50 },
      { type: 'words', words: CUT_WORDS, durationMs: CUT_DURATION },
      { type: 'step', step: 'transcribe', state: 'done', detail: '4 words · 6.0s' },
      { type: 'step', step: 'clean', state: 'active' },
      { type: 'words', words: retimed, durationMs: CLEANED_DURATION },
      { type: 'step', step: 'clean', state: 'done', detail: 'Removed 1 um and 1 long pause' },
      { type: 'step', step: 'moments', state: 'active' },
      { type: 'step', step: 'moments', state: 'done', detail: 'No moments found' },
      { type: 'step', step: 'suggest', state: 'active' },
      // Changed by spec 07 task 27: the opening line is a hook-statement draft.
      {
        type: 'slots',
        slots: [
          expect.objectContaining({
            componentId: 'hook-statement',
            status: 'suggested',
            startMs: 500,
            endMs: 3400,
          }),
        ],
      },
      { type: 'step', step: 'suggest', state: 'done', detail: '1 slot found' },
      // Spec 07 task 27: the director plans the video (no model here: the built-in rules).
      { type: 'step', step: 'plan', state: 'active', detail: 'Device first', route: 'device' },
      {
        type: 'step',
        step: 'plan',
        state: 'done',
        detail: 'Planned with built-in rules · peak at 0.5s',
      },
      { type: 'done', projectId: PROJECT_ID },
    ]);
  });

  it('saves a valid project with the original and cleaned audio', async () => {
    const h = makeHarness();
    const input = makeInput({ name: 'my voice.wav' });
    await runPipeline(input, h.deps, h.onEvent);

    const loaded = await h.repo.load(PROJECT_ID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const p = loaded.project;
    expect(EditorProjectSchema.safeParse(p).success).toBe(true);
    // Changed by spec 07 task 27: the opening line is a suggested hook-statement (no version
    // until auto-fill writes one).
    expect(p.slots).toMatchObject([
      {
        componentId: 'hook-statement',
        status: 'suggested',
        params: { content: { line: 'hello world again' }, beats: [{ cue: 'line', word: 0 }] },
        needsInput: ['content'],
      },
    ]);
    expect(p.versions).toEqual([]);
    expect(p.title).toBe('my voice');
    expect(p.durationMs).toBe(CLEANED_DURATION);

    const v = p.voiceover!;
    expect(v.source).toBe('upload');
    expect(v.durationMs).toBe(CLEANED_DURATION);
    expect(v.originalDurationMs).toBe(CUT_DURATION);
    expect(v.originalSrc).toBeDefined();
    expect(v.src).not.toBe(v.originalSrc);
    expect(v.cleanup).toEqual({ fillersRemoved: 1, pausesShortened: 1, enabled: true });
    expect(await h.audioStore.get(v.originalSrc!)).toBe(input.file);
    const cleaned = await h.audioStore.get(v.src);
    expect(cleaned?.type).toBe('audio/wav');
    expect(h.audioStore.size).toBe(2);

    expect(p.originalTranscript?.words).toEqual(CUT_WORDS);
    expect(p.originalTranscript?.cleaned).toBe(false);
    expect(p.transcript?.cleaned).toBe(true);
    expect(p.transcript?.words.map((x) => [x.text, x.startMs, x.endMs])).toEqual([
      ['hello', 500, 900],
      ['world', 1100, 1500],
      ['again', 1800, 3400],
    ]);
    expect(p.transcript?.words.map((x) => x.i)).toEqual([0, 1, 2]);
    expect(p.transcript?.ranOn).toBe('device');
  });

  it('renders the cleaned audio once, with the cuts and the output sample rate', async () => {
    const h = makeHarness();
    await runPipeline(makeInput(), h.deps, h.onEvent);
    expect(h.renderCleaned).toHaveBeenCalledTimes(1);
    const [, rate, cuts] = h.renderCleaned.mock.calls[0]!;
    expect(rate).toBe(24_000);
    expect(cuts).toEqual([
      { startMs: 1000, endMs: 1300 },
      { startMs: 1950, endMs: 3850 },
    ]);
    const out = await h.renderCleaned.mock.results[0]!.value;
    expect(out.length).toBe(CLEANED_DURATION * 24);
  });
});

describe('runPipeline: cleanup outcomes', () => {
  it('skips rendering with no cuts and keeps the original as src', async () => {
    const h = makeHarness({ words: CLEAN_WORDS, durationMs: 1300 });
    await runPipeline(makeInput(), h.deps, h.onEvent);
    expect(h.renderCleaned).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      type: 'step',
      step: 'clean',
      state: 'done',
      detail: 'Nothing to clean up',
    });
    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    const v = loaded.project.voiceover!;
    expect(v.src).toBe(v.originalSrc);
    expect(v.cleanup?.enabled).toBe(false);
    expect(loaded.project.durationMs).toBe(1300);
    expect(loaded.project.transcript?.cleaned).toBe(false);
    expect(h.audioStore.size).toBe(1);
  });

  it('keeps the audio as it is when cleanup would cut over 40 %', async () => {
    const h = makeHarness({ words: TOO_MUCH_WORDS, durationMs: 10_000 });
    await runPipeline(makeInput(), h.deps, h.onEvent);
    expect(h.renderCleaned).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      type: 'step',
      step: 'clean',
      state: 'done',
      detail: 'Kept your audio as it is',
    });
    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    const p = loaded.project;
    const v = p.voiceover!;
    expect(v.src).toBe(v.originalSrc);
    expect(v.cleanup).toEqual({
      fillersRemoved: 0,
      pausesShortened: 0,
      enabled: false,
      skipped: 'too-much',
    });
    expect(p.durationMs).toBe(10_000);
    expect(p.transcript?.words).toEqual(TOO_MUCH_WORDS);
  });
});

describe('runPipeline: intake errors', () => {
  async function expectIntakeError(h: Harness, input: PipelineInput, message: string) {
    await expect(runPipeline(input, h.deps, h.onEvent)).rejects.toMatchObject({
      name: 'PipelineError',
      step: 'intake',
      message,
    });
    expect(lastError(h.events)).toEqual({ type: 'error', step: 'intake', message });
    expect(h.events.some((e) => e.type === 'step' && e.state === 'failed')).toBe(false);
    expect(h.events.some((e) => e.type === 'done')).toBe(false);
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.renderCleaned).not.toHaveBeenCalled();
    await expectNothingStored(h);
  }

  it('rejects a file that is not audio before decoding', async () => {
    const h = makeHarness();
    await expectIntakeError(
      h,
      makeInput({ file: audioFile('text/plain'), name: 'notes.txt' }),
      INTAKE_MESSAGES['not-audio'],
    );
    expect(h.decode).not.toHaveBeenCalled();
    expect(h.events).toEqual([
      { type: 'error', step: 'intake', message: INTAKE_MESSAGES['not-audio'] },
    ]);
  });

  it('rejects an empty file before decoding', async () => {
    const h = makeHarness();
    await expectIntakeError(
      h,
      makeInput({ file: new Blob([], { type: 'audio/wav' }) }),
      INTAKE_MESSAGES['not-audio'],
    );
    expect(h.decode).not.toHaveBeenCalled();
  });

  it('rejects a file over 50 MB before decoding', async () => {
    const h = makeHarness();
    const big = audioFile();
    Object.defineProperty(big, 'size', { value: INTAKE_LIMITS.maxBytes + 1 });
    await expectIntakeError(h, makeInput({ file: big }), INTAKE_MESSAGES['too-large']);
    expect(h.decode).not.toHaveBeenCalled();
  });

  it('rejects audio over 20 minutes after decoding', async () => {
    const h = makeHarness({ decoded: pcm(INTAKE_LIMITS.maxDurationMs + 1) });
    await expectIntakeError(h, makeInput(), INTAKE_MESSAGES['too-long']);
    expect(h.decode).toHaveBeenCalledTimes(1);
  });

  it('accepts audio of exactly 20 minutes', async () => {
    const h = makeHarness({ decoded: pcm(INTAKE_LIMITS.maxDurationMs), words: CLEAN_WORDS });
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).resolves.toBeDefined();
  });

  it('rejects silent audio', async () => {
    const h = makeHarness({ decoded: pcm(CUT_DURATION, 0) });
    await expectIntakeError(h, makeInput(), "I couldn't hear anything in that file.");
  });

  it('rejects a file the browser cannot decode', async () => {
    const h = makeHarness();
    h.decode.mockRejectedValueOnce(new Error('EncodingError'));
    await expectIntakeError(h, makeInput(), "I couldn't read that file. Try MP3, WAV or M4A.");
  });
});

describe('runPipeline: transcribe failures', () => {
  it('reports "No words found" on the transcribe step', async () => {
    const h = makeHarness({ words: [] });
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toMatchObject({
      step: 'transcribe',
      message: 'No words found',
    });
    expect(h.events.slice(-2)).toEqual([
      { type: 'step', step: 'transcribe', state: 'failed', detail: 'No words found' },
      { type: 'error', step: 'transcribe', message: 'No words found' },
    ]);
    expect(h.events.some((e) => e.type === 'words')).toBe(false);
    expect(h.renderCleaned).not.toHaveBeenCalled();
    await expectNothingStored(h);
  });

  it('reports a transcribe exception on the transcribe step', async () => {
    const h = makeHarness();
    h.transcribe.mockRejectedValueOnce(new Error('Needs connection to download the voice model'));
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toBeInstanceOf(PipelineError);
    expect(lastError(h.events)).toEqual({
      type: 'error',
      step: 'transcribe',
      message: 'Needs connection to download the voice model',
    });
    await expectNothingStored(h);
  });

  it('reports a render exception on the clean step', async () => {
    const h = makeHarness();
    h.renderCleaned.mockRejectedValueOnce(new Error('render broke'));
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toMatchObject({
      step: 'clean',
    });
    expect(h.events).toContainEqual({
      type: 'step',
      step: 'clean',
      state: 'failed',
      detail: 'render broke',
    });
    await expectNothingStored(h);
  });
});

describe('runPipeline: cancel', () => {
  type Stage = 'decode' | 'transcribe' | 'render' | 'before store';

  async function runAbortedAt(stage: Stage): Promise<Harness> {
    const ctrl = new AbortController();
    const h = makeHarness();
    if (stage === 'decode') {
      h.decode.mockImplementationOnce(async () => {
        ctrl.abort();
        return pcm(CUT_DURATION);
      });
    }
    if (stage === 'transcribe') {
      h.transcribe.mockImplementationOnce(async () => {
        ctrl.abort();
        return { words: CUT_WORDS, ranOn: 'device', timingQuality: 'word' };
      });
    }
    if (stage === 'render') {
      h.renderCleaned.mockImplementationOnce(async () => {
        ctrl.abort();
        return new Float32Array(10);
      });
    }
    const onEvent = (e: PipelineEvent) => {
      h.onEvent(e);
      if (stage === 'before store' && e.type === 'step' && e.step === 'suggest') ctrl.abort();
    };
    await expect(runPipeline(makeInput(), h.deps, onEvent, ctrl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    return h;
  }

  it.each(['decode', 'transcribe', 'render', 'before store'] as const)(
    'abort during %s rejects with AbortError and stores nothing',
    async (stage) => {
      const h = await runAbortedAt(stage);
      expect(h.events.some((e) => e.type === 'done' || e.type === 'error')).toBe(false);
      await expectNothingStored(h);
    },
  );

  it('abort during decode stops before transcribing', async () => {
    const h = await runAbortedAt('decode');
    expect(h.transcribe).not.toHaveBeenCalled();
  });

  it('abort during transcribe stops before rendering', async () => {
    const h = await runAbortedAt('transcribe');
    expect(h.renderCleaned).not.toHaveBeenCalled();
  });

  it('the AbortError is a DOMException, not a PipelineError', async () => {
    const ctrl = new AbortController();
    const h = makeHarness();
    h.decode.mockImplementationOnce(async () => {
      ctrl.abort();
      return pcm(CUT_DURATION);
    });
    const err: unknown = await runPipeline(makeInput(), h.deps, h.onEvent, ctrl.signal).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DOMException);
    expect(err).not.toBeInstanceOf(PipelineError);
  });
});

describe('runPipeline: store failures', () => {
  // Changed by spec 07 task 27: the plan card is the last step now, so a failed save shows there
  // (it was the suggest card).
  it('deletes the audio already written when repo.save fails', async () => {
    const h = makeHarness();
    const failing: ProjectRepository = {
      load: (id) => h.repo.load(id),
      restoreBackup: (id) => h.repo.restoreBackup(id),
      save: async () => {
        throw new Error('quota exceeded');
      },
    };
    h.deps.repo = failing;
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toMatchObject({
      name: 'PipelineError',
      step: 'plan',
      message: "Couldn't save the project in this browser.",
    });
    expect(h.audioStore.size).toBe(0);
    expect(h.events.slice(-2)).toEqual([
      {
        type: 'step',
        step: 'plan',
        state: 'failed',
        detail: "Couldn't save the project in this browser.",
      },
      { type: 'error', step: 'plan', message: "Couldn't save the project in this browser." },
    ]);
    expect(h.events.some((e) => e.type === 'done')).toBe(false);
    expect(await h.repo.load(PROJECT_ID)).toEqual({ ok: false, error: 'not-found' });
  });

  it('deletes the original when writing the cleaned audio fails', async () => {
    const inner = new MemoryAudioStore();
    let puts = 0;
    const flaky: AudioStore = {
      put: async (blob) => {
        puts += 1;
        if (puts === 2) throw new Error('disk full');
        return inner.put(blob);
      },
      get: (ref) => inner.get(ref),
      delete: (ref) => inner.delete(ref),
    };
    const h = makeHarness({ audioStore: inner });
    h.deps.audioStore = flaky;
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toMatchObject({
      step: 'plan',
    });
    expect(inner.size).toBe(0);
    expect(await h.repo.load(PROJECT_ID)).toEqual({ ok: false, error: 'not-found' });
  });

  it('still reports the save failure if deleting a ref also fails', async () => {
    const inner = new MemoryAudioStore();
    const h = makeHarness({ audioStore: inner });
    h.deps.audioStore = {
      put: (blob) => inner.put(blob),
      get: (ref) => inner.get(ref),
      delete: async () => {
        throw new Error('delete failed');
      },
    };
    h.deps.repo = {
      load: (id) => h.repo.load(id),
      restoreBackup: (id) => h.repo.restoreBackup(id),
      save: async () => {
        throw new Error('nope');
      },
    };
    await expect(runPipeline(makeInput(), h.deps, h.onEvent)).rejects.toMatchObject({
      step: 'plan',
      message: "Couldn't save the project in this browser.",
    });
  });
});

describe('runPipeline: sample input', () => {
  it('uses the given words without calling transcribe, labelled as a sample', async () => {
    const s = sampleInput();
    const h = makeHarness({ words: [], durationMs: 18_000 });
    await runPipeline(
      { file: s.file, name: s.name, source: 'sample', words: s.words },
      h.deps,
      h.onEvent,
    );
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.events.some((e) => e.type === 'progress')).toBe(false);

    const done = h.events.find(
      (e) => e.type === 'step' && e.step === 'transcribe' && e.state === 'done',
    );
    expect(done).toMatchObject({ detail: `Sample transcript · ${s.words.length} words · 18.0s` });

    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    expect(loaded.project.voiceover?.source).toBe('sample');
    expect(loaded.project.title).toBe('Sample voiceover');
    expect(loaded.project.originalTranscript?.words).toEqual(s.words);
    expect(loaded.project.originalTranscript?.ranOn).toBe('device');
  });
});

describe('runPipeline: slot detection (spec 06)', () => {
  const runSample = async (over: Partial<PipelineDeps> = {}) => {
    const s = sampleInput();
    const h = makeHarness({ words: [], durationMs: 18_000 });
    Object.assign(h.deps, over);
    const result = runPipeline(
      { file: s.file, name: s.name, source: 'sample', words: s.words },
      h.deps,
      h.onEvent,
    );
    return { h, result };
  };

  // Changed by spec 07 task 27: the sample's number is a ready stat-punch (was big-number) and
  // its opening line a suggested hook-statement for auto-fill. The closing claim ends the
  // transcript too soon to be read, so it is not a hook.
  it('tags, detects and saves the sample stat-punch as a ready slot with a v1 version', async () => {
    const { h, result } = await runSample();
    await result;
    const step = (name: string) =>
      h.events.find((e) => e.type === 'step' && e.step === name && e.state === 'done');
    expect(step('moments')).toMatchObject({ detail: 'Found 3 moments' });
    // Three since the coverage pass (2026-11-16): the closing stretch gets its spoken line.
    expect(step('suggest')).toMatchObject({ detail: '3 slots found' });
    const slotsEvent = h.events.find((e) => e.type === 'slots');
    expect(slotsEvent).toMatchObject({
      slots: [
        { componentId: 'hook-statement', status: 'suggested' },
        { componentId: 'stat-punch', status: 'ready' },
        { componentId: 'hook-statement', status: 'suggested' },
      ],
    });

    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    const slot = loaded.project.slots[1];
    expect(slot).toMatchObject({
      id: 's-2',
      componentId: 'stat-punch',
      status: 'ready',
      params: {
        content: { value: 40, suffix: '%', label: 'Our revenue grew' },
        beats: [{ cue: 'number', word: 2 }],
      },
      currentVersionId: 'v-s-2-1',
    });
    expect(loaded.project.versions).toEqual([
      expect.objectContaining({ id: 'v-s-2-1', slotId: 's-2', source: 'user', label: 'v1' }),
    ]);
    expect(timelineIssues(loaded.project)).toEqual([]);
  });

  it('plans the sample with the built-in rules: the stat is the peak, energy rises to it', async () => {
    const { h, result } = await runSample();
    await result;
    const done = h.events.find((e) => e.type === 'step' && e.step === 'plan' && e.state === 'done');
    expect(done).toMatchObject({
      detail: expect.stringMatching(/^Planned with built-in rules · peak at \d/),
    });
    expect(done).not.toHaveProperty('route');
    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    const [hook, stat] = loaded.project.slots;
    expect(stat).toMatchObject({ params: { variant: 'hero' }, energy: 'lively' });
    expect(hook).toMatchObject({ energy: 'steady' });
    expect(['center', 'left', 'punch']).toContain(hook?.params.variant);
    // The v1 version carries the planned score.
    expect(loaded.project.versions[0]?.params).toMatchObject({ variant: 'hero' });
  });

  it("shows the model's route and falls back to the rules when the director throws", async () => {
    const device = await runSample({
      direct: (req) =>
        rulesOnly(req).then((r) => ({ ...r, source: 'device' as const, model: 'nano' })),
    });
    await device.result;
    expect(
      device.h.events.find((e) => e.type === 'step' && e.step === 'plan' && e.state === 'done'),
    ).toMatchObject({ detail: expect.stringMatching(/^Planned on your device/), route: 'device' });

    const broken = await runSample({ direct: () => Promise.reject(new Error('boom')) });
    await broken.result;
    expect(
      broken.h.events.find((e) => e.type === 'step' && e.step === 'plan' && e.state === 'done'),
    ).toMatchObject({ detail: expect.stringMatching(/^Planned with built-in rules/) });
  });

  it('stores on-device prosody with one stress value per cleaned word', async () => {
    const { h, result } = await runSample();
    await result;
    const loaded = await h.repo.load(PROJECT_ID);
    if (!loaded.ok) throw new Error('not saved');
    const t = loaded.project.transcript;
    expect(t.prosody?.v).toBe(1);
    expect(t.prosody?.stress).toHaveLength(t.words.length);
  });

  it('passes the cleaned words and the tagged spans to the injected detector', async () => {
    const detect = vi.fn<PipelineDeps['detect']>(() => Promise.resolve([]));
    const { result } = await runSample({ detect });
    await result;
    const [words, spans] = detect.mock.calls[0]!;
    expect(words.every((w) => !w.filler)).toBe(true);
    expect(spans.map((sp) => sp.kind)).toEqual(['comparison', 'number', 'year']);
  });

  it('shows a detector failure on the suggest card and saves nothing', async () => {
    const { h, result } = await runSample({
      detect: () => Promise.reject(new Error('detector exploded')),
    });
    await expect(result).rejects.toMatchObject({ step: 'suggest' });
    expect(h.events).toContainEqual({
      type: 'step',
      step: 'suggest',
      state: 'failed',
      detail: 'detector exploded',
    });
    await expectNothingStored(h);
  });
});

describe('summaries', () => {
  it.each([
    [0, 0, 'Nothing to clean up'],
    [1, 0, 'Removed 1 um'],
    [2, 0, 'Removed 2 ums'],
    [0, 1, 'Removed 1 long pause'],
    [0, 3, 'Removed 3 long pauses'],
    [1, 1, 'Removed 1 um and 1 long pause'],
    [7, 3, 'Removed 7 ums and 3 long pauses'],
  ])('cleanupSummary(%i, %i) = %s', (fillers, pauses, expected) => {
    expect(cleanupSummary(fillers, pauses)).toBe(expected);
  });

  it.each([
    [0, 0, '0 words · 0.0s'],
    [1, 1000, '1 word · 1.0s'],
    [2, 1500, '2 words · 1.5s'],
    [214, 18_000, '214 words · 18.0s'],
  ])('transcriptSummary(%i, %i) = %s', (words, ms, expected) => {
    expect(transcriptSummary(words, ms)).toBe(expected);
  });
});

describe('runPipeline: Start draft and pending intake (spec 11 task 8)', () => {
  it('honours the title, format and style of the draft', async () => {
    const h = makeHarness();
    await runPipeline(
      makeInput({ title: '  My launch  ', format: '9:16', styleId: 'paper-collage' }),
      h.deps,
      h.onEvent,
    );
    const r = await h.repo.load(PROJECT_ID);
    if (!r.ok) throw new Error('not saved');
    expect(r.project).toMatchObject({
      title: 'My launch',
      format: '9:16',
      styleId: 'paper-collage',
    });
  });

  it('skips the cut list for a generated voice and keeps its script', async () => {
    const h = makeHarness();
    const tts = { voiceId: 'warm', speed: 1, script: 'hello um world again' };
    await runPipeline(makeInput({ source: 'tts', cleanup: false, tts }), h.deps, h.onEvent);
    expect(h.renderCleaned).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      type: 'step',
      step: 'clean',
      state: 'done',
      detail: 'Skipped for generated voices',
    });
    const r = await h.repo.load(PROJECT_ID);
    if (!r.ok) throw new Error('not saved');
    expect(r.project.durationMs).toBe(CUT_DURATION);
    expect(r.project.voiceover).toMatchObject({ source: 'tts', tts, cleanup: { enabled: false } });
  });

  it('reuses a stored take as the original, and leaves it in place when the run fails', async () => {
    const h = makeHarness();
    const storedRef = await h.audioStore.put(audioFile());
    await runPipeline(makeInput({ storedRef, source: 'record' }), h.deps, h.onEvent);
    const r = await h.repo.load(PROJECT_ID);
    if (!r.ok) throw new Error('not saved');
    expect(r.project.voiceover.originalSrc).toBe(storedRef);
    expect(h.audioStore.size).toBe(2); // the take + the cleaned audio, no second copy

    const f = makeHarness();
    const ref = await f.audioStore.put(audioFile());
    vi.spyOn(f.repo, 'save').mockRejectedValue(new Error('quota'));
    await expect(
      runPipeline(makeInput({ storedRef: ref, source: 'record' }), f.deps, f.onEvent),
    ).rejects.toThrow();
    expect(await f.audioStore.get(ref)).not.toBeNull();
    expect(f.audioStore.size).toBe(1);
  });

  it('signed in, files a stored take under the project and drops the hand-off copy only after the save', async () => {
    const places: Array<string | undefined> = [];
    const syncing = (inner: MemoryAudioStore): AudioStore => ({
      put: (blob, place) => {
        places.push(place?.projectId);
        return inner.put(blob);
      },
      get: (ref) => inner.get(ref),
      delete: (ref) => inner.delete(ref),
      syncs: () => true,
    });
    const h = makeHarness();
    h.deps.audioStore = syncing(h.audioStore);
    const storedRef = await h.audioStore.put(audioFile());
    await runPipeline(makeInput({ storedRef, source: 'record' }), h.deps, h.onEvent);
    const r = await h.repo.load(PROJECT_ID);
    if (!r.ok) throw new Error('not saved');
    expect(places).toEqual([PROJECT_ID, PROJECT_ID]);
    expect(r.project.voiceover.originalSrc).not.toBe(storedRef);
    expect(await h.audioStore.get(storedRef)).toBeNull();
    expect(await h.audioStore.get(r.project.voiceover.originalSrc ?? '')).not.toBeNull();

    const f = makeHarness();
    f.deps.audioStore = syncing(f.audioStore);
    const ref = await f.audioStore.put(audioFile());
    vi.spyOn(f.repo, 'save').mockRejectedValue(new Error('quota'));
    await expect(
      runPipeline(makeInput({ storedRef: ref, source: 'record' }), f.deps, f.onEvent),
    ).rejects.toThrow();
    expect(await f.audioStore.get(ref)).not.toBeNull();
    expect(f.audioStore.size).toBe(1);
  });
});
