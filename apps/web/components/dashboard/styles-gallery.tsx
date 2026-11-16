'use client';

import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { styleOptions } from '@/lib/inspector/timing-view';
import { hoverLift } from '@/lib/motion/presets';
import { DashboardTopBar } from './dashboard-top-bar';

/**
 * `/styles`: every look a creator can start from, with a still of the same scene in each, what
 * it feels like and its tags. "Start with this style" opens Start with the look chosen; a look
 * can also be changed any time in the editor's Styles panel.
 */
export function StylesGallery() {
  const router = useRouter();
  const options = styleOptions();
  return (
    <div className="min-h-dvh bg-bg text-text">
      <DashboardTopBar active="styles" />
      <main className="mx-auto max-w-[1440px] px-[72px] pt-12 pb-20">
        <p className="text-[11px] leading-[14px] font-medium tracking-[1.4px] text-ember uppercase">
          Styles
        </p>
        <h1 className="mt-2 text-[34px] leading-[40px] font-semibold tracking-[-0.6px]">
          Pick a look. Every graphic follows it.
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-5 text-text-2">
          A look sets the colours, type, textures, maps and how everything moves. You can switch
          looks any time in the editor, and the whole video restyles in one step.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-6 xl:grid-cols-3">
          {options.map((o) => {
            const still = LOOK_STILLS[o.id];
            return (
              <motion.article
                key={o.id}
                {...hoverLift}
                className="flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-quiet"
              >
                {still ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small static stills
                  <img src={still} alt="" className="block aspect-video w-full" loading="lazy" />
                ) : (
                  <div
                    aria-hidden
                    className="aspect-video w-full"
                    style={{ background: o.colors.bg }}
                  />
                )}
                <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                  <h2 className="text-[17px] leading-[22px] font-semibold">{o.name}</h2>
                  <p className="mt-1 text-[13px] leading-[18px] text-text-2">{o.tagline}</p>
                  <p className="mt-2 text-[12px] leading-[17px] text-text-3">{o.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] leading-4 text-text-2"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/start?style=${encodeURIComponent(o.id)}`)}
                    className="group mt-auto flex items-center justify-between pt-5 text-[13px] leading-4 font-medium text-violet-ink-2 hover:text-violet-ink"
                  >
                    Start with this style
                    <ArrowRight
                      className="size-4 text-violet transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
