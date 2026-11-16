'use client';

import type { ProjectSummary } from '@motionpop/schemas';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Pip } from '@/components/pip/pip';
import { SlotDots } from '@/components/ui/slot-dots';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { relativeTime } from '@/lib/dashboard/format';
import { buttonMotion } from '@/lib/motion/presets';
import { posterKindFor, StylePoster } from './style-poster';

/**
 * "Continue where you left off" (projects.png: title at y 414, card 1296×320 at y 448 with a
 * 768 px preview half; Pip with popcorn on the card's top edge). Static poster for now (task 12).
 */
export function ContinueCard({ project, now }: { project: ProjectSummary; now: number | null }) {
  const router = useRouter();
  const open = () => router.push(`/editor/${encodeURIComponent(project.id)}`);
  return (
    <section aria-labelledby="continue-title" className="relative">
      <h2 id="continue-title" className="text-xl leading-[26px] font-semibold tracking-[-0.2px]">
        {C.continue.title}
      </h2>
      <div className="pointer-events-none absolute top-[-52px] right-[60px] z-10" aria-hidden>
        <Pip size={96} props={['popcorn']} decorative seed={9} look="cursor" />
      </div>
      <div className="mt-[22px] flex h-80 overflow-hidden rounded-[20px] border border-line bg-panel shadow-quiet">
        <button
          type="button"
          onClick={open}
          aria-label={`Open ${project.title}`}
          className="h-full w-[768px] shrink-0 overflow-hidden rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          <StylePoster
            kind={posterKindFor(project.styleId)}
            headline={project.title}
            loop={null}
            className="h-full w-full"
          />
        </button>
        <div className="flex flex-1 flex-col px-10 pt-[37px]">
          <p className="label-caps text-[10px] leading-[13px] tracking-[1.2px] text-ember">
            {C.continue.eyebrow}
          </p>
          <h3 className="mt-[13px] line-clamp-2 text-[26px] leading-[33px] font-semibold tracking-[-0.3px]">
            {project.title}
          </h3>
          <div className="mt-[22px] flex items-center justify-between pr-[128px]">
            <span className="text-xs leading-4 text-text-2">
              {project.readySlotCount} of {project.slotCount} slots ready
            </span>
            <SlotDots states={project.slotStates} tone="mint" />
          </div>
          <p className="mt-4 font-mono text-[11px] leading-[14px] text-text-2">
            Edited {now === null ? '' : relativeTime(project.updatedAt, now)}
          </p>
          <motion.button
            type="button"
            {...buttonMotion}
            onClick={open}
            className="mt-auto mb-10 inline-flex h-10 w-[148px] items-center justify-between rounded-chip bg-[linear-gradient(180deg,#FF975C,#FF7A3D)] pr-4 pl-6 text-[13px] leading-4 font-semibold text-[#2A1308] shadow-[0_4px_16px_rgb(255_122_61/0.12),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-105"
          >
            {C.continue.resume}
            <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
          </motion.button>
        </div>
      </div>
    </section>
  );
}
