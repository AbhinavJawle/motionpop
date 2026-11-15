import { postPass, tagSpans, type TaggedSpan, type ValidatedParams } from '@motionpop/ai';
import {
  EditorProjectSchema,
  type EditorProject,
  type Slot,
  type SlotSuggestion,
  type Transcript,
  type Version,
  type Word,
} from '@motionpop/schemas';
import type { AudioStore } from '../audio/audio-store';
import { isSilent, OUTPUT_SAMPLE_RATE, type DecodedAudio } from '../audio/decode';
import { buildEdl, cleanedDuration, retimeWords } from '../audio/edl';
import { checkDuration, validateIntake } from '../audio/intake';
import type { ProjectRepository } from '../projects/repository';
import {
  cleanupSummary,
  momentsSummary,
  PipelineError,
  slotsSummary,
  transcriptSummary,
  type PipelineEvent,
  type PipelineStep,
} from './events';

export interface PipelineInput {
  file: Blob;
  /** File name, for intake checks and the project title. */
  name: string;
  source: 'upload' | 'record' | 'sample';
  /** Use these words instead of transcribing (the synthesized sample, D-024). */
  words?: Word[];
}

export interface TranscribeOutput {
  words: Word[];
  ranOn: Transcript['ranOn'];
  timingQuality: Transcript['timingQuality'];
}

export interface PipelineDeps {
  decode(file: Blob): Promise<DecodedAudio>;
  transcribe(
    pcm16k: Float32Array,
    durationMs: number,
    onProgress: (p: { stage: 'loading' | 'transcribing'; percent?: number }) => void,
  ): Promise<TranscribeOutput>;
  renderCleaned(
    pcm: Float32Array,
    sampleRate: number,
    cuts: ReadonlyArray<{ startMs: number; endMs: number }>,
  ): Promise<Float32Array>;
  encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer;
  audioStore: AudioStore;
  repo: ProjectRepository;
  now(): number;
  newId(): string;
  styleId: string;
  /** Slot detection (spec 06): the deterministic detector, or AI through the router. */
  detect(words: Word[], spans: TaggedSpan[]): Promise<SlotSuggestion[]>;
  /** Component param validation for the post-pass (fills defaults, lists `needsInput`). */
  validateParams(componentId: string, params: Record<string, unknown>): ValidatedParams;
}

/** A first version for every ready slot, so the inspector history works (spec 06 design). */
export function firstVersions(
  slots: readonly Slot[],
  now: number,
): { slots: Slot[]; versions: Version[] } {
  const versions: Version[] = [];
  const out = slots.map((s) => {
    if (s.status !== 'ready') return s;
    const v: Version = {
      id: `v-${s.id}-1`,
      slotId: s.id,
      componentId: s.componentId,
      params: s.params,
      source: 'user',
      costCredits: 0,
      createdAt: now,
      label: 'v1',
    };
    versions.push(v);
    return { ...s, currentVersionId: v.id };
  });
  return { slots: out, versions };
}

function titleFrom(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return base.length > 0 ? base.slice(0, 80) : 'Untitled Project';
}

/**
 * Voiceover → editor project (spec 05). Emits step events as it goes; nothing is written
 * until the final store step, and a failed store removes what it already wrote, so a cancel
 * or a failure never leaves half a project behind.
 */
export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
  onEvent: (e: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<{ projectId: string }> {
  let step: PipelineStep | 'intake' = 'intake';
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Processing was cancelled', 'AbortError');
  };
  const fail = (message: string): never => {
    throw new PipelineError(step, message);
  };
  // Problems with the file itself, found while decoding, are intake errors (R1.2).
  const rejectFile = (message: string): never => {
    throw new PipelineError('intake', message);
  };

  try {
    // Intake (R1).
    const intake = validateIntake({
      name: input.name,
      type: input.file.type,
      size: input.file.size,
    });
    if (!intake.ok) rejectFile(intake.message);

    step = 'transcribe';
    onEvent({ type: 'step', step, state: 'active' });
    let audio: DecodedAudio;
    try {
      audio = await deps.decode(input.file);
    } catch {
      return rejectFile("I couldn't read that file. Try MP3, WAV or M4A.");
    }
    checkAbort();
    const duration = checkDuration(audio.durationMs);
    if (!duration.ok) {
      rejectFile(duration.message);
    }
    if (isSilent(audio.pcm16k)) {
      rejectFile("I couldn't hear anything in that file.");
    }

    // Transcribe (R2).
    const t: TranscribeOutput = input.words
      ? { words: input.words, ranOn: 'device', timingQuality: 'word' }
      : await deps.transcribe(audio.pcm16k, audio.durationMs, (p) =>
          onEvent({ type: 'progress', step: 'transcribe', ...p }),
        );
    checkAbort();
    if (t.words.length === 0) fail('No words found');
    onEvent({ type: 'words', words: t.words, durationMs: audio.durationMs });
    onEvent({
      type: 'step',
      step,
      state: 'done',
      detail:
        (input.words ? 'Sample transcript · ' : '') +
        transcriptSummary(t.words.length, audio.durationMs),
    });

    // Clean (R3).
    step = 'clean';
    onEvent({ type: 'step', step, state: 'active' });
    const edl = buildEdl(t.words, audio.durationMs);
    const cuts = edl.cuts;
    const cleanedMs = cleanedDuration(audio.durationMs, cuts);
    const cleanedWords = retimeWords(t.words, cuts);
    const cleanedPcm =
      cuts.length > 0 ? await deps.renderCleaned(audio.pcm24k, OUTPUT_SAMPLE_RATE, cuts) : null;
    checkAbort();
    onEvent({ type: 'words', words: cleanedWords, durationMs: cleanedMs });
    onEvent({
      type: 'step',
      step,
      state: 'done',
      detail: edl.skipped
        ? 'Kept your audio as it is'
        : cleanupSummary(edl.fillersRemoved, edl.pausesShortened),
    });

    // Moments (spec 06 R1): the deterministic tagger on the cleaned words.
    step = 'moments';
    onEvent({ type: 'step', step, state: 'active' });
    const spans = tagSpans(cleanedWords);
    onEvent({ type: 'step', step, state: 'done', detail: momentsSummary(spans.length) });

    // Suggest (spec 06 R2-R3): detect, then the post-pass makes them timeline-valid.
    step = 'suggest';
    onEvent({ type: 'step', step, state: 'active' });
    const suggestions = await deps.detect(cleanedWords, spans);
    checkAbort();
    const placed = postPass({
      words: cleanedWords,
      suggestions,
      validate: deps.validateParams,
    });
    onEvent({ type: 'slots', slots: placed });

    // Store (spec 05 R4). Last chance to cancel before anything is written. A failure here
    // shows on the suggest card, which stays active until the project is saved.
    checkAbort();
    const written: string[] = [];
    try {
      const originalSrc = await deps.audioStore.put(input.file);
      written.push(originalSrc);
      const src = cleanedPcm
        ? await deps.audioStore.put(
            new Blob([deps.encodeWav(cleanedPcm, OUTPUT_SAMPLE_RATE)], { type: 'audio/wav' }),
          )
        : originalSrc;
      if (src !== originalSrc) written.push(src);

      const now = deps.now();
      const id = deps.newId();
      const transcript = (words: Word[], cleaned: boolean): Transcript => ({
        words,
        language: 'en',
        ranOn: t.ranOn,
        timingQuality: t.timingQuality,
        cleaned,
      });
      const project: EditorProject = EditorProjectSchema.parse({
        schemaVersion: 1,
        id,
        title: titleFrom(input.name),
        format: '16:9',
        fps: 30,
        styleId: deps.styleId,
        durationMs: cleanedMs,
        voiceover: {
          src,
          durationMs: cleanedMs,
          source: input.source,
          originalSrc,
          originalDurationMs: audio.durationMs,
          cleanup: {
            fillersRemoved: edl.fillersRemoved,
            pausesShortened: edl.pausesShortened,
            enabled: cuts.length > 0,
            ...(edl.skipped ? { skipped: edl.skipped } : {}),
          },
        },
        transcript: transcript(cleanedWords, cuts.length > 0),
        originalTranscript: transcript(t.words, false),
        ...firstVersions(placed, now),
        createdAt: now,
        updatedAt: now,
      });
      await deps.repo.save(project);
      onEvent({ type: 'step', step, state: 'done', detail: slotsSummary(placed.length) });
      onEvent({ type: 'done', projectId: id });
      return { projectId: id };
    } catch (err) {
      await Promise.all(written.map((ref) => deps.audioStore.delete(ref).catch(() => undefined)));
      throw err instanceof PipelineError
        ? err
        : new PipelineError(step, "Couldn't save the project in this browser.", { cause: err });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const e =
      err instanceof PipelineError
        ? err
        : new PipelineError(step, err instanceof Error ? err.message : String(err));
    if (e.step !== 'intake')
      onEvent({ type: 'step', step: e.step, state: 'failed', detail: e.message });
    onEvent({ type: 'error', step: e.step, message: e.message });
    throw e;
  }
}
