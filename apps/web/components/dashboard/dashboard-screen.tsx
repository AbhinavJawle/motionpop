'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { useRef, useState } from 'react';
import { AppBar } from '@/components/paper/app-bar';
import { PaperPage } from '@/components/paper/kit';
import { Shimmer } from '@/components/ui/shimmer';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { dashboardStats } from '@/lib/dashboard/format';
import { useNow } from '@/lib/dashboard/use-now';
import { useProjectList } from '@/lib/projects/use-project-list';
import { AiModesBanner } from './ai-modes-banner';
import { CaptureBar, type CaptureBarHandle } from './capture-bar';
import { ContinueCard } from './continue-card';
import { DropOverlay, useFileDrop } from './drop-layer';
import { EmptyCard } from './empty-card';
import { GreetingHeader } from './greeting-header';
import { HelpSheet } from './help-sheet';
import { ProjectsSection } from './projects-section';
import { TryAStyle } from './try-a-style';
import { WorkingSection } from './working-section';

export const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-10';

/**
 * `/dashboard` (spec 11, paper in spec 35, elevated studio layout in spec 42):
 * film-strip navbar, slim top Hybrid AI & BYOK bar, compact studio greeting + AI KPIs,
 * media-first AI upload/script launcher, and immediate above-the-fold recent projects.
 */
export function DashboardScreen() {
  const now = useNow();
  const capture = useRef<CaptureBarHandle>(null);
  const [help, setHelp] = useState(false);
  const { list, reload } = useProjectList();
  const drag = useFileDrop();
  const empty =
    list.kind === 'ready' &&
    list.listing.projects.length === 0 &&
    list.listing.damaged.length === 0;
  const listing = list.kind === 'ready' && !empty ? list.listing : null;
  const last = listing?.projects.reduce<ProjectSummary | null>(
    (best, p) => (!best || p.lastOpenedAt > best.lastOpenedAt ? p : best),
    null,
  );
  const stats =
    listing && now !== null
      ? dashboardStats(listing.projects, now, new Date(now).getTimezoneOffset())
      : null;

  return (
    <PaperPage className="relative">
      <AppBar active="projects" />
      <AiModesBanner />
      <main className={WRAP}>
        <GreetingHeader now={now} stats={stats} />
        <CaptureBar ref={capture} />
        <div className="mt-6">
          <WorkingSection />
          {list.kind === 'loading' && <LoadingBody />}
          {list.kind === 'error' && (
            <p className="rounded-xl border-2 border-ink px-6 py-8 text-sm">
              Pip couldn&apos;t read your projects in this browser. Reload to try again.
            </p>
          )}
          {empty && <EmptyCard drag={drag} onWake={() => capture.current?.focus()} />}
          {listing && (
            <>
              {last && (
                <ContinueCard
                  project={last}
                  now={now}
                  totalProjects={listing.projects.length + listing.damaged.length}
                />
              )}
              <ProjectsSection listing={listing} now={now} onChanged={() => void reload()} />
            </>
          )}
        </div>
        <TryAStyle />
      </main>
      <footer className={`${WRAP} mt-20`}>
        <div className="flex items-center justify-between border-t-2 border-ink py-6 text-[12px]">
          <span>{C.footer.line}</span>
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="underline decoration-[1.5px] underline-offset-4 hover:decoration-flame"
          >
            {C.footer.help}
          </button>
        </div>
      </footer>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
      <DropOverlay state={drag} floating={!empty} />
    </PaperPage>
  );
}

/** The skeleton while the list loads (shimmer; still under reduced motion). */
function LoadingBody() {
  return (
    <div aria-busy="true" aria-label="Loading projects" className="flex flex-col gap-6">
      <div className="relative h-[220px] overflow-hidden rounded-xl bg-mist">
        <Shimmer tone="neutral" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative h-[240px] overflow-hidden rounded-xl bg-mist">
            <Shimmer tone="neutral" />
          </div>
        ))}
      </div>
    </div>
  );
}
