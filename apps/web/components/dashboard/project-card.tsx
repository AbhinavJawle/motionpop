'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { paper } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { clock, relativeTime } from '@/lib/dashboard/format';
import type { DamagedProject } from '@/lib/projects/repository';
import type { ChipStatus } from '@/components/ui/status-chip';
import { ProjectMenu } from './project-menu';
import { ProjectPoster, SlotTicks } from './project-poster';

/** Render state is not in local mode (no `renders`), so the chip shows the project's status. */
export const chipFor = (p: ProjectSummary): ChipStatus => ({
  kind: p.status === 'ready' ? 'ready' : 'draft',
});

const edited = (p: ProjectSummary, now: number | null) =>
  now === null ? 'Edited' : `Edited ${relativeTime(p.updatedAt, now)}`;

const editorHref = (id: string) => `/editor/${encodeURIComponent(id)}`;

/** "Ready" when every slot has its graphic, else "Draft". */
function Status({ project }: { project: ProjectSummary }) {
  const ready = project.status === 'ready';
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md border-2 border-ink px-2 text-[11px] font-medium',
        ready ? 'bg-ink text-paper' : 'bg-paper',
      )}
    >
      {ready ? 'Ready' : 'Draft'}
    </span>
  );
}

/** A project as a film frame (spec 35): picture, title and ⋯, length and last edit, status. */
export function ProjectCard({
  project,
  now,
  onChanged,
}: {
  project: ProjectSummary;
  now: number | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  return (
    <article
      data-testid="project-card"
      className={cn(paper.frame, paper.press, 'relative flex flex-col')}
    >
      <button
        type="button"
        onClick={() => router.push(editorHref(project.id))}
        aria-label={`Open ${project.title}`}
        className="block aspect-video w-full overflow-hidden rounded-t-[10px] border-b-2 border-ink outline-none focus-visible:ring-4 focus-visible:ring-flame focus-visible:ring-inset"
      >
        <ProjectPoster styleId={project.styleId} title={project.title} className="h-full w-full" />
      </button>
      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-[15px] leading-[1.35] font-semibold">{project.title}</h3>
          <ProjectMenu
            id={project.id}
            title={project.title}
            onChanged={onChanged}
            className="-mt-0.5 -mr-1.5"
          />
        </div>
        <p className="mt-1 text-[12px] text-black/60">
          <span className="tabular">{clock(project.durationMs)}</span>
          <span className="ml-4">{edited(project, now)}</span>
        </p>
        <div className="mt-auto flex items-center justify-between pt-4">
          <Status project={project} />
          <SlotTicks states={project.slotStates} />
        </div>
      </div>
    </article>
  );
}

/** List view: one ruled line per project. */
export function ProjectRow({
  project,
  now,
  onChanged,
}: {
  project: ProjectSummary;
  now: number | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  return (
    <div
      data-testid="project-row"
      className="flex h-16 items-center gap-4 border-b-2 border-ink pr-1 transition-colors hover:bg-mist"
    >
      <button
        type="button"
        onClick={() => router.push(editorHref(project.id))}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-flame"
      >
        <ProjectPoster
          styleId={project.styleId}
          title={project.title}
          className="h-11 w-[78px] shrink-0 rounded-[5px] border-2 border-ink"
        />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{project.title}</span>
        <span className="hidden w-14 text-[12px] tabular sm:block">
          {clock(project.durationMs)}
        </span>
        <span className="hidden w-44 text-[12px] text-black/60 md:block">
          {edited(project, now)}
        </span>
        <span className="w-16">
          <Status project={project} />
        </span>
        <SlotTicks states={project.slotStates} className="hidden w-28 justify-end sm:inline-flex" />
      </button>
      <ProjectMenu id={project.id} title={project.title} onChanged={onChanged} />
    </div>
  );
}

/** A save that failed zod (design §10): Open (the editor offers restore) and Delete. */
export function DamagedCard({
  project,
  onChanged,
}: {
  project: DamagedProject;
  onChanged: () => void;
}) {
  const router = useRouter();
  return (
    <article className={cn(paper.frame, 'flex flex-col overflow-hidden border-dashed')}>
      <button
        type="button"
        onClick={() => router.push(editorHref(project.id))}
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 border-b-2 border-dashed border-ink bg-mist outline-none focus-visible:ring-4 focus-visible:ring-flame focus-visible:ring-inset"
      >
        <AlertTriangle className="size-6 text-error" strokeWidth={2} aria-hidden />
        <span className="text-[12px]">{C.projects.damaged}</span>
      </button>
      <div className="px-4 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-[15px] font-semibold">{project.title}</h3>
          <ProjectMenu id={project.id} title={project.title} damaged onChanged={onChanged} />
        </div>
        <p className="mt-4 text-[12px] text-error">Damaged</p>
      </div>
    </article>
  );
}
