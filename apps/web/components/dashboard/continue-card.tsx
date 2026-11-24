'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { ArrowDown, ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { btn, paper, poster, Sprockets } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { clock, relativeTime } from '@/lib/dashboard/format';
import { ProjectPoster, SlotTicks } from './project-poster';

/**
 * Compact lead studio card (Spec 35 + Spec 42): keeps your active AI project prominent while
 * leaving room for the Recent Projects grid right above the fold on first glance.
 */
export function ContinueCard({
  project,
  now,
  totalProjects,
}: {
  project: ProjectSummary;
  now: number | null;
  totalProjects?: number;
}) {
  const router = useRouter();
  const open = () => router.push(`/editor/${encodeURIComponent(project.id)}`);
  return (
    <section aria-labelledby="continue-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 id="continue-title" className={cn(poster, 'text-[28px] leading-none')}>
            {C.continue.title}
          </h2>
          <span className="inline-flex items-center gap-1 rounded-md border border-ink bg-[#8dbceb] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase">
            <Sparkles className="size-3" strokeWidth={2} aria-hidden />
            Last AI edit
          </span>
        </div>
        {totalProjects !== undefined && totalProjects > 1 && (
          <a
            href="#recent-projects"
            className="inline-flex items-center gap-1 text-[12px] font-medium underline decoration-[1.5px] underline-offset-4 hover:decoration-flame"
          >
            All {totalProjects} projects
            <ArrowDown className="size-3" strokeWidth={2} aria-hidden />
          </a>
        )}
      </div>
      <div
        className={cn(
          paper.frame,
          'mt-3 grid overflow-hidden shadow-[4px_4px_0_#000] md:grid-cols-[340px_minmax(0,1fr)]',
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
              project={project}
              size="lg"
              className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          </span>
          <Sprockets />
        </button>
        <div className="flex flex-col justify-between gap-4 p-5 lg:px-6 lg:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className={cn(poster, 'line-clamp-2 text-[32px] leading-[0.95]')}>
                {project.title}
              </h3>
              <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/55">Length</dt>
                  <dd className="font-mono font-medium tabular">{clock(project.durationMs)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/55">Edited</dt>
                  <dd className="font-medium">
                    {now === null ? '\u00a0' : relativeTime(project.updatedAt, now)}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/55">Format</dt>
                  <dd className="rounded border border-ink bg-mist px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                    {project.format}
                  </dd>
                </div>
              </dl>
            </div>
            <button type="button" onClick={open} className={btn('ink', 'md', false, 'shrink-0')}>
              {C.continue.resume}
              <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-black/15 pt-3">
            <div>
              <SlotTicks states={project.slotStates} size="lg" />
              <p className="mt-1.5 text-[12px] text-black/75">
                {project.preview?.kind === 'reel' && project.preview.reelSceneCount
                  ? `${project.preview.reelSceneCount} AI ${project.preview.reelSceneCount === 1 ? 'scene' : 'scenes'} directed`
                  : C.continue.ready(project.readySlotCount, project.slotCount)}
              </p>
            </div>
            <span className="font-mono text-[11px] text-black/55 uppercase">
              {project.preview?.kind === 'reel' ? 'AI Reel Engine' : 'AI Motion Graphics'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
