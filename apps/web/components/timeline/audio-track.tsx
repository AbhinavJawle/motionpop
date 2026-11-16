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
 * AUDIO track (spec 12 task B6): the mint band with the effects the bed actually plays, as pills
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
      className="absolute top-1 h-[34px] overflow-hidden rounded-[7px] bg-music shadow-glass"
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
            className="text-music-bar opacity-60"
          />
        </svg>
      )}
      <button
        type="button"
        onClick={() => toggleRailPanel('audio')}
        className={`absolute top-[5px] left-1.5 z-10 rounded-md bg-music px-1.5 py-1 text-[10px] leading-[13px] font-medium ${hasMusic ? 'text-text-2' : 'text-text-3 hover:text-text-2'}`}
      >
        {label}
      </button>
      {placements.map((p) => (
        <span
          key={`${p.slotId}-${p.kind}-${p.atMs}`}
          className="absolute top-[7px] -translate-x-1/2 rounded-full border border-white/8 bg-sfx px-[7px] py-[3px] text-[9px] leading-3 text-text-2"
          style={{ left: msToX(p.atMs, view) - left }}
          title={`${p.kind} at ${(p.atMs / 1000).toFixed(2)}s`}
        >
          • {p.kind}
        </span>
      ))}
    </div>
  );
}
