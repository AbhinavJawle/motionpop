'use client';

import { LayoutGrid, List, Search } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Pip } from '@/components/pip/pip';
import { Dropdown } from '@/components/ui/dropdown';
import { Tabs } from '@/components/ui/tabs';
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

/**
 * "Your projects" (projects.png: title at y 960 with the count badge, search 284×38, sort
 * 202×38, view toggle, tabs at y 1001, 3-column grid of 416×312 cards with 24 px gaps).
 */
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
  const [tab, setTab] = useState<'all' | 'shared'>('all');
  const view = useSyncExternalStore(subscribeView, readView, () => 'grid' as const);

  const shown = useMemo(
    () => sortSummaries(listing.projects, sort).filter((p) => matchesSearch(p.title, query)),
    [listing.projects, sort, query],
  );
  const damaged = listing.damaged.filter((d) => matchesSearch(d.title, query));
  const count = listing.projects.length + listing.damaged.length;

  return (
    <section aria-labelledby="projects-title" className="mt-[54px]">
      <div className="flex items-center">
        <h2 id="projects-title" className="text-xl leading-[26px] font-semibold tracking-[-0.2px]">
          {C.projects.title}
        </h2>
        <span className="ml-3.5 inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-md bg-card-2 px-1.5 font-mono text-[11px] leading-none text-text-2">
          {count}
        </span>
        <label className="ml-auto flex h-[38px] w-[284px] items-center gap-2.5 rounded-chip border border-line bg-panel px-3 text-text-2 focus-within:border-violet/50">
          <Search className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={C.projects.search}
            aria-label={C.projects.search}
            className="h-full min-w-0 flex-1 bg-transparent text-xs leading-4 text-text outline-none placeholder:text-text-2"
          />
        </label>
        <Dropdown
          label="Sort projects"
          options={SORTS}
          value={sort}
          onChange={setSort}
          className="ml-[13px] flex h-[38px] w-[202px] items-center rounded-chip border border-line bg-panel px-2"
        />
        <div
          role="radiogroup"
          aria-label="View"
          className="ml-[13px] flex h-[38px] items-center gap-1 rounded-chip border border-line bg-panel p-1"
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
                'flex h-[28px] w-10 items-center justify-center rounded-lg transition-colors',
                view === v ? 'bg-card-3 text-text' : 'text-text-2 hover:text-text',
              )}
            >
              <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-[18px] border-b border-line">
        <Tabs
          label="Projects"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'all', label: C.projects.tabs.all },
            { value: 'shared', label: C.projects.tabs.shared },
          ]}
          className="gap-[43px] [&_button]:text-xs"
        />
      </div>

      {tab === 'shared' ? (
        <QuietEmpty text={C.projects.sharedEmpty} />
      ) : shown.length === 0 && damaged.length === 0 ? (
        <QuietEmpty text={C.projects.noMatch(query.trim())} />
      ) : view === 'grid' ? (
        <div className="mt-6 grid grid-cols-3 gap-6">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} now={now} onChanged={onChanged} />
          ))}
          {damaged.map((d) => (
            <DamagedCard key={d.id} project={d} onChanged={onChanged} />
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {shown.map((p) => (
            <ProjectRow key={p.id} project={p} now={now} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function QuietEmpty({ text }: { text: string }) {
  return (
    <div className="mt-6 flex h-[220px] flex-col items-center justify-center gap-3 rounded-card border border-line bg-panel">
      <Pip state="idle" size={56} decorative seed={12} />
      <p className="text-[13px] leading-4 text-text-2">{text}</p>
    </div>
  );
}
