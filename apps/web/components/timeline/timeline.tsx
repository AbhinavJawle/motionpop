'use client';

import { AudioLines, Music } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackClock } from '@/lib/editor/playback';
import { cn } from '@/lib/cn';
import { fitView, msToX } from '@/lib/timeline/geometry';
import { useEditor } from '@/lib/stores/editor';
import { AudioTrack } from './audio-track';
import { PlayheadCapsule, PlayheadLine, usePlayheadVar } from './playhead';
import { Ruler } from './ruler';
import { SlotsTrack } from './slots-track';
import { TimelineContext, TL, useTimeline, type TimelineCtx } from './timeline-context';
import { TimelineHeader } from './timeline-header';
import { VoiceTrack } from './voice-track';
import { WordsTrack } from './words-track';

const ROWS = [
  { id: 'slots', label: 'SLOTS', surface: 'bg-track-b', icon: null },
  { id: 'words', label: 'WORDS', surface: 'bg-track-a', icon: null },
  { id: 'voice', label: 'VOICE', surface: 'bg-track-b', icon: AudioLines },
  { id: 'audio', label: 'AUDIO', surface: 'bg-track-a', icon: Music },
] as const;

/**
 * The transcript-first timeline (spec 04 R4, R5): 300 px, full width. Tracks are absolute
 * rows; the time area starts after the 152 px label column.
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
  const storeView = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const areaRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidthPx(Math.round(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to width unless the user zoomed (spec 04 design: window resize keeps fit).
  useEffect(() => {
    if (storeView.fit && widthPx > 0) {
      const fit = fitView(durationMs, widthPx - TL.rightPad);
      if (fit.pxPerMs !== storeView.pxPerMs || storeView.scrollMs !== 0) setView({ ...fit, fit: true });
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
        aria-label="Timeline"
        className="relative h-[300px] shrink-0 border-t border-white/10 bg-panel select-none"
      >
        <TimelineHeader />
        {ROWS.map((row) => {
          const r = TL.rows[row.id];
          const Icon = row.icon;
          return (
            <div
              key={row.id}
              className={cn('absolute inset-x-0', row.surface)}
              style={{ top: r.top, height: r.height }}
            >
              <span className="absolute right-6 bottom-0 left-6 h-px bg-track-hair" />
              <span
                className="absolute left-6 text-[9px] leading-3 font-medium tracking-[1.1px] text-text-3"
                style={{ top: row.id === 'slots' ? 26 : row.id === 'words' ? 19 : 17 }}
              >
                {row.label}
              </span>
              {Icon && (
                <Icon
                  className="absolute left-[102px] size-3.5 text-text-3"
                  style={{ top: row.id === 'voice' ? 16 : 13 }}
                  strokeWidth={1.5}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
        <TimeArea areaRef={areaRef} peaks={peaks} bucketMs={bucketMs} ready={widthPx > 0} />
        <p className="absolute bottom-[3px] left-6 text-[9px] leading-3 text-text-3">
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
}: {
  areaRef: React.RefObject<HTMLDivElement | null>;
  peaks: Float32Array | null;
  bucketMs: number;
  ready: boolean;
}) {
  usePlayheadVar(areaRef);
  return (
    <div
      ref={areaRef}
      className="absolute right-0 bottom-0"
      // Clip to the time area, with room on the left for the centred "0s" label.
      style={{ left: TL.labelCol, top: TL.rows.ruler.top, clipPath: 'inset(0 0 0 -24px)' }}
    >
      {ready && (
        <>
          <BeatGrid />
          <Ruler />
          <Row id="slots" label="Slots">
            <SlotsTrack />
          </Row>
          <Row id="words" label="Words">
            <WordsTrack />
          </Row>
          <Row id="voice" label="Voice">
            <VoiceTrack peaks={peaks} bucketMs={bucketMs} />
          </Row>
          <Row id="audio" label="Audio">
            <AudioTrack />
          </Row>
          <PlayheadLine />
          <PlayheadCapsule />
        </>
      )}
    </div>
  );
}

function Row({ id, label, children }: { id: keyof typeof TL.rows; label: string; children: React.ReactNode }) {
  const r = TL.rows[id];
  return (
    <div
      role="group"
      aria-label={label}
      className="absolute inset-x-0"
      style={{ top: r.top - TL.rows.ruler.top, height: r.height }}
    >
      {children}
    </div>
  );
}

/** Faint 1 s grid through the tracks (2 % white), when there is room for it. */
function BeatGrid() {
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
          className="absolute h-[196px] w-px bg-white/2"
          style={{ left: msToX(t, view), top: TL.rows.slots.top - TL.rows.ruler.top }}
        />
      ))}
    </>
  );
}
