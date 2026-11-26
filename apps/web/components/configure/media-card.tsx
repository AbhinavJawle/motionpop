'use client';

import type { MediaClipKind } from '@motionpop/schemas';
import { ArrowUpRight, FileText, Film, Image as ImageIcon, Music2, Plus, Sparkles, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import type { Job } from '@/lib/pipeline/jobs-store';
import { useStill } from '@/lib/motion/use-still';
import { MEDIA_BIN_ACCEPT } from '@/lib/video/media-bin';

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

const ROLE_OPTIONS: readonly { value: '' | MediaClipKind; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'broll', label: 'B-roll' },
  { value: 'screen-recording', label: 'Screen rec' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'photo', label: 'Photo' },
];

export interface MediaCardProps {
  job: Job;
  onRemove: () => void;
  onAddExtraClips?: (files: readonly File[]) => void;
  onRemoveExtraClip?: (ref: string) => void;
  onSetExtraClipKind?: (ref: string, kind: MediaClipKind | undefined) => void;
  onMakeMainClip?: (ref: string) => void;
}

/**
 * The take on top of the configure screen (spec 39 R2.2, R2.3, spec 48 R1.2–R1.4): a frame of
 * the video, a waveform, a graphic prompt card, or the script's first lines, its facts, Remove,
 * the free preparation bar, and an optional tray for extra B-roll / screen recordings with
 * 1-click "Make main" A-roll selection.
 */
export function MediaCard({
  job,
  onRemove,
  onAddExtraClips,
  onRemoveExtraClip,
  onSetExtraClipKind,
  onMakeMainClip,
}: MediaCardProps) {
  const still = useStill();
  const extraInputRef = useRef<HTMLInputElement>(null);
  const m = job.media;
  const graphic = job.kind === 'graphic';
  const ratio = graphic ? (job.format ?? '16:9') : aspect(m.width, m.height);
  const failed = job.prep.stage === 'failed';
  const ready = job.prep.stage === 'ready';
  const extras = job.extraClips ?? [];
  const supportsExtraClips = !graphic && !job.script && Boolean(onAddExtraClips);
  const Icon = graphic ? Sparkles : job.script ? FileText : job.kind === 'video' ? Film : Music2;
  return (
    <div
      className={cn(
        paper.frame,
        paper.raised,
        'relative flex flex-col gap-4 p-4 sm:p-5',
      )}
    >
      <div className="flex flex-col gap-5 sm:flex-row">
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
        <div className="flex flex-wrap items-center gap-2 pr-10">
          <Icon className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          <p className="min-w-0 truncate text-[14px] font-semibold" title={graphic ? job.graphicPrompt : m.name}>
            {graphic ? 'Your motion graphic prompt' : job.script ? 'Your script' : m.name}
          </p>
          {extras.length > 0 && !graphic && !job.script && (
            <span
              data-testid="main-aroll-badge"
              className="rounded-md border border-black bg-[#a7f3d0] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.03em] text-black uppercase"
            >
              {job.kind === 'video' ? 'Main talking head' : 'Main audio'}
            </span>
          )}
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
      </div>

      {supportsExtraClips && (
        <div
          data-testid="configure-extra-clips"
          className="border-t-2 border-black/10 pt-3.5"
        >
          <input
            ref={extraInputRef}
            type="file"
            multiple
            accept={MEDIA_BIN_ACCEPT}
            aria-label="Add B-roll, screen recordings, or screenshots"
            className="hidden"
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              if (list.length > 0) onAddExtraClips?.(list);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold tracking-[0.02em] text-ink">
                {extras.length > 0
                  ? `B-roll & extra clips (${extras.length})`
                  : 'Have B-roll, screen recordings, or screenshots?'}
              </span>
              {extras.length > 0 && (
                <span className="text-[11px] text-black/55">
                  AI weaves these into matching beats · click &ldquo;Make main&rdquo; to switch talking head
                </span>
              )}
            </div>
            <button
              type="button"
              data-testid="configure-add-clips"
              onClick={() => extraInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border-2 border-black bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[#fde68a]"
            >
              <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
              Add B-roll / clips
            </button>
          </div>

          {extras.length > 0 && (
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {extras.map((clip) => {
                const isVideo = clip.mimeType.startsWith('video/');
                const canBeMain =
                  (isVideo || clip.mimeType.startsWith('audio/')) && Boolean(onMakeMainClip);
                return (
                  <li
                    key={clip.ref}
                    data-testid={`extra-clip-${clip.ref}`}
                    className="flex items-center gap-2.5 rounded-[8px] border-2 border-black/80 bg-mist/40 p-2"
                  >
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-[6px] border border-black/40 bg-[#1d1d22]">
                      {clip.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local thumbnail data URL
                        <img
                          src={clip.thumbUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-white/60">
                          {isVideo ? (
                            <Film className="size-4" aria-hidden />
                          ) : (
                            <ImageIcon className="size-4" aria-hidden />
                          )}
                        </div>
                      )}
                      {clip.durationMs !== undefined && (
                        <span className="absolute right-1 bottom-0.5 rounded bg-black/75 px-1 font-mono text-[9px] text-white">
                          {fmtTime(clip.durationMs)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink" title={clip.name}>
                        {clip.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {onSetExtraClipKind && (
                          <select
                            aria-label={`Role for ${clip.name}`}
                            value={clip.kindHint ?? ''}
                            onChange={(e) => {
                              const v = e.target.value as '' | MediaClipKind;
                              onSetExtraClipKind(clip.ref, v || undefined);
                            }}
                            className="rounded border border-black/40 bg-paper px-1.5 py-0.5 text-[10.5px] font-medium text-ink"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.label} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {canBeMain && (
                          <button
                            type="button"
                            onClick={() => onMakeMainClip?.(clip.ref)}
                            className="inline-flex items-center gap-0.5 rounded border border-black bg-paper px-1.5 py-0.5 text-[10.5px] font-semibold text-ink hover:bg-[#a7f3d0]"
                          >
                            <ArrowUpRight className="size-3" strokeWidth={2.2} aria-hidden />
                            Make main
                          </button>
                        )}
                        {clip.sizeBytes !== undefined && (
                          <span className="font-mono text-[10px] text-black/50">
                            {fmtSize(clip.sizeBytes)}
                          </span>
                        )}
                      </div>
                    </div>

                    {onRemoveExtraClip && (
                      <button
                        type="button"
                        onClick={() => onRemoveExtraClip(clip.ref)}
                        aria-label={`Remove ${clip.name}`}
                        className="grid size-6 shrink-0 place-items-center rounded-full border border-black/40 bg-paper text-ink hover:bg-mist"
                      >
                        <X className="size-3" strokeWidth={2.2} aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

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
