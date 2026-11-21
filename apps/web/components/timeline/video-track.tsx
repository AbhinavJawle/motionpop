'use client';

import {
  keptSourceSegments,
  type MediaClip,
  type VideoStageMode,
  type VideoStageSegment,
} from '@motionpop/schemas';
import { Film, Scissors, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { cn } from '@/lib/cn';
import { removeVideoPunchIn, setSlotVideoStage } from '@/lib/commands';
import { selectSlots, useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { useTimeline } from './timeline-context';

const EMPTY_MEDIA_BIN: readonly MediaClip[] = [];

const STAGE_OPTIONS: readonly { mode: VideoStageMode; label: string; short: string }[] = [
  { mode: 'full', label: 'Full speaker', short: 'Full' },
  { mode: 'split-left', label: 'Split top / left', short: 'Split' },
  { mode: 'split-right', label: 'Split bottom / right', short: 'Split 2' },
  { mode: 'pip', label: 'Speaker PiP', short: 'PiP' },
  { mode: 'backdrop', label: 'Dimmed backdrop', short: 'Backdrop' },
  { mode: 'cutaway', label: 'Full graphic cutaway', short: 'Cutaway' },
];

const STAGE_LABEL: Record<VideoStageMode, string> = {
  full: 'Full',
  'split-left': 'Split',
  'split-right': 'Split 2',
  pip: 'PiP',
  backdrop: 'Backdrop',
  cutaway: 'Cutaway',
  'split-top-broll': 'B-roll split',
  'screen-showcase': 'Screen',
  'broll-full': 'B-roll',
  'media-card-pop': 'Media card',
};

const STAGE_PILL_STYLE: Record<VideoStageMode, string> = {
  full: 'border-white/18 bg-black/55 text-text',
  'split-left': 'border-violet/45 bg-violet/25 text-violet-ink',
  'split-right': 'border-violet/45 bg-violet/25 text-violet-ink',
  pip: 'border-sky-400/45 bg-sky-500/22 text-sky-200',
  backdrop: 'border-amber-400/40 bg-amber-500/20 text-amber-200',
  cutaway: 'border-white/15 bg-card-3/90 text-text-2',
  'split-top-broll': 'border-mint/45 bg-mint/20 text-mint-ink',
  'screen-showcase': 'border-mint/45 bg-mint/20 text-mint-ink',
  'broll-full': 'border-mint/45 bg-mint/20 text-mint-ink',
  'media-card-pop': 'border-mint/45 bg-mint/20 text-mint-ink',
};

const filmstripCache = new Map<string, string[]>();

async function extractFilmstrip(src: string, count = 12): Promise<string[]> {
  const cached = filmstripCache.get(src);
  if (cached) return cached;
  if (typeof document === 'undefined') return [];
  const blob = await appAudioStore()
    .get(src)
    .catch(() => null);
  if (!blob) return [];
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      v.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      v.onerror = () => {
        clearTimeout(timer);
        reject(new Error('error'));
      };
      v.src = url;
    });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const vw = v.videoWidth || 160;
    const vh = v.videoHeight || 90;
    const th = 48;
    const tw = Math.max(28, Math.round((vw / vh) * th));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const thumbs: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = Math.max(0.05, Math.min(dur - 0.05, ((i + 0.5) / count) * dur));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1200);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        v.addEventListener('seeked', done, { once: true });
        v.addEventListener('error', done, { once: true });
        v.currentTime = t;
      });
      try {
        ctx.drawImage(v, 0, 0, tw, th);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.62));
      } catch {
        // Ignore single frame capture failures.
      }
    }
    if (thumbs.length > 0) filmstripCache.set(src, thumbs);
    return thumbs;
  } catch {
    return [];
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * VIDEO layer track: displays the talking-head thumbnail filmstrip, per-beat stage choreography
 * blocks (with 1-click stage switching), cut seam markers, B-roll bindings, and punch-in zooms.
 */
export function VideoTrack() {
  const { clock, view, durationMs } = useTimeline();
  const video = useEditor((s) => s.project?.video ?? null);
  const slots = useEditor(selectSlots);
  const mediaBin = useEditor((s) => s.project?.mediaBin ?? EMPTY_MEDIA_BIN);
  const selectedId = useEditor((s) => s.selectedSlotId);
  const select = useEditor((s) => s.select);
  const exec = useEditor((s) => s.exec);
  const [thumbs, setThumbs] = useState<string[]>(() =>
    video?.src ? (filmstripCache.get(video.src) ?? []) : [],
  );
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  const videoSrc = video?.src ?? null;
  useEffect(() => {
    if (!videoSrc) return;
    let alive = true;
    void extractFilmstrip(videoSrc, 12).then((frames) => {
      if (alive && frames.length > 0) setThumbs(frames);
    });
    return () => {
      alive = false;
    };
  }, [videoSrc]);

  // Close the inline stage picker on outside click / Escape.
  useEffect(() => {
    if (!openPickerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPickerId(null);
    };
    const onPointerDown = () => setOpenPickerId(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openPickerId]);

  const cutSeams = useMemo(() => {
    if (!video) return [];
    const segs = keptSourceSegments(video.originalDurationMs, video.cuts);
    const out: { atMs: number; cutMs: number }[] = [];
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1]!;
      const cur = segs[i]!;
      out.push({ atMs: cur.timelineStartMs, cutMs: Math.max(0, cur.startMs - prev.endMs) });
    }
    return out;
  }, [video]);

  if (!video) return null;

  const stripLeft = msToX(0, view);
  const stripWidth = Math.max(12, msToX(durationMs, view) - stripLeft);
  const stages: readonly VideoStageSegment[] =
    video.stages && video.stages.length > 0
      ? video.stages
      : [
          {
            id: 'stage-full',
            startMs: 0,
            endMs: Math.max(1, durationMs),
            mode: 'full',
            focusX: 0.5,
            focusY: 0.35,
            scaleFrom: 1,
            scaleTo: 1.04,
          },
        ];

  const slotForStage = (st: VideoStageSegment) =>
    slots.find(
      (sl) =>
        `stage-${sl.id}` === st.id ||
        (sl.startMs <= st.startMs + 60 && sl.endMs >= st.endMs - 60),
    );

  return (
    <div data-testid="video-track" className="relative h-full w-full">
      {/* Continuous A-roll talking-head thumbnail filmstrip */}
      <div
        className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-[7px] border border-white/10 bg-[#12131c]"
        style={{ left: stripLeft, width: stripWidth }}
      >
        {thumbs.length > 0 ? (
          <div className="flex h-full w-full opacity-75">
            {thumbs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                draggable={false}
                className="h-full min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center gap-1.5 px-3 text-[10px] text-text-3">
            <Film className="size-3" strokeWidth={1.5} aria-hidden />
            <span>Video footage</span>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/45"
        />
      </div>

      {/* Per-beat stage choreography segments */}
      {stages.map((st) => {
        const left = msToX(st.startMs, view);
        const width = Math.max(12, msToX(st.endMs, view) - left);
        const linkedSlot = slotForStage(st);
        const isSelected = linkedSlot ? linkedSlot.id === selectedId : false;
        const boundClip = st.clipId ? mediaBin.find((c) => c.id === st.clipId) : undefined;
        const isCutaway = st.mode === 'cutaway';
        const pickerOpen = openPickerId === st.id;

        return (
          <div
            key={st.id}
            data-testid={`video-stage-${st.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (linkedSlot) select(linkedSlot.id);
              clock.seek(st.startMs);
            }}
            className={cn(
              'group absolute top-1.5 bottom-1.5 z-[2] cursor-pointer rounded-[6px] border transition-colors',
              isSelected
                ? 'border-violet/80 ring-1 ring-violet/40'
                : 'border-white/12 hover:border-white/28',
              isCutaway && 'bg-[#0c0d14]/78',
            )}
            style={{ left, width }}
          >
            {isCutaway && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[5px] opacity-35"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(-45deg, transparent 0 6px, rgba(255,255,255,0.12) 6px 7px)',
                }}
              />
            )}
            {width >= 42 && (
              <div className="relative flex h-full items-start justify-between p-1">
                <button
                  type="button"
                  data-testid={`video-stage-pill-${st.id}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!linkedSlot) return;
                    select(linkedSlot.id);
                    setOpenPickerId((cur) => (cur === st.id ? null : st.id));
                  }}
                  title={
                    linkedSlot
                      ? `Video layout: ${st.mode} (click to change)`
                      : `Video layout: ${st.mode}`
                  }
                  className={cn(
                    'truncate rounded-full border px-1.5 py-[1px] font-mono text-[9.5px] leading-[13px] font-medium backdrop-blur-sm transition-transform hover:scale-[1.03]',
                    STAGE_PILL_STYLE[st.mode],
                  )}
                >
                  {boundClip ? `${STAGE_LABEL[st.mode]} · ${boundClip.name}` : STAGE_LABEL[st.mode]}
                </button>
              </div>
            )}

            {pickerOpen && linkedSlot && (
              <div
                role="menu"
                aria-label="Choose video layout"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-[calc(100%+6px)] left-0 z-40 flex min-w-[152px] flex-col gap-0.5 rounded-[10px] border border-white/12 bg-panel/96 p-1 shadow-modal backdrop-blur-md"
              >
                {STAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={st.mode === opt.mode}
                    onClick={() => {
                      exec(setSlotVideoStage(linkedSlot.id, opt.mode));
                      setOpenPickerId(null);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded-[6px] px-2 py-1 text-left text-[11px] transition-colors',
                      st.mode === opt.mode
                        ? 'bg-violet-sel text-violet-ink'
                        : 'text-text-2 hover:bg-card-2 hover:text-text',
                    )}
                  >
                    <span>{opt.label}</span>
                    <span className="font-mono text-[9px] text-text-3">{opt.short}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Cut seam ticks (where dead air / retakes were non-destructively trimmed) */}
      {cutSeams.map((seam, i) => {
        const left = msToX(seam.atMs, view);
        return (
          <div
            key={`${seam.atMs}-${i}`}
            title={`Trimmed ${(seam.cutMs / 1000).toFixed(1)}s`}
            className="pointer-events-none absolute top-1 bottom-1 z-[4] flex flex-col items-center"
            style={{ left }}
          >
            <span className="flex size-3.5 -translate-x-1/2 items-center justify-center rounded-full bg-ember text-bg shadow-sm">
              <Scissors className="size-2" strokeWidth={2.2} aria-hidden />
            </span>
            <span className="w-px flex-1 -translate-x-1/2 bg-ember/70" />
          </div>
        );
      })}

      {/* Punch-in zoom ranges along the bottom edge */}
      {video.punchIns.map((p) => {
        const left = msToX(p.startMs, view);
        const width = Math.max(10, msToX(p.endMs, view) - left);
        return (
          <button
            key={p.id}
            type="button"
            title={`Punch-in ${p.scale}× (${p.reason}) — click to remove`}
            onClick={(e) => {
              e.stopPropagation();
              exec(removeVideoPunchIn(p.id));
            }}
            className="absolute bottom-2 z-[5] flex h-[15px] items-center gap-0.5 overflow-hidden rounded-full border border-ember/55 bg-ember/25 px-1.5 font-mono text-[8.5px] text-ember-ink backdrop-blur-sm transition-colors hover:bg-ember/40"
            style={{ left, width }}
          >
            <ZoomIn className="size-2.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="truncate">{p.scale.toFixed(2)}×</span>
          </button>
        );
      })}
    </div>
  );
}
