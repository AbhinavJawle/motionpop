'use client';

import { FileText, Film, Music2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { btn, paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { formatEta } from '@/lib/pipeline/eta';
import { dashboardJobs, jobStepLine } from '@/lib/pipeline/job-view';
import { cancel, dismiss, isLive, retry, useJobs, type Job } from '@/lib/pipeline/jobs-store';

/**
 * "Working on it" (spec 39 R6.7): every edit made in this tab that is running, waiting, failed or
 * just finished, on top of the dashboard. Each card shows its step, a bar and the time left.
 */
export function WorkingSection() {
  const jobs = useJobs(useShallow((s) => dashboardJobs(s.jobs, s.order)));
  if (jobs.length === 0) return null;
  return (
    <section aria-labelledby="working-title" className="mb-14">
      <h2 id="working-title" className={cn(poster, 'text-[44px]')}>
        Working on it
      </h2>
      <ul className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function JobCard({ job }: { job: Job }) {
  const router = useRouter();
  const still = useStill();
  const live = isLive(job);
  const failed = job.status === 'error';
  const done = job.status === 'done';
  const Icon = job.script ? FileText : job.kind === 'video' ? Film : Music2;
  const view = () => router.push(`/processing/${encodeURIComponent(job.id)}`);
  const open = () => job.projectId && router.push(`/editor/${encodeURIComponent(job.projectId)}`);
  return (
    <motion.li
      layout={!still}
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      transition={springPop}
      data-testid="job-card"
      data-status={job.status}
      className={cn(paper.frame, paper.raised, 'relative flex gap-5 p-4')}
    >
      <div className="relative grid h-[96px] w-[128px] shrink-0 place-items-center overflow-hidden rounded-[8px] border-2 border-black bg-[#1d1d22]">
        {job.media.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL keyframe
          <img
            src={job.media.thumbUrl}
            alt=""
            className="h-full w-full object-cover object-[50%_26%]"
          />
        ) : job.script ? (
          <div className="flex h-full w-full flex-col justify-center bg-paper px-2.5 py-2 text-ink">
            <span className="line-clamp-3 font-mono text-[10px] leading-snug">{job.script}</span>
          </div>
        ) : (
          <Icon className="size-7 text-[#fff]" strokeWidth={1.8} aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate pr-8 text-[15px] font-semibold" title={job.title}>
          {job.title}
        </p>
        {job.recipeLabel && (
          <p className="mt-0.5 truncate text-[12px] text-black/60">
            {job.recipeLabel}
            {job.styleLabel ? ` · ${job.styleLabel}` : ''}
          </p>
        )}
        <p
          className={cn('mt-2 truncate text-[12px]', failed && 'text-error')}
          title={failed ? job.error : undefined}
        >
          {jobStepLine(job)}
        </p>
        {live && (
          <div className="mt-2">
            <div
              role="progressbar"
              aria-label={`${job.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progressPct}
              className="h-[10px] overflow-hidden rounded-full border-2 border-black bg-paper"
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
            <p className="mt-1 flex justify-between text-[11px] text-black/55">
              <span>{job.progressPct}%</span>
              <span>{formatEta(job.etaMs)}</span>
            </p>
          </div>
        )}
        <div className="mt-auto flex items-center gap-4 pt-3">
          {done ? (
            <button type="button" className={btn('flame', 'sm')} onClick={open}>
              Open
            </button>
          ) : failed ? (
            <>
              {!job.intakeError && (
                <button type="button" className={btn('ink', 'sm')} onClick={() => retry(job.id)}>
                  Retry
                </button>
              )}
              <button type="button" className={paper.link} onClick={view}>
                Details
              </button>
            </>
          ) : live ? (
            <>
              <button type="button" className={btn('ink', 'sm')} onClick={view}>
                View progress
              </button>
              <button type="button" className={paper.link} onClick={() => cancel(job.id)}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>
      {!live && (
        <button
          type="button"
          onClick={() => dismiss(job.id)}
          aria-label={`Dismiss ${job.title}`}
          className="absolute top-3 right-3 grid size-7 place-items-center rounded-full border-2 border-black bg-paper hover:bg-mist"
        >
          <X className="size-3.5" strokeWidth={2.4} aria-hidden />
        </button>
      )}
    </motion.li>
  );
}
