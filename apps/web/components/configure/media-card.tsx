'use client';

import { FileText, Film, Music2, Sparkles, X } from 'lucide-react';
import { motion } from 'motion/react';
import { paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import type { Job } from '@/lib/pipeline/jobs-store';
import { useStill } from '@/lib/motion/use-still';

const fmtTime = (ms: number | undefined) => {
  if (ms === undefined) return '–';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtSize = (b: number) =>
  b >= 1e9
    ? `${(b / 1e9).toFixed(1)} GB`
    : b >= 1e6
      ? `${(b / 1e6).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1e3))} KB`;

const aspect = (w?: number, h?: number) => {
  if (!w || !h) return null;
  if (h > w * 1.2) return '9:16';
  if (w > h * 1.2) return '16:9';
  return '1:1';
};

/** Static waveform bars (deterministic). */
const WAVE = Array.from({ length: 72 }, (_, i) =>
  Math.max(0.12, Math.min(1, Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4))),
);

/** Pip's line for the preparation stage. */
export function pipLine(job: Job): string {
  if (job.prep.stage === 'failed') return 'Hmm, that one slipped.';
  if (job.kind === 'graphic') return 'Ready to direct your graphic!';
  if (job.script) return 'Your words are ready!';
  if (job.prep.stage === 'ready') return 'Got every word!';
  if (job.prep.model !== undefined) return 'Warming up my ears…';
  if (job.prep.stage === 'transcribing') return 'Listening closely…';
  return job.kind === 'video' ? 'Reading your video…' : 'Reading your audio…';
}

/**
 * The take on top of the configure screen (spec 39 R2.2, R2.3): a frame of the video, a waveform,
 * a graphic prompt card, or the script's first lines, its facts, Remove, and the free preparation
 * as one bar.
 */
export function MediaCard({ job, onRemove }: { job: Job; onRemove: () => void }) {
  const still = useStill();
  const m = job.media;
  const graphic = job.kind === 'graphic';
  const ratio = graphic ? (job.format ?? '16:9') : aspect(m.width, m.height);
  const failed = job.prep.stage === 'failed';
  const ready = job.prep.stage === 'ready';
  const Icon = graphic ? Sparkles : job.script ? FileText : job.kind === 'video' ? Film : Music2;
  return (
    <div
      className={cn(
        paper.frame,
        paper.raised,
        'relative flex flex-col gap-5 p-4 sm:flex-row sm:p-5',
      )}
    >
      {/* the picture */}
      <div className="relative h-[150px] w-full shrink-0 overflow-hidden rounded-[8px] border-2 border-black bg-[#1d1d22] sm:w-[240px]">
        {graphic ? (
          <div className="relative flex h-full flex-col justify-between bg-[#f4efe4] p-3 text-ink">
            <span className="inline-flex w-fit items-center gap-1 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-paper">
              <Sparkles className="size-2.5 text-[#f4d03f]" aria-hidden />
              Motion Graphic
            </span>
            <p className="line-clamp-3 font-sans text-[12px] leading-[17px] font-medium text-ink">
              {job.graphicPrompt ?? job.title}
            </p>
            <span className="font-mono text-[10px] text-black/55">
              Custom motion · Alpha WebM
            </span>
          </div>
        ) : job.script ? (
          <div
            className={cn(paper.ruled, 'h-full bg-paper px-3 pt-[6px] text-[12px] leading-[32px]')}
          >
            <p className="line-clamp-4">{job.script}</p>
          </div>
        ) : m.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL keyframe
          <img src={m.thumbUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center gap-[2px] px-3">
            {WAVE.map((v, i) => (
              <span
                key={i}
                className="w-[2px] rounded-full bg-voice"
                style={{
                  height: `${Math.round(v * 90)}px`,
                  opacity: ready || i / WAVE.length < job.prep.pct / 100 ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        )}
        {ratio && (
          <span className="absolute right-2 bottom-2 rounded-[4px] bg-black/75 px-1.5 text-[11px] text-[#fff]">
            {ratio}
          </span>
        )}
      </div>

      {/* the facts and the bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-3 pr-10">
          <Icon className="mt-1 size-4 shrink-0" strokeWidth={2} aria-hidden />
          <p className="min-w-0 truncate text-[14px] font-semibold" title={graphic ? job.graphicPrompt : m.name}>
            {graphic ? 'Your motion graphic prompt' : job.script ? 'Your script' : m.name}
          </p>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-black/65">
          {graphic ? (
            <div>
              <dt className="sr-only">Format</dt>
              <dd>
                {job.format ?? '16:9'} canvas · Graphics only (no audio) · MP4 & transparent WebM
              </dd>
            </div>
          ) : job.script ? (
            <div>
              <dt className="sr-only">Words</dt>
              <dd>{job.script.trim().split(/\s+/).length} words · voice made after Create</dd>
            </div>
          ) : (
            <>
              <div>
                <dt className="sr-only">Duration</dt>
                <dd>{fmtTime(m.durationMs)}</dd>
              </div>
              {m.width && m.height && (
                <div>
                  <dt className="sr-only">Resolution</dt>
                  <dd>
                    {m.width}×{m.height}
                  </dd>
                </div>
              )}
              <div>
                <dt className="sr-only">Size</dt>
                <dd>{fmtSize(m.sizeBytes)}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="mt-auto pt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className={cn('font-semibold', failed && 'text-error')}>
              {failed
                ? job.prep.error
                : ready
                  ? graphic
                    ? 'Ready to direct'
                    : 'Ready'
                  : job.prep.model !== undefined
                    ? `Getting speech ready, first time only (${job.prep.model}%)`
                    : `Preparing ${job.prep.pct}%`}
            </span>
            <span className="text-black/50">
              {failed ? '' : graphic ? 'custom motion + cutouts' : 'free · on this device'}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Preparing your take"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={failed ? 0 : job.prep.pct}
            className="h-[12px] overflow-hidden rounded-full border-2 border-black bg-paper"
          >
            <motion.div
              className={cn('h-full', failed ? 'bg-error' : ready ? 'bg-voice' : 'bg-pip')}
              initial={false}
              animate={{ width: `${failed ? 100 : job.prep.pct}%` }}
              transition={still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 24 }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={failed ? 'Choose another file' : 'Remove this take'}
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full border-2 border-black bg-paper hover:bg-mist"
      >
        <X className="size-4" strokeWidth={2.4} aria-hidden />
      </button>

      <span className="sr-only" aria-live="polite">
        {failed ? job.prep.error : ready ? 'Ready' : ''}
      </span>
      <h2 className={cn(poster, 'sr-only')}>Your take</h2>
    </div>
  );
}
