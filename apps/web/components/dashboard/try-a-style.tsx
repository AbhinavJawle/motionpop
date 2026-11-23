'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { styleOptions } from '@/lib/inspector/timing-view';

/**
 * "Try a look" (spec 35): the looks that have a still, each opening Start with that look
 * chosen, and a link to every look.
 */
export function TryAStyle() {
  const router = useRouter();
  const looks = styleOptions()
    .filter((o) => LOOK_STILLS[o.id])
    .slice(0, 4);
  return (
    <section aria-labelledby="try-a-style" className="mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <h2 id="try-a-style" className={cn(poster, 'text-[44px]')}>
            {C.styles.title}
          </h2>
          <p className="mt-2 text-[13px] text-black/65">{C.styles.subline}</p>
        </div>
        <Link href="/styles" className={paper.link}>
          {C.styles.explore}
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {looks.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => router.push(`/start?style=${encodeURIComponent(o.id)}`)}
            className={cn(
              paper.frame,
              paper.press,
              'overflow-hidden text-left outline-none focus-visible:ring-4 focus-visible:ring-flame',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small static stills */}
            <img
              src={LOOK_STILLS[o.id]}
              alt=""
              loading="lazy"
              className="block aspect-video w-full border-b-2 border-ink object-cover"
            />
            <span className="block px-4 pt-3 pb-4">
              <span className={cn(poster, 'block text-[26px]')}>{o.name}</span>
              <span className="mt-1 block text-[12px] leading-[1.45] text-black/65">
                {o.tagline}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
