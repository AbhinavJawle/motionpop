'use client';

import { Pip } from '@/components/pip/pip';
import { NumberRoll } from '@/components/ui/number-roll';
import { stageLine } from '@/lib/renders/export-flow';
import type { RenderView } from '@/lib/renders/render-client';

/**
 * Progress (design §13.2, not designed): Pip thinking on the ember bloom, the percentage in mono
 * (rolling), a violet bar (a render is cloud work) and the stage line. Closing keeps the render.
 */
export function ProgressView({ view }: { view: RenderView | null }) {
  const percent = view?.progress ?? 0;
  const stage = stageLine(view?.status);
  return (
    <div className="flex min-h-[485px] flex-col items-center justify-center pb-6 text-center">
      <div className="relative flex size-[200px] items-center justify-center">
        <span aria-hidden className="absolute inset-0 bg-ember-bloom" />
        <Pip state="thinking" size={120} />
      </div>
      <NumberRoll
        value={percent}
        suffix="%"
        group={false}
        className="mt-1 text-[40px] leading-[48px] font-semibold"
        aria-label={`${percent} percent`}
      />
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-card-2"
      >
        <div
          className="h-full rounded-full bg-violet-fill transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p role="status" className="mt-4 text-[13px] leading-[17px] text-text-2">
        {stage}
      </p>
      <p className="mt-2 text-[11px] leading-[14px] text-text-3">
        You can keep editing. Pip will tell you when it&apos;s ready.
      </p>
    </div>
  );
}
