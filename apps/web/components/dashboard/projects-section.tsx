'use client';

import { LayoutGrid, List, Search } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { paper, poster } from '@/components/paper/kit';
import { Dropdown } from '@/components/ui/dropdown';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { matchesSearch, sortSummaries, type SortKey } from '@/lib/dashboard/format';
import type { ProjectListing } from '@/lib/projects/repository';
import { DamagedCard, ProjectCard, ProjectRow } from './project-card';

type View = 'grid' | 'list';
const VIEW_KEY = 'mp:projects-view';

/** The grid/list choice, persisted per browser (R5.3). */
const viewListeners = new Set<() => void>();
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}
function writeView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  viewListeners.forEach((fn) => fn());
}
const subscribeView = (fn: () => void) => {
  viewListeners.add(fn);
  return () => viewListeners.delete(fn);
};

const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: 'edited', label: C.projects.sort.edited },
  { value: 'created', label: C.projects.sort.created },
  { value: 'name', label: C.projects.sort.name },
];

/** Every project (spec 35): poster title with the count, search, sort, grid or list. */
export function ProjectsSection({
  listing,
  now,
  onChanged,
}: {
  listing: ProjectListing;
  now: number | null;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('edited');
  const view = useSyncExternalStore(subscribeView, readView, () => 'grid' as const);

  const shown = useMemo(
    () => sortSummaries(listing.projects, sort).filter((p) => matchesSearch(p.title, query)),
    [listing.projects, sort, query],
  );
  const damaged = listing.damaged.filter((d) => matchesSearch(d.title, query));
  const count = listing.projects.length + listing.damaged.length;

  return (
    <section id="recent-projects" aria-labelledby="projects-title" className="mt-8 scroll-mt-20">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b-2 border-ink pb-3">
        <h2
          id="projects-title"
          className={cn(poster, 'flex items-center gap-2.5 text-[34px] leading-none')}
        >
          {C.projects.title}
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border-2 border-ink px-1.5 font-mono text-[12px] leading-none font-semibold tracking-normal tabular">
            {count}
          </span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className={cn(paper.field, 'flex h-10 w-[260px] items-center gap-2.5 px-3')}>
            <Search className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={C.projects.search}
              aria-label={C.projects.search}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-black/45"
            />
          </label>
          <Dropdown
            label="Sort projects"
            options={SORTS}
            value={sort}
            onChange={setSort}
            className={cn(
              paper.field,
              'flex h-10 w-[170px] items-center px-1.5 [&>button]:text-[13px]',
            )}
          />
          <div
            role="radiogroup"
            aria-label="View"
            className={cn(paper.field, 'flex h-10 items-center gap-1 p-1')}
          >
            {(
              [
                ['grid', LayoutGrid, 'Grid view'],
                ['list', List, 'List view'],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                aria-label={label}
                onClick={() => writeView(v)}
                className={cn(
                  'flex h-7 w-9 items-center justify-center rounded-[5px] transition-colors',
                  view === v ? 'bg-ink text-paper' : 'hover:bg-mist',
                )}
              >
                <Icon className="size-4" strokeWidth={2} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 && damaged.length === 0 ? (
        <p className="py-16 text-center text-[14px]">{C.projects.noMatch(query.trim())}</p>
      ) : view === 'grid' ? (
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} now={now} onChanged={onChanged} />
          ))}
          {damaged.map((d) => (
            <DamagedCard key={d.id} project={d} onChanged={onChanged} />
          ))}
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {shown.map((p) => (
            <ProjectRow key={p.id} project={p} now={now} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}
