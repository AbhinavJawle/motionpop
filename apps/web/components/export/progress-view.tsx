'use client';

import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { NumberRoll } from '@/components/ui/number-roll';
import { cn } from '@/lib/cn';
import { stageLine } from '@/lib/renders/export-flow';
import type { RenderView } from '@/lib/renders/render-client';
import { exportStageSteps } from '@/lib/renders/subtitles';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Progress (design §13.2 + spec 46 R3.1): Pip thinking on the ember bloom, rolling percentage,
 * violet bar, stage line, live elapsed timer, and a 4-stage pipeline checklist.
 */
export function ProgressView({
  view,
  hasStockLayers = false,
  startedAtMs = null,
}: {
  view: RenderView | null;
  hasStockLayers?: boolean;
  startedAtMs?: number | null;
}) {
  const percent = view?.progress ?? 0;
  const stage = stageLine(view?.status);
  const steps = exportStageSteps(view?.status, percent, {
    hasStockLayers,
    transparent: Boolean(view?.transparent),
  });
  const renderKey = view?.renderId ?? '';
  const [elapsedSec, setElapsedSec] = useState(() =>
    startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0,
  );

  useEffect(() => {
    const t0 = startedAtMs ?? Date.now();
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
    };
  }, [renderKey, startedAtMs]);

  return (
    <div className="flex min-h-[485px] flex-col items-center justify-center pb-4 text-center">
      <div className="relative flex size-[164px] items-center justify-center">
        <span aria-hidden className="absolute inset-0 bg-ember-bloom" />
        <Pip state="thinking" size={108} />
      </div>
      <NumberRoll
        value={percent}
        suffix="%"
        group={false}
        className="mt-1 text-[38px] leading-[44px] font-semibold"
        aria-label={`${percent} percent`}
      />
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-card-2"
      >
        <div
          className="h-full rounded-full bg-violet-fill transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p role="status" className="text-[13px] leading-[17px] font-medium text-text">
          {stage}
        </p>
        <span
          aria-label="Elapsed time"
          className="tabular rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10.5px] leading-3.5 text-text-3"
        >
          {formatElapsed(elapsedSec)}
        </span>
      </div>

      <ol
        aria-label="Export stages"
        data-testid="export-stage-stepper"
        className="mt-5 w-full space-y-2 rounded-[12px] border border-dialog-line bg-white/[0.025] p-3 text-left"
      >
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                s.state === 'done' && 'bg-mint/20 text-mint',
                s.state === 'active' && 'bg-violet/20 text-violet-icon',
                s.state === 'pending' && 'bg-white/[0.06] text-text-4',
              )}
            >
              {s.state === 'done' ? (
                <Check className="size-2.5" strokeWidth={2.6} />
              ) : s.state === 'active' ? (
                <Loader2
                  className="size-2.5 animate-spin motion-reduce:animate-none"
                  strokeWidth={2.4}
                />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-[12px] leading-4 font-medium',
                  s.state === 'done' && 'text-text-2',
                  s.state === 'active' && 'text-text',
                  s.state === 'pending' && 'text-text-3',
                )}
              >
                {s.label}
              </div>
              <div className="text-[10.5px] leading-3.5 text-text-3">{s.hint}</div>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[11px] leading-[14px] text-text-3">
        You can keep editing. Pip will tell you when it&apos;s ready.
      </p>
    </div>
  );
}
