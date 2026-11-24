'use client';

import {
  MAX_TIMELINE_LANES,
  resolvedAudioLanes,
  resolvedMediaLanes,
  type StockAudioClip,
  type StockOverlayClip,
  type TimelineLane,
} from '@motionpop/schemas';
import {
  AudioLines,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Music,
  Plus,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  addTimelineLane,
  removeTimelineLane,
  toggleTimelineLaneHidden,
  toggleTimelineLaneMute,
} from '@/lib/commands';
import type { PlaybackClock } from '@/lib/editor/playback';
import { seekPreview } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { fitView, msToX } from '@/lib/timeline/geometry';
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
  type TimelineLayoutResult,
  type TimelineRowGeometry,
} from './timeline-context';
import { TimelineHeader } from './timeline-header';
import { VideoTrack } from './video-track';
import { VoiceTrack } from './voice-track';
import { WordsTrack } from './words-track';

const EMPTY_LANES: readonly TimelineLane[] = [];
const EMPTY_OVERLAYS: readonly StockOverlayClip[] = [];
const EMPTY_AUDIO: readonly StockAudioClip[] = [];

interface DisplayTrackRow {
  key: string;
  label: string;
  geom: TimelineRowGeometry;
  surface: string;
  icon: typeof AudioLines;
  tone?: string;
  laneKind?: 'media' | 'audio';
  lane?: TimelineLane;
  canAdd?: boolean;
}

/**
 * The transcript-first multi-track timeline (spec 04 R4–R5 + spec 38 R7 + spec 45 R3.1).
 * Header and time ruler stay pinned; the track stack scrolls vertically when extra Stock Media
 * or Stock Audio lanes are added so all tracks stay accessible without shrinking the preview.
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
  const stockMediaLanesRaw = useEditor((s) => s.project?.stockMediaLanes ?? EMPTY_LANES);
  const stockAudioLanesRaw = useEditor((s) => s.project?.stockAudioLanes ?? EMPTY_LANES);
  const stockOverlays = useEditor((s) => s.project?.stockOverlays ?? EMPTY_OVERLAYS);
  const stockAudio = useEditor((s) => s.project?.stockAudio ?? EMPTY_AUDIO);
  const storeView = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const exec = useEditor((s) => s.exec);

  const areaRef = useRef<HTMLDivElement>(null);
  const rulerAreaRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);

  const mediaLanes = useMemo(
    () =>
      resolvedMediaLanes({
        stockMediaLanes: stockMediaLanesRaw,
        stockOverlays,
      }),
    [stockMediaLanesRaw, stockOverlays],
  );
  const audioLanes = useMemo(
    () =>
      resolvedAudioLanes({
        stockAudioLanes: stockAudioLanesRaw,
        stockAudio,
      }),
    [stockAudioLanesRaw, stockAudio],
  );

  const layout = useMemo(
    () => timelineLayout(hasVideo, mediaLanes.length, audioLanes.length),
    [hasVideo, mediaLanes.length, audioLanes.length],
  );

  const trackRows = useMemo<DisplayTrackRow[]>(() => {
    const list: DisplayTrackRow[] = [];
    const push = (row: Omit<DisplayTrackRow, 'surface'>) => {
      list.push({ ...row, surface: list.length % 2 === 0 ? 'bg-track-b' : 'bg-track-a' });
    };

    push({
      key: 'slots',
      label: 'Graphics',
      geom: layout.rows.slots,
      icon: Sparkles,
      tone: 'text-violet',
    });
    if (hasVideo && layout.rows.video) {
      push({
        key: 'video',
        label: 'Video',
        geom: layout.rows.video,
        icon: Film,
        tone: 'text-flame',
      });
    }
    mediaLanes.forEach((lane, idx) => {
      const geom = layout.rows.stockMediaLanes[idx];
      if (!geom) return;
      push({
        key: `stockMedia-${lane.index}`,
        label: lane.name ?? (lane.index === 0 ? 'Stock Media' : `Media ${lane.index + 1}`),
        geom,
        icon: ImageIcon,
        tone: 'text-mint',
        laneKind: 'media',
        lane,
        canAdd: lane.index === 0 && mediaLanes.length < MAX_TIMELINE_LANES,
      });
    });
    push({ key: 'words', label: 'Words', geom: layout.rows.words, icon: Type });
    push({
      key: 'voice',
      label: 'Voice',
      geom: layout.rows.voice,
      icon: AudioLines,
      tone: 'text-voice',
    });
    push({
      key: 'audio',
      label: 'Sound',
      geom: layout.rows.audio,
      icon: Music,
      tone: 'text-sound',
    });
    audioLanes.forEach((lane, idx) => {
      const geom = layout.rows.stockAudioLanes[idx];
      if (!geom) return;
      push({
        key: `stockAudio-${lane.index}`,
        label: lane.name ?? (lane.index === 0 ? 'Stock Audio' : `Audio ${lane.index + 1}`),
        geom,
        icon: Volume2,
        tone: 'text-flame',
        laneKind: 'audio',
        lane,
        canAdd: lane.index === 0 && audioLanes.length < MAX_TIMELINE_LANES,
      });
    });
    return list;
  }, [hasVideo, layout, mediaLanes, audioLanes]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidthPx(Math.round(entry?.contentRect.width ?? 0)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘/ctrl + wheel zooms at the pointer; shift + wheel or a sideways swipe scrolls horizontally.
  // Plain vertical wheel scrolls the track stack naturally when multiple extra tracks exist.
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

  const extraLaneSummary =
    mediaLanes.length > 1 || audioLanes.length > 1
      ? `${mediaLanes.length}V · ${audioLanes.length}A`
      : null;

  return (
    <TimelineContext.Provider value={ctx}>
      <section
        ref={sectionRef}
        aria-label="Timeline"
        className="relative flex shrink-0 flex-col border-t-2 border-rule bg-paper font-mono select-none"
        style={{ height: layout.height }}
      >
        <TimelineHeader />

        {/* Pinned Ruler strip */}
        <div
          className="relative shrink-0 border-b border-track-hair bg-paper"
          style={{ height: TL.rows.ruler.height }}
        >
          <div
            className="absolute inset-y-0 left-0 flex items-center justify-between pr-2 pl-4 text-[9.5px] tracking-[0.06em] text-text-3 uppercase"
            style={{ width: TL.labelCol }}
          >
            <span>Tracks</span>
            {extraLaneSummary && (
              <span className="rounded bg-card-2 px-1 py-px text-[9px] text-text-2">
                {extraLaneSummary}
              </span>
            )}
          </div>
          <RulerStrip rulerAreaRef={rulerAreaRef} ready={widthPx > 0} />
        </div>

        {/* Vertically scrollable track stack (labels + clips move together in lockstep) */}
        <div
          className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          style={{ height: layout.viewportTracksHeight }}
        >
          <div className="relative w-full" style={{ height: layout.tracksHeight }}>
            {trackRows.map((row) => {
              const Icon = row.icon;
              const lane = row.lane;
              const isHidden = row.laneKind === 'media' && Boolean(lane?.hidden);
              const isMuted = row.laneKind === 'audio' && Boolean(lane?.muted);
              return (
                <div
                  key={row.key}
                  className={cn('absolute inset-x-0', row.surface)}
                  style={{ top: row.geom.top, height: row.geom.height }}
                >
                  <span className="absolute right-6 bottom-0 left-4 h-px bg-track-hair" />
                  <div
                    className="absolute inset-y-0 left-0 flex items-center justify-between gap-1 pr-2 pl-4 text-[11px] leading-[14px] text-text-2"
                    style={{ width: TL.labelCol }}
                  >
                    <span
                      className={cn(
                        'flex min-w-0 items-center gap-1.5 truncate',
                        (isHidden || isMuted) && 'opacity-45 line-through',
                      )}
                    >
                      <Icon
                        className={cn('size-3.5 shrink-0', row.tone)}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="truncate">{row.label}</span>
                    </span>

                    {row.laneKind && lane && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {row.laneKind === 'media' ? (
                          <button
                            type="button"
                            aria-label={isHidden ? `Show ${row.label}` : `Hide ${row.label}`}
                            title={isHidden ? `Show ${row.label}` : `Hide ${row.label}`}
                            onClick={() => {
                              exec(toggleTimelineLaneHidden(lane.index));
                              seekPreview(editorStore.getState().playheadMs);
                            }}
                            className={cn(
                              'rounded p-0.5 transition-colors hover:bg-card-2 hover:text-text',
                              isHidden ? 'text-flame' : 'text-text-3',
                            )}
                          >
                            {isHidden ? (
                              <EyeOff className="size-3" strokeWidth={1.8} aria-hidden />
                            ) : (
                              <Eye className="size-3" strokeWidth={1.8} aria-hidden />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={isMuted ? `Unmute ${row.label}` : `Mute ${row.label}`}
                            title={isMuted ? `Unmute ${row.label}` : `Mute ${row.label}`}
                            onClick={() => exec(toggleTimelineLaneMute(lane.index))}
                            className={cn(
                              'rounded p-0.5 transition-colors hover:bg-card-2 hover:text-text',
                              isMuted ? 'text-flame' : 'text-text-3',
                            )}
                          >
                            {isMuted ? (
                              <VolumeX className="size-3" strokeWidth={1.8} aria-hidden />
                            ) : (
                              <Volume2 className="size-3" strokeWidth={1.8} aria-hidden />
                            )}
                          </button>
                        )}

                        {row.canAdd && (
                          <button
                            type="button"
                            data-testid={
                              row.laneKind === 'media' ? 'add-media-lane-btn' : 'add-audio-lane-btn'
                            }
                            aria-label={
                              row.laneKind === 'media' ? 'Add media track' : 'Add audio track'
                            }
                            title={
                              row.laneKind === 'media'
                                ? 'Add another video / photo track'
                                : 'Add another audio / music track'
                            }
                            onClick={() => exec(addTimelineLane(row.laneKind!))}
                            className="rounded p-0.5 text-text-3 transition-colors hover:bg-card-2 hover:text-text"
                          >
                            <Plus className="size-3" strokeWidth={2} aria-hidden />
                          </button>
                        )}

                        {lane.index >= 1 && (
                          <button
                            type="button"
                            aria-label={`Remove ${row.label} track`}
                            title={`Remove ${row.label} track`}
                            onClick={() => {
                              exec(removeTimelineLane(row.laneKind!, lane.index));
                              seekPreview(editorStore.getState().playheadMs);
                            }}
                            className="rounded p-0.5 text-text-3 transition-colors hover:bg-card-2 hover:text-flame"
                          >
                            <X className="size-3" strokeWidth={2} aria-hidden />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <TimeArea
              areaRef={areaRef}
              rulerAreaRef={rulerAreaRef}
              peaks={peaks}
              bucketMs={bucketMs}
              ready={widthPx > 0}
              hasVideo={hasVideo}
              mediaLanes={mediaLanes}
              audioLanes={audioLanes}
              layout={layout}
            />
          </div>
        </div>

        {/* Footer hints */}
        <div className="flex h-[18px] shrink-0 items-center justify-between border-t border-track-hair px-4 text-[10px] leading-3 text-text-3">
          <span>Space play · S split · ⌘G generate · Drag clips across tracks</span>
          {layout.scrollable && <span>Scroll tracks ↕</span>}
        </div>
      </section>
    </TimelineContext.Provider>
  );
}

function RulerStrip({
  rulerAreaRef,
  ready,
}: {
  rulerAreaRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
}) {
  const { view } = useTimeline();
  return (
    <div
      ref={rulerAreaRef}
      data-ruler-area
      className="absolute inset-y-0 right-0"
      style={{
        left: TL.labelCol,
        clipPath: view.scrollMs > 0 ? 'inset(0)' : 'inset(0 0 0 -24px)',
      }}
    >
      {ready && (
        <>
          <Ruler />
          <PlayheadCapsule />
        </>
      )}
    </div>
  );
}

function TimeArea({
  areaRef,
  rulerAreaRef,
  peaks,
  bucketMs,
  ready,
  hasVideo,
  mediaLanes,
  audioLanes,
  layout,
}: {
  areaRef: React.RefObject<HTMLDivElement | null>;
  rulerAreaRef: React.RefObject<HTMLDivElement | null>;
  peaks: Float32Array | null;
  bucketMs: number;
  ready: boolean;
  hasVideo: boolean;
  mediaLanes: readonly TimelineLane[];
  audioLanes: readonly TimelineLane[];
  layout: TimelineLayoutResult;
}) {
  usePlayheadVar(areaRef, rulerAreaRef);
  const { view } = useTimeline();
  return (
    <div
      ref={areaRef}
      data-time-area
      className="absolute top-0 right-0"
      style={{
        left: TL.labelCol,
        height: layout.tracksHeight,
        clipPath: view.scrollMs > 0 ? 'inset(0)' : 'inset(0 0 0 -24px)',
      }}
    >
      {ready && (
        <>
          <BeatGrid height={layout.tracksHeight} />
          <Row geom={layout.rows.slots} label="Slots">
            <SlotsTrack />
          </Row>
          {hasVideo && layout.rows.video && (
            <Row geom={layout.rows.video} label="Video">
              <VideoTrack />
            </Row>
          )}
          {mediaLanes.map((lane, idx) => {
            const geom = layout.rows.stockMediaLanes[idx];
            if (!geom) return null;
            return (
              <Row
                key={`media-lane-${lane.index}`}
                geom={geom}
                label={lane.name ?? (lane.index === 0 ? 'Stock Media' : `Media ${lane.index + 1}`)}
              >
                <StockMediaTrack
                  laneIndex={lane.index}
                  laneCount={mediaLanes.length}
                  hidden={Boolean(lane.hidden)}
                />
              </Row>
            );
          })}
          <Row geom={layout.rows.words} label="Words">
            <WordsTrack />
          </Row>
          <Row geom={layout.rows.voice} label="Voice">
            <VoiceTrack peaks={peaks} bucketMs={bucketMs} />
          </Row>
          <Row geom={layout.rows.audio} label="Audio">
            <AudioTrack />
          </Row>
          {audioLanes.map((lane, idx) => {
            const geom = layout.rows.stockAudioLanes[idx];
            if (!geom) return null;
            return (
              <Row
                key={`audio-lane-${lane.index}`}
                geom={geom}
                label={lane.name ?? (lane.index === 0 ? 'Stock Audio' : `Audio ${lane.index + 1}`)}
              >
                <StockAudioTrack
                  laneIndex={lane.index}
                  laneCount={audioLanes.length}
                  muted={Boolean(lane.muted)}
                />
              </Row>
            );
          })}
          <PlayheadLine />
        </>
      )}
    </div>
  );
}

function Row({
  geom,
  label,
  children,
}: {
  geom: TimelineRowGeometry;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="absolute inset-x-0"
      style={{ top: geom.top, height: geom.height }}
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
          className="absolute top-0 w-px bg-white/2"
          style={{
            left: msToX(t, view),
            height,
          }}
        />
      ))}
    </>
  );
}
