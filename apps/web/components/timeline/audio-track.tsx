'use client';

import { audioOf } from '@motionpop/schemas';
import { duckEnvelope } from '@motionpop/motion/sfx';
import { useMemo } from 'react';
import { msToX } from '@/lib/timeline/geometry';
import { toggleRailPanel } from '@/lib/editor/rail-panel';
import { useBedState } from '@/lib/sound/bed-state';
import { useEditor } from '@/lib/stores/editor';
import { useTimeline } from './timeline-context';

const MUSIC_NAMES: Record<string, string> = {
  'calm-pad': 'Calm pad',
  'steady-pulse': 'Steady pulse',
};

/**
 * AUDIO track (spec 12 task B6): a neutral band with the effects the bed actually plays, as pills
 * at their peaks, and the ducking line when music is on. The label says what the bed holds and
 * opens the Audio panel.
 */
export function AudioTrack() {
  const { view, durationMs } = useTimeline();
  const project = useEditor((s) => s.project);
  const placements = useBedState((s) => s.placements);
  const audio = project ? audioOf(project) : null;
  const left = msToX(0, view);
  const width = msToX(durationMs, view) - left;
  const hasMusic = !!audio?.musicId;

  // The ducking line: the same envelope the mix uses, drawn as a path over the band.
  const words = project?.transcript.words;
  const videoMs = project?.durationMs ?? 0;
  const musicId = audio?.musicId;
  const ducking = audio?.ducking ?? false;
  const depthDb = audio?.duckDepthDb ?? 0;
  const duckPath = useMemo(() => {
    if (!words || !musicId || !ducking || width <= 0) return null;
    const env = duckEnvelope(words, videoMs, { depthDb });
    if (env.length === 0) return null;
    const step = Math.max(1, Math.floor(env.length / Math.max(1, width / 2)));
    const depth = Math.max(1, depthDb);
    let d = '';
    for (let i = 0; i < env.length; i += step) {
      const x = msToX(i * 10, view) - left;
      const y = 6 + (Math.min(depth, -(env[i] ?? 0)) / depth) * 20;
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }, [words, videoMs, musicId, ducking, depthDb, view, left, width]);

  const label = !audio
    ? ''
    : audio.musicId === 'own'
      ? `♫ ${audio.musicName ?? 'Your track'}${audio.ducking ? ' · ducked' : ''}`
      : audio.musicId
        ? `♫ ${MUSIC_NAMES[audio.musicId] ?? 'Music'}${audio.ducking ? ' · ducked' : ''}`
        : '♫ Add music';

  return (
    <div
      className="absolute top-1 h-[26px] overflow-hidden rounded-[7px] border border-sound/30 bg-linear-to-r from-sound/[0.1] via-sound/[0.14] to-sound-2/[0.22]"
      style={{ left, width }}
      data-testid="audio-track"
    >
      {duckPath && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
          <path
            d={duckPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-sound opacity-80"
          />
        </svg>
      )}
      <button
        type="button"
        onClick={() => toggleRailPanel('audio')}
        className={`absolute top-[2px] left-1.5 z-10 rounded-md border border-sound/50 bg-paper/90 px-1.5 py-px text-[11px] leading-[14px] font-medium transition-colors hover:bg-mist ${hasMusic ? 'text-ink' : 'text-text-2 hover:text-ink'}`}
      >
        {label}
      </button>
      {placements.map((p) => (
        <span
          key={`${p.slotId}-${p.kind}-${p.atMs}`}
          className="absolute top-[4px] -translate-x-1/2 rounded-full border border-sound/45 bg-sound/[0.16] px-[7px] py-[2px] text-[10px] leading-3 text-sound-ink"
          style={{ left: msToX(p.atMs, view) - left }}
          title={`${p.kind} at ${(p.atMs / 1000).toFixed(2)}s`}
        >
          • {p.kind}
        </span>
      ))}
    </div>
  );
}
