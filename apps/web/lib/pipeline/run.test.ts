import { EditorProjectSchema, type Word } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { MemoryAudioStore, type AudioStore } from '../audio/audio-store';
import type { DecodedAudio } from '../audio/decode';
import { INTAKE_LIMITS, INTAKE_MESSAGES } from '../audio/intake';
import { MemoryProjectRepository, type ProjectRepository } from '../projects/repository';
import { cleanupSummary, PipelineError, transcriptSummary, type PipelineEvent } from './events';
import { runPipeline, type PipelineDeps, type PipelineInput, type TranscribeOutput } from './run';
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
      { type: 'step', step: 'moments', state: 'skipped', detail: 'Up next' },
      { type: 'step', step: 'suggest', state: 'skipped', detail: 'Up next' },
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
    expect(p.slots).toEqual([]);
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
      step: 'suggest',
      message: "Couldn't save the project in this browser.",
    });
    expect(h.audioStore.size).toBe(0);
    expect(h.events.slice(-2)).toEqual([
      {
        type: 'step',
        step: 'suggest',
        state: 'failed',
        detail: "Couldn't save the project in this browser.",
      },
      { type: 'error', step: 'suggest', message: "Couldn't save the project in this browser." },
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
      step: 'suggest',
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
      step: 'suggest',
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
