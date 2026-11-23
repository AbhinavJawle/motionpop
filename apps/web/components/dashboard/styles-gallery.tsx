'use client';

import { useRouter } from 'next/navigation';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { styleOptions } from '@/lib/inspector/timing-view';

/**
 * `/styles`: every look a creator can start from, with a still of the same scene in each, what
 * it feels like and its tags. "Start with this style" opens Start with the look chosen; a look
 * can also be changed any time in the editor's Styles panel.
 */
export function StylesGallery() {
  const router = useRouter();
  const options = styleOptions();
  return (
    <PaperPage>
      <AppBar active="styles" />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-14 pb-24 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-8">
          <div>
            <h1 className={cn(poster, 'text-[clamp(56px,7vw,104px)]')}>
              Pick a look.
              <br />
              Every graphic follows it.
            </h1>
            <p className="mt-5 max-w-[620px] text-[15px] leading-[1.65]">
              A look sets the colours, type, textures, maps and how everything moves. You can switch
              looks any time in the editor, and the whole video restyles in one step.
            </p>
          </div>
        </div>
        <div className="mt-10 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
          {options.map((o) => {
            const still = LOOK_STILLS[o.id];
            return (
              <article
                key={o.id}
                className={cn(paper.frame, paper.press, 'flex flex-col overflow-hidden')}
              >
                {still ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small static stills
                  <img
                    src={still}
                    alt=""
                    className="block aspect-video w-full border-b-2 border-ink object-cover"
                    loading="lazy"
                  />
                ) : (
                  <LookSwatch colors={o.colors} name={o.name} />
                )}
                <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
                  <h2 className={cn(poster, 'text-[34px]')}>{o.name}</h2>
                  <p className="mt-1.5 text-[13px] font-semibold">{o.tagline}</p>
                  <p className="mt-2 text-[12px] leading-[1.6] text-black/65">{o.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border-2 border-ink px-1.5 py-px text-[11px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/start?style=${encodeURIComponent(o.id)}`)}
                    className={btn('ink', 'md', false, 'mt-auto self-start')}
                  >
                    Start with this look
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </PaperPage>
  );
}

/** A look without a still: its own paper, ink and accents, set like a title card. */
function LookSwatch({
  colors,
  name,
}: {
  colors: { bg: string; ink?: string; accent?: string; accent2?: string };
  name: string;
}) {
  return (
    <div
      aria-hidden
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-b-2 border-ink"
      style={{ background: colors.bg, color: colors.ink ?? '#000' }}
    >
      <span className="font-poster text-[56px] leading-none tracking-[0.01em] uppercase">40%</span>
      <span className="absolute right-5 bottom-5 flex gap-1.5">
        {[colors.ink, colors.accent, colors.accent2].filter(Boolean).map((c, i) => (
          <span
            key={i}
            className="size-4 rounded-full border-2 border-ink"
            style={{ background: c }}
          />
        ))}
      </span>
      <span className="sr-only">{name}</span>
    </div>
  );
}
