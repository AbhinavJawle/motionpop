'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, Bubble, paper, PaperPage, PipMark, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { defaultEdit } from '@/lib/configure/defaults';
import { CONFIGURE, handOffFile, handOffSample } from '@/lib/intake/hand-off';
import { takePending } from '@/lib/intake/pending';
import { fadeIn, springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { formatEta } from '@/lib/pipeline/eta';
import { PIPELINE_STEPS } from '@/lib/pipeline/events';
import {
  cancel,
  dismiss,
  prepare,
  retry,
  submit,
  useJobs,
  watch,
  type Job,
} from '@/lib/pipeline/jobs-store';
import { STEP_TITLES } from '@/lib/pipeline/processing-state';
import { projectLibrary } from '@/lib/projects/use-project-list';
import { DropZone } from './drop-zone';
import { StepCard } from './step-card';
import { WordStrip } from './word-strip';

type Phase = 'checking' | 'drop' | 'interrupted';

/** Pip's bubble once suggestions are in: "1 slot ready" / "3 slots ready". */
const slotsReady = (n: number) => `${n} ${n === 1 ? 'slot' : 'slots'} ready`;

/** The headline and strip label per kind (spec 39 R1.3). */
const COPY = {
  video: { title: 'Editing your video.', strip: 'Your video' },
  voiceover: { title: 'Turning your voice into motion.', strip: 'Your voice' },
} as const;

function bubbleOf(job: Job | undefined, phase: Phase): string {
  if (!job) return phase === 'interrupted' ? 'Hmm, that one slipped.' : 'Drop it, I’ll catch it!';
  if (job.processing.slots.length > 0) return slotsReady(job.processing.slots.length);
  if (job.status === 'error') return 'Hmm, that one slipped.';
  if (job.status === 'cancelled') return 'Stopped. Nothing was saved.';
  if (job.status === 'queued') return 'Next in line!';
  return 'On it…';
}

/**
 * `/processing/[jobId]` (spec 05 R5, spec 39 R6.8): a view of one background job. The job runs
 * in the jobs store, so leaving this page (Continue in background) never stops it. `new` keeps
 * old links working: a pending take goes to the configure screen (a single graphic starts at
 * once with the default choices); nothing pending shows the drop zone. A project id opens the
 * editor; any other id was lost to a reload.
 */
export function ProcessingScreen({ id }: { id: string }) {
  const router = useRouter();
  const still = useStill();
  const job = useJobs((s) => s.jobs[id]);
  const [phase, setPhase] = useState<Phase>('checking');
  const [dropError, setDropError] = useState<string | null>(null);

  // Not a job in this tab: an old `/processing/new` link, a project id, or a lost job.
  useEffect(() => {
    if (useJobs.getState().jobs[id]) return;
    let live = true;
    if (id === 'new') {
      void takePending()
        .catch(() => null)
        .then((take) => {
          if (!live) return;
          if (!take) return setPhase('drop');
          if (!take.meta.single) return router.replace(CONFIGURE);
          const jobId = prepare(take);
          const kind = useJobs.getState().jobs[jobId]?.kind ?? 'voiceover';
          submit(jobId, defaultEdit(kind, { source: take.meta.source }));
          router.replace(`/processing/${jobId}`);
        });
    } else {
      void projectLibrary()
        .load(id)
        .then((r) => {
          if (!live) return;
          if (!r.ok) return setPhase('interrupted');
          router.replace(`/editor/${encodeURIComponent(id)}`);
        });
    }
    return () => {
      live = false;
    };
  }, [id, router]);

  // While this page shows the job, it is watched: its "ready" toast would only repeat the page.
  const shownHere = job !== undefined;
  useEffect(() => (shownHere ? watch(id) : undefined), [id, shownHere]);

  // The watched job finished: let the last check and Pip's celebration land, then open it.
  const projectId = job?.status === 'done' ? job.projectId : undefined;
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(
      () => {
        router.push(`/editor/${encodeURIComponent(projectId)}`);
        // Seen through to the end: no "Working on it" card needed for this one.
        dismiss(id);
      },
      still ? 250 : 1100,
    );
    return () => clearTimeout(t);
  }, [projectId, id, router, still]);

  const pick = async (work: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setDropError(null);
    const r = await work();
    if (r.ok) router.push(CONFIGURE);
    else setDropError(r.message);
  };

  const chooseAnother = () => {
    dismiss(id);
    router.push('/start');
  };

  const shown = job !== undefined;
  const done = job?.status === 'done';
  const failed = job?.status === 'error';
  const waiting = job?.status === 'queued' || job?.status === 'preparing';
  const working = job?.status === 'running' || waiting;
  const copy = COPY[job?.kind ?? 'voiceover'];
  const bubble = bubbleOf(shown ? job : undefined, phase);
  const eta = job && working ? formatEta(job.etaMs) : '';

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
          <div className="min-w-0">
            <h1 className={cn(poster, 'text-[clamp(52px,7vw,96px)]')}>
              {done ? 'Here it comes.' : copy.title}
            </h1>
            <p className="mt-4 text-[15px]">
              {shown && job.title ? (
                <>
                  <span className="font-semibold">{job.title}</span>
                  {job.recipeLabel && (
                    <span className="text-black/60">
                      {' '}
                      · {job.recipeLabel}
                      {job.styleLabel ? ` · ${job.styleLabel}` : ''}
                    </span>
                  )}
                </>
              ) : (
                'Bring your voice. We’ll bring the motion.'
              )}
            </p>
          </div>
          <div className="relative h-[170px] w-[150px] shrink-0 sm:w-[240px]">
            <AnimatePresence mode="wait">
              <motion.span
                key={bubble}
                data-testid={job && job.processing.slots.length > 0 ? 'pip-bubble' : undefined}
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
              name={done || (job?.processing.slots.length ?? 0) > 0 ? 'juggle' : 'clapper'}
              className="absolute -right-3 -bottom-6 size-[150px] select-none"
            />
          </div>
        </section>

        <AnimatePresence mode="wait" initial={false}>
          {!shown && phase === 'drop' && (
            <motion.div key="drop" {...fadeIn}>
              <DropZone
                key={dropError ?? 'none'}
                initialError={dropError}
                onFile={(file) => void pick(() => handOffFile(file))}
                onSample={() => void pick(() => handOffSample())}
              />
            </motion.div>
          )}

          {shown && (
            <motion.div key="job" {...fadeIn}>
              {working && (
                <div className="mb-6">
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="font-semibold">
                      {waiting ? 'Waiting for the edit before this one…' : `${job.progressPct}%`}
                    </span>
                    <span className="text-black/60" data-testid="job-eta">
                      {eta}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Edit progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={job.progressPct}
                    className="h-[12px] overflow-hidden rounded-full border-2 border-black bg-paper"
                  >
                    <motion.div
                      className="h-full bg-pip"
                      initial={false}
                      animate={{ width: `${job.progressPct}%` }}
                      transition={
                        still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 24 }
                      }
                    />
                  </div>
                </div>
              )}
              <ol
                className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[6px_6px_0_#000]"
                aria-label="Processing steps"
              >
                {PIPELINE_STEPS.map((step, k) => {
                  const s = job.processing.steps[step];
                  return (
                    <StepCard
                      key={step}
                      index={k + 1}
                      title={s.title ?? STEP_TITLES[step]}
                      state={s.state}
                      detail={s.detail}
                      {...(s.route ? { route: s.route } : {})}
                    />
                  );
                })}
              </ol>
              <div className="mt-8">
                <WordStrip
                  label={copy.strip}
                  words={job.processing.words}
                  keys={job.processing.wordKeys}
                  durationMs={job.processing.durationMs}
                  slots={job.processing.slots}
                />
              </div>
              {failed && job.error && (
                <p role="alert" className="mt-6 text-[14px] text-error">
                  {job.error}
                </p>
              )}
              {job.status === 'cancelled' && (
                <p className="mt-6 text-[14px]">This edit was cancelled. Nothing was saved.</p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                {failed ? (
                  <>
                    {!job.intakeError && (
                      <button type="button" className={btn('ink')} onClick={() => retry(id)}>
                        Try again
                      </button>
                    )}
                    <button type="button" className={btn('paper')} onClick={chooseAnother}>
                      Choose another file
                    </button>
                  </>
                ) : job.status === 'cancelled' ? (
                  <button type="button" className={btn('ink')} onClick={chooseAnother}>
                    Start again
                  </button>
                ) : (
                  working && (
                    <>
                      <button
                        type="button"
                        className={btn('ink')}
                        onClick={() => router.push('/dashboard')}
                      >
                        Continue in background
                      </button>
                      <button type="button" className={paper.link} onClick={() => cancel(id)}>
                        Cancel
                      </button>
                    </>
                  )
                )}
              </div>
              {working && (
                <p className="mt-3 text-[12px] text-black/55">
                  Keep this tab open. You can use the rest of motionpop while it works.
                </p>
              )}
            </motion.div>
          )}

          {!shown && phase === 'interrupted' && (
            <motion.div key="int" {...fadeIn} className="flex flex-col items-start gap-5">
              <p className="text-[15px]">This upload was interrupted. Nothing was saved.</p>
              <button type="button" className={btn('ink')} onClick={() => router.replace('/start')}>
                Choose another file
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p role="status" aria-live="polite" className="sr-only">
          {shown ? job.processing.announcement : ''}
        </p>
      </main>
    </PaperPage>
  );
}
