'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PipLoop } from '@/components/landing/pip-loop';
import { toast } from '@/components/ui/toast';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { CONFIGURE, handOffFile } from '@/lib/intake/hand-off';
import { fadeIn, modal } from '@/lib/motion/presets';
import { CatchPill, type CatchState } from './empty-card';

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');

/**
 * Files dragged anywhere over the dashboard (R4.3–R4.5). A counter over `dragenter` and
 * `dragleave` on the window, so moving between child elements never flickers. On drop the
 * intake rules run, Pip catches for 600 ms, then Processing opens with the pending intake.
 */
export function useFileDrop(): CatchState {
  const router = useRouter();
  const [state, setState] = useState<CatchState>('idle');
  const depth = useRef(0);

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setState((s) => (s === 'caught' ? s : 'over'));
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setState((s) => (s === 'caught' ? s : 'idle'));
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      const file = e.dataTransfer?.files[0];
      if (!file) return setState('idle');
      void handOffFile(file).then((r) => {
        if (!r.ok) {
          setState('idle');
          toast.error(r.message);
          return;
        }
        setState('caught');
        setTimeout(() => router.push(CONFIGURE), 600);
      });
    };
    // Escape or a drag that ends outside the window.
    const end = () => {
      depth.current = 0;
      setState((s) => (s === 'caught' ? s : 'idle'));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', end);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', end);
    };
  }, [router]);

  return state;
}

/**
 * The whole-page dashed ember border (inset 16 px, r16, dash 10/6) and, with projects, the
 * catching card floating centred over a 40 % scrim.
 */
export function DropOverlay({ state, floating }: { state: CatchState; floating: boolean }) {
  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.div
          key="drop"
          {...fadeIn}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-50"
          data-testid="drop-overlay"
        >
          {floating && <div className="fixed inset-0 bg-paper/70" />}
          <svg className="fixed inset-3 h-[calc(100dvh-24px)] w-[calc(100vw-24px)] overflow-visible">
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx="16"
              fill="none"
              stroke="#000"
              strokeWidth="2.5"
              strokeDasharray="12 8"
            />
          </svg>
          {floating && (
            <motion.div
              {...modal}
              className="fixed top-1/2 left-1/2 flex w-[560px] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-[16px] border-2 border-ink bg-paper px-8 pt-8 pb-10 text-center shadow-[6px_6px_0_#000]"
            >
              <CatchPill />
              <PipLoop name="juggle" className="mt-4 size-[200px]" />
              <p className="font-poster text-[40px] leading-[0.95] uppercase">{C.drag.body}</p>
              <p className="mt-3 text-[13px] text-black/60">{C.drag.formats}</p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
