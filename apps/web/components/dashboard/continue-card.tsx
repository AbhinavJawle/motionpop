'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { useRouter } from 'next/navigation';
import { btn, paper, poster, Sprockets } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { clock, relativeTime } from '@/lib/dashboard/format';
import { ProjectPoster, SlotTicks } from './project-poster';

/**
 * "Pick up where you left off" (spec 35): the last opened project as the lead frame, its
 * picture on a strip of film, its graphics as storyboard ticks, and Resume.
 */
export function ContinueCard({ project, now }: { project: ProjectSummary; now: number | null }) {
  const router = useRouter();
  const open = () => router.push(`/editor/${encodeURIComponent(project.id)}`);
  return (
    <section aria-labelledby="continue-title">
      <h2 id="continue-title" className={cn(poster, 'text-[44px]')}>
        {C.continue.title}
      </h2>
      <div
        className={cn(
          paper.frame,
          'mt-5 grid overflow-hidden md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]',
        )}
      >
        <button
          type="button"
          onClick={open}
          aria-label={`Open ${project.title}`}
          className="group flex flex-col bg-ink outline-none focus-visible:ring-4 focus-visible:ring-flame focus-visible:ring-inset md:border-r-2 md:border-ink"
        >
          <Sprockets />
          <span className="relative block aspect-video w-full overflow-hidden">
            <ProjectPoster
              styleId={project.styleId}
              title={project.title}
              className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          </span>
          <Sprockets />
        </button>
        <div className="flex flex-col p-7 lg:p-9">
          <h3 className={cn(poster, 'line-clamp-3 text-[52px]')}>{project.title}</h3>
          <dl className="mt-5 flex gap-10 text-[13px]">
            <div>
              <dt className="text-black/55">Length</dt>
              <dd className="tabular">{clock(project.durationMs)}</dd>
            </div>
            <div>
              <dt className="text-black/55">Edited</dt>
              <dd>{now === null ? '\u00a0' : relativeTime(project.updatedAt, now)}</dd>
            </div>
          </dl>
          <div className="mt-7">
            <SlotTicks states={project.slotStates} size="lg" />
            <p className="mt-2.5 text-[13px]">
              {C.continue.ready(project.readySlotCount, project.slotCount)}
            </p>
          </div>
          <button
            type="button"
            onClick={open}
            className={btn('ink', 'lg', false, 'mt-9 self-start md:mt-auto')}
          >
            {C.continue.resume}
          </button>
        </div>
      </div>
    </section>
  );
}
