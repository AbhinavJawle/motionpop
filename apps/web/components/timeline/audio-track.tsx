'use client';

import { audioOf } from '@motionpop/schemas';
import { reelSfxPlacements, type ReelSfxPlacement } from '@motionpop/motion/reel';
import { SFX_LABEL, duckEnvelope, type SfxKind } from '@motionpop/motion/sfx';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { removeReelSound, updateReelSound } from '@/lib/commands';
import { toggleRailPanel } from '@/lib/editor/rail-panel';
import { auditionSynthSfx } from '@/lib/sound/audition-sfx';
import { useBedState } from '@/lib/sound/bed-state';
import { useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { useTimeline } from './timeline-context';

const MUSIC_NAMES: Record<string, string> = {
  'calm-pad': 'Calm pad',
  'steady-pulse': 'Steady pulse',
};

interface DisplaySfx {
  key: string;
  kind: SfxKind;
  take: number;
  atMs: number;
  gainDb: number;
  source: 'scene' | 'added';
  addedIndex?: number;
  label?: string;
}

interface DragState {
  addedIndex: number;
  atMs: number;
}

/**
 * AUDIO / Sound track (spec 12 task B6 + reel SFX timeline visibility):
 * - Displays music label + ducking envelope.
 * - Shows ALL placed SFX on BOTH voiceover projects (via `useBedState`) AND video reels (via
 *   `reelSfxPlacements`, including both auto scene hits and Pip/user-added SFX).
 * - Clicking any pill auditions that exact sound immediately via Web Audio; Pip/user-added hits
 *   can be dragged horizontally to retime or removed individually with `×`.
 */
export function AudioTrack() {
  const { view, durationMs, clock } = useTimeline();
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  const bedPlacements = useBedState((s) => s.placements);
  const audio = project ? audioOf(project) : null;
  const left = msToX(0, view);
  const width = msToX(durationMs, view) - left;

  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupDragRef.current?.(), []);

  const reel = project?.reel;
  const autoSfx = audio?.autoSfx !== false;
  const reelPlacements = useMemo<ReelSfxPlacement[]>(() => {
    if (!reel || !autoSfx || durationMs <= 0) return [];
    return reelSfxPlacements(reel, durationMs);
  }, [reel, autoSfx, durationMs]);

  const items = useMemo<DisplaySfx[]>(() => {
    if (reel) {
      return reelPlacements.map((p, i) => ({
        key:
          p.source === 'added' && p.addedIndex !== undefined
            ? `added-${p.addedIndex}`
            : `scene-${i}-${p.kind}-${p.atMs}`,
        kind: p.kind,
        take: p.take,
        atMs: p.atMs,
        gainDb: p.gainDb,
        source: p.source,
        ...(p.addedIndex !== undefined ? { addedIndex: p.addedIndex } : {}),
        ...(p.label ? { label: p.label } : {}),
      }));
    }
    return bedPlacements.map((p, i) => ({
      key: `${p.slotId}-${p.kind}-${p.atMs}-${i}`,
      kind: p.kind,
      take: p.take,
      atMs: p.atMs,
      gainDb: p.gainDb,
      source: 'scene' as const,
    }));
  }, [reel, reelPlacements, bedPlacements]);

  // Positions of added SFX pills so auto scene ticks right underneath them collapse to discreet markers.
  const addedXs = useMemo(
    () =>
      items
        .filter((it) => it.source === 'added')
        .map((it) => {
          const ms = drag && drag.addedIndex === it.addedIndex ? drag.atMs : it.atMs;
          return msToX(ms, view) - left;
        }),
    [items, drag, view, left],
  );

  // The ducking line: the same envelope the mix uses, drawn as a path over the band.
  const words = project?.transcript.words;
  const videoMs = project?.durationMs ?? 0;
  const musicId = audio?.musicId;
  const hasReelMusic = Boolean(reel?.music?.src);
  const hasMusic = Boolean(musicId || hasReelMusic);
  const ducking = hasReelMusic ? true : (audio?.ducking ?? false);
  const depthDb = hasReelMusic ? 9 : (audio?.duckDepthDb ?? 0);
  const duckPath = useMemo(() => {
    if (!words || !hasMusic || !ducking || width <= 0) return null;
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
  }, [words, videoMs, hasMusic, ducking, depthDb, view, left, width]);

  const label = !audio
    ? ''
    : hasReelMusic
      ? `♫ ${reel?.music?.brief ?? 'AI music'} · ducked`
      : audio.musicId === 'own'
        ? `♫ ${audio.musicName ?? 'Your track'}${audio.ducking ? ' · ducked' : ''}`
        : audio.musicId
          ? `♫ ${MUSIC_NAMES[audio.musicId] ?? 'Music'}${audio.ducking ? ' · ducked' : ''}`
          : items.length > 0
            ? '♫ Music'
            : '♫ Add music';

  const startAddedDrag = (e: PointerEvent, item: DisplaySfx) => {
    if (item.source !== 'added' || item.addedIndex === undefined) return;
    e.stopPropagation();
    e.preventDefault();
    const addedIndex = item.addedIndex;
    const startX = e.clientX;
    const origMs = item.atMs;
    const pxPerMs = Math.max(0.0001, view.pxPerMs);
    let latestMs = origMs;
    let moved = false;
    let finished = false;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dxPx = ev.clientX - startX;
      if (Math.abs(dxPx) > 3) moved = true;
      latestMs = Math.max(0, Math.min(Math.max(0, durationMs - 20), Math.round(origMs + dxPx / pxPerMs)));
      setDrag({ addedIndex, atMs: latestMs });
    };

    const onUp = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (moved && latestMs !== origMs) {
        exec(updateReelSound(addedIndex, { atMs: latestMs }));
        clock.seek(latestMs);
      } else {
        clock.seek(origMs);
      }
      void auditionSynthSfx(item.kind, item.take, item.gainDb);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (cleanupDragRef.current === cleanup) cleanupDragRef.current = null;
    };
    cleanupDragRef.current?.();
    cleanupDragRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

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
        className={`absolute top-[2px] left-1.5 z-10 max-w-[160px] truncate rounded-md border border-sound/50 bg-paper/90 px-1.5 py-px text-[11px] leading-[14px] font-medium transition-colors hover:bg-mist ${hasMusic ? 'text-ink' : 'text-text-2 hover:text-ink'}`}
      >
        {label}
      </button>

      {items.map((p) => {
        const isAdded = p.source === 'added' && p.addedIndex !== undefined;
        const isDragging = isAdded && drag !== null && drag.addedIndex === p.addedIndex;
        const displayMs = isDragging && drag ? drag.atMs : p.atMs;
        const x = msToX(displayMs, view) - left;
        const kindName = SFX_LABEL[p.kind] ?? p.kind;
        const secStr = (displayMs / 1000).toFixed(2);

        if (isAdded) {
          const addedIndex = p.addedIndex!;
          const tip = p.label
            ? `${kindName} · ${p.label} (${secStr}s) · Click to preview, drag to retime`
            : `${kindName} at ${secStr}s · Click to preview, drag to retime`;
          return (
            <div
              key={p.key}
              role="button"
              tabIndex={0}
              data-testid={`reel-sfx-pill-${addedIndex}`}
              onPointerDown={(e) => startAddedDrag(e, p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void auditionSynthSfx(p.kind, p.take, p.gainDb);
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                  e.preventDefault();
                  exec(removeReelSound(addedIndex));
                }
              }}
              style={{ left: x }}
              title={tip}
              className={cn(
                'group absolute top-[2px] z-20 inline-flex h-[20px] -translate-x-1/2 cursor-grab items-center gap-1 rounded-full border border-flame/75 bg-paper/95 px-2 text-[10px] leading-none font-semibold text-ink shadow-xs transition-colors hover:z-30 hover:border-flame hover:bg-paper active:cursor-grabbing',
                isDragging && 'z-30 ring-2 ring-flame/70',
              )}
            >
              <Sparkles className="size-2.5 shrink-0 text-flame" strokeWidth={2.2} aria-hidden />
              <span className="max-w-[72px] truncate">{kindName}</span>
              <button
                type="button"
                aria-label={`Remove ${p.label ?? kindName}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  exec(removeReelSound(addedIndex));
                }}
                className="ml-0.5 hidden rounded-full p-0.5 text-text-3 hover:bg-flame/20 hover:text-ink group-hover:inline-flex"
              >
                <X className="size-2.5" strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          );
        }

        // Auto scene-derived SFX pill: collapses to a quiet dot if an added SFX sits right beside it.
        const crowded = addedXs.some((ax) => Math.abs(ax - x) < 42);
        return (
          <button
            key={p.key}
            type="button"
            data-testid={`auto-sfx-pill-${p.kind}-${p.atMs}`}
            onClick={(e) => {
              e.stopPropagation();
              void auditionSynthSfx(p.kind, p.take, p.gainDb);
            }}
            style={{ left: x }}
            title={`${kindName} at ${secStr}s (auto) · Click to preview`}
            className={cn(
              'absolute -translate-x-1/2 transition-colors hover:z-30',
              crowded
                ? 'top-[9px] z-10 size-2 rounded-full border border-sound/70 bg-sound/45 hover:scale-125'
                : 'top-[4px] z-10 rounded-full border border-sound/45 bg-sound/[0.16] px-[6px] py-[2px] text-[10px] leading-3 text-sound-ink hover:border-sound hover:bg-sound/25',
            )}
          >
            {crowded ? <span className="sr-only">{kindName}</span> : `• ${p.kind}`}
          </button>
        );
      })}
    </div>
  );
}
