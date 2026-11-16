'use client';

import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toast';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { hoverLift } from '@/lib/motion/presets';
import { StylePoster, type PosterKind } from './style-poster';

/** The five designed cards (R6.1). `styleId` is set only for styles that exist today. */
const STYLES: ReadonlyArray<{ kind: PosterKind; name: string; line: string; styleId?: string }> = [
  {
    kind: 'editorial',
    name: 'Editorial Explainer',
    line: 'A point of view for every idea.',
    styleId: 'editorial-explainer',
  },
  { kind: 'dark-money', name: 'Dark Money', line: 'Make the numbers tell a story.' },
  { kind: 'clean-minimal', name: 'Clean Minimal', line: 'Less noise. More meaning.' },
  {
    kind: 'paper-collage',
    name: 'Paper Collage',
    line: 'A little rough. Full of character.',
    styleId: 'paper-collage',
  },
  { kind: 'neon-data', name: 'Neon Data', line: 'Big signals. Bold energy.' },
];

/**
 * "Try a style" (projects.png: title at y 1006, cards 256×204 r12 with 16 px gaps, the fifth
 * clipped by the content edge). Built styles open Start with the style chosen; the others
 * answer with an "on its way" toast (R6.2). Static posters until live previews land (task 12).
 */
export function TryAStyle() {
  const router = useRouter();
  return (
    <section aria-labelledby="try-a-style" className="mt-[70px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 id="try-a-style" className="text-[22px] leading-7 font-semibold tracking-[-0.3px]">
            {C.styles.title}
          </h2>
          <p className="mt-[9px] text-[13px] leading-4 text-text-2">{C.styles.subline}</p>
        </div>
        <button
          type="button"
          onClick={() => toast(C.toasts.exploreStyles)}
          className="mt-[4px] mr-[42px] flex items-center gap-1 text-[13px] leading-4 text-violet-ink-2 transition-colors hover:text-violet-ink"
        >
          {C.styles.explore}
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div className="mt-[18px] flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">
        {STYLES.map((s) => (
          <motion.button
            key={s.kind}
            type="button"
            {...hoverLift}
            onClick={() =>
              s.styleId
                ? router.push(`/start?style=${encodeURIComponent(s.styleId)}`)
                : toast(C.toasts.styleSoon(s.name))
            }
            className="w-64 shrink-0 overflow-hidden rounded-card border border-line bg-card text-left shadow-quiet outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <StylePoster kind={s.kind} className="h-[126px] w-full" />
            <span className="block px-4 pt-[18px] pb-5">
              <span className="block text-sm leading-[18px] font-medium text-text">{s.name}</span>
              <span className="mt-[9px] block text-[11px] leading-[14px] text-text-2">
                {s.line}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
