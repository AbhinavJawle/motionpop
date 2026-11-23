import type { ReactNode } from 'react';
import { PipLoop, type PipLoopName } from '@/components/landing/pip-loop';
import { Bubble, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';

/**
 * The header of Start and Recording (spec 35): a left-aligned poster headline and subline, with
 * Pip on the right saying `bubble`. Shared by Start and Recording.
 */
export function StartHero({
  bubble,
  headline,
  subline,
  pip = 'clapper',
  pipSlot,
}: {
  /** Pip's line, in the speech bubble. */
  bubble: string;
  headline: string;
  subline: string;
  pip?: PipLoopName;
  /** Replaces the Pip loop. */
  pipSlot?: ReactNode;
}) {
  return (
    <section className="relative flex items-end justify-between gap-8 pt-14 pb-10">
      <div className="max-w-[760px]">
        <h1 className={cn(poster, 'text-[clamp(56px,7vw,104px)]')}>{headline}</h1>
        <p className="mt-5 max-w-[560px] text-[15px] leading-[1.65]">{subline}</p>
      </div>
      <div className="relative hidden h-[230px] w-[290px] shrink-0 md:block" aria-hidden>
        <Bubble right className="absolute top-2 right-[60px] whitespace-nowrap">
          {bubble}
        </Bubble>
        {pipSlot ?? (
          <PipLoop name={pip} className="absolute -right-4 -bottom-8 size-[210px] select-none" />
        )}
      </div>
    </section>
  );
}
