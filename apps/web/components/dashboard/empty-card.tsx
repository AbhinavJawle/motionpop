'use client';

import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pip } from '@/components/pip/pip';
import type { PipState } from '@/components/pip/states';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { buttonMotion, fadeIn, springPop } from '@/lib/motion/presets';

export type CatchState = 'idle' | 'over' | 'caught';

/** The "Drop it, I'll catch it!" pill (projects-drag-over.png: 248×48, ember tint). */
export function CatchPill() {
  return (
    <motion.p
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springPop}
      className="flex h-12 w-[248px] items-center justify-center rounded-[24px] border border-ember/35 bg-ember/14 text-[15px] leading-5 font-medium text-ember-ink"
    >
      {C.drag.pill}
    </motion.p>
  );
}

/**
 * The empty state (projects-empty.png: 1296×536 at y 400, panel colour, r20) and, while files
 * are dragged over the page, its catching variant (projects-drag-over.png) in place (R4.1–R4.3).
 */
export function EmptyCard({ drag, onWake }: { drag: CatchState; onWake: () => void }) {
  const router = useRouter();
  const [pip, setPip] = useState<'asleep' | 'peek' | 'awake'>('asleep');
  const catching = drag !== 'idle';
  const state: PipState = catching
    ? drag === 'caught'
      ? 'caught'
      : 'catching'
    : pip === 'asleep'
      ? 'sleeping'
      : pip === 'peek'
        ? 'waking'
        : 'waving';

  return (
    <section
      aria-label="No projects yet"
      className={cn(
        'relative flex h-[536px] flex-col items-center rounded-[20px] border transition-colors duration-200',
        catching
          ? 'border-ember/35 bg-[linear-gradient(180deg,rgb(255_122_61/0.12),rgb(255_122_61/0.04))]'
          : 'border-line bg-panel shadow-quiet',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {catching ? (
          <motion.div key="catch" {...fadeIn} className="flex flex-col items-center pt-6">
            <CatchPill />
            <div className="mt-6 h-[160px]">
              <Pip state={state} size={150} glow decorative seed={8} props={['nightcap']} />
            </div>
            <h2 className="mt-[34px] text-[28px] leading-9 font-semibold tracking-[-0.4px]">
              {C.empty.title}
            </h2>
            <p className="mt-4 text-[15px] leading-5 text-text-2">{C.drag.body}</p>
            <p className="mt-[42px] font-mono text-[11px] leading-[14px] tracking-[0.6px] text-text-3">
              {C.drag.formats}
            </p>
          </motion.div>
        ) : (
          <motion.div key="empty" {...fadeIn} className="flex flex-col items-center pt-[56px]">
            <button
              type="button"
              aria-label="Wake Pip up"
              onPointerEnter={() => setPip((p) => (p === 'asleep' ? 'peek' : p))}
              onPointerLeave={() => setPip((p) => (p === 'peek' ? 'asleep' : p))}
              onClick={() => {
                setPip('awake');
                onWake();
              }}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              <Pip
                state={state}
                size={170}
                glow
                decorative
                seed={4}
                props={['nightcap', ...(pip === 'asleep' ? (['cloud'] as const) : [])]}
              />
            </button>
            <h2 className="mt-[30px] text-[28px] leading-9 font-semibold tracking-[-0.4px]">
              {C.empty.title}
            </h2>
            <p className="mt-4 text-[15px] leading-5 text-text-2">{C.empty.body}</p>
            <motion.button
              type="button"
              {...buttonMotion}
              onClick={() => router.push('/start')}
              className="mt-[34px] inline-flex h-12 w-60 items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(180deg,#FF975C,#FF7A3D)] text-sm leading-[18px] font-semibold text-[#2A1308] shadow-[0_4px_20px_rgb(255_122_61/0.18),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-105"
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden />
              {C.empty.cta}
            </motion.button>
            <p className="mt-[34px] text-xs leading-4 text-text-2">{C.empty.foot}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
