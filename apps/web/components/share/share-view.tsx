import Link from 'next/link';
import { FORMATS, type Format } from '@motionpop/schemas';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { Pip } from '@/components/pip/pip';
import { secondsText } from '@/lib/renders/export-flow';

/** The brand row at the top-left of the share page. */
function Brand() {
  return (
    <header className="flex h-14 items-center px-6">
      <Link href="/" className="flex items-center gap-[7px]" aria-label="motionpop home">
        <PipAvatar size={24} ring={false} />
        <span className="text-[19px] leading-[25px] font-semibold tracking-[-0.2px]">
          motionpop
        </span>
      </Link>
    </header>
  );
}

const makeYourOwn = (
  <Link
    href="/"
    className="inline-flex h-9 items-center rounded-chip bg-ember-grad px-4 text-xs leading-4 font-semibold text-white shadow-ember transition-[filter] hover:brightness-110"
  >
    Make your own
  </Link>
);

/** The shared video (design §13.4): a centred player, the title, the length and the way back in. */
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
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <Brand />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
        <div
          className="w-full overflow-hidden rounded-card bg-frame shadow-glass"
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
            className="size-full bg-black object-contain"
          />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-[26px] leading-8 font-semibold">{title}</h1>
          <p className="tabular font-mono text-xs leading-4 text-text-2">
            {secondsText(durationMs)} · {format} · {resolution}
          </p>
          <p className="text-xs leading-4 text-text-3">Made with motionpop</p>
        </div>
        {makeYourOwn}
      </main>
    </div>
  );
}

/** A missing, revoked or unfinished share: friendly, with the way to make a video. */
export function ShareNotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <Brand />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
        <Pip state="idle" size={96} glow />
        <h1 className="text-lg font-semibold">This video isn&apos;t here anymore.</h1>
        <p className="text-sm text-text-2">The link may have been removed.</p>
        {makeYourOwn}
      </main>
    </div>
  );
}
