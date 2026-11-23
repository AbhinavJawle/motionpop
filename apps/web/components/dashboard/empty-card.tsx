'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, Bubble, paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { springPop } from '@/lib/motion/presets';

export type CatchState = 'idle' | 'over' | 'caught';

/** Pip's "Drop it, I'll catch it!" bubble while files are over the page. */
export function CatchPill() {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springPop}
      className="inline-block"
    >
      <Bubble>{C.drag.pill}</Bubble>
    </motion.span>
  );
}

/**
 * The empty dashboard (spec 35): Pip juggling beside an invitation to make the first video, and
 * the same frame catching files while they are dragged over the page (spec 11 R4.1–R4.3).
 * `onWake` focuses the capture bar, for the "paste a script" path.
 */
export function EmptyCard({ drag, onWake }: { drag: CatchState; onWake: () => void }) {
  const router = useRouter();
  const catching = drag !== 'idle';

  return (
    <section
      aria-label="No projects yet"
      className={cn(
        paper.frame,
        'relative grid items-center gap-8 overflow-hidden px-8 py-12 transition-colors duration-200 md:grid-cols-[minmax(0,1fr)_320px] md:px-14',
        catching && 'border-dashed bg-[#eef5fc]',
      )}
    >
      <div>
        {catching ? (
          <>
            <CatchPill />
            <p className={cn(poster, 'mt-8 text-[56px]')}>{C.drag.body}</p>
            <p className="mt-4 text-[13px] text-black/60">{C.drag.formats}</p>
          </>
        ) : (
          <>
            <h2 className={cn(poster, 'max-w-[620px] text-[clamp(48px,6vw,76px)]')}>
              {C.empty.title}
            </h2>
            <p className="mt-5 max-w-[540px] text-[15px] leading-[1.65]">{C.empty.body}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => router.push('/start')}
                className={btn('ink', 'lg')}
              >
                {C.empty.cta}
              </button>
              <Link href="/processing/new" className={btn('paper', 'lg')}>
                {C.empty.sample}
              </Link>
              <button type="button" onClick={onWake} className={paper.link}>
                Paste a script
              </button>
            </div>
            <p className="mt-8 text-[12px] text-black/55">{C.empty.foot}</p>
          </>
        )}
      </div>
      <div className="hidden justify-center md:flex" aria-hidden>
        <PipLoop name="juggle" className="size-[300px] select-none" />
      </div>
    </section>
  );
}
