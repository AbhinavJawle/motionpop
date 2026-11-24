'use client';

import { AudioLines, Film, Image as ImageIcon, Music, Sparkles, Type, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackClock } from '@/lib/editor/playback';
import { cn } from '@/lib/cn';
import { fitView, msToX } from '@/lib/timeline/geometry';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { wheelView } from '@/lib/timeline/wheel';
import { AudioTrack } from './audio-track';
import { PlayheadCapsule, PlayheadLine, usePlayheadVar } from './playhead';
import { Ruler } from './ruler';
import { SlotsTrack } from './slots-track';
import { StockAudioTrack } from './stock-audio-track';
import { StockMediaTrack } from './stock-media-track';
import {
  TimelineContext,
  TL,
  timelineLayout,
  useTimeline,
  type TimelineCtx,
  type TimelineRowGeometry,
} from './timeline-context';
import { TimelineHeader } from './timeline-header';
import { VideoTrack } from './video-track';
import { VoiceTrack } from './voice-track';
import { WordsTrack } from './words-track';

type TrackRowId = 'slots' | 'video' | 'stockMedia' | 'words' | 'voice' | 'audio' | 'stockAudio';

const BASE_ROWS: readonly {
  id: TrackRowId;
  label: string;
  surface: string;
  icon: typeof AudioLines | null;
  /** The track's colour on its label icon (spec 38 R8). */
  tone?: string;
}[] = [
  { id: 'slots', label: 'Graphics', surface: 'bg-track-b', icon: Sparkles, tone: 'text-violet' },
  {
    id: 'stockMedia',
    label: 'Stock Media',
    surface: 'bg-track-a',
    icon: ImageIcon,
    tone: 'text-mint',
  },
  { id: 'words', label: 'Words', surface: 'bg-track-b', icon: Type },
  { id: 'voice', label: 'Voice', surface: 'bg-track-a', icon: AudioLines, tone: 'text-voice' },
  { id: 'audio', label: 'Sound', surface: 'bg-track-b', icon: Music, tone: 'text-sound' },
  {
    id: 'stockAudio',
    label: 'Stock Audio',
    surface: 'bg-track-a',
    icon: Volume2,
    tone: 'text-flame',
  },
];

const VIDEO_ROWS: readonly {
  id: TrackRowId;
  label: string;
  surface: string;
  icon: typeof AudioLines | null;
  /** The track's colour on its label icon (spec 38 R8). */
  tone?: string;
}[] = [
  { id: 'slots', label: 'Graphics', surface: 'bg-track-b', icon: Sparkles, tone: 'text-violet' },
  { id: 'video', label: 'Video', surface: 'bg-track-a', icon: Film, tone: 'text-flame' },
  {
    id: 'stockMedia',
    label: 'Stock Media',
    surface: 'bg-track-b',
    icon: ImageIcon,
    tone: 'text-mint',
  },
  { id: 'words', label: 'Words', surface: 'bg-track-a', icon: Type },
  { id: 'voice', label: 'Voice', surface: 'bg-track-b', icon: AudioLines, tone: 'text-voice' },
  { id: 'audio', label: 'Sound', surface: 'bg-track-a', icon: Music, tone: 'text-sound' },
  {
    id: 'stockAudio',
    label: 'Stock Audio',
    surface: 'bg-track-b',
    icon: Volume2,
    tone: 'text-flame',
  },
];

/**
 * The transcript-first timeline (spec 04 R4, R5; spec 38 R7: 244 px, under the preview). Tracks are absolute
 * rows; the time area starts after the label column.
 */
export function Timeline({
  clock,
  peaks,
  bucketMs,
}: {
  clock: PlaybackClock;
  peaks: Float32Array | null;
  bucketMs: number;
}) {
  const durationMs = useEditor((s) => s.project?.durationMs ?? 0);
  const hasVideo = useEditor((s) => Boolean(s.project?.video));
  const storeView = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const areaRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const layout = useMemo(() => timelineLayout(hasVideo), [hasVideo]);
  const rows = hasVideo ? VIDEO_ROWS : BASE_ROWS;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidthPx(Math.round(entry?.contentRect.width ?? 0)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘/ctrl + wheel zooms at the pointer; shift + wheel or a sideways swipe scrolls (R6.3).
  // Non-passive so we can stop the page from scrolling or zooming.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const onWheel = (e: WheelEvent) => {
      const area = areaRef.current;
      const st = editorStore.getState();
      if (!area || !st.project) return;
      const r = area.getBoundingClientRect();
      const next = wheelView(st.view, r.width - TL.rightPad, st.project.durationMs, {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        zoom: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
        anchorX: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      });
      if (!next) return;
      e.preventDefault();
      st.setView(next);
    };
    section.addEventListener('wheel', onWheel, { passive: false });
    return () => section.removeEventListener('wheel', onWheel);
  }, []);

  // Toasts sit above the timeline, never over the tracks (spec 32).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--toast-bottom', `${layout.height + 16}px`);
    return () => {
      root.style.removeProperty('--toast-bottom');
    };
  }, [layout.height]);

  // Fit to width unless the user zoomed (spec 04 design: window resize keeps fit).
  useEffect(() => {
    if (storeView.fit && widthPx > 0) {
      const fit = fitView(durationMs, widthPx - TL.rightPad);
      if (fit.pxPerMs !== storeView.pxPerMs || storeView.scrollMs !== 0)
        setView({ ...fit, fit: true });
    }
  }, [storeView, widthPx, durationMs, setView]);

  const ctx = useMemo<TimelineCtx>(
    () => ({
      clock,
      view: { pxPerMs: storeView.pxPerMs, scrollMs: storeView.scrollMs },
      widthPx,
      durationMs,
    }),
    [clock, storeView.pxPerMs, storeView.scrollMs, widthPx, durationMs],
  );

  return (
    <TimelineContext.Provider value={ctx}>
      <section
        ref={sectionRef}
        aria-label="Timeline"
        className="relative shrink-0 border-t-2 border-rule bg-paper font-mono select-none"
        style={{ height: layout.height }}
      >
        <TimelineHeader />
        {rows.map((row) => {
          const r = layout.rows[row.id];
          if (!r) return null;
          const Icon = row.icon;
          return (
            <div
              key={row.id}
              className={cn('absolute inset-x-0', row.surface)}
              style={{ top: r.top, height: r.height }}
            >
              <span className="absolute right-6 bottom-0 left-6 h-px bg-track-hair" />
              {/* Spec 32 R3.1: sentence-case labels, centred in their row, icon beside. */}
              <span className="absolute inset-y-0 left-6 flex items-center gap-2 text-[11px] leading-[14px] text-text-2">
                {Icon && (
                  <Icon className={cn('size-3.5', row.tone)} strokeWidth={1.75} aria-hidden />
                )}
                {row.label}
              </span>
            </div>
          );
        })}
        <TimeArea
          areaRef={areaRef}
          peaks={peaks}
          bucketMs={bucketMs}
          ready={widthPx > 0}
          hasVideo={hasVideo}
          layout={layout}
        />
        <p className="absolute bottom-[3px] left-6 text-[10px] leading-3 text-text-3">
          Space play · ⌘G generate · Drag slot to retime
        </p>
      </section>
    </TimelineContext.Provider>
  );
}

function TimeArea({
  areaRef,
  peaks,
  bucketMs,
  ready,
  hasVideo,
  layout,
}: {
  areaRef: React.RefObject<HTMLDivElement | null>;
  peaks: Float32Array | null;
  bucketMs: number;
  ready: boolean;
  hasVideo: boolean;
  layout: ReturnType<typeof timelineLayout>;
}) {
  usePlayheadVar(areaRef);
  const { view } = useTimeline();
  const gridHeight = layout.height - layout.rows.slots.top - 14;
  return (
    <div
      ref={areaRef}
      data-time-area
      className="absolute right-0 bottom-0"
      // Clip to the time area, with room on the left for the centred "0s" label (and the
      // playhead capsule) while the start is in view. Scrolled, nothing may cross the labels.
      style={{
        left: TL.labelCol,
        top: layout.rows.ruler.top,
        clipPath: view.scrollMs > 0 ? 'inset(0)' : 'inset(0 0 0 -24px)',
      }}
    >
      {ready && (
        <>
          <BeatGrid height={gridHeight} />
          <Ruler />
          <Row geom={layout.rows.slots} rulerTop={layout.rows.ruler.top} label="Slots">
            <SlotsTrack />
          </Row>
          {hasVideo && layout.rows.video && (
            <Row geom={layout.rows.video} rulerTop={layout.rows.ruler.top} label="Video">
              <VideoTrack />
            </Row>
          )}
          <Row geom={layout.rows.stockMedia} rulerTop={layout.rows.ruler.top} label="Stock Media">
            <StockMediaTrack />
          </Row>
          <Row geom={layout.rows.words} rulerTop={layout.rows.ruler.top} label="Words">
            <WordsTrack />
          </Row>
          <Row geom={layout.rows.voice} rulerTop={layout.rows.ruler.top} label="Voice">
            <VoiceTrack peaks={peaks} bucketMs={bucketMs} />
          </Row>
          <Row geom={layout.rows.audio} rulerTop={layout.rows.ruler.top} label="Audio">
            <AudioTrack />
          </Row>
          <Row geom={layout.rows.stockAudio} rulerTop={layout.rows.ruler.top} label="Stock Audio">
            <StockAudioTrack />
          </Row>
          <PlayheadLine />
          <PlayheadCapsule />
        </>
      )}
    </div>
  );
}

function Row({
  geom,
  rulerTop,
  label,
  children,
}: {
  geom: TimelineRowGeometry;
  rulerTop: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="absolute inset-x-0"
      style={{ top: geom.top - rulerTop, height: geom.height }}
    >
      {children}
    </div>
  );
}

/** Faint 1 s grid through the tracks (2 % white), when there is room for it. */
function BeatGrid({ height }: { height: number }) {
  const { view, widthPx } = useTimeline();
  if (view.pxPerMs * 1000 < 24) return null;
  const lines: number[] = [];
  const from = Math.max(0, Math.ceil(view.scrollMs / 1000) * 1000);
  const to = view.scrollMs + widthPx / view.pxPerMs;
  for (let t = from; t <= to; t += 1000) lines.push(t);
  return (
    <>
      {lines.map((t) => (
        <span
          key={t}
          aria-hidden
          className="absolute w-px bg-white/2"
          style={{
            left: msToX(t, view),
            top: TL.rows.slots.top - TL.rows.ruler.top,
            height,
          }}
        />
      ))}
    </>
  );
}
