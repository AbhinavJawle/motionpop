'use client';

import { Film, Sparkles, Timer } from 'lucide-react';
import { PipLoop } from '@/components/landing/pip-loop';
import { poster } from '@/components/paper/kit';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/cn';
import { formatSaved, type DashboardStats } from '@/lib/dashboard/format';
import { greet } from '@/lib/dashboard/greeting';

/** Tiny inline 7-day sparkline for the studio KPI strip. */
function MiniSpark({ values }: { values: readonly number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span aria-hidden className="ml-1 inline-flex h-4 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px] bg-ink/75"
          style={{ height: `${Math.max(3, Math.round((v / max) * 16))}px` }}
        />
      ))}
    </span>
  );
}

/**
 * Compact AI studio header (Spec 35 + Spec 42): tighter single-line greeting, AI studio badge,
 * live workspace KPI pills (AI videos, AI graphics, time saved), and compact Pip mascot so the
 * capture bar and recent projects sit immediately above the fold.
 */
export function GreetingHeader({
  now,
  stats,
}: {
  now: number | null;
  stats?: DashboardStats | null;
}) {
  const auth = useAuth();
  const name = auth.status === 'signed-in' ? auth.user.displayName : null;
  const g = now === null ? null : greet(new Date(now).getHours(), name);

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 pt-5 pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-ink bg-[#fde68a] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase">
            <Sparkles className="size-3" strokeWidth={2.2} aria-hidden />
            AI Video &amp; Motion Graphics Studio
          </span>
          {g && <span className="hidden text-[12px] text-black/60 sm:inline">{g.subline}</span>}
        </div>
        <h1
          data-testid="dashboard-title"
          className={cn(poster, 'mt-1.5 text-[clamp(30px,3.6vw,46px)] leading-[0.95]')}
        >
          {g ? g.line : '\u00a0'}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {stats && (
          <dl
            aria-label="This week's AI studio stats"
            className="hidden items-center gap-2 md:flex"
          >
            <div className="flex items-center gap-2 rounded-lg border-2 border-ink bg-paper px-3 py-1.5 shadow-[2px_2px_0_#000]">
              <Film className="size-3.5 shrink-0 text-ink" strokeWidth={2} aria-hidden />
              <div>
                <dd className="font-poster text-[20px] leading-none tabular-nums">
                  {stats.videos}
                </dd>
                <dt className="font-mono text-[9px] text-black/60 uppercase">AI videos</dt>
              </div>
              <MiniSpark values={stats.spark.videos} />
            </div>
            <div className="flex items-center gap-2 rounded-lg border-2 border-ink bg-paper px-3 py-1.5 shadow-[2px_2px_0_#000]">
              <Sparkles className="size-3.5 shrink-0 text-flame" strokeWidth={2} aria-hidden />
              <div>
                <dd className="font-poster text-[20px] leading-none tabular-nums">
                  {stats.graphics}
                </dd>
                <dt className="font-mono text-[9px] text-black/60 uppercase">AI graphics</dt>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border-2 border-ink bg-[#d1fae5] px-3 py-1.5 shadow-[2px_2px_0_#000]">
              <Timer className="size-3.5 shrink-0 text-ink" strokeWidth={2} aria-hidden />
              <div>
                <dd className="font-poster text-[20px] leading-none tabular-nums">
                  {formatSaved(stats.savedMin)}
                </dd>
                <dt className="font-mono text-[9px] text-black/70 uppercase">AI time saved</dt>
              </div>
            </div>
          </dl>
        )}
        <div className="hidden shrink-0 sm:block" aria-hidden>
          <PipLoop name="clapper" className="size-[64px] select-none" />
        </div>
      </div>
    </section>
  );
}
