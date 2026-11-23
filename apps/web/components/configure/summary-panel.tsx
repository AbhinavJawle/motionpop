'use client';

import { Cloud, Zap } from 'lucide-react';
import { btn, paper } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import type { Summary } from '@/lib/configure/summary';

/**
 * The sticky summary (spec 39 R2.7): every enabled step and its price, the total and Create.
 * Paid steps show their route chip first (hybrid-ai.md: the route is shown before the action).
 */
export function SummaryPanel({
  summary,
  creating,
  preparing,
  onCreate,
  disabledReason,
}: {
  summary: Summary;
  creating: boolean;
  /** Prep percent while not ready (Create still works and picks it up, R2.8). */
  preparing: number | null;
  onCreate: () => void;
  disabledReason?: string;
}) {
  const reason = disabledReason ?? summary.block;
  return (
    <aside
      aria-label="Summary"
      className={cn(paper.frame, paper.raised, 'flex flex-col self-start p-5 lg:sticky lg:top-24')}
    >
      <h2 className="font-poster text-[32px] leading-none">Summary</h2>
      <ul className="mt-4 flex flex-col">
        {summary.rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 border-b border-dashed border-black/15 py-2 text-[13px] last:border-b-0"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                {r.label}
                {r.route === 'cloud' && (
                  <Cloud
                    className="size-3.5 text-violet"
                    strokeWidth={2.2}
                    aria-label="runs in the cloud"
                  />
                )}
                {r.route === 'device' && (
                  <Zap
                    className="size-3.5 text-voice-2"
                    strokeWidth={2.2}
                    aria-label="runs on this device"
                  />
                )}
              </span>
              {r.note && <span className="block text-[11px] text-black/50">{r.note}</span>}
            </span>
            <span
              className={cn(
                'shrink-0 text-right whitespace-nowrap',
                r.credits > 0 ? 'font-semibold' : 'text-black/60',
              )}
            >
              {r.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t-2 border-ink pt-3">
        <span className="text-[14px] font-semibold">Total</span>
        <span className="flex items-baseline gap-1.5">
          {summary.totalUpTo && <span className="text-[12px] text-black/60">up to</span>}
          <span className="font-poster text-[40px] leading-none">{summary.total}</span>
          <span className="text-[13px]">{summary.total === 1 ? 'credit' : 'credits'}</span>
        </span>
      </div>
      {summary.note && <p className="mt-1 text-[11px] text-black/55">{summary.note}</p>}
      <button
        type="button"
        onClick={onCreate}
        disabled={creating || Boolean(reason)}
        className={btn('flame', 'lg', false, 'mt-5 w-full justify-center text-[16px]')}
      >
        {creating ? 'Starting…' : 'Create'}
      </button>
      <p className="mt-2 min-h-[16px] text-center text-[11px] text-black/55" aria-live="polite">
        {reason ??
          (preparing !== null
            ? `Still preparing (${preparing}%). Create now and it carries on.`
            : 'Nothing is spent until you press Create.')}
      </p>
    </aside>
  );
}
