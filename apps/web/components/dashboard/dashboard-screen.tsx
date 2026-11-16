'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { useRef, useState } from 'react';
import { Shimmer } from '@/components/ui/shimmer';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { dashboardStats, formatSaved } from '@/lib/dashboard/format';
import { useNow } from '@/lib/dashboard/use-now';
import { useProjectList } from '@/lib/projects/use-project-list';
import { CaptureBar, type CaptureBarHandle } from './capture-bar';
import { ContinueCard } from './continue-card';
import { DashboardTopBar } from './dashboard-top-bar';
import { DropOverlay, useFileDrop } from './drop-layer';
import { EmptyCard } from './empty-card';
import { GreetingHeader } from './greeting-header';
import { HelpSheet } from './help-sheet';
import { ProjectsSection } from './projects-section';
import { StatTile } from './stat-tile';
import { TryAStyle } from './try-a-style';

/** `/dashboard` (spec 11 R2–R6): top bar, greeting, capture bar, body, footer. */
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
    <div className="relative min-h-dvh min-w-[1280px] bg-bg text-text">
      <DashboardTopBar />
      <main className="mx-auto max-w-[1440px] px-[72px]">
        <GreetingHeader now={now} />
        <CaptureBar ref={capture} />
        <div className="mt-14">
          {list.kind === 'loading' && <LoadingBody />}
          {list.kind === 'error' && (
            <p className="rounded-card bg-panel px-6 py-8 text-sm text-text-2">
              Pip couldn&apos;t read your projects in this browser. Reload to try again.
            </p>
          )}
          {empty && <EmptyCard drag={drag} onWake={() => capture.current?.focus()} />}
          {listing && (
            <>
              {last && <ContinueCard project={last} now={now} />}
              {stats && (
                <div className="mt-8 grid grid-cols-3 gap-6">
                  <StatTile
                    value={stats.videos}
                    label="videos this week"
                    spark={stats.spark.videos}
                    color="var(--color-ember)"
                  />
                  <StatTile
                    value={stats.graphics}
                    label="graphics generated"
                    spark={stats.spark.graphics}
                    color="var(--color-violet)"
                  />
                  <StatTile
                    text={formatSaved(stats.savedMin)}
                    label="saved"
                    spark={stats.spark.saved}
                    color="var(--color-ember)"
                  />
                </div>
              )}
              <ProjectsSection listing={listing} now={now} onChanged={() => void reload()} />
            </>
          )}
        </div>
        <TryAStyle />
      </main>
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between px-[72px] pt-[60px] pb-[26px] text-[11px] leading-[14px] text-text-3">
        <span>{C.footer.line}</span>
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="mr-[13px] transition-colors hover:text-text"
        >
          {C.footer.help}
        </button>
      </footer>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
      <DropOverlay state={drag} floating={!empty} />
    </div>
  );
}

/** The skeleton while the list loads (shimmer; still under reduced motion). */
function LoadingBody() {
  return (
    <div aria-busy="true" aria-label="Loading projects" className="flex flex-col gap-6">
      <div className="relative h-[320px] overflow-hidden rounded-[20px] bg-panel">
        <Shimmer tone="neutral" />
      </div>
      <div className="grid grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative h-[88px] overflow-hidden rounded-card bg-panel">
            <Shimmer tone="neutral" />
          </div>
        ))}
      </div>
    </div>
  );
}
