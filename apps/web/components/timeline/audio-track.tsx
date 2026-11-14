'use client';

import { mulberry32 } from '@motionpop/motion';
import { useMemo } from 'react';
import { msToX } from '@/lib/timeline/geometry';
import { selectSlots, useEditor } from '@/lib/stores/editor';
import { useTimeline } from './timeline-context';

/**
 * AUDIO track: the design's mint music band with SFX chips at slot cues (spec 04 R4.5).
 * Music, ducking and SFX playback land in spec 12; until then the band is a placeholder.
 */
export function AudioTrack() {
  const { view, durationMs } = useTimeline();
  const slots = useEditor(selectSlots);
  const left = msToX(0, view);
  const width = msToX(durationMs, view) - left;
  const bars = useMemo(() => {
    const rand = mulberry32(12);
    return Array.from({ length: 400 }, () => 2 + rand() * 9);
  }, []);

  return (
    <div
      className="absolute top-1 h-[34px] overflow-hidden rounded-[7px] bg-music shadow-glass"
      style={{ left, width }}
    >
      <div aria-hidden className="absolute inset-y-0 left-[180px] flex items-center gap-[5.3px]">
        {bars.slice(0, Math.max(0, Math.floor((width - 190) / 7.3))).map((h, i) => (
          <span
            key={i}
            className="w-0.5 rounded-full bg-music-bar opacity-40"
            style={{ height: h }}
          />
        ))}
      </div>
      <span className="absolute top-[9px] left-3 text-[10px] leading-[13px] font-medium text-text-2">
        ♫ Music · ducked
      </span>
      {slots.flatMap((s) =>
        (s.sfx ?? []).map((cue) => (
          <span
            key={`${s.id}-${cue.id}-${cue.atMs}`}
            className="absolute top-[7px] rounded-full border border-white/8 bg-sfx px-[7px] py-[3px] text-[9px] leading-3 text-text-2"
            style={{ left: msToX(s.startMs + cue.atMs, view) - left }}
          >
            • {cue.id}
          </span>
        )),
      )}
    </div>
  );
}
