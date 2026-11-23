import Link from 'next/link';
import { FORMATS, type Format } from '@motionpop/schemas';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, PaperPage, PipMark, poster, Sprockets } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { secondsText } from '@/lib/renders/export-flow';

/** The brand row at the top of the share page. */
function Brand() {
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="motionpop home">
          <PipMark />
          <span className="font-sans text-[22px] leading-none font-semibold tracking-[-0.03em]">
            motionpop
          </span>
        </Link>
        <Link href="/" className={btn('ink', 'sm')}>
          Make your own
        </Link>
      </div>
    </header>
  );
}

/** The shared video (spec 35): the player on a strip of film, then its title on paper. */
export function ShareVideo({
  title,
  durationMs,
  format,
  resolution,
  videoUrl,
  posterUrl,
}: {
  title: string;
  durationMs: number;
  format: Format;
  resolution: string;
  videoUrl: string;
  posterUrl?: string | undefined;
}) {
  const size = FORMATS[format];
  const vertical = size.height > size.width;
  return (
    <PaperPage className="flex flex-col">
      <Brand />
      <section className="bg-ink">
        <Sprockets className="opacity-30" />
        <div className="flex justify-center px-6 py-10">
          <div
            className="w-full overflow-hidden rounded-[10px]"
            style={{
              maxWidth: vertical ? 'min(960px, 70dvh * 9 / 16)' : 960,
              aspectRatio: `${size.width} / ${size.height}`,
            }}
          >
            <video
              controls
              playsInline
              preload="metadata"
              src={videoUrl}
              poster={posterUrl}
              aria-label={title}
              className="size-full bg-ink object-contain"
            />
          </div>
        </div>
        <Sprockets className="opacity-30" />
      </section>
      <main className="mx-auto flex w-full max-w-[1000px] flex-wrap items-end justify-between gap-6 px-6 pt-10 pb-20">
        <div>
          <h1 className={cn(poster, 'text-[clamp(48px,6vw,80px)]')}>{title}</h1>
          <p className="mt-4 flex flex-wrap gap-x-6 text-[13px] tabular">
            <span>{secondsText(durationMs)}</span>
            <span>{format}</span>
            <span>{resolution}</span>
          </p>
        </div>
        <p className="text-[13px] text-black/60">
          Made with motionpop: you talk, it makes it move.
        </p>
      </main>
    </PaperPage>
  );
}

/** A missing, revoked or unfinished share: a plain answer, with the way to make a video. */
export function ShareNotFound() {
  return (
    <PaperPage className="flex flex-col">
      <Brand />
      <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col items-start justify-center gap-5 px-6 pb-20 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={cn(poster, 'text-[clamp(52px,7vw,96px)]')}>
            This video isn&apos;t here anymore.
          </h1>
          <p className="mt-4 text-[15px]">The link may have been removed.</p>
          <Link href="/" className={btn('ink', 'lg', false, 'mt-8')}>
            Make your own
          </Link>
        </div>
        <PipLoop name="juggle" className="size-[260px] shrink-0" />
      </main>
    </PaperPage>
  );
}
