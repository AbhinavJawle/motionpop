import type { ReactNode } from 'react';
import { Pip } from '@/components/pip/pip';
import type { PipState } from '@/components/pip/states';

/**
 * Pip with ember sound arcs in a bloom, eyebrow, headline and subline (start.png and
 * recording.png: Pip ~120 px centred at y 215, eyebrow y 314, headline 40 px y 340, subline
 * 16 px y 404). Shared by Start and Recording.
 */
export function StartHero({
  eyebrow,
  headline,
  subline,
  pip = 'idle',
  pipSlot,
}: {
  eyebrow: string;
  headline: string;
  subline: string;
  pip?: PipState;
  /** Replaces the Pip (the recorder drives its own, reacting to the level). */
  pipSlot?: ReactNode;
}) {
  return (
    <section className="relative flex flex-col items-center pt-[80px] text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[10px] left-1/2 h-[420px] w-[460px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_122_61/0.14),rgb(255_122_61/0.04)_55%,transparent)]"
      />
      <div className="relative h-[150px]">
        {pipSlot ?? <Pip state={pip} size={150} props={['arcs']} decorative seed={6} />}
      </div>
      <p className="relative mt-[22px] text-[10px] leading-[13px] font-medium tracking-[2.2px] text-text-2">
        {eyebrow}
      </p>
      <h1 className="relative mt-[18px] text-[40px] leading-[48px] font-semibold tracking-[-1px]">
        {headline}
      </h1>
      <p className="relative mt-[10px] text-base leading-5 text-text-2">{subline}</p>
    </section>
  );
}
