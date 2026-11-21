'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { fadeIn, springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { browserPipelineDeps } from '@/lib/pipeline/browser-deps';
import { PIPELINE_STEPS } from '@/lib/pipeline/events';
import {
  initialProcessing,
  reduceProcessing,
  STEP_TITLES,
  type ProcessingState,
} from '@/lib/pipeline/processing-state';
import { START_COPY } from '@/lib/dashboard/copy';
import { clearPending, takePending } from '@/lib/intake/pending';
import { runPipeline, type PipelineInput } from '@/lib/pipeline/run';
import { sampleInput, sampleWords } from '@/lib/pipeline/sample';
import { projectLibrary } from '@/lib/projects/use-project-list';
import { DropZone } from './drop-zone';
import { StepCard } from './step-card';
import { WordStrip } from './word-strip';

type Phase = 'checking' | 'drop' | 'running' | 'interrupted';

/** Pip's bubble once suggestions are in: "1 slot ready" / "3 slots ready". */
const slotsReady = (n: number) => `${n} ${n === 1 ? 'slot' : 'slots'} ready`;

type Action = { type: 'reset' } | { type: 'event'; event: Parameters<typeof reduceProcessing>[1] };
function reducer(s: ProcessingState, a: Action): ProcessingState {
  return a.type === 'reset' ? initialProcessing() : reduceProcessing(s, a.event);
}

/**
 * `/processing/[id]` (spec 05 R5). `new` shows the drop zone; a running pipeline shows Pip,
 * the four steps and the word strip, then opens the editor. An existing project id goes
 * straight to the editor; an unknown one was interrupted by a reload.
 */
export function ProcessingScreen({ id }: { id: string }) {
  const router = useRouter();
  const still = useStill();
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, dispatch] = useReducer(reducer, undefined, initialProcessing);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastInput = useRef<PipelineInput | null>(null);

  useEffect(() => {
    if (id === 'new') return;
    let live = true;
    void projectLibrary()
      .load(id)
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setPhase('interrupted');
        router.replace(`/editor/${encodeURIComponent(id)}`);
      });
    return () => {
      live = false;
    };
  }, [id, router]);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    (input: PipelineInput) => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      lastInput.current = input;
      dispatch({ type: 'reset' });
      setIntakeError(null);
      setPhase('running');
      runPipeline(
        input,
        browserPipelineDeps(),
        (event) => dispatch({ type: 'event', event }),
        ac.signal,
      )
        .then(async ({ projectId }) => {
          // The project owns the stored take now; only the hand-off goes.
          if (input.storedRef) await clearPending({ keepAudio: true });
          // Let the last check and Pip's celebration land before the editor opens.
          setTimeout(
            () => router.push(`/editor/${encodeURIComponent(projectId)}`),
            still ? 250 : 1100,
          );
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          // The card shows a friendly line; keep the real cause in the console for debugging.
          console.error('[processing]', err, err instanceof Error ? err.cause : undefined);
          // Problems with the file itself go back to the drop zone with the reason.
          if (err instanceof Error && 'step' in err && err.step === 'intake') {
            if (input.storedRef) void clearPending({ keepAudio: false });
            setIntakeError(err.message);
            setPhase('drop');
          }
        });
    },
    [router, still],
  );

  // `/processing/new` picks up a hand-off from the dashboard, Start or the recorder (spec 11).
  useEffect(() => {
    if (id !== 'new') return;
    let live = true;
    void takePending()
      .catch(() => null)
      .then((p) => {
        if (!live) return;
        if (!p) return setPhase('drop');
        start({
          file: p.blob,
          name: p.meta.name,
          source: p.meta.source,
          storedRef: p.meta.ref,
          // An untouched "Untitled Project" lets the file name title the project.
          ...(p.draft.title !== START_COPY.untitled ? { title: p.draft.title } : {}),
          // Let uploaded videos auto-match their native aspect ratio (9:16 / 16:9 / 1:1) unless
          // the creator explicitly chose a format pill on Start.
          ...(p.draft.formatChosen || !p.blob.type.startsWith('video/')
            ? { format: p.draft.format }
            : {}),
          cleanup: p.meta.cleanup,
          ...(p.draft.styleId ? { styleId: p.draft.styleId } : {}),
          ...(p.meta.tts ? { tts: p.meta.tts } : {}),
          ...(p.meta.words
            ? { words: p.meta.words }
            : p.meta.source === 'sample'
              ? { words: sampleWords() }
              : {}),
          ...(p.meta.extraClips?.length ? { extraClips: p.meta.extraClips } : {}),
          ...(p.meta.single ? { single: true } : {}),
        });
      });
    return () => {
      live = false;
    };
  }, [id, start]);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    if (lastInput.current?.storedRef) void clearPending({ keepAudio: false });
    setPhase('drop');
  };

  const chooseAnother = () => {
    if (lastInput.current?.storedRef) void clearPending({ keepAudio: false });
    setPhase('drop');
  };

  const done = state.projectId !== null;
  const failed = state.error !== null && phase === 'running';

  return (
    <main className="relative flex min-h-dvh items-start justify-center overflow-hidden bg-bg px-4 pt-[12vh] pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-10%] left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.16),transparent)] blur-2xl"
      />
      <div className="relative w-full max-w-[560px]">
        <header className="flex flex-col items-center text-center">
          <div className="relative">
            <Pip
              size={96}
              state={
                done ? 'celebrating' : failed ? 'idle' : phase === 'running' ? 'thinking' : 'waving'
              }
              glow
              decorative
              seed={5}
            />
            <AnimatePresence>
              {state.slots.length > 0 && (
                <motion.p
                  key="bubble"
                  data-testid="pip-bubble"
                  initial={still ? false : { opacity: 0, scale: 0.6, x: -6, y: 6 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={springPop}
                  className="absolute top-1 left-[calc(100%+6px)] origin-bottom-left rounded-[12px] rounded-bl-[4px] bg-card-2 px-3 py-1.5 text-[12px] leading-4 font-medium whitespace-nowrap text-text shadow-glass"
                >
                  {slotsReady(state.slots.length)}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-5 font-mono text-[11px] leading-[14px] tracking-[1.1px] text-violet-ink">
            {phase === 'running' ? (done ? 'ALL SET' : 'PIP IS WORKING') : 'NEW PROJECT'}
          </p>
          <h1 className="mt-2 text-[28px] leading-[34px] font-semibold text-text">
            {done ? 'Here it comes' : 'Turning your voice into motion'}
          </h1>
          <p className="mt-2 text-[13px] leading-[18px] text-text-2">
            {phase === 'running'
              ? 'A few moments. A little magic.'
              : 'Bring your voice. We’ll bring the motion.'}
          </p>
        </header>

        <div className="mt-9">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 'drop' && (
              <motion.div key="drop" {...fadeIn}>
                <DropZone
                  key={intakeError ?? 'none'}
                  initialError={intakeError}
                  onFile={(file) => start({ file, name: file.name, source: 'upload' })}
                  onSample={() => start({ ...sampleInput(), source: 'sample' })}
                />
              </motion.div>
            )}

            {phase === 'running' && (
              <motion.div key="run" {...fadeIn}>
                <ol className="flex flex-col gap-3" aria-label="Processing steps">
                  {PIPELINE_STEPS.map((step, k) => (
                    <StepCard
                      key={step}
                      index={k + 1}
                      title={STEP_TITLES[step]}
                      state={state.steps[step].state}
                      detail={state.steps[step].detail}
                      {...(state.steps[step].route ? { route: state.steps[step].route } : {})}
                    />
                  ))}
                </ol>
                <div className="mt-6">
                  <WordStrip
                    words={state.words}
                    keys={state.wordKeys}
                    durationMs={state.durationMs}
                    slots={state.slots}
                  />
                </div>
                <div className="mt-6 flex justify-center gap-3">
                  {failed ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => lastInput.current && start(lastInput.current)}
                      >
                        Try again
                      </Button>
                      <Button variant="secondary" onClick={chooseAnother}>
                        Choose another file
                      </Button>
                    </>
                  ) : (
                    !done && (
                      <Button variant="ghost" onClick={cancel}>
                        Cancel
                      </Button>
                    )
                  )}
                </div>
              </motion.div>
            )}

            {phase === 'interrupted' && (
              <motion.div key="int" {...fadeIn} className="flex flex-col items-center gap-4">
                <p className="text-[13px] leading-[18px] text-text-2">
                  This upload was interrupted. Nothing was saved.
                </p>
                <Button variant="primary" onClick={() => router.replace('/processing/new')}>
                  Choose another file
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {state.announcement}
        </p>
      </div>
    </main>
  );
}
