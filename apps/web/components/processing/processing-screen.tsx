'use client';

import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, Bubble, paper, PaperPage, PipMark, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
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
  const { client: credits } = useCreditsClient();

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
        browserPipelineDeps({ credits }),
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
    [router, still, credits],
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

  const bubble =
    state.slots.length > 0
      ? slotsReady(state.slots.length)
      : failed
        ? 'Hmm, that one slipped.'
        : phase === 'running'
          ? 'On it…'
          : 'Drop it, I’ll catch it!';

  return (
    <PaperPage>
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-6 lg:px-10">
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="motionpop home">
            <PipMark />
            <span className="font-sans text-[22px] leading-none font-semibold tracking-[-0.03em]">
              motionpop
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1000px] px-6 pb-20 lg:px-10">
        <section className="flex items-end justify-between gap-6 pt-12 pb-10">
          <div>
            <h1 className={cn(poster, 'text-[clamp(52px,7vw,96px)]')}>
              {done ? 'Here it comes.' : 'Turning your voice into motion.'}
            </h1>
            <p className="mt-4 text-[15px]">
              {phase === 'running'
                ? 'A few moments. A little magic.'
                : 'Bring your voice. We’ll bring the motion.'}
            </p>
          </div>
          <div className="relative h-[170px] w-[150px] shrink-0 sm:w-[240px]">
            <AnimatePresence mode="wait">
              <motion.span
                key={bubble}
                data-testid={state.slots.length > 0 ? 'pip-bubble' : undefined}
                initial={still ? false : { opacity: 0, scale: 0.7, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springPop}
                className="absolute top-0 right-[30px] origin-bottom-right whitespace-nowrap"
              >
                <Bubble right>{bubble}</Bubble>
              </motion.span>
            </AnimatePresence>
            <PipLoop
              name={done || state.slots.length > 0 ? 'juggle' : 'clapper'}
              className="absolute -right-3 -bottom-6 size-[150px] select-none"
            />
          </div>
        </section>

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
              <ol
                className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[6px_6px_0_#000]"
                aria-label="Processing steps"
              >
                {PIPELINE_STEPS.map((step, k) => (
                  <StepCard
                    key={step}
                    index={k + 1}
                    title={state.steps[step].title ?? STEP_TITLES[step]}
                    state={state.steps[step].state}
                    detail={state.steps[step].detail}
                    {...(state.steps[step].route ? { route: state.steps[step].route } : {})}
                  />
                ))}
              </ol>
              <div className="mt-8">
                <WordStrip
                  words={state.words}
                  keys={state.wordKeys}
                  durationMs={state.durationMs}
                  slots={state.slots}
                />
              </div>
              <div className="mt-8 flex gap-4">
                {failed ? (
                  <>
                    <button
                      type="button"
                      className={btn('ink')}
                      onClick={() => lastInput.current && start(lastInput.current)}
                    >
                      Try again
                    </button>
                    <button type="button" className={btn('paper')} onClick={chooseAnother}>
                      Choose another file
                    </button>
                  </>
                ) : (
                  !done && (
                    <button type="button" className={paper.link} onClick={cancel}>
                      Cancel
                    </button>
                  )
                )}
              </div>
            </motion.div>
          )}

          {phase === 'interrupted' && (
            <motion.div key="int" {...fadeIn} className="flex flex-col items-start gap-5">
              <p className="text-[15px]">This upload was interrupted. Nothing was saved.</p>
              <button
                type="button"
                className={btn('ink')}
                onClick={() => router.replace('/processing/new')}
              >
                Choose another file
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p role="status" aria-live="polite" className="sr-only">
          {state.announcement}
        </p>
      </main>
    </PaperPage>
  );
}
