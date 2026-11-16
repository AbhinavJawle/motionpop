'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { SlotDots } from '@/components/ui/slot-dots';
import { StatusChip, type ChipStatus } from '@/components/ui/status-chip';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { clock, relativeTime } from '@/lib/dashboard/format';
import { hoverLift } from '@/lib/motion/presets';
import type { DamagedProject } from '@/lib/projects/repository';
import { ProjectMenu } from './project-menu';
import { posterKindFor, StylePoster } from './style-poster';

/** Render state is not in local mode (no `renders`), so the chip shows the project's status. */
export const chipFor = (p: ProjectSummary): ChipStatus => ({
  kind: p.status === 'ready' ? 'ready' : 'draft',
});

const edited = (p: ProjectSummary, now: number | null) =>
  now === null ? 'Edited' : `Edited ${relativeTime(p.updatedAt, now)}`;

const editorHref = (id: string) => `/editor/${encodeURIComponent(id)}`;

/** Project card (projects.png: 416×312, poster 416×206, title + ⋯, meta, chip + dots). */
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
  const open = () => router.push(editorHref(project.id));
  return (
    <motion.article
      {...hoverLift}
      data-testid="project-card"
      className="relative h-[312px] overflow-hidden rounded-card border border-line bg-panel shadow-quiet"
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${project.title}`}
        className="block h-[206px] w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-inset"
      >
        <StylePoster
          kind={posterKindFor(project.styleId)}
          headline={project.title}
          loop={null}
          className="h-full w-full"
        />
      </button>
      <div className="px-4 pt-[15px]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm leading-[18px] font-medium">{project.title}</h3>
          <ProjectMenu
            id={project.id}
            title={project.title}
            onChanged={onChanged}
            className="-mr-1.5"
          />
        </div>
        <p className="mt-1 text-[11px] leading-[14px] text-text-2">
          <span className="font-mono">{clock(project.durationMs)}</span>
          <span className="mx-2.5 text-text-4">·</span>
          {edited(project, now)}
        </p>
        <div className="mt-[22px] flex items-center justify-between pr-1">
          <StatusChip status={chipFor(project)} />
          <SlotDots
            states={project.slotStates}
            tone={project.status === 'ready' ? 'mint' : 'violet'}
          />
        </div>
      </div>
    </motion.article>
  );
}

/** List view (not designed: same tokens, 56 px rows). */
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
      className="flex h-14 items-center gap-4 rounded-card border border-line bg-panel pr-3 pl-2 shadow-quiet transition-colors hover:bg-card"
    >
      <button
        type="button"
        onClick={() => router.push(editorHref(project.id))}
        className="flex min-w-0 flex-1 items-center gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet rounded-lg"
      >
        <StylePoster
          kind={posterKindFor(project.styleId)}
          headline={project.title}
          loop={null}
          className="h-10 w-[72px] shrink-0 rounded-md"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-medium">
          {project.title}
        </span>
        <span className="w-14 font-mono text-[11px] leading-[14px] text-text-2">
          {clock(project.durationMs)}
        </span>
        <span className="w-40 text-[11px] leading-[14px] text-text-2">{edited(project, now)}</span>
        <span className="w-24">
          <StatusChip status={chipFor(project)} />
        </span>
        <SlotDots states={project.slotStates} className="w-28 justify-end" />
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
    <article className="flex h-[312px] flex-col overflow-hidden rounded-card border border-error/30 bg-panel shadow-quiet">
      <button
        type="button"
        onClick={() => router.push(editorHref(project.id))}
        className="flex h-[206px] w-full flex-col items-center justify-center gap-2 bg-card text-text-2 outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-inset"
      >
        <AlertTriangle className="size-6 text-error" strokeWidth={1.5} aria-hidden />
        <span className="text-xs leading-4">{C.projects.damaged}</span>
      </button>
      <div className="px-4 pt-[15px]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm leading-[18px] font-medium">{project.title}</h3>
          <ProjectMenu id={project.id} title={project.title} damaged onChanged={onChanged} />
        </div>
        <div className="mt-[39px]">
          <StatusChip status={{ kind: 'damaged' }} />
        </div>
      </div>
    </article>
  );
}
