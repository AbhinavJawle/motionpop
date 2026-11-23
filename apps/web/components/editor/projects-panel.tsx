'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { chipFor } from '@/components/dashboard/project-card';
import { posterKindFor, StylePoster } from '@/components/dashboard/style-poster';
import { Pip } from '@/components/pip/pip';
import { StatusChip } from '@/components/ui/status-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { clock, relativeTime } from '@/lib/dashboard/format';
import { useNow } from '@/lib/dashboard/use-now';
import { useProjectList } from '@/lib/projects/use-project-list';
import { summarise } from '@/lib/projects/summary';
import { flushSave } from '@/lib/stores/autosave';
import { useEditor } from '@/lib/stores/editor';

/**
 * The editor's Projects panel (spec 11 R10, design §12; not designed, Pip-panel language): recent
 * projects as 64 px rows. Switching flushes the open project first, so nothing typed is lost.
 */
export function ProjectsPanelBody() {
  const router = useRouter();
  const { list } = useProjectList();
  const open = useEditor((s) => s.project);
  const openId = open?.id ?? null;
  // The open project is listed even before its first save reaches the library (the demo).
  const projects = useMemo(() => {
    if (list.kind !== 'ready') return [];
    const rows = list.listing.projects;
    return open && !rows.some((p) => p.id === open.id) ? [summarise(open), ...rows] : rows;
  }, [list, open]);
  const now = useNow();
  const [leaving, setLeaving] = useState<string | null>(null);

  const go = async (href: string, id: string) => {
    if (leaving) return;
    setLeaving(id);
    try {
      await flushSave();
    } finally {
      router.push(href);
    }
  };

  return (
    <div className="flex h-full flex-col px-4 pb-4">
      <header className="-mx-4 flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-[14px] leading-5 font-semibold text-text">Projects</h2>
        <Tooltip content="New project" side="bottom">
          <button
            type="button"
            aria-label="New project"
            onClick={() => void go('/start', 'new')}
            className="flex size-7 items-center justify-center rounded-full text-text-2 hover:bg-card hover:text-text"
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </Tooltip>
      </header>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-3">
        {list.kind === 'loading' && (
          <div className="flex flex-col gap-2" aria-busy>
            {[0, 1, 2].map((k) => (
              <div
                key={k}
                className="h-16 animate-pulse rounded-card bg-card motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {list.kind === 'error' && (
          <p className="px-1 text-[12px] leading-4 text-text-2">
            Couldn’t list your projects. {list.message}
          </p>
        )}
        {list.kind === 'ready' && (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectPanelRow
                  project={p}
                  now={now}
                  current={p.id === openId}
                  busy={leaving === p.id}
                  onOpen={() =>
                    p.id === openId
                      ? undefined
                      : void go(`/editor/${encodeURIComponent(p.id)}`, p.id)
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {list.kind === 'ready' && projects.length <= 1 && (
          <Empty onNew={() => void go('/start', 'new')} />
        )}
      </div>
    </div>
  );
}

function ProjectPanelRow({
  project,
  now,
  current,
  busy,
  onOpen,
}: {
  project: ProjectSummary;
  now: number | null;
  current: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={current ? 'page' : undefined}
      data-testid="projects-panel-row"
      className={cn(
        'flex h-16 w-full items-center gap-3 rounded-card border bg-card px-3 text-left shadow-quiet transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet',
        current
          ? 'border-edge shadow-[3px_3px_0_var(--color-hard)]'
          : 'border-line hover:bg-card-2',
      )}
    >
      <StylePoster
        kind={posterKindFor(project.styleId)}
        headline={project.title}
        loop={null}
        className="h-10 w-[72px] shrink-0 rounded-md"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-4 font-medium text-text">
          {project.title}
        </span>
        <span className="mt-1 block truncate font-mono text-[10px] leading-[13px] text-text-3">
          {clock(project.durationMs)} ·{' '}
          {busy
            ? 'Saving…'
            : now === null
              ? 'Edited'
              : `Edited ${relativeTime(project.updatedAt, now)}`}
        </span>
      </span>
      <StatusChip status={chipFor(project)} className="shrink-0" />
    </button>
  );
}

function Empty({ onNew }: { onNew: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-card border border-dashed border-line-strong px-3 py-3">
      <Pip state="idle" size={34} decorative />
      <p className="flex-1 text-[12px] leading-4 text-text-2">
        This is your only project so far.{' '}
        <button type="button" onClick={onNew} className="text-violet hover:underline">
          Start another
        </button>
      </p>
    </div>
  );
}
